-- Launch-safe product pickup reservations and admin-curated homepage products.
--
-- Forward-only and additive:
-- * Existing product orders, inventory, products, campaigns and rows remain.
-- * Nationwide shipping data is preserved but is not used by the new launch flow.
-- * New reservation fields are nullable/defaulted, so historical rows are not
--   reclassified or overwritten.

begin;

alter table public.commerce_checkout_intents
  add column if not exists checkout_purpose text not null default 'legacy_purchase',
  add column if not exists management_token_hash text,
  add column if not exists pickup_deposit_amount numeric(10,2) not null default 0,
  add column if not exists pickup_remaining_balance numeric(10,2) not null default 0,
  add column if not exists pickup_deadline timestamptz;

alter table public.commerce_checkout_intents
  drop constraint if exists commerce_checkout_intents_checkout_purpose_check;
alter table public.commerce_checkout_intents
  add constraint commerce_checkout_intents_checkout_purpose_check
  check (checkout_purpose in ('legacy_purchase','combined_checkout','pickup_reservation'));

create unique index if not exists commerce_intents_management_token_unique
  on public.commerce_checkout_intents(management_token_hash)
  where management_token_hash is not null;

alter table public.product_orders
  add column if not exists reservation_status text,
  add column if not exists deposit_amount numeric(10,2) not null default 0,
  add column if not exists remaining_balance numeric(10,2) not null default 0,
  add column if not exists management_token_hash text,
  add column if not exists pickup_deadline timestamptz,
  add column if not exists cancellation_actor text,
  add column if not exists customer_safe_reason text,
  add column if not exists internal_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists refund_status text,
  add column if not exists refund_amount numeric(10,2) not null default 0;

alter table public.product_orders
  drop constraint if exists product_orders_payment_status_check;
alter table public.product_orders
  add constraint product_orders_payment_status_check
  check (payment_status in (
    'Pending payment','Paid','Deposit paid','Partially Refunded','Refund pending',
    'Refunded','Failed','Disputed'
  ));

alter table public.product_orders
  drop constraint if exists product_orders_fulfillment_status_check;
alter table public.product_orders
  add constraint product_orders_fulfillment_status_check
  check (fulfillment_status in (
    'New','Preparing','Ready for Pickup','Shipped','Delivered','Cancelled',
    'Reserved','Ready for pickup','Collected','Canceled','Expired',
    'Not collected','Refunded'
  ));

alter table public.product_orders
  drop constraint if exists product_orders_reservation_status_check;
alter table public.product_orders
  add constraint product_orders_reservation_status_check
  check (
    reservation_status is null or reservation_status in (
      'Pending payment','Reserved','Ready for pickup','Collected','Canceled',
      'Expired','Not collected','Refunded'
    )
  );

alter table public.product_orders
  drop constraint if exists product_orders_cancellation_actor_check;
alter table public.product_orders
  add constraint product_orders_cancellation_actor_check
  check (
    cancellation_actor is null or cancellation_actor in (
      'Customer','Salon','Admin','System'
    )
  );

create unique index if not exists product_orders_management_token_unique
  on public.product_orders(management_token_hash)
  where management_token_hash is not null;
create index if not exists product_orders_reservation_status_idx
  on public.product_orders(reservation_status,pickup_deadline,created_at desc)
  where reservation_status is not null;

create sequence if not exists public.product_reservation_reference_seq
  as bigint start with 1 increment by 1 no minvalue no maxvalue cache 20;

create or replace function public.product_reservation_reference_from_number(
  p_value bigint
) returns text
language sql
immutable
strict
set search_path=public,pg_catalog
as $$
  select 'GCR' || p_value::text
$$;

