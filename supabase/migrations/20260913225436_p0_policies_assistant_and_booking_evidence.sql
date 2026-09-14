begin;

-- Extend the existing locale registry. Published reviewed source translations
-- are retained; this does not backfill machine-generated legal translations.
insert into public.supported_locales(locale,display_name,native_name,intl_locale,text_direction,is_enabled,is_default,sort_order)
values ('zh-CN','Chinese (Simplified)','中文（简体）','zh-CN','ltr',true,false,5)
on conflict(locale) do nothing;

create table public.business_policy_revisions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  policy jsonb not null check(jsonb_typeof(policy)='object' and octet_length(policy::text)<=16000),
  source_locale text not null check(source_locale in ('en','fr','wo','es','zh-CN')),
  version integer check(version>0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  constraint policy_publication_pair check((version is null and published_at is null) or (version is not null and published_at is not null)),
  unique(salon_id,version),
  unique(salon_id,id)
);
alter table public.salons add column business_policy_revision_id uuid;
alter table public.salons add constraint salon_policy_same_business foreign key(id,business_policy_revision_id) references public.business_policy_revisions(salon_id,id);
alter table public.bookings add column business_policy_revision_id uuid references public.business_policy_revisions(id),
  add column business_policy_snapshot jsonb not null default '{}'::jsonb,
  add column business_policy_version integer,
  add column business_policy_captured_at timestamptz;

alter table public.business_policy_revisions enable row level security;
revoke all on public.business_policy_revisions from anon,authenticated;
grant select on public.business_policy_revisions to anon,authenticated;
grant all on public.business_policy_revisions to service_role;
create policy business_policy_public_read on public.business_policy_revisions for select to anon,authenticated
  using(published_at is not null and public.is_marketplace_visible(salon_id));
create policy business_policy_owner_read on public.business_policy_revisions for select to authenticated
  using(public.salon_has_permission(salon_id,'my_page') or public.admin_has_permission('support'));
create index business_policy_salon_created_idx on public.business_policy_revisions(salon_id,created_at desc);

create function public.keep_published_business_policy_immutable() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if (new.id,new.salon_id,new.policy,new.source_locale,new.created_at) is distinct from
     (old.id,old.salon_id,old.policy,old.source_locale,old.created_at)
     or (old.published_at is not null and (new.version,new.published_at) is distinct from (old.version,old.published_at)) then
    raise exception using message='PUBLISHED_POLICY_IMMUTABLE',errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.keep_published_business_policy_immutable() from public,anon,authenticated;
create trigger keep_published_business_policy_immutable before update on public.business_policy_revisions
for each row execute function public.keep_published_business_policy_immutable();

-- Actor identity is bound by the API's verified user. Only trusted server code
-- may call this helper; fresh membership and identity checks precede mutation.
create function public.p0_actor_has_permission(p_salon uuid,p_user uuid,p_permission text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.platform_identities i join auth.users u on u.id=i.user_id
    where i.user_id=p_user and i.status='Active' and i.email_normalized=lower(trim(u.email))
      and ((i.primary_role='salon_owner' and exists(select 1 from public.salons s where s.id=p_salon and s.user_id=p_user))
        or (i.primary_role='salon_team' and exists(select 1 from public.salon_team_members m where m.salon_id=p_salon and m.user_id=p_user
          and m.status='Active' and coalesce((m.permissions->>p_permission)::boolean,false)))));
