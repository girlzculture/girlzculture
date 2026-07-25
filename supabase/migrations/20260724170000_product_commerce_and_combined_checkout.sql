-- Product commerce, atomic inventory/appointment reservation, combined checkout,
-- fulfillment, payout evidence, and auditable product refunds.
--
-- This migration is additive. Existing catalog rows remain visible and receive
-- conservative defaults: inventory tracking is off and online fulfillment is
-- disabled until the salon explicitly configures it.

begin;

alter table public.salon_products
  add column if not exists sku text,
  add column if not exists sale_price numeric(10,2),
  add column if not exists inventory_quantity integer not null default 0,
  add column if not exists low_stock_threshold integer not null default 5,
  add column if not exists track_inventory boolean not null default false,
  add column if not exists product_status text not null default 'Draft',
  add column if not exists pickup_enabled boolean not null default false,
  add column if not exists pickup_prep_minutes integer not null default 60,
  add column if not exists shipping_enabled boolean not null default false,
  add column if not exists weight_ounces numeric(10,2),
  add column if not exists dimensions jsonb not null default '{}'::jsonb,
  add column if not exists shipping_profile text,
  add column if not exists shipping_price numeric(10,2) not null default 0,
  add column if not exists tax_category text not null default 'general_tangible_goods',
  add column if not exists max_quantity_per_order integer not null default 10,
  add column if not exists images jsonb not null default '[]'::jsonb;

alter table public.salon_products
  drop constraint if exists salon_products_sale_price_check,
  add constraint salon_products_sale_price_check
    check (sale_price is null or (sale_price >= 0 and sale_price <= price)),
  drop constraint if exists salon_products_inventory_quantity_check,
  add constraint salon_products_inventory_quantity_check
    check (inventory_quantity between 0 and 1000000),
  drop constraint if exists salon_products_low_stock_threshold_check,
  add constraint salon_products_low_stock_threshold_check
    check (low_stock_threshold between 0 and 1000000),
  drop constraint if exists salon_products_product_status_check,
  add constraint salon_products_product_status_check
    check (product_status in ('Draft','Active','Archived')),
  drop constraint if exists salon_products_pickup_prep_minutes_check,
  add constraint salon_products_pickup_prep_minutes_check
    check (pickup_prep_minutes between 0 and 43200),
  drop constraint if exists salon_products_shipping_price_check,
  add constraint salon_products_shipping_price_check
    check (shipping_price between 0 and 100000),
  drop constraint if exists salon_products_weight_ounces_check,
  add constraint salon_products_weight_ounces_check
    check (weight_ounces is null or weight_ounces between 0.01 and 100000),
  drop constraint if exists salon_products_max_quantity_check,
  add constraint salon_products_max_quantity_check
    check (max_quantity_per_order between 1 and 1000);

-- Preserve the visibility of catalog entries that were already published
-- before lifecycle status existed. Online fulfillment remains opt-in.
update public.salon_products
set product_status='Active'
where is_visible and archived_at is null and product_status='Draft';

create unique index if not exists salon_products_salon_sku_unique
  on public.salon_products(salon_id, lower(sku))
  where sku is not null and trim(sku) <> '' and archived_at is null;
create index if not exists salon_products_online_catalog_idx
  on public.salon_products(salon_id, product_status, is_visible)
  where archived_at is null;

create sequence if not exists public.product_order_reference_seq
  as bigint start with 1 increment by 1 no minvalue no maxvalue cache 20;

create or replace function public.product_order_reference_from_number(p_value bigint)
returns text
language plpgsql
immutable
strict
set search_path=public
as $$
declare
  v_block bigint;
  v_suffix integer;
  v_letters text := '';
  v_cursor bigint;
begin
  if p_value < 1 then
    raise exception using errcode='22023', message='ORDER_REFERENCE_VALUE_INVALID';
  end if;
  v_block := (p_value - 1) / 99;
  v_suffix := ((p_value - 1) % 99 + 1)::integer;
  v_cursor := v_block + 1;
  while v_cursor > 0 loop
    v_cursor := v_cursor - 1;
    v_letters := chr(65 + (v_cursor % 26)::integer) || v_letters;
    v_cursor := v_cursor / 26;
  end loop;
  return 'GC-P-' || v_letters || '-' || lpad(v_suffix::text, 2, '0');
end;
$$;