create or replace function public.reserve_product_pickup_checkout(
  p_salon_id uuid,
  p_customer_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_items jsonb,
  p_product_promotion_id uuid,
  p_deposit_percent numeric,
  p_deposit_minimum numeric,
  p_pickup_deadline_hours integer,
  p_management_token_hash text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  v_reserved jsonb;
  v_intent_id uuid;
  v_total numeric(10,2);
  v_deposit numeric(10,2);
  v_deadline timestamptz;
  v_reference text;
  v_existing public.commerce_checkout_intents%rowtype;
begin
  if nullif(trim(coalesce(p_management_token_hash,'')),'') is null
    or p_deposit_percent < 0 or p_deposit_percent > 100
    or p_deposit_minimum < 0
    or p_pickup_deadline_hours not between 1 and 720 then
    raise exception using errcode='22023', message='PICKUP_RESERVATION_INVALID';
  end if;

  select * into v_existing
  from public.commerce_checkout_intents
  where salon_id=p_salon_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.checkout_purpose <> 'pickup_reservation' then
      raise exception using errcode='22023', message='COMMERCE_IDEMPOTENCY_CLOSED';
    end if;
    return jsonb_build_object(
      'commerce_intent_id',v_existing.id,
      'product_subtotal',v_existing.product_subtotal,
      'product_discount',v_existing.product_discount,
      'product_total',v_existing.product_total,
      'deposit_amount',v_existing.pickup_deposit_amount,
      'remaining_balance',v_existing.pickup_remaining_balance,
      'pickup_deadline',v_existing.pickup_deadline,
      'status',v_existing.status,
      'order_id',v_existing.order_id,
      'expires_at',v_existing.expires_at
    );
  end if;

  v_reserved := public.reserve_combined_checkout(
    p_salon_id,p_customer_id,p_guest_name,p_guest_email,p_guest_phone,
    'Pickup','{}'::jsonb,p_items,null,p_product_promotion_id,0,
    p_idempotency_key
  );
  v_intent_id := (v_reserved ->> 'commerce_intent_id')::uuid;
  v_total := greatest(coalesce((v_reserved ->> 'product_total')::numeric,0),0);
  v_deposit := least(
    v_total,
    greatest(round(v_total * p_deposit_percent / 100,2),p_deposit_minimum)
  );
  v_deadline := now() + make_interval(hours => p_pickup_deadline_hours);
  v_reference := public.product_reservation_reference_from_number(
    nextval('public.product_reservation_reference_seq')
  );

  update public.commerce_checkout_intents
  set checkout_purpose='pickup_reservation',
      management_token_hash=p_management_token_hash,
      pickup_deposit_amount=v_deposit,
      pickup_remaining_balance=greatest(v_total-v_deposit,0),
      pickup_deadline=v_deadline,
      total_charged=v_deposit,
      updated_at=now(),
      shipping_address=jsonb_build_object('reservation_reference',v_reference)
  where id=v_intent_id;

  return jsonb_build_object(
    'commerce_intent_id',v_intent_id,
    'reservation_reference',v_reference,
    'product_subtotal',(v_reserved ->> 'product_subtotal')::numeric,
    'product_discount',(v_reserved ->> 'product_discount')::numeric,
    'product_total',v_total,
    'deposit_amount',v_deposit,
    'remaining_balance',greatest(v_total-v_deposit,0),
    'pickup_deadline',v_deadline,
    'status','Pending',
    'expires_at',v_reserved ->> 'expires_at'
  );
end;
$$;

create or replace function public.complete_product_pickup_reservation(
  p_commerce_intent_id uuid,
  p_payment jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_intent public.commerce_checkout_intents%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_reference text;
  v_processing_fee numeric(10,2) :=
    greatest(coalesce((p_payment ->> 'processing_fee')::numeric,0),0);
begin
  select * into v_intent
  from public.commerce_checkout_intents
  where id=p_commerce_intent_id
  for update;
  if not found then
    raise exception using errcode='22023', message='COMMERCE_INTENT_NOT_FOUND';
  end if;
  if v_intent.checkout_purpose <> 'pickup_reservation' then
    raise exception using errcode='22023', message='PICKUP_RESERVATION_INVALID';
  end if;
  if v_intent.status='Paid' and v_intent.order_id is not null then
    return jsonb_build_object(
      'order_id',v_intent.order_id,'already_completed',true
    );
  end if;
  if v_intent.status <> 'Pending' then
    raise exception using errcode='22023', message='COMMERCE_INTENT_NOT_PENDING';
  end if;
  if v_intent.pickup_deposit_amount > 0
    and nullif(p_payment ->> 'payment_intent_id','') is null then
    raise exception using errcode='22023', message='COMMERCE_PAYMENT_NOT_VERIFIED';
  end if;

  v_reference := coalesce(
    nullif(v_intent.shipping_address ->> 'reservation_reference',''),
    public.product_reservation_reference_from_number(
      nextval('public.product_reservation_reference_seq')
    )
  );

  insert into public.product_orders(
    public_reference,commerce_intent_id,salon_id,customer_id,
    guest_name,guest_email,guest_phone,fulfillment_method,shipping_address,
    subtotal,discount_amount,product_promotion_id,
    product_promotion_snapshot,product_promotion_redemption_id,
    tax_amount,shipping_amount,total_amount,currency,payment_mode,
    payment_status,fulfillment_status,reservation_status,
    deposit_amount,remaining_balance,management_token_hash,pickup_deadline,
    stripe_checkout_session_id,stripe_payment_intent_id,stripe_charge_id,
    stripe_receipt_url,stripe_connected_account_id,stripe_transfer_id,
    stripe_processing_fee,platform_fee,net_amount_owed_salon,payout_status
  ) values (
    v_reference,v_intent.id,v_intent.salon_id,v_intent.customer_id,
    v_intent.guest_name,v_intent.guest_email,v_intent.guest_phone,
    'Pickup','{}'::jsonb,v_intent.product_subtotal,v_intent.product_discount,
    v_intent.product_promotion_id,v_intent.product_promotion_snapshot,
    v_intent.product_promotion_redemption_id,v_intent.tax_amount,0,
    v_intent.product_total,v_intent.currency,
    coalesce(nullif(p_payment ->> 'payment_mode',''),'test'),
    'Deposit paid','Reserved','Reserved',
    v_intent.pickup_deposit_amount,v_intent.pickup_remaining_balance,
    v_intent.management_token_hash,v_intent.pickup_deadline,
    nullif(p_payment ->> 'checkout_session_id',''),
    nullif(p_payment ->> 'payment_intent_id',''),
    nullif(p_payment ->> 'charge_id',''),
    nullif(p_payment ->> 'receipt_url',''),
    nullif(p_payment ->> 'connected_account_id',''),
    nullif(p_payment ->> 'transfer_id',''),
    v_processing_fee,0,
    greatest(v_intent.pickup_deposit_amount-v_processing_fee,0),
    case when nullif(p_payment ->> 'connected_account_id','') is not null
      then 'Destination payment submitted' else 'Awaiting payout' end
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_intent.item_snapshot)
  loop
    insert into public.product_order_items(
      order_id,product_id,product_name,sku,image_url,unit_price,quantity,
      line_total,tax_category,fulfillment_snapshot
    ) values (
      v_order_id,(v_item ->> 'product_id')::uuid,v_item ->> 'name',
      nullif(v_item ->> 'sku',''),nullif(v_item ->> 'image_url',''),
      (v_item ->> 'unit_price')::numeric,(v_item ->> 'quantity')::integer,
      (v_item ->> 'line_total')::numeric,v_item ->> 'tax_category',
      v_item - array[
        'product_id','name','sku','image_url','unit_price','quantity',
        'line_total','tax_category'
      ]
    );
  end loop;

  insert into public.product_order_events(
    order_id,salon_id,event_type,new_status,actor_role,metadata
  ) values (
    v_order_id,v_intent.salon_id,'pickup_reserved','Reserved',
    'payment_provider',
    jsonb_build_object(
      'checkout_session_id',nullif(p_payment ->> 'checkout_session_id',''),
      'payment_intent_id',nullif(p_payment ->> 'payment_intent_id',''),
      'deposit_amount',v_intent.pickup_deposit_amount,
      'remaining_balance',v_intent.pickup_remaining_balance
    )
  );

  update public.product_inventory_reservations
  set status='Converted',updated_at=now()
  where commerce_intent_id=v_intent.id and status='Reserved';
  if v_intent.product_promotion_redemption_id is not null then
    update public.product_promotion_redemptions
    set status='redeemed',product_order_id=v_order_id,redeemed_at=now()
    where id=v_intent.product_promotion_redemption_id
      and status='pending' and expires_at>now();
    if not found then
      raise exception using
        errcode='22023',
        message='PRODUCT_PROMOTION_RESERVATION_NOT_AVAILABLE';
    end if;
  end if;
  update public.commerce_checkout_intents
  set status='Paid',order_id=v_order_id,
      stripe_checkout_session_id=nullif(p_payment ->> 'checkout_session_id',''),
      stripe_payment_intent_id=nullif(p_payment ->> 'payment_intent_id',''),
      updated_at=now()
  where id=v_intent.id;
  return jsonb_build_object('order_id',v_order_id,'already_completed',false);
end;
$$;

revoke all on sequence public.product_reservation_reference_seq
  from public,anon,authenticated;
revoke all on function public.reserve_product_pickup_checkout(
  uuid,uuid,text,text,text,jsonb,uuid,numeric,numeric,integer,text,text
) from public,anon,authenticated;
revoke all on function public.complete_product_pickup_reservation(uuid,jsonb)
  from public,anon,authenticated;
grant usage,select on sequence public.product_reservation_reference_seq
  to service_role;
grant execute on function public.reserve_product_pickup_checkout(
  uuid,uuid,text,text,text,jsonb,uuid,numeric,numeric,integer,text,text
) to service_role;
grant execute on function public.complete_product_pickup_reservation(uuid,jsonb)
  to service_role;

-- Admin-curated product placements. A real product record remains the source
-- of image, inventory, current price, promotion eligibility, and pickup data.
alter table public.marketing_entitlements
  drop constraint if exists marketing_entitlements_placement_type_check;
alter table public.marketing_entitlements
  add constraint marketing_entitlements_placement_type_check
  check (placement_type in ('Featured Salon','Trending Video','Featured Product'));

create table if not exists public.homepage_product_placements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.salon_products(id) on delete restrict,
  entitlement_id uuid references public.marketing_entitlements(id) on delete restrict,
  status text not null default 'Draft'
    check (status in ('Draft','Scheduled','Active','Paused','Expired','Archived')),
  sort_order integer not null default 1 check (sort_order between 1 and 100),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  internal_note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id),
  check (ends_at is null or ends_at>starts_at)
);