$$;
revoke all on function public.p0_actor_has_permission(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.p0_actor_has_permission(uuid,uuid,text) to service_role;

create function public.p0_salon_has_permission(p_salon uuid,p_permission text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select public.p0_actor_has_permission(p_salon,auth.uid(),p_permission);
$$;
revoke all on function public.p0_salon_has_permission(uuid,text) from public,anon,authenticated;
grant execute on function public.p0_salon_has_permission(uuid,text) to authenticated,service_role;
alter policy business_policy_owner_read on public.business_policy_revisions to authenticated
using(public.p0_salon_has_permission(salon_id,'my_page') or public.admin_has_permission('support'));

create function public.p0_business_plan_active(p_salon uuid)
returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
  select coalesce((select lower(sub.status) in ('active','trialing') and (sub.current_period_end is null or sub.current_period_end>now())
    from public.subscriptions sub where sub.salon_id=p_salon),
    (select lower(s.subscription_status) in ('active','trialing') from public.salons s where s.id=p_salon),false);
$$;
revoke all on function public.p0_business_plan_active(uuid) from public,anon,authenticated;
grant execute on function public.p0_business_plan_active(uuid) to service_role;

create function public.publish_business_policy(p_salon uuid,p_user uuid,p_revision uuid,p_expected_revision uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  current_revision uuid;
  draft public.business_policy_revisions%rowtype;
  next_version integer;
begin
  select s.business_policy_revision_id into current_revision from public.salons s where s.id=p_salon for update;
  perform 1 from public.platform_identities where user_id=p_user for share;
  perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_user for share;
  perform 1 from public.subscriptions where salon_id=p_salon for share;
  if not public.p0_actor_has_permission(p_salon,p_user,'my_page') then raise exception 'FORBIDDEN'; end if;
  if not public.p0_business_plan_active(p_salon) then raise exception 'PLAN_ACCESS_REQUIRED'; end if;
  select * into draft from public.business_policy_revisions r where r.id=p_revision and r.salon_id=p_salon for update;
  if not found then raise exception 'POLICY_NOT_FOUND'; end if;
  if draft.published_at is not null and current_revision=p_revision then return to_jsonb(draft); end if;
  if current_revision is distinct from p_expected_revision or draft.published_at is not null then raise exception 'POLICY_PREVIEW_STALE'; end if;
  select coalesce(max(r.version),0)+1 into next_version from public.business_policy_revisions r where r.salon_id=p_salon;
  update public.business_policy_revisions r set version=next_version,published_at=now(),published_by=p_user where r.id=p_revision returning * into draft;
  update public.salons s set business_policy_revision_id=p_revision where s.id=p_salon;
  return to_jsonb(draft);
end $$;
revoke all on function public.publish_business_policy(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_business_policy(uuid,uuid,uuid,uuid) to service_role;

-- Preserve the established booking-keyed conversation. A separate immutable
-- system event needs no fake user identity and cannot duplicate on webhook retry.
create table public.booking_conversation_events (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  event_type text not null default 'booking_created' check(event_type='booking_created'),
  facts jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.booking_conversation_events enable row level security;
revoke all on public.booking_conversation_events from anon,authenticated;
grant select on public.booking_conversation_events to authenticated;
grant all on public.booking_conversation_events to service_role;
create policy booking_event_participant_read on public.booking_conversation_events for select to authenticated
using(exists(select 1 from public.bookings b where b.id=booking_conversation_events.booking_id and (b.customer_id=auth.uid()
  or public.p0_salon_has_permission(b.salon_id,'bookings') or public.admin_has_permission('support'))));
create index booking_event_salon_idx on public.booking_conversation_events(salon_id,created_at desc);

create function public.capture_booking_p0_evidence() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare policy_row public.business_policy_revisions%rowtype; accepted jsonb;
begin
  if tg_op='UPDATE' then
    if new.business_policy_revision_id is distinct from old.business_policy_revision_id
      or new.business_policy_snapshot is distinct from old.business_policy_snapshot
      or new.business_policy_version is distinct from old.business_policy_version
      or new.business_policy_captured_at is distinct from old.business_policy_captured_at then
      raise exception using message='BOOKING_POLICY_SNAPSHOT_IMMUTABLE',errcode='23514';
    end if;
    return new;
  end if;
  -- Serialize against policy publication on this business, not other businesses.
  perform 1 from public.salons s where s.id=new.salon_id for share;
  -- Combined checkout uses an established explicit booking column list. Recover
  -- its accepted policy from the server-created intent using its payment-session
  -- identity; never substitute the business's newer policy during finalization.
  if new.business_policy_captured_at is null and new.stripe_checkout_session_id is not null and auth.role()='service_role' then
    select i.payload into accepted from public.booking_checkout_intents i
      where i.stripe_checkout_session_id=new.stripe_checkout_session_id and i.salon_id=new.salon_id
        and i.payload ? 'business_policy_captured_at';
    if found then
      new.business_policy_captured_at:=(accepted->>'business_policy_captured_at')::timestamptz;
      new.business_policy_revision_id:=(accepted->>'business_policy_revision_id')::uuid;
    end if;
  end if;
  if new.business_policy_captured_at is not null then
    -- Only trusted checkout payloads may carry a policy accepted before payment.
    -- Preserve that published revision if the owner publishes during payment.
    if auth.role() is distinct from 'service_role' then raise exception 'POLICY_CAPTURE_SERVER_ONLY'; end if;
    if new.business_policy_revision_id is not null then
      select r.* into policy_row from public.business_policy_revisions r where r.id=new.business_policy_revision_id and r.salon_id=new.salon_id and r.published_at is not null;
      if not found then raise exception 'POLICY_CAPTURE_INVALID'; end if;
    end if;
  else
    select r.* into policy_row from public.business_policy_revisions r join public.salons s
      on s.business_policy_revision_id=r.id and s.id=r.salon_id where s.id=new.salon_id and r.published_at is not null;
    new.business_policy_captured_at:=now();
  end if;
  new.business_policy_revision_id:=policy_row.id;
  new.business_policy_version:=policy_row.version;
  new.business_policy_snapshot:=coalesce(policy_row.policy,'{}'::jsonb);
  return new;
end $$;
revoke all on function public.capture_booking_p0_evidence() from public,anon,authenticated;
create trigger capture_booking_p0_evidence before insert or update on public.bookings
for each row execute function public.capture_booking_p0_evidence();

create function public.open_booking_conversation_event() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.booking_conversation_events(booking_id,salon_id,facts)
  select new.id,new.salon_id,jsonb_build_object('booking_id',new.id,'reference',to_jsonb(new)->>'public_reference',
    'customer_name',coalesce(nullif(to_jsonb(new)->>'guest_name',''),c.name,''),'business_name',s.name,
    'service_name',st.name,'appointment_datetime',new.appointment_datetime,'time_zone',s.time_zone,'status',new.status)
  from public.salons s left join public.styles st on st.id=new.style_id
    left join public.customers c on c.id=new.customer_id where s.id=new.salon_id
  on conflict(booking_id) do nothing;
  return new;
end $$;
revoke all on function public.open_booking_conversation_event() from public,anon,authenticated;
create trigger open_booking_conversation_event after insert on public.bookings
for each row execute function public.open_booking_conversation_event();

-- Cache by immutable source message and recipient locale. Original content stays
-- in booking_messages and never becomes a provider-selected replacement.
create table public.booking_message_translations (
  message_id uuid not null references public.booking_messages(id) on delete cascade,
  locale text not null check(locale in ('en','fr','wo','es','zh-CN')),
  translated_body text not null check(char_length(translated_body) between 1 and 4000),
  source_hash text not null,
  provider text not null,
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(message_id,locale)
);
alter table public.booking_message_translations enable row level security;
revoke all on public.booking_message_translations from anon,authenticated;
grant select on public.booking_message_translations to authenticated;
grant all on public.booking_message_translations to service_role;
create policy translated_message_participant_read on public.booking_message_translations for select to authenticated
using(exists(select 1 from public.booking_messages m where m.id=booking_message_translations.message_id));
alter table public.booking_messages add column source_locale text check(source_locale in ('en','fr','wo','es','zh-CN')),
  add column client_request_id uuid;
create unique index booking_message_request_idx on public.booking_messages(sender_user_id,client_request_id) where client_request_id is not null;

create function public.keep_booking_message_source() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if (new.body,new.original_body,new.source_locale,new.sender_user_id,new.sender_role,new.booking_id,new.salon_id,new.created_at,new.client_request_id)
    is distinct from (old.body,old.original_body,old.source_locale,old.sender_user_id,old.sender_role,old.booking_id,old.salon_id,old.created_at,old.client_request_id)
    then raise exception 'MESSAGE_SOURCE_IMMUTABLE'; end if;
  return new;
end $$;
revoke all on function public.keep_booking_message_source() from public,anon,authenticated;
create trigger keep_booking_message_source before update on public.booking_messages
for each row execute function public.keep_booking_message_source();

-- In-app delivery is part of the same transaction for every message writer.
-- The existing dashboard notification model and recipient permissions remain
-- authoritative; no parallel inbox or notification table is introduced.
create function public.notify_booking_message_in_app() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype; recipient uuid; recipient_role text; destination text;
begin
  select * into b from public.bookings where id=new.booking_id;
  if not found or b.salon_id<>new.salon_id then raise exception 'MESSAGE_BOOKING_MISMATCH'; end if;
  recipient_role:=case when new.sender_role='customer' then 'salon' else 'customer' end;
  destination:=case when recipient_role='salon' then '/salon/dashboard/messages/'||b.id::text else '/account?tab=inbox&booking='||b.id::text end;
  for recipient in
    select b.customer_id where recipient_role='customer' and b.customer_id is not null
    union select s.user_id from public.salons s where recipient_role='salon' and s.id=b.salon_id and public.p0_actor_has_permission(s.id,s.user_id,'bookings')
    union select m.user_id from public.salon_team_members m where recipient_role='salon' and m.salon_id=b.salon_id and public.p0_actor_has_permission(m.salon_id,m.user_id,'bookings')
  loop
    perform public.upsert_dashboard_notification(recipient,b.salon_id,b.id,recipient_role,'messages','info','New booking message',
      left(coalesce(new.original_body,new.body),140),destination,'booking-message:'||new.id::text,jsonb_build_object('message_id',new.id,'source_original',true));
  end loop;
  return new;
end $$;
revoke all on function public.notify_booking_message_in_app() from public,anon,authenticated;
create trigger notify_booking_message_in_app after insert on public.booking_messages
for each row execute function public.notify_booking_message_in_app();

create function public.keep_booking_event() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if new is distinct from old then raise exception 'BOOKING_EVENT_IMMUTABLE'; end if;
  return new;
end $$;
revoke all on function public.keep_booking_event() from public,anon,authenticated;
create trigger keep_booking_event before update on public.booking_conversation_events
for each row execute function public.keep_booking_event();

-- Preserve reviewed policy evidence through the existing combined finalizer,
-- including zero-charge checkouts that never obtain a Stripe session ID.
-- All payment, inventory, idempotency and permission logic remains unchanged.
create or replace function public.complete_combined_checkout(
  p_commerce_intent_id uuid,
  p_payment jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_intent public.commerce_checkout_intents%rowtype;
  v_booking_intent public.booking_checkout_intents%rowtype;
  v_booking_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_processing_fee numeric(10,2) := greatest(coalesce((p_payment ->> 'processing_fee')::numeric,0),0);
  v_booking_fee numeric(10,2) := 0;
  v_product_fee numeric(10,2) := 0;
begin
  select * into v_intent from public.commerce_checkout_intents
  where id = p_commerce_intent_id for update;
  if not found then
    raise exception using errcode='22023', message='COMMERCE_INTENT_NOT_FOUND';
  end if;
  if v_intent.status = 'Paid' then
    return jsonb_build_object('order_id',v_intent.order_id,'booking_id',v_intent.booking_id,'already_completed',true);
  end if;
  if v_intent.status <> 'Pending' then
    raise exception using errcode='22023', message='COMMERCE_INTENT_NOT_PENDING';
  end if;

  if v_intent.total_charged > 0 and nullif(p_payment ->> 'payment_intent_id','') is null then
    raise exception using errcode='22023', message='COMMERCE_PAYMENT_NOT_VERIFIED';
  end if;
  if v_intent.total_charged > 0 then
    v_booking_fee := round(v_processing_fee * (v_intent.appointment_deposit / v_intent.total_charged),2);
    v_product_fee := greatest(v_processing_fee - v_booking_fee,0);
  end if;

  if v_intent.booking_intent_id is not null then
    select * into v_booking_intent
    from public.booking_checkout_intents
    where id = v_intent.booking_intent_id for update;
    if not found or v_booking_intent.status <> 'Pending' then
      raise exception using errcode='22023', message='BOOKING_INTENT_NOT_PENDING';
    end if;
    insert into public.bookings(
      customer_id,salon_id,stylist_id,style_id,selected_size,selected_length,
      selected_material_id,selected_addons,selected_options,client_notes,
      appointment_datetime,duration_hours,buffer_minutes,estimated_total,
      subtotal_before_promotion,deposit_amount,deposit_percentage,
      cancellation_grace_minutes_snapshot,original_deposit_amount,
      discount_amount,promo_code_id,salon_promotion_id,
      salon_promotion_redemption_id,promotion_discount_amount,
      promotion_snapshot,balance_due,confirmation_code,status,deposit_status,
      guest_name,guest_email,guest_phone,preferred_locale,source,
      stripe_payment_id,stripe_checkout_session_id,stripe_charge_id,
      stripe_receipt_url,payment_method_label,payment_mode,payment_verified_at,
      stripe_processing_fee,platform_fee,net_amount_owed_salon,payout_status,business_policy_revision_id,business_policy_captured_at
    ) values (
      nullif(v_booking_intent.payload ->> 'customer_id','')::uuid,
      (v_booking_intent.payload ->> 'salon_id')::uuid,
      nullif(v_booking_intent.payload ->> 'stylist_id','')::uuid,
      (v_booking_intent.payload ->> 'style_id')::uuid,
      nullif(v_booking_intent.payload ->> 'selected_size',''),
      nullif(v_booking_intent.payload ->> 'selected_length',''),
      nullif(v_booking_intent.payload ->> 'selected_material_id','')::uuid,
      coalesce(v_booking_intent.payload -> 'selected_addons','[]'::jsonb),
      coalesce(v_booking_intent.payload -> 'selected_options','{}'::jsonb),
      nullif(v_booking_intent.payload ->> 'client_notes',''),
      (v_booking_intent.payload ->> 'appointment_datetime')::timestamptz,
      (v_booking_intent.payload ->> 'duration_hours')::numeric,
      (v_booking_intent.payload ->> 'buffer_minutes')::integer,
      (v_booking_intent.payload ->> 'estimated_total')::numeric,
      nullif(v_booking_intent.payload ->> 'subtotal_before_promotion','')::numeric,
      (v_booking_intent.payload ->> 'deposit_amount')::numeric,
      nullif(v_booking_intent.payload ->> 'deposit_percentage','')::numeric,
      nullif(v_booking_intent.payload ->> 'cancellation_grace_minutes_snapshot','')::integer,
      nullif(v_booking_intent.payload ->> 'original_deposit_amount','')::numeric,
      coalesce((v_booking_intent.payload ->> 'discount_amount')::numeric,0),
      coalesce(
        nullif(v_booking_intent.payload ->> 'promo_code_id','')::uuid,
        v_booking_intent.promo_code_id
      ),
      coalesce(
        nullif(v_booking_intent.payload ->> 'salon_promotion_id','')::uuid,
        v_booking_intent.salon_promotion_id
      ),
      coalesce(
        nullif(
          v_booking_intent.payload ->> 'salon_promotion_redemption_id',
          ''
        )::uuid,
        v_booking_intent.salon_promotion_redemption_id
      ),
      coalesce(
        nullif(
          v_booking_intent.payload ->> 'promotion_discount_amount',
          ''
        )::numeric,
        v_booking_intent.promotion_discount_amount,
        0
      ),
      case
        when v_booking_intent.promotion_snapshot <> '{}'::jsonb
          then v_booking_intent.promotion_snapshot
        else coalesce(
          v_booking_intent.payload -> 'promotion_snapshot',
          '{}'::jsonb
        )
      end,
      (v_booking_intent.payload ->> 'balance_due')::numeric,
      nullif(v_booking_intent.payload ->> 'confirmation_code',''),
      coalesce(nullif(v_booking_intent.payload ->> 'status',''),'Confirmed'),
      case when v_intent.appointment_deposit > 0 then 'Paid' else 'No Payment Required' end,
      v_intent.guest_name,v_intent.guest_email,v_intent.guest_phone,
      coalesce(nullif(v_booking_intent.payload ->> 'preferred_locale',''),'en'),
      coalesce(nullif(v_booking_intent.payload ->> 'source',''),'Website'),
      nullif(p_payment ->> 'payment_intent_id',''),
      nullif(p_payment ->> 'checkout_session_id',''),
      nullif(p_payment ->> 'charge_id',''),
      nullif(p_payment ->> 'receipt_url',''),
      coalesce(nullif(p_payment ->> 'payment_method_label',''),'Secure payment'),
      coalesce(nullif(p_payment ->> 'payment_mode',''),'test'),
      now(),v_booking_fee,0,
      greatest(v_intent.appointment_deposit-v_booking_fee,0),
      case when nullif(p_payment ->> 'connected_account_id','') is not null
        then 'Destination payment submitted' else 'Awaiting payout' end,
      nullif(v_booking_intent.payload ->> 'business_policy_revision_id','')::uuid,
      nullif(v_booking_intent.payload ->> 'business_policy_captured_at','')::timestamptz
    ) returning id into v_booking_id;
    update public.booking_checkout_intents
    set status='Paid',booking_id=v_booking_id,
        stripe_checkout_session_id=nullif(p_payment ->> 'checkout_session_id','')
    where id=v_intent.booking_intent_id;
  end if;

  insert into public.product_orders(
    commerce_intent_id,salon_id,customer_id,booking_id,
    guest_name,guest_email,guest_phone,fulfillment_method,shipping_address,
    subtotal,discount_amount,product_promotion_id,
    product_promotion_snapshot,product_promotion_redemption_id,
    tax_amount,shipping_amount,total_amount,currency,payment_mode,
    stripe_checkout_session_id,stripe_tax_calculation_id,
    stripe_payment_intent_id,stripe_charge_id,
    stripe_receipt_url,stripe_connected_account_id,stripe_transfer_id,
    stripe_processing_fee,platform_fee,net_amount_owed_salon,payout_status
  ) values (
    v_intent.id,v_intent.salon_id,v_intent.customer_id,v_booking_id,
    v_intent.guest_name,v_intent.guest_email,v_intent.guest_phone,
    v_intent.fulfillment_method,v_intent.shipping_address,
    v_intent.product_subtotal,v_intent.product_discount,
    v_intent.product_promotion_id,v_intent.product_promotion_snapshot,
    v_intent.product_promotion_redemption_id,v_intent.tax_amount,
    v_intent.shipping_amount,v_intent.product_total,v_intent.currency,
    coalesce(nullif(p_payment ->> 'payment_mode',''),'test'),
    nullif(p_payment ->> 'checkout_session_id',''),
    v_intent.stripe_tax_calculation_id,
    nullif(p_payment ->> 'payment_intent_id',''),
    nullif(p_payment ->> 'charge_id',''),
    nullif(p_payment ->> 'receipt_url',''),
    nullif(p_payment ->> 'connected_account_id',''),
    nullif(p_payment ->> 'transfer_id',''),
    v_product_fee,0,greatest(v_intent.product_total-v_product_fee,0),
    case when nullif(p_payment ->> 'connected_account_id','') is not null
      then 'Destination payment submitted' else 'Awaiting payout' end
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_intent.item_snapshot)
  loop
    insert into public.product_order_items(
      order_id,product_id,product_name,sku,image_url,unit_price,quantity,line_total,
      tax_category,fulfillment_snapshot
    ) values (
      v_order_id,(v_item ->> 'product_id')::uuid,v_item ->> 'name',
      nullif(v_item ->> 'sku',''),nullif(v_item ->> 'image_url',''),
      (v_item ->> 'unit_price')::numeric,(v_item ->> 'quantity')::integer,
      (v_item ->> 'line_total')::numeric,v_item ->> 'tax_category',
      v_item - array['product_id','name','sku','image_url','unit_price','quantity','line_total','tax_category']
    );
  end loop;

  insert into public.product_order_events(
    order_id,salon_id,event_type,new_status,actor_role,metadata
  ) values (
    v_order_id,v_intent.salon_id,'order_confirmed','New','payment_provider',
    jsonb_build_object(
      'checkout_session_id',nullif(p_payment ->> 'checkout_session_id',''),
      'payment_intent_id',nullif(p_payment ->> 'payment_intent_id',''),
      'payment_mode',coalesce(nullif(p_payment ->> 'payment_mode',''),'test')
    )
  );

  update public.product_inventory_reservations
  set status='Converted',updated_at=now()
  where commerce_intent_id=v_intent.id and status='Reserved';
  if v_intent.product_promotion_redemption_id is not null then
    update public.product_promotion_redemptions
    set status='redeemed',product_order_id=v_order_id,redeemed_at=now()
    where id=v_intent.product_promotion_redemption_id
      and status='pending'
      and expires_at > now();
    if not found then
      raise exception using errcode='22023', message='PRODUCT_PROMOTION_RESERVATION_NOT_AVAILABLE';
    end if;
  end if;
  update public.commerce_checkout_intents
  set status='Paid',order_id=v_order_id,booking_id=v_booking_id,
      stripe_checkout_session_id=nullif(p_payment ->> 'checkout_session_id',''),
      stripe_payment_intent_id=nullif(p_payment ->> 'payment_intent_id',''),
      updated_at=now()
  where id=v_intent.id;

  return jsonb_build_object('order_id',v_order_id,'booking_id',v_booking_id,'already_completed',false);
end;
$$;

-- Reuse the existing registry; classification is authoritative across production
-- discovery and checkout, even after the application launch gate is enabled.
create or replace function public.is_marketplace_visible(target_salon_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select not exists(select 1 from public.test_data_registry r where r.record_type='salon' and r.record_id=target_salon_id::text)
    and coalesce((public.salon_publication_diagnostic(target_salon_id)->>'discovery_eligible')::boolean,false);
$$;

-- The Assistant stores proposals/evidence, never a second business catalog.
insert into public.engine_settings(setting_key,category,display_name,description,value_type,draft_value,published_value,status,published_version,is_public,validation)
values
('marketplace.prelaunch_title','homepage_composition','Prelaunch heading','Truthful business-facing heading while customer booking is disabled.','text','"A new home for your beauty business"','"A new home for your beauty business"','Published',1,true,'{"maxLength":160}'),
('marketplace.prelaunch_description','homepage_composition','Prelaunch description','Do not imply that sample supply is bookable. The server launch gate is managed separately.','text','"Girlz Culture is onboarding founding beauty businesses. Our customer marketplace is preparing to launch. Customer booking and payment are not available yet."','"Girlz Culture is onboarding founding beauty businesses. Our customer marketplace is preparing to launch. Customer booking and payment are not available yet."','Published',1,true,'{"maxLength":800}')
on conflict(setting_key) do nothing;

-- The Assistant stores proposals/evidence, never a second business catalog.
create table public.gc_assistant_requests (
  id uuid primary key,
  salon_id uuid not null references public.salons(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  locale text not null check(locale in ('en','fr','wo','es','zh-CN')),
  tool text not null check(tool in ('get_business_summary','get_bookings','get_availability','get_business_profile','get_services_and_prices','get_business_policies','prepare_business_profile_update','prepare_availability_block','prepare_service','prepare_customer_message','prepare_business_policy_update')),
  arguments jsonb not null check(octet_length(arguments::text)<=16000),
  execution_payload jsonb not null default '{}'::jsonb check(octet_length(execution_payload::text)<=16000),
  risk_class integer not null check(risk_class between 1 and 4),
  permission text not null check(permission in ('overview','my_page','availability','styles','bookings')),
  digest text not null check(digest ~ '^[0-9a-f]{64}$'),
  before_summary jsonb not null default '{}'::jsonb,
  result jsonb,
  failure_code text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes'
);
create index gc_assistant_actor_created_idx on public.gc_assistant_requests(requested_by,created_at desc);
create index gc_assistant_business_created_idx on public.gc_assistant_requests(salon_id,created_at desc);
alter table public.gc_assistant_requests enable row level security;
revoke all on public.gc_assistant_requests from public,anon,authenticated;
grant select on public.gc_assistant_requests to authenticated;
grant all on public.gc_assistant_requests to service_role;
create policy assistant_actor_read on public.gc_assistant_requests for select to authenticated
using((requested_by=auth.uid() and public.p0_salon_has_permission(salon_id,permission)) or public.admin_has_permission('support'));

create table public.gc_assistant_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.gc_assistant_requests(id) on delete cascade,
  event text not null check(event in ('prepared','read','confirmed','failed','cancelled')),
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index gc_assistant_audit_request_idx on public.gc_assistant_audit(request_id,created_at);
alter table public.gc_assistant_audit enable row level security;
revoke all on public.gc_assistant_audit from public,anon,authenticated;
grant select on public.gc_assistant_audit to authenticated;
grant all on public.gc_assistant_audit to service_role;
create policy assistant_audit_read on public.gc_assistant_audit for select to authenticated
using(exists(select 1 from public.gc_assistant_requests r where r.id=gc_assistant_audit.request_id));

create function public.save_gc_assistant_request(p_request jsonb,p_notices jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype; saved public.gc_assistant_requests%rowtype;
begin
  r:=jsonb_populate_record(null::public.gc_assistant_requests,p_request);
  if not public.p0_actor_has_permission(r.salon_id,r.requested_by,r.permission) then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
  insert into public.gc_assistant_requests(id,salon_id,requested_by,locale,tool,arguments,execution_payload,risk_class,permission,digest,before_summary,result)
    values(r.id,r.salon_id,r.requested_by,r.locale,r.tool,r.arguments,r.execution_payload,r.risk_class,r.permission,r.digest,r.before_summary,r.result)
    on conflict(id) do nothing returning * into saved;
  if not found then
    select * into saved from public.gc_assistant_requests where id=r.id and salon_id=r.salon_id and requested_by=r.requested_by;
    if not found or (saved.locale,saved.tool,saved.arguments) is distinct from (r.locale,r.tool,r.arguments) then raise exception 'ASSISTANT_IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(saved);
  end if;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)
    values(saved.id,case when saved.risk_class=1 then 'read' else 'prepared' end,saved.requested_by,jsonb_build_object('notices',p_notices));
  return to_jsonb(saved);
end $$;
revoke all on function public.save_gc_assistant_request(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_gc_assistant_request(jsonb,jsonb) to service_role;

create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype; s public.salons%rowtype;
  expected_permission text; expected_risk integer; saved jsonb; current_value jsonb; policy_id uuid; failure text;
begin
  -- Consistent business -> identity -> member -> proposal locks. Revocation and
  -- edits must finish before this transaction's fresh checks or wait until it ends.
  select * into s from public.salons where id=p_salon for update;
  perform 1 from public.platform_identities where user_id=p_actor for share;
  perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
  select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
  if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND'; end if;
  expected_permission:=case r.tool when 'prepare_business_profile_update' then case when r.arguments->>'field'='hours' then 'availability' else 'my_page' end when 'prepare_availability_block' then 'availability' when 'prepare_service' then 'styles' when 'prepare_customer_message' then 'bookings' when 'prepare_business_policy_update' then 'my_page' else null end;
  expected_risk:=case when r.tool in ('prepare_availability_block','prepare_service') then 3 else 4 end;
  if expected_permission is null or r.permission<>expected_permission or r.risk_class<>expected_risk
    or not public.p0_actor_has_permission(p_salon,p_actor,expected_permission) then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
  if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
  if r.confirmed_at is not null then return jsonb_build_object('verified',true,'replayed',true,'result',r.result); end if;
  if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED'; end if;
  perform 1 from public.subscriptions where salon_id=p_salon for share;
  if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED'; end if;
  begin
    if r.tool='prepare_business_profile_update' then
      if r.arguments->>'field' not in ('description','hours','tiktok_url','instagram_url') then raise exception 'ASSISTANT_INVALID_INPUT'; end if;
      current_value:=jsonb_build_object(r.arguments->>'field',to_jsonb(s)->(r.arguments->>'field'));
      if current_value is distinct from r.before_summary then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
      if r.arguments->>'field'='description' then
        update public.salons set description=r.arguments->>'text',description_ai_assisted=true where id=p_salon;
        saved:=jsonb_build_object('description',r.arguments->>'text');
      elsif r.arguments->>'field'='hours' then
        update public.salons set hours=r.execution_payload->'hours' where id=p_salon;
        saved:=r.execution_payload;
      else
        -- Existing social/public-identity approval remains authoritative.
        if s.user_id<>p_actor then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
        saved:=public.request_salon_vanity_url(p_salon,p_actor,coalesce(s.vanity_slug,s.slug),
          case when r.arguments->>'field'='instagram_url' then r.arguments->>'text' else s.instagram_url end,
          case when r.arguments->>'field'='tiktok_url' then r.arguments->>'text' else s.tiktok_url end,s.google_business_url);
      end if;
    elsif r.tool='prepare_availability_block' then
      if r.arguments->>'time_zone' is distinct from s.time_zone or (r.arguments->>'start')::timestamptz<=now() then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
      -- Existing override merging can extend a different range. Require a new
      -- non-overlapping range so the actual change exactly matches the preview.
      perform pg_advisory_xact_lock(hashtextextended('availability-override:'||p_salon::text||':'||coalesce(r.arguments->>'stylist_id','salon'),0));
      if exists(select 1 from public.salon_blockouts b where b.salon_id=p_salon and b.released_at is null and b.stylist_id is not distinct from (r.arguments->>'stylist_id')::uuid and b.starts_at<(r.arguments->>'end')::timestamptz and b.ends_at>(r.arguments->>'start')::timestamptz) then raise exception 'ASSISTANT_RANGE_CONFLICT'; end if;
      saved:=to_jsonb(public.create_salon_availability_override(p_salon,(r.arguments->>'stylist_id')::uuid,(r.arguments->>'start')::timestamptz,(r.arguments->>'end')::timestamptz,r.arguments->>'reason',false,'manual',p_actor));
    elsif r.tool='prepare_service' then
      if r.execution_payload->>'is_draft'<>'true' then raise exception 'ASSISTANT_INVALID_INPUT'; end if;
      saved:=public.save_salon_style_with_materials(p_salon,null,r.execution_payload,'[]'::jsonb);
    elsif r.tool='prepare_customer_message' then
      select jsonb_build_object('id',b.id,'status',b.status,'appointment_datetime',b.appointment_datetime) into current_value
        from public.bookings b where b.id=(r.arguments->>'booking_id')::uuid and b.salon_id=p_salon for update;
      if not found or current_value is distinct from r.before_summary then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
      insert into public.booking_messages(booking_id,salon_id,sender_user_id,sender_role,body,original_body,source_locale,client_request_id,read_by_salon_at)
      values((r.arguments->>'booking_id')::uuid,p_salon,p_actor,'salon',r.arguments->>'body',r.arguments->>'body',r.locale,r.id,now()) returning jsonb_build_object('id',id,'booking_id',booking_id,'body',body) into saved;
    elsif r.tool='prepare_business_policy_update' then
      if s.business_policy_revision_id is distinct from (r.before_summary->>'revision_id')::uuid then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
      insert into public.business_policy_revisions(salon_id,policy,source_locale,created_by)
        values(p_salon,r.arguments->'policy',r.locale,p_actor) returning id into policy_id;
      saved:=public.publish_business_policy(p_salon,p_actor,policy_id,s.business_policy_revision_id);
    end if;
    update public.gc_assistant_requests set confirmed_at=now(),result=saved where id=r.id;
    insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'confirmed',p_actor,jsonb_build_object('before',r.before_summary,'after',saved,'risk_class',r.risk_class));
    return jsonb_build_object('verified',true,'replayed',false,'result',saved);
  exception when others then
    -- Subtransaction rolls back the business change and keeps a safe failure
    -- event in the outer transaction. Never persist raw SQL/provider errors.
    failure:=case when sqlerrm in ('ASSISTANT_PREVIEW_STALE','ASSISTANT_RANGE_CONFLICT','ASSISTANT_ACCESS_DENIED','ASSISTANT_INVALID_INPUT') then sqlerrm else 'ASSISTANT_ACTION_FAILED' end;
    update public.gc_assistant_requests set failure_code=failure where id=r.id;
    insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
    return jsonb_build_object('verified',false,'code',failure);
  end;
end $$;
revoke all on function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) to service_role;

insert into public.ai_automation_features(feature_key,display_name,description,is_enabled,pii_policy)
values('gc_owner_assistant','GC Assistant','Owner-scoped planning; validated tools and confirmation control every action.',false,'redact') on conflict(feature_key) do nothing;

-- Reserve a conservative upper bound before any provider request. Locking the
-- existing feature row makes concurrent requests share one budget/rate guard.
create function public.reserve_governed_ai_usage(p_feature text,p_user uuid,p_cost_cents numeric)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare f public.ai_automation_features%rowtype; used numeric; daily bigint; request_id uuid;
begin
  if p_feature not in ('gc_owner_assistant','translation_drafts') then raise exception 'ASSISTANT_UNAVAILABLE'; end if;
  select * into f from public.ai_automation_features where feature_key=p_feature for update;
  if not found or not f.is_enabled or f.provider_key<>'openai' or p_cost_cents is null or p_cost_cents<=0 or p_cost_cents>1000000
    or not exists(select 1 from public.engine_settings where setting_key='ai.emergency_kill_switch' and published_value='false'::jsonb)
    then raise exception 'ASSISTANT_UNAVAILABLE'; end if;
  select coalesce(sum(estimated_cost_cents),0),count(*) filter(where created_at>=date_trunc('day',now())) into used,daily
    from public.ai_usage_events where feature_key=f.feature_key and created_at>=date_trunc('month',now());
  if used+p_cost_cents>f.monthly_budget_cents or daily>=f.daily_request_limit
    or (select count(*) from public.ai_usage_events where feature_key=f.feature_key and requested_by=p_user and created_at>now()-interval '1 minute')>=12 then raise exception 'ASSISTANT_BUDGET_LIMIT'; end if;
  insert into public.ai_usage_events(feature_key,provider_key,model_key,outcome,estimated_cost_cents,requested_by,safe_error_code)
    values(f.feature_key,f.provider_key,f.model_key,'blocked',p_cost_cents,p_user,'RESERVED') returning id into request_id;
  return request_id;
end $$;
revoke all on function public.reserve_governed_ai_usage(text,uuid,numeric) from public,anon,authenticated;
grant execute on function public.reserve_governed_ai_usage(text,uuid,numeric) to service_role;

create function public.reserve_gc_assistant_usage(p_user uuid,p_cost_cents numeric)
returns uuid language sql security invoker set search_path=pg_catalog,public as $$
  select public.reserve_governed_ai_usage('gc_owner_assistant',p_user,p_cost_cents);
$$;
revoke all on function public.reserve_gc_assistant_usage(uuid,numeric) from public,anon,authenticated;
grant execute on function public.reserve_gc_assistant_usage(uuid,numeric) to service_role;

create function public.p0_booking_message_access(p_booking uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.bookings b join public.platform_identities i on i.user_id=auth.uid()
    join auth.users u on u.id=i.user_id
    where b.id=p_booking and i.status='Active' and i.email_normalized=lower(trim(u.email))
      and ((i.primary_role='customer' and b.customer_id=auth.uid())
        or public.p0_actor_has_permission(b.salon_id,auth.uid(),'bookings')
        or (i.primary_role='admin' and exists(select 1 from public.admin_users a where a.user_id=auth.uid() and a.status='Active' and (a.is_super_admin or coalesce((a.permissions->>'support')::boolean,false))))));
$$;
revoke all on function public.p0_booking_message_access(uuid) from public,anon,authenticated;
grant execute on function public.p0_booking_message_access(uuid) to authenticated,service_role;
alter policy "Booking participants read messages" on public.booking_messages to authenticated
using(public.p0_booking_message_access(booking_id));
alter policy booking_event_participant_read on public.booking_conversation_events to authenticated
using(public.p0_booking_message_access(booking_id));

create table public.booking_message_translation_jobs (
  message_id uuid not null references public.booking_messages(id) on delete cascade,
  locale text not null check(locale in ('en','fr','wo','es','zh-CN')),
  retry_after timestamptz not null,
  primary key(message_id,locale)
);
alter table public.booking_message_translation_jobs enable row level security;
revoke all on public.booking_message_translation_jobs from public,anon,authenticated;
grant all on public.booking_message_translation_jobs to service_role;
create function public.claim_booking_message_translation(p_message uuid,p_locale text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare claimed integer;
begin
  if exists(select 1 from public.booking_message_translations t where t.message_id=p_message and t.locale=p_locale) then return false; end if;
  insert into public.booking_message_translation_jobs(message_id,locale,retry_after)
    values(p_message,p_locale,now()+interval '5 minutes')
    on conflict(message_id,locale) do update set retry_after=excluded.retry_after
      where booking_message_translation_jobs.retry_after<=now();
  get diagnostics claimed=row_count;
  return claimed=1;
end $$;
revoke all on function public.claim_booking_message_translation(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_booking_message_translation(uuid,text) to service_role;

update public.engine_settings set published_value='"20260913225436"'::jsonb,
  draft_value='"20260913225436"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