create table if not exists public.commerce_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  fulfillment_method text not null
    check (fulfillment_method in ('Pickup','Shipping')),
  shipping_address jsonb not null default '{}'::jsonb,
  item_snapshot jsonb not null default '[]'::jsonb,
  product_subtotal numeric(10,2) not null default 0 check (product_subtotal >= 0),
  product_discount numeric(10,2) not null default 0 check (product_discount >= 0),
  product_promotion_id uuid references public.salon_promotions(id) on delete set null,
  product_promotion_snapshot jsonb not null default '{}'::jsonb,
  product_promotion_redemption_id uuid,
  tax_amount numeric(10,2) not null default 0 check (tax_amount >= 0),
  shipping_amount numeric(10,2) not null default 0 check (shipping_amount >= 0),
  product_total numeric(10,2) not null default 0 check (product_total >= 0),
  booking_intent_id uuid references public.booking_checkout_intents(id) on delete set null,
  appointment_total numeric(10,2) not null default 0 check (appointment_total >= 0),
  appointment_deposit numeric(10,2) not null default 0 check (appointment_deposit >= 0),
  total_charged numeric(10,2) not null default 0 check (total_charged >= 0),
  currency text not null default 'usd',
  idempotency_key text not null,
  stripe_checkout_session_id text unique,
  stripe_tax_calculation_id text,
  stripe_payment_intent_id text,
  order_id uuid,
  booking_id uuid references public.bookings(id) on delete set null,
  status text not null default 'Pending'
    check (status in ('Pending','Paid','Expired','Failed','Cancelled')),
  expires_at timestamptz not null default (now() + interval '35 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, idempotency_key)
);

