begin;
alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check(tool in ('get_business_summary','get_bookings','get_availability','get_business_profile','get_services_and_prices','get_business_policies','get_customers','get_professionals','get_products','get_booking_messages','get_reviews','get_promotions','get_plan_status','get_profile_completion','get_earnings_summary','get_upcoming_appointments','get_calendar_gaps','prepare_manual_appointment','prepare_manual_reschedule','prepare_manual_cancellation','prepare_business_hours','prepare_service_edit','prepare_professional_draft','prepare_product_draft','prepare_promotion_draft','prepare_booking_note','prepare_business_profile_update','prepare_availability_block','prepare_service','prepare_customer_message','prepare_business_policy_update'));
alter table public.gc_assistant_requests drop constraint gc_assistant_requests_permission_check;
alter table public.gc_assistant_requests add constraint gc_assistant_requests_permission_check check(permission in ('overview','bookings','availability','my_page','styles','stylists','products','reviews','promotions','earnings'));
-- Additive forward migration: operational appointments share existing occupancy,
-- but cannot acquire marketplace financial, review, or customer-consent credit.
alter table public.bookings
  add column booking_origin text not null default 'marketplace' check(booking_origin in ('marketplace','business_added')),
  add column business_added_by uuid references auth.users(id) on delete set null,
  add column business_added_request_id uuid unique,
  add column manual_service_name text,
  add column origin_checkout_intent_id uuid references public.booking_checkout_intents(id),
  add column business_policy_accepted_at timestamptz,
  add column business_policy_acceptance_kind text not null default 'legacy_unverified' check(business_policy_acceptance_kind in ('legacy_unverified','customer','guest','no_published_policy','business_added_not_accepted')),
  add column business_policy_acceptance_evidence jsonb not null default '{}'::jsonb,
  add column platform_policy_accepted_at timestamptz;
alter table public.bookings alter column style_id drop not null;
alter table public.bookings add constraint booking_service_origin check(style_id is not null or (booking_origin='business_added' and length(trim(manual_service_name)) between 1 and 120));
create index bookings_salon_origin_appointment_idx on public.bookings(salon_id,booking_origin,appointment_datetime);

alter table public.booking_messages add column source_locale_provenance text not null default 'unknown'
  check(source_locale_provenance in ('unknown','sender_selected','assistant_selected'));
create function public.keep_message_language_provenance() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.source_locale_provenance is distinct from old.source_locale_provenance then raise exception 'MESSAGE_SOURCE_IMMUTABLE'; end if;
  return new;
end $$;
revoke all on function public.keep_message_language_provenance() from public,anon,authenticated;
create trigger keep_message_language_provenance before update on public.booking_messages for each row execute function public.keep_message_language_provenance();

-- Match the existing appointment ownership rule for stylist-linked team members.
create function public.p0_actor_can_manage_professional(p_salon uuid,p_actor uuid,p_professional uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.salons where id=p_salon and user_id=p_actor)
    or exists(select 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor and status='Active' and (stylist_id is null or stylist_id=p_professional))
$$;
revoke all on function public.p0_actor_can_manage_professional(uuid,uuid,uuid) from public,anon;
grant execute on function public.p0_actor_can_manage_professional(uuid,uuid,uuid) to authenticated,service_role;