create table if not exists public.homepage_product_placement_audit (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null
    references public.homepage_product_placements(id) on delete restrict,
  action text not null,
  previous_values jsonb,
  new_values jsonb,
  reason text,
  acting_admin_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists homepage_product_placement_active_idx
  on public.homepage_product_placements(status,sort_order,starts_at,ends_at);
create index if not exists homepage_product_placement_audit_idx
  on public.homepage_product_placement_audit(placement_id,created_at desc);

alter table public.homepage_product_placements enable row level security;
alter table public.homepage_product_placement_audit enable row level security;
drop policy if exists homepage_product_placements_admin_read
  on public.homepage_product_placements;
create policy homepage_product_placements_admin_read
  on public.homepage_product_placements for select to authenticated
  using(public.admin_has_permission('marketing'));
drop policy if exists homepage_product_audit_admin_read
  on public.homepage_product_placement_audit;
create policy homepage_product_audit_admin_read
  on public.homepage_product_placement_audit for select to authenticated
  using(public.admin_has_permission('marketing'));

create or replace function public.prevent_homepage_product_audit_mutation()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  raise exception 'Homepage product placement audit records are immutable.';
end
$$;
drop trigger if exists homepage_product_audit_immutable
  on public.homepage_product_placement_audit;
create trigger homepage_product_audit_immutable
before update or delete on public.homepage_product_placement_audit
for each row execute function public.prevent_homepage_product_audit_mutation();

-- Keep the homepage section key contract explicit while extending it for the
-- product placement workspace introduced by this migration. The original
-- constraint only allowed the four salon/video sections, so inserting the new
-- canonical section would fail on both a clean database and an existing one.
alter table public.homepage_sections
  drop constraint if exists homepage_sections_section_key_check;
alter table public.homepage_sections
  add constraint homepage_sections_section_key_check
  check (
    section_key in (
      'salons_near_you',
      'featured_salons',
      'trending_now',
      'trending_picks',
      'featured_products'
    )
  );

insert into public.homepage_sections(
  section_key,title,description,is_visible,sort_order,updated_at
) values (
  'featured_products','Featured Products',
  'Reserve salon favorites for local pickup.',true,4,now()
)
on conflict(section_key) do nothing;

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,
  draft_value,published_value,status,impact_level,validation,help_text,
  impact_description,is_public,is_secret_status,sort_order,affected_surfaces
) values
(
  'commerce.pickup_deposit_percent','payments_subscriptions',
  'Pickup reservation deposit percent',
  'Percent of the discounted product total used for a pickup reservation deposit.',
  'number','10','10','Published','billing','{"min":0,"max":100}',
  'The final deposit is the greater of this percentage or the configured minimum, capped at the product total.',
  'Affects future pickup reservation checkouts only.',
  true,false,120,array['Product reservation','Stripe checkout','Finance']
),
(
  'commerce.pickup_deposit_minimum','payments_subscriptions',
  'Pickup reservation minimum deposit',
  'Minimum USD deposit for a product pickup reservation.',
  'number','5','5','Published','billing','{"min":0,"max":1000}',
  'The deposit can never exceed the discounted product total.',
  'Affects future pickup reservation checkouts only.',
  true,false,130,array['Product reservation','Stripe checkout','Finance']
),
(
  'commerce.pickup_deadline_hours','payments_subscriptions',
  'Pickup collection deadline',
  'Hours after reservation that the customer has to collect products.',
  'number','72','72','Published','customer',
  '{"min":1,"max":720,"integer":true}',
  'Salon staff can mark a reservation ready sooner; this is the final collection deadline.',
  'Affects future pickup reservations and customer confirmations.',
  true,false,140,array['Product reservation','Salon products','Notifications']
)
on conflict(setting_key) do update set
  description=excluded.description,
  validation=excluded.validation,
  help_text=excluded.help_text,
  impact_description=excluded.impact_description,
  affected_surfaces=excluded.affected_surfaces;

update public.engine_settings
set draft_value='"20260725105000"'::jsonb,
    published_value='"20260725105000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

commit;