create table if not exists public.product_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  commerce_intent_id uuid not null references public.commerce_checkout_intents(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  product_id uuid not null references public.salon_products(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 1000),
  status text not null default 'Reserved'
    check (status in ('Reserved','Converted','Released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (commerce_intent_id, product_id)
);

create table if not exists public.product_orders (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null,
  commerce_intent_id uuid not null unique
    references public.commerce_checkout_intents(id) on delete restrict,
  salon_id uuid not null references public.salons(id) on delete restrict,
  customer_id uuid references auth.users(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  fulfillment_method text not null
    check (fulfillment_method in ('Pickup','Shipping')),
  shipping_address jsonb not null default '{}'::jsonb,
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
  product_promotion_id uuid references public.salon_promotions(id) on delete set null,
  product_promotion_snapshot jsonb not null default '{}'::jsonb,
  product_promotion_redemption_id uuid,
  tax_amount numeric(10,2) not null default 0 check (tax_amount >= 0),
  shipping_amount numeric(10,2) not null default 0 check (shipping_amount >= 0),
  total_amount numeric(10,2) not null default 0 check (total_amount >= 0),
  currency text not null default 'usd',
  payment_mode text not null default 'test'
    check (payment_mode in ('test','live')),
  payment_status text not null default 'Paid'
    check (payment_status in ('Paid','Partially Refunded','Refunded','Disputed')),
  fulfillment_status text not null default 'New'
    check (fulfillment_status in ('New','Preparing','Ready for Pickup','Shipped','Delivered','Cancelled')),
  stripe_checkout_session_id text,
  stripe_tax_calculation_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_receipt_url text,
  stripe_connected_account_id text,
  stripe_transfer_id text,
  stripe_payout_id text,
  stripe_processing_fee numeric(10,2) not null default 0,
  platform_fee numeric(10,2) not null default 0,
  net_amount_owed_salon numeric(10,2) not null default 0,
  payout_status text not null default 'Awaiting payout',
  carrier text,
  tracking_number text,
  fulfillment_note text,
  paid_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.next_product_order_reference()
returns text
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_reference text;
begin
  loop
    v_reference := public.product_order_reference_from_number(
      nextval('public.product_order_reference_seq')
    );
    exit when not exists (
      select 1 from public.product_orders where public_reference = v_reference
    );
  end loop;
  return v_reference;
end;
$$;

alter table public.product_orders
  alter column public_reference set default public.next_product_order_reference();

alter table public.commerce_checkout_intents
  drop constraint if exists commerce_checkout_intents_order_id_fkey;
alter table public.commerce_checkout_intents
  add constraint commerce_checkout_intents_order_id_fkey
  foreign key (order_id) references public.product_orders(id) on delete set null;

create table if not exists public.product_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.product_orders(id) on delete cascade,
  product_id uuid references public.salon_products(id) on delete set null,
  product_name text not null,
  sku text,
  image_url text,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 1000),
  line_total numeric(10,2) not null check (line_total >= 0),
  tax_category text,
  fulfillment_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.product_promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid references public.salon_promotions(id) on delete set null,
  commerce_intent_id uuid not null
    references public.commerce_checkout_intents(id) on delete cascade,
  product_order_id uuid references public.product_orders(id) on delete set null,
  salon_id uuid references public.salons(id) on delete set null,
  customer_id uuid references auth.users(id) on delete set null,
  customer_identity_key text not null,
  status text not null default 'pending'
    check (status in ('pending','redeemed','cancelled','expired')),
  promotion_snapshot jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '35 minutes'),
  redeemed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (commerce_intent_id, promotion_id)
);

alter table public.commerce_checkout_intents
  drop constraint if exists commerce_checkout_product_promotion_redemption_fkey;
alter table public.commerce_checkout_intents
  add constraint commerce_checkout_product_promotion_redemption_fkey
  foreign key (product_promotion_redemption_id)
  references public.product_promotion_redemptions(id) on delete set null;
alter table public.product_orders
  drop constraint if exists product_orders_product_promotion_redemption_fkey;
alter table public.product_orders
  add constraint product_orders_product_promotion_redemption_fkey
  foreign key (product_promotion_redemption_id)
  references public.product_promotion_redemptions(id) on delete set null;

create table if not exists public.product_order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.product_orders(id) on delete restrict,
  salon_id uuid not null references public.salons(id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  reason text not null check (
    reason in ('non_delivery','damaged_or_wrong','duplicate_charge','fraud','salon_unable_to_fulfill')
  ),
  notes text,
  status text not null default 'Pending'
    check (status in ('Pending','Succeeded','Failed','Cancelled')),
  stripe_refund_id text,
  stripe_refund_status text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_role text,
  error_reference text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.product_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.product_orders(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  event_type text not null,
  previous_status text,
  new_status text,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists product_orders_public_reference_unique
  on public.product_orders(public_reference);
create index if not exists commerce_checkout_expiry_idx
  on public.commerce_checkout_intents(status, expires_at);
create index if not exists inventory_reservations_expiry_idx
  on public.product_inventory_reservations(status, expires_at);
create index if not exists product_orders_salon_created_idx
  on public.product_orders(salon_id, created_at desc);
create index if not exists product_orders_customer_created_idx
  on public.product_orders(customer_id, created_at desc)
  where customer_id is not null;
create index if not exists product_orders_email_created_idx
  on public.product_orders(lower(guest_email), created_at desc);
create index if not exists product_order_items_order_idx
  on public.product_order_items(order_id);
create index if not exists product_promotion_redemptions_limit_idx
  on public.product_promotion_redemptions(promotion_id,status,expires_at);
create index if not exists product_promotion_redemptions_customer_idx
  on public.product_promotion_redemptions(
    promotion_id,customer_identity_key,status
  );
create index if not exists product_refunds_order_created_idx
  on public.product_order_refunds(order_id, created_at desc);
create unique index if not exists product_refunds_stripe_id_unique
  on public.product_order_refunds(stripe_refund_id)
  where stripe_refund_id is not null;
create index if not exists product_order_events_order_created_idx
  on public.product_order_events(order_id, created_at desc);

alter table public.commerce_checkout_intents enable row level security;
alter table public.product_inventory_reservations enable row level security;
alter table public.product_orders enable row level security;
alter table public.product_order_items enable row level security;
alter table public.product_promotion_redemptions enable row level security;
alter table public.product_order_refunds enable row level security;
alter table public.product_order_events enable row level security;

drop policy if exists salon_products_public_read on public.salon_products;
create policy salon_products_public_read on public.salon_products
for select to anon,authenticated
using (
  (
    is_visible
    and product_status='Active'
    and archived_at is null
  )
  or public.salon_has_permission(salon_id,'products')
  or public.admin_has_permission('salons')
);

drop policy if exists product_orders_customer_read on public.product_orders;
create policy product_orders_customer_read on public.product_orders
for select to authenticated
using (
  customer_id = auth.uid()
  or public.salon_has_permission(salon_id, 'bookings')
  or public.admin_has_permission('finance')
);

drop policy if exists product_order_items_authorized_read on public.product_order_items;
create policy product_order_items_authorized_read on public.product_order_items
for select to authenticated
using (
  exists (
    select 1 from public.product_orders o
    where o.id = order_id and (
      o.customer_id = auth.uid()
      or public.salon_has_permission(o.salon_id, 'bookings')
      or public.admin_has_permission('finance')
    )
  )
);

drop policy if exists product_refunds_authorized_read on public.product_order_refunds;
create policy product_refunds_authorized_read on public.product_order_refunds
for select to authenticated
using (
  exists (
    select 1 from public.product_orders o
    where o.id = order_id and (
      o.customer_id = auth.uid()
      or public.salon_has_permission(o.salon_id, 'earnings')
      or public.admin_has_permission('finance')
    )
  )
);

drop policy if exists product_promotion_redemptions_authorized_read
  on public.product_promotion_redemptions;
create policy product_promotion_redemptions_authorized_read
on public.product_promotion_redemptions for select to authenticated
using (
  public.salon_has_permission(salon_id,'promotions')
  or public.admin_has_permission('marketing')
  or public.admin_has_permission('finance')
);

drop policy if exists product_order_events_authorized_read on public.product_order_events;
create policy product_order_events_authorized_read on public.product_order_events
for select to authenticated
using (
  exists (
    select 1 from public.product_orders o
    where o.id=order_id and (
      o.customer_id=auth.uid()
      or public.salon_has_permission(o.salon_id,'products')
      or public.admin_has_permission('finance')
    )
  )
);

-- Checkout intents and inventory reservations are server-only. Enabling RLS
-- with no client policies prevents direct browser reads and writes.
revoke all on table public.commerce_checkout_intents
  from anon,authenticated;
revoke all on table public.product_inventory_reservations
  from anon,authenticated;
revoke all on table public.product_orders,public.product_order_items,
  public.product_order_refunds,public.product_order_events,
  public.product_promotion_redemptions
  from anon;
revoke insert,update,delete,truncate,references,trigger
  on table public.product_orders,public.product_order_items,
  public.product_order_refunds,public.product_order_events,
  public.product_promotion_redemptions
  from authenticated;
grant select on table public.product_orders,public.product_order_items,
  public.product_order_refunds,public.product_order_events,
  public.product_promotion_redemptions
  to authenticated;

create or replace function public.reserve_combined_checkout(
  p_salon_id uuid,
  p_customer_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_fulfillment_method text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_booking jsonb,
  p_product_promotion_id uuid,
  p_tax_amount numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  v_existing public.commerce_checkout_intents%rowtype;
  v_intent_id uuid;
  v_booking_intent_id uuid;
  v_product public.salon_products%rowtype;
  v_item record;
  v_unit_price numeric(10,2);
  v_line_total numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_tax numeric(10,2) := greatest(coalesce(p_tax_amount, 0), 0);
  v_shipping numeric(10,2) := 0;
  v_product_total numeric(10,2);
  v_appointment_total numeric(10,2) := 0;
  v_appointment_deposit numeric(10,2) := 0;
  v_snapshots jsonb := '[]'::jsonb;
  v_expires_at timestamptz := now() + interval '35 minutes';
  v_promotion public.salon_promotions%rowtype;
  v_promotion_snapshot jsonb := '{}'::jsonb;
  v_promotion_redemption_id uuid;
  v_promotion_subtotal numeric(10,2) := 0;
  v_usage_limit integer := 0;
  v_per_customer_limit integer := 0;
  v_customer_identity text;
  v_previous_orders bigint := 0;
begin
  if p_salon_id is null or nullif(trim(coalesce(p_idempotency_key,'')), '') is null then
    raise exception using errcode='22023', message='COMMERCE_CHECKOUT_INVALID';
  end if;
  if p_fulfillment_method not in ('Pickup','Shipping') then
    raise exception using errcode='22023', message='FULFILLMENT_METHOD_INVALID';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode='22023', message='CART_EMPTY';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('commerce:' || p_salon_id::text || ':' || p_idempotency_key, 0)
  );

  select * into v_existing
  from public.commerce_checkout_intents
  where salon_id = p_salon_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.status not in ('Pending','Paid') then
      raise exception using
        errcode='22023',
        message='COMMERCE_IDEMPOTENCY_CLOSED';
    end if;
    return jsonb_build_object(
      'commerce_intent_id', v_existing.id,
      'booking_intent_id', v_existing.booking_intent_id,
      'product_subtotal', v_existing.product_subtotal,
      'product_discount', v_existing.product_discount,
      'product_promotion_id', v_existing.product_promotion_id,
      'tax_amount', v_existing.tax_amount,
      'shipping_amount', v_existing.shipping_amount,
      'product_total', v_existing.product_total,
      'appointment_total', v_existing.appointment_total,
      'appointment_deposit', v_existing.appointment_deposit,
      'total_charged', v_existing.total_charged,
      'order_id',v_existing.order_id,
      'booking_id',v_existing.booking_id,
      'status', v_existing.status,
      'expires_at', v_existing.expires_at
    );
  end if;

  -- Lock products in a deterministic order and coalesce duplicate cart lines.
  for v_item in
    select parsed.product_id, sum(parsed.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as parsed(product_id uuid, quantity integer)
    group by parsed.product_id
    order by parsed.product_id
  loop
    if v_item.quantity is null or v_item.quantity < 1 then
      raise exception using errcode='22023', message='PRODUCT_QUANTITY_INVALID';
    end if;
    select * into v_product
    from public.salon_products
    where id = v_item.product_id and salon_id = p_salon_id
    for update;
    if not found
      or v_product.archived_at is not null
      or not v_product.is_visible
      or v_product.product_status <> 'Active' then
      raise exception using errcode='22023', message='PRODUCT_UNAVAILABLE';
    end if;
    if v_item.quantity > v_product.max_quantity_per_order then
      raise exception using errcode='22023', message='PRODUCT_MAX_QUANTITY_EXCEEDED';
    end if;
    if p_fulfillment_method = 'Pickup' and not v_product.pickup_enabled then
      raise exception using errcode='22023', message='PRODUCT_PICKUP_UNAVAILABLE';
    end if;
    if p_fulfillment_method = 'Shipping' and not v_product.shipping_enabled then
      raise exception using errcode='22023', message='PRODUCT_SHIPPING_UNAVAILABLE';
    end if;
    if v_product.track_inventory and v_product.inventory_quantity < v_item.quantity then
      raise exception using errcode='22023', message='PRODUCT_OUT_OF_STOCK';
    end if;

    v_unit_price := coalesce(v_product.sale_price, v_product.price);
    v_line_total := round(v_unit_price * v_item.quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    if p_fulfillment_method = 'Shipping' then
      v_shipping := v_shipping + coalesce(v_product.shipping_price, 0);
    end if;
    v_snapshots := v_snapshots || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'name', v_product.name,
      'sku', v_product.sku,
      'image_url', coalesce(v_product.photo_url, v_product.images ->> 0),
      'unit_price', v_unit_price,
      'quantity', v_item.quantity,
      'line_total', v_line_total,
      'tax_category', v_product.tax_category,
      'pickup_prep_minutes', v_product.pickup_prep_minutes,
      'shipping_profile', v_product.shipping_profile,
      'shipping_price', v_product.shipping_price,
      'weight_ounces', v_product.weight_ounces,
      'dimensions', v_product.dimensions
    ));

    if v_product.track_inventory then
      update public.salon_products
      set inventory_quantity = inventory_quantity - v_item.quantity,
          updated_at = now()
      where id = v_product.id;
    end if;
  end loop;

  if p_product_promotion_id is not null then
    select * into v_promotion
    from public.salon_promotions
    where id=p_product_promotion_id and salon_id=p_salon_id
    for update;
    if not found
      or v_promotion.status <> 'Active'
      or v_promotion.is_active is not true
      or v_promotion.archived_at is not null
      or (v_promotion.starts_at is not null and v_promotion.starts_at > now())
      or (v_promotion.ends_at is not null and v_promotion.ends_at < now())
      or v_promotion.promotion_type not in ('percentage','fixed')
      or v_promotion.target_scope not in ('salon','products')
      or not public.salon_has_feature(p_salon_id,'promotions')
    then
      raise exception using errcode='22023', message='PRODUCT_PROMOTION_UNAVAILABLE';
    end if;

    select coalesce(sum((item ->> 'line_total')::numeric),0)
    into v_promotion_subtotal
    from jsonb_array_elements(v_snapshots) item
    where v_promotion.target_scope='salon'
      or item ->> 'product_id' = any(v_promotion.target_ids);
    if v_promotion_subtotal <= 0
      or v_subtotal < greatest(
        coalesce(nullif(v_promotion.restrictions ->> 'minimum_subtotal','')::numeric,0),
        0
      )
    then
      raise exception using errcode='22023', message='PRODUCT_PROMOTION_NOT_APPLICABLE';
    end if;

    v_customer_identity := case
      when p_customer_id is not null then 'user:' || p_customer_id::text
      else 'email:' || md5(lower(trim(coalesce(p_guest_email,''))))
    end;
    update public.product_promotion_redemptions
    set status='expired'
    where promotion_id=p_product_promotion_id
      and status='pending'
      and expires_at <= now();
    v_usage_limit := greatest(
      coalesce(nullif(v_promotion.restrictions ->> 'usage_limit','')::integer,0),
      0
    );
    v_per_customer_limit := greatest(
      coalesce(
        nullif(v_promotion.restrictions ->> 'per_customer_limit','')::integer,
        0
      ),
      0
    );
    if v_usage_limit > 0 and (
      select count(*)
      from public.product_promotion_redemptions
      where promotion_id=p_product_promotion_id
        and (
          status='redeemed'
          or (status='pending' and expires_at > now())
        )
    ) >= v_usage_limit then
      raise exception using errcode='22023', message='PRODUCT_PROMOTION_LIMIT_REACHED';
    end if;
    if v_per_customer_limit > 0 and (
      select count(*)
      from public.product_promotion_redemptions
      where promotion_id=p_product_promotion_id
        and customer_identity_key=v_customer_identity
        and (
          status='redeemed'
          or (status='pending' and expires_at > now())
        )
    ) >= v_per_customer_limit then
      raise exception using errcode='22023', message='PRODUCT_PROMOTION_CUSTOMER_LIMIT_REACHED';
    end if;
    if coalesce(
      (v_promotion.restrictions ->> 'new_customers_only')::boolean,
      false
    ) then
      select
        (select count(*) from public.bookings b
         where b.salon_id=p_salon_id and (
           (p_customer_id is not null and b.customer_id=p_customer_id)
           or lower(trim(coalesce(b.guest_email,'')))=lower(trim(p_guest_email))
         ))
        +
        (select count(*) from public.product_orders o
         where o.salon_id=p_salon_id and (
           (p_customer_id is not null and o.customer_id=p_customer_id)
           or lower(trim(o.guest_email))=lower(trim(p_guest_email))
         ))
      into v_previous_orders;
      if v_previous_orders > 0 then
        raise exception using errcode='22023', message='PRODUCT_PROMOTION_NEW_CUSTOMERS_ONLY';
      end if;
    end if;

    v_discount := case
      when v_promotion.promotion_type='percentage' then
        round(
          v_promotion_subtotal
          * least(greatest(v_promotion.discount_value,0),100)
          / 100,
          2
        )
      else least(v_promotion_subtotal,greatest(v_promotion.discount_value,0))
    end;
    v_promotion_snapshot := jsonb_build_object(
      'promotion_id',v_promotion.id,
      'title',coalesce(v_promotion.public_headline,v_promotion.title),
      'promotion_type',v_promotion.promotion_type,
      'discount_value',v_promotion.discount_value,
      'discount_label',v_promotion.discount_label,
      'target_scope',v_promotion.target_scope,
      'target_ids',v_promotion.target_ids,
      'restrictions',v_promotion.restrictions,
      'eligible_subtotal',v_promotion_subtotal,
      'discount_amount',v_discount,
      'captured_at',now()
    );
  end if;

  if v_tax > greatest(v_subtotal - v_discount, 0) then
    raise exception using errcode='22023', message='PRODUCT_TAX_INVALID';
  end if;
  v_product_total := round(greatest(v_subtotal - v_discount, 0) + v_tax + v_shipping, 2);

  if p_booking is not null and jsonb_typeof(p_booking) = 'object' then
    v_appointment_total := greatest(coalesce((p_booking ->> 'total_amount')::numeric, 0), 0);
    v_appointment_deposit := greatest(coalesce((p_booking ->> 'deposit_amount')::numeric, 0), 0);
    v_booking_intent_id := public.reserve_booking_checkout(
      p_salon_id,
      (p_booking ->> 'style_id')::uuid,
      nullif(p_booking ->> 'stylist_id','')::uuid,
      p_customer_id,
      p_guest_email,
      (p_booking ->> 'appointment_datetime')::timestamptz,
      (p_booking ->> 'duration_hours')::numeric,
      (p_booking ->> 'buffer_minutes')::integer,
      p_booking -> 'payload',
      v_appointment_total,
      v_appointment_deposit
    );
    update public.booking_checkout_intents
    set expires_at=v_expires_at
    where id=v_booking_intent_id and status='Pending';
  end if;

  insert into public.commerce_checkout_intents(
    salon_id,customer_id,guest_name,guest_email,guest_phone,
    fulfillment_method,shipping_address,item_snapshot,
    product_subtotal,product_discount,product_promotion_id,
    product_promotion_snapshot,tax_amount,shipping_amount,product_total,
    booking_intent_id,appointment_total,appointment_deposit,total_charged,
    idempotency_key,expires_at
  ) values (
    p_salon_id,p_customer_id,trim(p_guest_name),lower(trim(p_guest_email)),p_guest_phone,
    p_fulfillment_method,coalesce(p_shipping_address,'{}'::jsonb),v_snapshots,
    v_subtotal,v_discount,p_product_promotion_id,
    v_promotion_snapshot,v_tax,v_shipping,v_product_total,
    v_booking_intent_id,v_appointment_total,v_appointment_deposit,
    round(v_product_total + v_appointment_deposit,2),
    p_idempotency_key,v_expires_at
  ) returning id into v_intent_id;

  if p_product_promotion_id is not null then
    insert into public.product_promotion_redemptions(
      promotion_id,commerce_intent_id,salon_id,customer_id,
      customer_identity_key,status,promotion_snapshot,expires_at
    ) values (
      p_product_promotion_id,v_intent_id,p_salon_id,p_customer_id,
      v_customer_identity,'pending',v_promotion_snapshot,v_expires_at
    ) returning id into v_promotion_redemption_id;
    update public.commerce_checkout_intents
    set product_promotion_redemption_id=v_promotion_redemption_id
    where id=v_intent_id;
  end if;

  insert into public.product_inventory_reservations(
    commerce_intent_id,salon_id,product_id,quantity,expires_at
  )
  select
    v_intent_id,p_salon_id,(item ->> 'product_id')::uuid,
    (item ->> 'quantity')::integer,v_expires_at
  from jsonb_array_elements(v_snapshots) item;

  return jsonb_build_object(
    'commerce_intent_id', v_intent_id,
    'booking_intent_id', v_booking_intent_id,
    'product_subtotal', v_subtotal,
    'product_discount', v_discount,
    'product_promotion_id', p_product_promotion_id,
    'tax_amount', v_tax,
    'shipping_amount', v_shipping,
    'product_total', v_product_total,
    'appointment_total', v_appointment_total,
    'appointment_deposit', v_appointment_deposit,
    'total_charged', round(v_product_total + v_appointment_deposit,2),
    'status', 'Pending',
    'expires_at', v_expires_at
  );
exception
  when others then
    -- Product decrements and an optional booking reservation roll back with the
    -- transaction. No partial reservation can escape this function.
    raise;
end;
$$;

create or replace function public.apply_commerce_checkout_tax(
  p_commerce_intent_id uuid,
  p_tax_amount numeric,
  p_stripe_tax_calculation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_intent public.commerce_checkout_intents;
  v_tax numeric(10,2);
  v_product_total numeric(10,2);
begin
  select * into v_intent
  from public.commerce_checkout_intents
  where id=p_commerce_intent_id
  for update;
  if not found or v_intent.status<>'Pending' or v_intent.expires_at<=now() then
    raise exception using errcode='P0001',message='COMMERCE_TAX_INTENT_CLOSED';
  end if;
  v_tax:=round(greatest(coalesce(p_tax_amount,0),0),2);
  if v_tax>greatest(v_intent.product_subtotal-v_intent.product_discount,0) then
    raise exception using errcode='22023',message='PRODUCT_TAX_INVALID';
  end if;
  v_product_total:=round(
    greatest(v_intent.product_subtotal-v_intent.product_discount,0)
    +v_tax+v_intent.shipping_amount,
    2
  );
  update public.commerce_checkout_intents
  set tax_amount=v_tax,
      product_total=v_product_total,
      total_charged=round(v_product_total+appointment_deposit,2),
      stripe_tax_calculation_id=nullif(trim(p_stripe_tax_calculation_id),''),
      updated_at=now()
  where id=p_commerce_intent_id
  returning * into v_intent;
  return jsonb_build_object(
    'commerce_intent_id',v_intent.id,
    'booking_intent_id',v_intent.booking_intent_id,
    'product_subtotal',v_intent.product_subtotal,
    'product_discount',v_intent.product_discount,
    'product_promotion_id',v_intent.product_promotion_id,
    'tax_amount',v_intent.tax_amount,
    'shipping_amount',v_intent.shipping_amount,
    'product_total',v_intent.product_total,
    'appointment_total',v_intent.appointment_total,
    'appointment_deposit',v_intent.appointment_deposit,
    'total_charged',v_intent.total_charged,
    'status',v_intent.status,
    'expires_at',v_intent.expires_at
  );
end;
$$;

create or replace function public.release_combined_checkout(
  p_commerce_intent_id uuid,
  p_status text default 'Failed'
) returns boolean
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_intent public.commerce_checkout_intents%rowtype;
  v_reservation record;
begin
  if p_status not in ('Expired','Failed','Cancelled') then
    raise exception using errcode='22023', message='COMMERCE_RELEASE_STATUS_INVALID';
  end if;
  select * into v_intent from public.commerce_checkout_intents
  where id = p_commerce_intent_id for update;
  if not found or v_intent.status <> 'Pending' then return false; end if;

  for v_reservation in
    select * from public.product_inventory_reservations
    where commerce_intent_id = p_commerce_intent_id and status = 'Reserved'
    for update
  loop
    update public.salon_products
    set inventory_quantity = inventory_quantity + v_reservation.quantity,
        updated_at = now()
    where id = v_reservation.product_id and track_inventory;
    update public.product_inventory_reservations
    set status = 'Released', updated_at = now()
    where id = v_reservation.id;
  end loop;

  if v_intent.booking_intent_id is not null then
    update public.booking_checkout_intents
    set status = case when p_status = 'Expired' then 'Expired' else 'Failed' end
    where id = v_intent.booking_intent_id and status = 'Pending';
    update public.salon_promotion_redemptions
    set status=case when p_status='Expired' then 'expired' else 'cancelled' end,
        cancelled_at=case when p_status='Expired' then null else now() end
    where booking_intent_id=v_intent.booking_intent_id
      and status='pending';
    update public.promo_code_redemptions
    set status='expired'
    where booking_intent_id=v_intent.booking_intent_id
      and status='pending';
  end if;
  if v_intent.product_promotion_redemption_id is not null then
    update public.product_promotion_redemptions
    set status=case when p_status='Expired' then 'expired' else 'cancelled' end,
        cancelled_at=case when p_status='Expired' then null else now() end
    where id=v_intent.product_promotion_redemption_id
      and status='pending';
  end if;
  update public.commerce_checkout_intents
  set status = p_status, updated_at = now()
  where id = p_commerce_intent_id;
  return true;
end;
$$;

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
      stripe_processing_fee,platform_fee,net_amount_owed_salon,payout_status
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
        then 'Destination payment submitted' else 'Awaiting payout' end
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

create or replace function public.expire_stale_commerce_checkouts()
returns integer
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_intent record;
  v_count integer := 0;
begin
  for v_intent in
    select id from public.commerce_checkout_intents
    where status='Pending' and expires_at <= now()
    order by expires_at
    for update skip locked
  loop
    if public.release_combined_checkout(v_intent.id,'Expired') then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on sequence public.product_order_reference_seq from public,anon,authenticated;
revoke all on function public.next_product_order_reference() from public,anon,authenticated;
revoke all on function public.reserve_combined_checkout(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,uuid,numeric,text)
  from public,anon,authenticated;
revoke all on function public.apply_commerce_checkout_tax(uuid,numeric,text)
  from public,anon,authenticated;
revoke all on function public.release_combined_checkout(uuid,text) from public,anon,authenticated;
revoke all on function public.complete_combined_checkout(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.expire_stale_commerce_checkouts() from public,anon,authenticated;

grant usage,select on sequence public.product_order_reference_seq to service_role;
grant execute on function public.next_product_order_reference() to service_role;
grant execute on function public.reserve_combined_checkout(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,uuid,numeric,text)
  to service_role;
grant execute on function public.apply_commerce_checkout_tax(uuid,numeric,text)
  to service_role;
grant execute on function public.release_combined_checkout(uuid,text) to service_role;
grant execute on function public.complete_combined_checkout(uuid,jsonb) to service_role;
grant execute on function public.expire_stale_commerce_checkouts() to service_role;

comment on table public.commerce_checkout_intents is
  'Server-only reservation aggregate for one-salon product carts and optional appointments.';
comment on table public.product_inventory_reservations is
  'Temporary inventory holds released atomically on failed or expired checkout.';
comment on table public.product_orders is
  'Immutable product-sale and payout evidence; fulfillment status remains operational.';
comment on table public.product_order_refunds is
  'Auditable, reason-limited product refund requests and Stripe outcomes.';

update public.engine_settings
set draft_value='"20260724170000"'::jsonb,
    published_value='"20260724170000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

commit;