-- Normalize the established object and legacy text hours contracts in one place.
create function public.p0_hours_window(value jsonb) returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $$
declare parts text[]; opening time; closing time;
begin
  if jsonb_typeof(value)='object' then
    if coalesce((value->>'closed')::boolean,false) or value->>'enabled'='false' then return null; end if;
    opening:=(value->>'open')::time; closing:=(value->>'close')::time;
  elsif jsonb_typeof(value)='string' then
    parts:=regexp_split_to_array(value#>>'{}', E'\\s*(?:-|–|—|to)\\s*','i');
    if cardinality(parts)<>2 then return null; end if;
    opening:=parts[1]::time; closing:=parts[2]::time;
  else return null; end if;
  if opening is null or closing is null or closing<=opening then return null; end if;
  return jsonb_build_object('open',opening,'close',closing);
exception when others then return null;
end $$;
revoke all on function public.p0_hours_window(jsonb) from public,anon,authenticated;
grant execute on function public.p0_hours_window(jsonb) to service_role;

create function public.p0_can_read_booking_notes(p_salon uuid,p_booking uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.p0_salon_has_permission(p_salon,'bookings') and exists(select 1 from public.bookings b where b.id=p_booking and b.salon_id=p_salon and public.p0_actor_can_manage_professional(p_salon,auth.uid(),b.stylist_id));
$$;
revoke all on function public.p0_can_read_booking_notes(uuid,uuid) from public,anon;
grant execute on function public.p0_can_read_booking_notes(uuid,uuid) to authenticated,service_role;

-- Private notes are never put in client_notes, messages, public views or welcome events.
create table public.owner_booking_notes (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade, body text not null check(length(body) between 1 and 1200),
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  request_id uuid not null unique
);
alter table public.owner_booking_notes enable row level security;
revoke all on public.owner_booking_notes from public,anon,authenticated;
grant select on public.owner_booking_notes to authenticated;
grant all on public.owner_booking_notes to service_role;
create policy owner_booking_notes_read on public.owner_booking_notes for select to authenticated using(public.p0_can_read_booking_notes(salon_id,booking_id));
create index owner_booking_notes_booking_idx on public.owner_booking_notes(booking_id,created_at);

create function public.guard_business_added_booking() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and (new.booking_origin,new.business_added_request_id,new.business_added_by,new.source,new.created_at) is distinct from (old.booking_origin,old.business_added_request_id,old.business_added_by,old.source,old.created_at)
    and (new.booking_origin='business_added' or old.booking_origin='business_added') then raise exception 'BOOKING_ORIGIN_IMMUTABLE'; end if;
  if new.booking_origin='business_added' then
    if (select current_setting('request.jwt.claim.role',true)) is distinct from 'service_role'
      and coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'BUSINESS_APPOINTMENT_SERVER_ONLY'; end if;
    if new.business_added_request_id is null or (tg_op='INSERT' and new.business_added_by is null)
      or new.source not in ('phone','walk_in','instagram','whatsapp','other')
      or new.customer_id is not null or nullif(trim(new.guest_name),'') is null
      or new.deposit_amount<>0 or new.estimated_total<>0 or new.balance_due<>0
      or coalesce(new.platform_fee,0)<>0 or coalesce(new.stripe_processing_fee,0)<>0 or coalesce(new.net_amount_owed_salon,0)<>0
      or coalesce(new.refund_amount,0)<>0 or new.deposit_status<>'Not collected by Girlz Culture'
      or new.stripe_payment_id is not null or new.stripe_checkout_session_id is not null or new.stripe_charge_id is not null
      or new.stripe_transfer_id is not null or new.stripe_refund_id is not null or new.stripe_payout_id is not null or new.stripe_transfer_reversal_id is not null
      or new.promo_code_id is not null or new.salon_promotion_id is not null or new.salon_promotion_redemption_id is not null
      or coalesce(new.discount_amount,0)<>0 or coalesce(new.promotion_discount_amount,0)<>0 or new.origin_checkout_intent_id is not null
      or new.business_policy_accepted_at is not null or new.platform_policy_accepted_at is not null
      or new.business_policy_acceptance_kind<>'business_added_not_accepted'
      or new.business_policy_acceptance_evidence<>'{}'::jsonb or new.business_policy_revision_id is not null
      or new.business_policy_snapshot<>'{}'::jsonb then raise exception 'BUSINESS_APPOINTMENT_MARKETPLACE_CREDIT_FORBIDDEN'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_business_added_booking() from public,anon,authenticated;
create trigger zz_guard_business_added_booking before insert or update on public.bookings for each row execute function public.guard_business_added_booking();

-- New manual appointments cannot earn a verified-review token or a review even
-- through a privileged legacy API. The guest is not a fabricated auth identity.
create function public.guard_marketplace_review_origin() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.bookings b where b.id=new.booking_id and b.booking_origin='business_added') then raise exception 'BUSINESS_APPOINTMENT_REVIEW_INELIGIBLE'; end if;
  return new;
end $$;
revoke all on function public.guard_marketplace_review_origin() from public,anon,authenticated;
create trigger aa_marketplace_review_origin before insert or update on public.reviews for each row execute function public.guard_marketplace_review_origin();
create trigger aa_marketplace_review_link_origin before insert or update on public.booking_review_links for each row execute function public.guard_marketplace_review_origin();

create or replace function public.capture_booking_p0_evidence() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare policy_row public.business_policy_revisions%rowtype; accepted jsonb;
begin
  if tg_op='UPDATE' then
    if (new.business_policy_accepted_at,new.business_policy_acceptance_kind,new.business_policy_acceptance_evidence,new.platform_policy_accepted_at)
      is distinct from (old.business_policy_accepted_at,old.business_policy_acceptance_kind,old.business_policy_acceptance_evidence,old.platform_policy_accepted_at) then raise exception 'BOOKING_POLICY_ACCEPTANCE_IMMUTABLE'; end if;
    if new.business_policy_revision_id is distinct from old.business_policy_revision_id
      or new.business_policy_snapshot is distinct from old.business_policy_snapshot
      or new.business_policy_version is distinct from old.business_policy_version
      or new.business_policy_captured_at is distinct from old.business_policy_captured_at then
      raise exception using message='BOOKING_POLICY_SNAPSHOT_IMMUTABLE',errcode='23514';
    end if;
    return new;
  end if;
  if new.booking_origin='business_added' then
    new.business_policy_revision_id:=null; new.business_policy_version:=null; new.business_policy_snapshot:='{}'::jsonb; new.business_policy_captured_at:=null;
    return new;
  end if;
  -- Serialize against policy publication on this business, not other businesses.
  perform 1 from public.salons s where s.id=new.salon_id for share;
  -- Combined checkout uses an established explicit booking column list. Recover
  -- its accepted policy from the server-created intent using its payment-session
  -- identity; never substitute the business's newer policy during finalization.
  if new.stripe_checkout_session_id is not null and auth.role()='service_role' then
    select i.payload into accepted from public.booking_checkout_intents i
      where i.stripe_checkout_session_id=new.stripe_checkout_session_id and i.salon_id=new.salon_id
        and i.payload ? 'business_policy_captured_at';
    if found then
      new.business_policy_captured_at:=(accepted->>'business_policy_captured_at')::timestamptz;
      new.business_policy_revision_id:=(accepted->>'business_policy_revision_id')::uuid;
      new.business_policy_accepted_at:=(accepted->>'business_policy_accepted_at')::timestamptz;
      new.business_policy_acceptance_kind:=coalesce(accepted->>'business_policy_acceptance_kind','legacy_unverified');
      new.business_policy_acceptance_evidence:=coalesce(accepted->'business_policy_acceptance_evidence','{}'::jsonb);
      new.platform_policy_accepted_at:=(accepted->>'platform_policy_accepted_at')::timestamptz;
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
  if new.business_policy_acceptance_kind in ('customer','guest') then
    if policy_row.id is null or new.business_policy_accepted_at is null or new.platform_policy_accepted_at is null
      or new.business_policy_acceptance_evidence->>'channel' is distinct from 'marketplace_checkout'
      or (new.business_policy_acceptance_kind='customer' and (new.customer_id is null or new.business_policy_acceptance_evidence->>'user_id' is distinct from new.customer_id::text))
      or (new.business_policy_acceptance_kind='guest' and (new.customer_id is not null or lower(new.business_policy_acceptance_evidence->>'guest_email') is distinct from lower(new.guest_email))) then raise exception 'BOOKING_POLICY_ACCEPTANCE_INVALID'; end if;
  end if;
  new.business_policy_revision_id:=policy_row.id;
  new.business_policy_version:=policy_row.version;
  new.business_policy_snapshot:=coalesce(policy_row.policy,'{}'::jsonb);
  return new;
end $$;
revoke all on function public.capture_booking_p0_evidence() from public,anon,authenticated;
create or replace function public.open_booking_conversation_event() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.booking_origin='business_added' then return new; end if;
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

-- Serialize calendar occupancy for marketplace holds, appointments and overrides.
-- Recheck after taking the shared lock; a preflight alone cannot prevent races.
create function public.p0_calendar_occupancy_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_salon uuid; v_stylist uuid; v_start timestamptz; v_end timestamptz; v_session text; v_id uuid;
begin
  v_salon:=new.salon_id; v_id:=new.id;
  if tg_table_name='bookings' and to_jsonb(new)->>'origin_checkout_intent_id' is not null then
    if auth.role() is distinct from 'service_role' then raise exception 'CHECKOUT_ORIGIN_SERVER_ONLY'; end if;
    if not exists(select 1 from public.booking_checkout_intents i where i.id=(to_jsonb(new)->>'origin_checkout_intent_id')::uuid and i.salon_id=v_salon and i.customer_id is not distinct from new.customer_id and coalesce(i.appointment_datetime,(i.payload->>'appointment_datetime')::timestamptz)=new.appointment_datetime) then raise exception 'CHECKOUT_ORIGIN_INVALID'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p0-calendar:'||v_salon::text,0));
  if tg_table_name='salon_blockouts' then return new; end if;
  v_stylist:=new.stylist_id; v_start:=new.appointment_datetime;
  v_end:=v_start+make_interval(secs=>(coalesce(new.duration_hours,0)*3600+coalesce(new.buffer_minutes,0)*60)::double precision);
  v_session:=new.stripe_checkout_session_id;
  if tg_table_name='bookings' and lower(coalesce(new.status,'')) in ('cancelled','canceled') then return new; end if;
  if tg_table_name='booking_checkout_intents' and (new.status<>'Pending' or (to_jsonb(new)->>'expires_at')::timestamptz<=now()) then return new; end if;
  if exists(select 1 from public.bookings b where b.salon_id=v_salon and b.id<>v_id and b.is_active_booking
    and (v_stylist is null or b.stylist_id is null or b.stylist_id=v_stylist)
    and b.appointment_datetime<v_end and b.blocked_until>v_start)
    or exists(select 1 from public.booking_checkout_intents i where i.salon_id=v_salon and i.id<>v_id and i.status='Pending' and i.expires_at>now()
    and (v_stylist is null or i.stylist_id is null or i.stylist_id=v_stylist)
    and i.appointment_datetime<v_end and i.blocked_until>v_start
    and (v_session is null or i.stripe_checkout_session_id is distinct from v_session)
    and (tg_table_name<>'bookings' or i.id is distinct from (to_jsonb(new)->>'origin_checkout_intent_id')::uuid)) then raise exception 'BOOKING_RESOURCE_CONFLICT'; end if;
  -- Ordinary updates to an existing appointment must remain possible when an
  -- owner subsequently blocks their calendar. New or moved appointments may not.
  if tg_op='INSERT' or (new.appointment_datetime,new.stylist_id,new.duration_hours,new.buffer_minutes) is distinct from (old.appointment_datetime,old.stylist_id,old.duration_hours,old.buffer_minutes) then
    if exists(select 1 from public.salon_blockouts b where b.salon_id=v_salon and b.released_at is null
      and (b.stylist_id is null or v_stylist is null or b.stylist_id=v_stylist) and b.starts_at<v_end and b.ends_at>v_start) then raise exception 'BOOKING_RESOURCE_CONFLICT'; end if;
  end if;
  return new;
end $$;
revoke all on function public.p0_calendar_occupancy_guard() from public,anon,authenticated;
create trigger aa_p0_calendar_occupancy before insert or update on public.bookings for each row execute function public.p0_calendar_occupancy_guard();
create trigger aa_p0_calendar_occupancy before insert or update on public.booking_checkout_intents for each row execute function public.p0_calendar_occupancy_guard();
create trigger aa_p0_calendar_occupancy before insert or update on public.salon_blockouts for each row execute function public.p0_calendar_occupancy_guard();

create function public.save_business_added_appointment(p_salon uuid,p_actor uuid,p_request uuid,p_args jsonb,p_payload jsonb,p_before jsonb,p_action text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype; s public.salons%rowtype; st public.styles%rowtype; professional public.stylists%rowtype;
  v_start timestamptz; v_end timestamptz; local_start timestamp; local_end timestamp; day_name text;
  h jsonb; ph jsonb; v_duration integer; v_buffer integer; v_stylist uuid; count_professionals integer;
begin
  select * into s from public.salons where id=p_salon for update;
  perform 1 from public.platform_identities where user_id=p_actor for share;
  perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
  perform 1 from public.subscriptions where salon_id=p_salon for share;
  if not public.p0_actor_has_permission(p_salon,p_actor,'bookings') then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
  if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED'; end if;
  if p_action not in ('prepare_manual_appointment','prepare_manual_reschedule','prepare_manual_cancellation') then raise exception 'ASSISTANT_INVALID_INPUT'; end if;
  if p_action<>'prepare_manual_appointment' then
    select * into b from public.bookings where id=(p_args->>'booking_id')::uuid and salon_id=p_salon for update;
    if not found or b.booking_origin<>'business_added' or to_jsonb(b) is distinct from p_before then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
    if b.status not in ('Confirmed','Requested') then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
  end if;
  if b.id is not null and not public.p0_actor_can_manage_professional(p_salon,p_actor,b.stylist_id) then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
  if p_action='prepare_manual_cancellation' then
    update public.bookings set status='Cancelled',cancelled_at=now(),cancelled_by='salon',cancellation_reason=p_args->>'reason' where id=b.id returning * into b;
    return to_jsonb(b);
  end if;
  v_stylist:=(p_payload->>'stylist_id')::uuid; v_start:=(p_payload->>'appointment_datetime')::timestamptz;
  if not public.p0_actor_can_manage_professional(p_salon,p_actor,v_stylist) then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
  v_duration:=(p_payload->>'duration_minutes')::integer; v_buffer:=(p_payload->>'buffer_minutes')::integer;
  if v_duration not between 15 and 1440 or v_buffer not between 0 and 180 or v_start<=now() or v_start>now()+interval '365 days' or p_payload->>'time_zone' is distinct from s.time_zone then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
  v_end:=v_start+make_interval(mins=>v_duration+v_buffer);
  local_start:=v_start at time zone s.time_zone; local_end:=v_end at time zone s.time_zone;
  if to_char(local_start,'YYYY-MM-DD') is distinct from p_args->>'date' or to_char(local_start,'HH24:MI') is distinct from p_args->>'time' then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
  day_name:=(array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from local_start)::integer+1];
  h:=public.p0_hours_window(s.hours->day_name);
  if h is null or jsonb_typeof(h)<>'object' or coalesce((h->>'closed')::boolean,false) or local_start::date<>local_end::date
    or local_start::time<(h->>'open')::time or local_end::time>(h->>'close')::time then raise exception 'ASSISTANT_AVAILABILITY_CONFLICT'; end if;
  if s.is_closed_override and s.closed_override_date=local_start::date then raise exception 'ASSISTANT_AVAILABILITY_CONFLICT'; end if;
  select count(*) into count_professionals from public.stylists where salon_id=p_salon and is_active and archived_at is null;
  if v_stylist is null and count_professionals>0 then raise exception 'ASSISTANT_PROFESSIONAL_CLARIFICATION_REQUIRED'; end if;
  if v_stylist is not null then
    select * into professional from public.stylists where id=v_stylist and salon_id=p_salon and is_active and archived_at is null for share;
    if not found then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
    ph:=public.p0_hours_window(professional.availability->day_name);
    if ph is null or jsonb_typeof(ph)<>'object' or coalesce((ph->>'closed')::boolean,false) or local_start::time<(ph->>'open')::time or local_end::time>(ph->>'close')::time then raise exception 'ASSISTANT_AVAILABILITY_CONFLICT'; end if;
  end if;
  if coalesce(b.style_id,(p_args->>'style_id')::uuid) is not null then
    select * into st from public.styles where id=coalesce(b.style_id,(p_args->>'style_id')::uuid) and salon_id=p_salon and archived_at is null and not is_draft for share;
    if not found or v_duration<st.duration_min_hours*60 or v_duration>coalesce(st.duration_max_hours,st.duration_min_hours)*60 or v_buffer<>st.buffer_minutes then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
    if p_payload->'service_facts' is distinct from jsonb_build_object('id',st.id,'name',st.name,'duration_min_hours',st.duration_min_hours,'duration_max_hours',st.duration_max_hours,'buffer_minutes',st.buffer_minutes,'is_draft',st.is_draft,'archived_at',st.archived_at) then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
  end if;
  if p_action='prepare_manual_reschedule' then
    update public.bookings set appointment_datetime=v_start,stylist_id=v_stylist,duration_hours=v_duration::numeric/60,buffer_minutes=v_buffer where id=b.id returning * into b;
  else
    insert into public.bookings(salon_id,style_id,stylist_id,guest_name,guest_email,guest_phone,appointment_datetime,duration_hours,buffer_minutes,estimated_total,deposit_amount,balance_due,deposit_status,status,source,booking_origin,business_added_by,business_added_request_id,manual_service_name,business_policy_acceptance_kind,financial_status,payout_status,net_amount_owed_salon,payment_mode)
    values(p_salon,(p_args->>'style_id')::uuid,v_stylist,p_args->>'guest_name',nullif(p_args->>'guest_email',''),nullif(p_args->>'guest_phone',''),v_start,v_duration::numeric/60,v_buffer,0,0,0,'Not collected by Girlz Culture','Confirmed',p_args->>'source','business_added',p_actor,p_request,p_payload->>'service_name','business_added_not_accepted','Not collected by Girlz Culture','Not required',0,null) returning * into b;
    if length(trim(coalesce(p_args->>'notes','')))>0 then
      insert into public.owner_booking_notes(booking_id,salon_id,body,created_by,request_id) values(b.id,p_salon,p_args->>'notes',p_actor,p_request);
    end if;
  end if;
  return to_jsonb(b);
end $$;
revoke all on function public.save_business_added_appointment(uuid,uuid,uuid,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_business_added_appointment(uuid,uuid,uuid,jsonb,jsonb,jsonb,text) to service_role;

create function public.save_owner_catalog_draft(p_salon uuid,p_actor uuid,p_tool text,p_payload jsonb,p_before jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare table_name text; permission text; v_id uuid:=(p_payload->>'record_id')::uuid; v jsonb:=p_payload->'values'; current_row jsonb; saved jsonb;
begin
  table_name:=case p_tool when 'prepare_service_edit' then 'styles' when 'prepare_professional_draft' then 'stylists' when 'prepare_product_draft' then 'salon_products' when 'prepare_promotion_draft' then 'salon_promotions' end;
  permission:=case table_name when 'styles' then 'styles' when 'stylists' then 'stylists' when 'salon_products' then 'products' when 'salon_promotions' then 'promotions' end;
  if table_name is null or table_name is distinct from p_payload->>'table' or not public.p0_actor_has_permission(p_salon,p_actor,permission) then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
  if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED'; end if;
  if table_name in ('salon_products','salon_promotions') and not exists(
    select 1 from public.subscriptions where salon_id=p_salon
      and lower(status) in ('active','trialing') and (current_period_end is null or current_period_end>now())
  ) then raise exception 'ASSISTANT_PLAN_REQUIRED'; end if;
  if v_id is not null then
    -- Only these four hard-coded table choices reach this query. The model
    -- cannot supply identifiers, predicates, SQL, or arbitrary field names.
    execute format('select to_jsonb(r) from public.%I r where id=$1 and salon_id=$2 for update',table_name) into current_row using v_id,p_salon;
    if current_row is null or current_row is distinct from p_before then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
    if (case when table_name in ('styles','stylists') then current_row->>'is_draft' is distinct from 'true' when table_name='salon_products' then current_row->>'product_status' is distinct from 'Draft' else current_row->>'status' is distinct from 'Draft' end) then raise exception 'ASSISTANT_DRAFT_REQUIRED'; end if;
  end if;
  if table_name='styles' then
    -- Reuse the established service/material transaction, preserving materials.
    saved:=public.save_salon_style_with_materials(p_salon,v_id,v,(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.style_materials m where style_id=v_id))->'record';
  elsif table_name='stylists' then
    if v_id is null then
      insert into public.stylists(salon_id,name,bio,specialties,years_experience,is_active,is_draft) values(p_salon,v->>'name',v->>'bio',v->'specialties',(v->>'years_experience')::numeric,false,true) returning to_jsonb(stylists) into saved;
    else update public.stylists set name=v->>'name',bio=v->>'bio',specialties=v->'specialties',years_experience=(v->>'years_experience')::numeric,is_active=false,is_draft=true where id=v_id and salon_id=p_salon returning to_jsonb(stylists) into saved; end if;
  elsif table_name='salon_products' then
    -- The existing plan-limit trigger remains authoritative and serializes the
    -- new listing count, including draft product listings.
    if v_id is null then insert into public.salon_products(salon_id,name,description,price,product_status,is_visible) values(p_salon,v->>'name',v->>'description',(v->>'price')::numeric,'Draft',false) returning to_jsonb(salon_products) into saved;
    else update public.salon_products set name=v->>'name',description=v->>'description',price=(v->>'price')::numeric where id=v_id and salon_id=p_salon returning to_jsonb(salon_products) into saved; end if;
  else
    if v_id is null then insert into public.salon_promotions(salon_id,title,public_headline,description,promotion_type,discount_value,starts_at,ends_at,timezone,status,is_active,target_scope) values(p_salon,v->>'title',v->>'public_headline',v->>'description',v->>'promotion_type',(v->>'discount_value')::numeric,(v->>'starts_at')::timestamptz,(v->>'ends_at')::timestamptz,v->>'timezone','Draft',false,'salon') returning to_jsonb(salon_promotions) into saved;
    else update public.salon_promotions set title=v->>'title',public_headline=v->>'public_headline',description=v->>'description',promotion_type=v->>'promotion_type',discount_value=(v->>'discount_value')::numeric,starts_at=(v->>'starts_at')::timestamptz,ends_at=(v->>'ends_at')::timestamptz,timezone=v->>'timezone' where id=v_id and salon_id=p_salon returning to_jsonb(salon_promotions) into saved; end if;
  end if;
  return saved;
end $$;
revoke all on function public.save_owner_catalog_draft(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_owner_catalog_draft(uuid,uuid,text,jsonb,jsonb) to service_role;
create or replace function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text)
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
  expected_permission:=case r.tool when 'prepare_business_profile_update' then case when r.arguments->>'field'='hours' then 'availability' else 'my_page' end when 'prepare_business_hours' then 'availability' when 'prepare_manual_appointment' then 'bookings' when 'prepare_manual_reschedule' then 'bookings' when 'prepare_manual_cancellation' then 'bookings' when 'prepare_booking_note' then 'bookings' when 'prepare_service_edit' then 'styles' when 'prepare_professional_draft' then 'stylists' when 'prepare_product_draft' then 'products' when 'prepare_promotion_draft' then 'promotions' when 'prepare_availability_block' then 'availability' when 'prepare_service' then 'styles' when 'prepare_customer_message' then 'bookings' when 'prepare_business_policy_update' then 'my_page' else null end;
  expected_risk:=case when r.tool in ('prepare_availability_block','prepare_service','prepare_business_hours','prepare_manual_appointment','prepare_manual_reschedule','prepare_manual_cancellation','prepare_booking_note','prepare_service_edit','prepare_professional_draft','prepare_product_draft','prepare_promotion_draft') then 3 else 4 end;
  if expected_permission is null or r.permission<>expected_permission or r.risk_class<>expected_risk
    or not public.p0_actor_has_permission(p_salon,p_actor,expected_permission) then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
  if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
  if r.confirmed_at is not null then return jsonb_build_object('verified',true,'replayed',true,'result',r.result); end if;
  if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED'; end if;
  perform 1 from public.subscriptions where salon_id=p_salon for share;
  if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED'; end if;
  begin
    if r.tool in ('prepare_manual_appointment','prepare_manual_reschedule','prepare_manual_cancellation') then
      saved:=public.save_business_added_appointment(p_salon,p_actor,r.id,r.arguments,r.execution_payload,r.before_summary,r.tool);
    elsif r.tool in ('prepare_service_edit','prepare_professional_draft','prepare_product_draft','prepare_promotion_draft') then
      saved:=public.save_owner_catalog_draft(p_salon,p_actor,r.tool,r.execution_payload,r.before_summary);
    elsif r.tool='prepare_business_hours' then
      if jsonb_build_object('hours',s.hours) is distinct from r.before_summary then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
      update public.salons set hours=r.execution_payload->'hours' where id=p_salon;
      saved:=r.execution_payload;
    elsif r.tool='prepare_booking_note' then
      select to_jsonb(b) into current_value from public.bookings b where b.id=(r.arguments->>'booking_id')::uuid and b.salon_id=p_salon for update;
      if current_value is null or current_value is distinct from r.before_summary then raise exception 'ASSISTANT_PREVIEW_STALE'; end if;
      if not public.p0_actor_can_manage_professional(p_salon,p_actor,(current_value->>'stylist_id')::uuid) then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
      insert into public.owner_booking_notes(booking_id,salon_id,body,created_by,request_id) values((r.arguments->>'booking_id')::uuid,p_salon,r.arguments->>'note',p_actor,r.id) returning to_jsonb(owner_booking_notes) into saved;
    elsif r.tool='prepare_business_profile_update' then
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
      if exists(select 1 from public.bookings b where b.id=(r.arguments->>'booking_id')::uuid and b.booking_origin='business_added' and b.customer_id is null) then raise exception 'ASSISTANT_CUSTOMER_PARTICIPANT_REQUIRED'; end if;
      insert into public.booking_messages(booking_id,salon_id,sender_user_id,sender_role,body,original_body,source_locale,source_locale_provenance,client_request_id,read_by_salon_at)
      values((r.arguments->>'booking_id')::uuid,p_salon,p_actor,'salon',r.arguments->>'body',r.arguments->>'body',r.locale,'assistant_selected',r.id,now()) returning jsonb_build_object('id',id,'booking_id',booking_id,'body',body) into saved;
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
    failure:=case when sqlerrm='BOOKING_RESOURCE_CONFLICT' then 'ASSISTANT_AVAILABILITY_CONFLICT' when sqlerrm in ('ASSISTANT_PREVIEW_STALE','ASSISTANT_RANGE_CONFLICT','ASSISTANT_ACCESS_DENIED','ASSISTANT_INVALID_INPUT','ASSISTANT_AVAILABILITY_CONFLICT','ASSISTANT_DRAFT_REQUIRED','ASSISTANT_CUSTOMER_PARTICIPANT_REQUIRED','ASSISTANT_PLAN_REQUIRED') then sqlerrm else 'ASSISTANT_ACTION_FAILED' end;
    update public.gc_assistant_requests set failure_code=failure where id=r.id;
    insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
    return jsonb_build_object('verified',false,'code',failure);
  end;
end $$;
revoke all on function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) to service_role;


-- Pass acceptance evidence through the existing combined checkout column list.
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
      stripe_processing_fee,platform_fee,net_amount_owed_salon,payout_status,business_policy_revision_id,business_policy_captured_at,origin_checkout_intent_id,business_policy_accepted_at,business_policy_acceptance_kind,business_policy_acceptance_evidence,platform_policy_accepted_at
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
      nullif(v_booking_intent.payload ->> 'business_policy_captured_at','')::timestamptz,
      v_booking_intent.id,
      nullif(v_booking_intent.payload ->> 'business_policy_accepted_at','')::timestamptz,
      coalesce(v_booking_intent.payload ->> 'business_policy_acceptance_kind','legacy_unverified'),
      coalesce(v_booking_intent.payload -> 'business_policy_acceptance_evidence','{}'::jsonb),
      nullif(v_booking_intent.payload ->> 'platform_policy_accepted_at','')::timestamptz
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


-- Marketplace acquisition, GMV and quality metrics exclude business-added work.
create or replace function public.platform_admin_overview_metrics()
returns table (
  total_salons bigint,
  active_salons bigint,
  pending_submissions bigint,
  total_customers bigint,
  total_bookings bigint,
  completed_booking_value numeric,
  deposits_collected numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (
      select count(*)
      from public.salons salon
      where salon.deleted_at is null
    )::bigint as total_salons,
    (
      select count(*)
      from public.salons salon
      where salon.deleted_at is null
        and salon.status = 'Active'
    )::bigint as active_salons,
    (
      select count(*)
      from public.salon_applications application
      where application.status = 'Pending'
        and application.archived_at is null
    )::bigint as pending_submissions,
    (
      select count(*)
      from public.customers
    )::bigint as total_customers,
    (
      select count(*)
      from public.bookings where booking_origin='marketplace'
    )::bigint as total_bookings,
    (
      select coalesce(sum(booking.estimated_total), 0)::numeric
      from public.bookings booking
      where booking.booking_origin='marketplace' and lower(coalesce(booking.status, '')) = 'completed'
    ) as completed_booking_value,
    (
      select coalesce(sum(booking.deposit_amount), 0)::numeric
      from public.bookings booking
      where booking.booking_origin='marketplace' and lower(coalesce(booking.deposit_status, ''))
        in ('paid', 'succeeded', 'complete', 'completed')
        and booking.payment_verified_at is not null
    ) as deposits_collected;
$$;

create or replace view public.salon_quality_metrics
with (security_invoker = true)
as
with terminal_bookings as (
  select booking.*
  from public.bookings booking
  where booking.booking_origin='marketplace' and lower(coalesce(booking.status, '')) in ('completed', 'cancelled', 'canceled')
    and booking.appointment_datetime >= now() - interval '365 days'
), booking_stats as (
  select
    salon_id,
    count(*)::integer total_bookings,
    count(*) filter (where lower(coalesce(status, '')) = 'completed')::integer completed_bookings,
    count(*) filter (
      where lower(coalesce(status, '')) in ('cancelled', 'canceled')
        and lower(coalesce(cancelled_by, cancellation_initiated_by, '')) = 'salon'
    )::integer salon_cancellations,
    count(*) filter (
      where lower(coalesce(status, '')) = 'completed'
        and service_started_at is not null
    )::integer on_time_measured,
    count(*) filter (
      where lower(coalesce(status, '')) = 'completed'
        and service_started_at is not null
        and service_started_at <= appointment_datetime + interval '15 minutes'
    )::integer on_time_count
  from terminal_bookings
  group by salon_id
), complaint_stats as (
  select complaint.salon_id, count(*)::integer complaint_count
  from public.complaints_log complaint
  where complaint.booking_verified
    and lower(coalesce(complaint.status, '')) not in ('closed', 'resolved')
    and complaint.created_at >= now() - interval '365 days'
  group by complaint.salon_id
), metrics as (
  select
    salon.id salon_id,
    coalesce(stats.total_bookings, 0) total_bookings,
    coalesce(stats.completed_bookings, 0) completed_bookings,
    coalesce(stats.salon_cancellations, 0) salon_cancellations,
    case
      when coalesce(stats.total_bookings, 0) > 0
        then round(stats.salon_cancellations::numeric / stats.total_bookings * 100, 2)
      else 0
    end cancellation_rate_percent,
    coalesce(stats.on_time_measured, 0) on_time_measured,
    case
      when coalesce(stats.on_time_measured, 0) > 0
        then round(stats.on_time_count::numeric / stats.on_time_measured * 100, 2)
    end on_time_rate_percent,
    coalesce(complaints.complaint_count, 0) active_complaints,
    case
      when coalesce(stats.total_bookings, 0) > 0
        then greatest(
          0,
          round(
            (1 - least(coalesce(complaints.complaint_count, 0)::numeric / stats.total_bookings, 1)) * 100,
            2
          )
        )
    end complaint_free_rate_percent,
    salon.rating_overall,
    salon.review_count
  from public.salons salon
  left join booking_stats stats on stats.salon_id = salon.id
  left join complaint_stats complaints on complaints.salon_id = salon.id
)
select
  metrics.*,
  round(
    (
      case when coalesce(review_count, 0) > 0 then least(greatest(rating_overall * 20, 0), 100) * 0.40 else 0 end
      + case when total_bookings > 0 then (100 - cancellation_rate_percent) * 0.30 else 0 end
      + case when on_time_rate_percent is not null then on_time_rate_percent * 0.20 else 0 end
      + case when complaint_free_rate_percent is not null then complaint_free_rate_percent * 0.10 else 0 end
    ) / nullif(
      (case when coalesce(review_count, 0) > 0 then 0.40 else 0 end)
      + (case when total_bookings > 0 then 0.30 else 0 end)
      + (case when on_time_rate_percent is not null then 0.20 else 0 end)
      + (case when complaint_free_rate_percent is not null then 0.10 else 0 end),
      0
    ),
    1
  ) composite_quality_score,
  coalesce(
    (select (value ->> 'salon_cancellation_rate_percent')::numeric
     from public.admin_settings where key = 'quality_thresholds'),
    10
  ) cancellation_threshold_percent,
  now() - interval '365 days' measurement_window_start,
  now() measurement_window_end
from metrics;


-- Keep the Engine's migration-health marker aligned with this forward migration.
update public.engine_settings set published_value='"20260914113932"'::jsonb,
  draft_value='"20260914113932"'::jsonb,updated_at=now()
where setting_key='integrations.expected_migration';

commit;
