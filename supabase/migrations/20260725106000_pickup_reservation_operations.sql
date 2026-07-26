-- Atomic pickup-reservation lifecycle and audited Featured Product placement.
--
-- Forward-only impact:
-- * adds one supported refund reason and one partial uniqueness index;
-- * creates service-role-only lifecycle/placement functions;
-- * does not rewrite, delete, or reclassify any existing row.

begin;

alter table public.product_order_refunds
  drop constraint if exists product_order_refunds_reason_check;
alter table public.product_order_refunds
  add constraint product_order_refunds_reason_check
  check (
    reason in (
      'non_delivery','damaged_or_wrong','duplicate_charge','fraud',
      'salon_unable_to_fulfill','customer_cancellation'
    )
  );

create unique index if not exists product_refunds_customer_cancel_unique
  on public.product_order_refunds(order_id,reason)
  where reason='customer_cancellation'
    and status in ('Pending','Succeeded');

create or replace function public.advance_product_pickup_reservation(
  p_order_id uuid,
  p_next_status text,
  p_actor_id uuid,
  p_actor_role text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_order public.product_orders%rowtype;
  v_next text := nullif(trim(coalesce(p_next_status,'')),'');
  v_item record;
begin
  select * into v_order
  from public.product_orders
  where id=p_order_id
  for update;
  if not found or v_order.reservation_status is null then
    raise exception using errcode='22023',message='PICKUP_RESERVATION_NOT_FOUND';
  end if;

  if v_order.reservation_status in ('Canceled','Expired','Refunded','Collected')
    then
    if v_order.reservation_status=v_next then
      return to_jsonb(v_order);
    end if;
    raise exception using errcode='22023',message='PICKUP_RESERVATION_CLOSED';
  end if;

  if not (
    (v_order.reservation_status='Reserved' and
      v_next in ('Ready for pickup','Canceled','Not collected'))
    or
    (v_order.reservation_status='Ready for pickup' and
      v_next in ('Collected','Canceled','Not collected'))
  ) then
    raise exception using errcode='22023',
      message='PICKUP_RESERVATION_TRANSITION_INVALID';
  end if;

  if v_next='Not collected' then
    for v_item in
      select product_id,quantity
      from public.product_order_items
      where order_id=p_order_id and product_id is not null
      order by product_id
    loop
      update public.salon_products
      set inventory_quantity=inventory_quantity+v_item.quantity,
          updated_at=now()
      where id=v_item.product_id and track_inventory;
    end loop;
  end if;

  update public.product_orders
  set reservation_status=v_next,
      fulfillment_status=v_next,
      fulfilled_at=case when v_next='Collected' then now() else fulfilled_at end,
      updated_at=now()
  where id=p_order_id
  returning * into v_order;

  insert into public.product_order_events(
    order_id,salon_id,event_type,previous_status,new_status,note,
    actor_id,actor_role,metadata
  ) values (
    v_order.id,v_order.salon_id,'pickup_status_changed',
    case
      when v_next='Ready for pickup' then 'Reserved'
      when v_next='Collected' then 'Ready for pickup'
      else null
    end,
    v_next,nullif(trim(coalesce(p_note,'')),''),
    p_actor_id,nullif(trim(coalesce(p_actor_role,'')),''),
    jsonb_build_object(
      'reservation',true,
      'inventory_released',v_next='Not collected'
    )
  );
  return to_jsonb(v_order);
end;
$$;

create or replace function public.cancel_product_pickup_reservation(
  p_order_id uuid,
  p_actor text,
  p_customer_reason text,
  p_internal_reason text,
  p_refund_status text,
  p_refund_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_order public.product_orders%rowtype;
  v_item record;
  v_actor text := initcap(lower(trim(coalesce(p_actor,'System'))));
  v_refund numeric(10,2) := round(
    greatest(coalesce(p_refund_amount,0),0),2
  );
begin
  if v_actor not in ('Customer','Salon','Admin','System') then
    raise exception using errcode='22023',message='PICKUP_CANCELLATION_ACTOR_INVALID';
  end if;
  if p_refund_status not in ('Not required','Refund pending','Refunded','Failed') then
    raise exception using errcode='22023',message='PICKUP_REFUND_STATUS_INVALID';
  end if;

  select * into v_order
  from public.product_orders
  where id=p_order_id
  for update;
  if not found or v_order.reservation_status is null then
    raise exception using errcode='22023',message='PICKUP_RESERVATION_NOT_FOUND';
  end if;
  if v_order.reservation_status in ('Canceled','Expired','Refunded') then
    return to_jsonb(v_order);
  end if;
  if v_order.reservation_status='Collected' then
    raise exception using errcode='22023',message='PICKUP_RESERVATION_COLLECTED';
  end if;
  if v_refund>v_order.deposit_amount then
    raise exception using errcode='22023',message='PICKUP_REFUND_AMOUNT_INVALID';
  end if;

  -- Inventory was decremented during the atomic checkout hold and the hold was
  -- converted on payment. Restore it once, inside the same locked transaction.
  for v_item in
    select product_id,quantity
    from public.product_order_items
    where order_id=p_order_id and product_id is not null
    order by product_id
  loop
    update public.salon_products
    set inventory_quantity=inventory_quantity+v_item.quantity,
        updated_at=now()
    where id=v_item.product_id and track_inventory;
  end loop;

  update public.product_orders
  set reservation_status=case
        when p_refund_status='Refunded' then 'Refunded' else 'Canceled' end,
      fulfillment_status=case
        when p_refund_status='Refunded' then 'Refunded' else 'Canceled' end,
      cancellation_actor=v_actor,
      customer_safe_reason=left(trim(coalesce(p_customer_reason,'')),500),
      internal_reason=nullif(left(trim(coalesce(p_internal_reason,'')),1000),''),
      cancelled_at=now(),
      refund_status=p_refund_status,
      refund_amount=v_refund,
      payment_status=case
        when p_refund_status='Refunded' then 'Refunded'
        when p_refund_status='Refund pending' then 'Refund pending'
        else payment_status end,
      net_amount_owed_salon=case
        when p_refund_status in ('Refund pending','Refunded','Failed') then 0
        else net_amount_owed_salon end,
      payout_status=case
        when p_refund_status='Refunded' then 'Refunded'
        when p_refund_status='Refund pending' then 'Refund pending'
        when p_refund_status='Failed' then 'Refund failed - requires attention'
        else payout_status end,
      updated_at=now()
  where id=p_order_id
  returning * into v_order;

  insert into public.product_order_events(
    order_id,salon_id,event_type,previous_status,new_status,note,
    actor_role,metadata
  ) values (
    v_order.id,v_order.salon_id,'pickup_canceled',null,
    v_order.reservation_status,v_order.customer_safe_reason,
    lower(v_actor),
    jsonb_build_object(
      'refund_status',p_refund_status,
      'refund_amount',v_refund,
      'inventory_released',true
    )
  );
  return to_jsonb(v_order);
end;
$$;

create or replace function public.expire_product_pickup_reservations()
returns integer
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_order record;
  v_item record;
  v_count integer := 0;
begin
  for v_order in
    select id,salon_id,reservation_status
    from public.product_orders
    where reservation_status in ('Reserved','Ready for pickup')
      and pickup_deadline<=now()
    order by id
    for update skip locked
  loop
    for v_item in
      select product_id,quantity
      from public.product_order_items
      where order_id=v_order.id and product_id is not null
      order by product_id
    loop
      update public.salon_products
      set inventory_quantity=inventory_quantity+v_item.quantity,
          updated_at=now()
      where id=v_item.product_id and track_inventory;
    end loop;
    update public.product_orders
    set reservation_status='Expired',fulfillment_status='Expired',
        cancellation_actor='System',
        customer_safe_reason='The pickup deadline passed before collection.',
        cancelled_at=now(),updated_at=now()
    where id=v_order.id;
    insert into public.product_order_events(
      order_id,salon_id,event_type,previous_status,new_status,actor_role,metadata
    ) values (
      v_order.id,v_order.salon_id,'pickup_expired',
      v_order.reservation_status,'Expired','system',
      '{"inventory_released":true}'::jsonb
    );
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_save_homepage_product_placement(
  p_actor_id uuid,
  p_placement_id uuid,
  p_product_id uuid,
  p_status text,
  p_sort_order integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_internal_note text,
  p_entitlement_id uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  v_admin public.admin_users%rowtype;
  v_product public.salon_products%rowtype;
  v_salon public.salons%rowtype;
  v_entitlement public.marketing_entitlements%rowtype;
  v_existing public.homepage_product_placements%rowtype;
  v_id uuid;
  v_previous jsonb;
begin
  select * into v_admin
  from public.admin_users
  where user_id=p_actor_id and status='Active';
  if not found or not (
    v_admin.is_super_admin is true
    or coalesce((v_admin.permissions ->> 'marketing')::boolean,false)
  ) then
    raise exception using errcode='42501',message='ADMIN_MARKETING_REQUIRED';
  end if;
  if p_status not in ('Draft','Scheduled','Active','Paused','Expired','Archived')
    or p_sort_order not between 1 and 100
    or p_starts_at is null
    or (p_ends_at is not null and p_ends_at<=p_starts_at) then
    raise exception using errcode='22023',message='FEATURED_PRODUCT_INVALID';
  end if;

  select * into v_product
  from public.salon_products
  where id=p_product_id;
  if not found or v_product.archived_at is not null then
    raise exception using errcode='22023',message='FEATURED_PRODUCT_NOT_FOUND';
  end if;
  select * into v_salon from public.salons where id=v_product.salon_id;
  if not found then
    raise exception using errcode='22023',message='FEATURED_PRODUCT_SALON_NOT_FOUND';
  end if;

  if p_entitlement_id is not null then
    select * into v_entitlement
    from public.marketing_entitlements
    where id=p_entitlement_id
      and salon_id=v_salon.id
      and placement_type='Featured Product'
      and status in ('Paid','Credited')
      and valid_from<=p_starts_at
      and (valid_until is null or p_ends_at is null or valid_until>=p_ends_at);
    if not found then
      raise exception using errcode='22023',message='FEATURED_PRODUCT_ENTITLEMENT_INVALID';
    end if;
  end if;
  if p_status in ('Scheduled','Active')
    and lower(coalesce(v_salon.subscription_tier,''))<>'premium'
    and p_entitlement_id is null then
    raise exception using errcode='22023',message='FEATURED_PRODUCT_NOT_ELIGIBLE';
  end if;

  if p_placement_id is not null then
    select * into v_existing
    from public.homepage_product_placements
    where id=p_placement_id
    for update;
  else
    select * into v_existing
    from public.homepage_product_placements
    where product_id=p_product_id
    for update;
  end if;
  if found then
    v_previous := to_jsonb(v_existing);
    update public.homepage_product_placements
    set product_id=p_product_id,entitlement_id=p_entitlement_id,
        status=p_status,sort_order=p_sort_order,starts_at=p_starts_at,
        ends_at=p_ends_at,
        internal_note=nullif(left(trim(coalesce(p_internal_note,'')),1000),''),
        updated_by=p_actor_id,updated_at=now()
    where id=v_existing.id
    returning id into v_id;
    insert into public.homepage_product_placement_audit(
      placement_id,action,previous_values,new_values,reason,acting_admin_id
    )
    select
      v_id,'updated',v_previous,to_jsonb(p),left(trim(coalesce(p_reason,'')),1000),
      p_actor_id
    from public.homepage_product_placements p where p.id=v_id;
  else
    insert into public.homepage_product_placements(
      product_id,entitlement_id,status,sort_order,starts_at,ends_at,
      internal_note,created_by,updated_by
    ) values (
      p_product_id,p_entitlement_id,p_status,p_sort_order,p_starts_at,p_ends_at,
      nullif(left(trim(coalesce(p_internal_note,'')),1000),''),
      p_actor_id,p_actor_id
    ) returning id into v_id;
    insert into public.homepage_product_placement_audit(
      placement_id,action,new_values,reason,acting_admin_id
    )
    select
      v_id,'created',to_jsonb(p),left(trim(coalesce(p_reason,'')),1000),p_actor_id
    from public.homepage_product_placements p where p.id=v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.advance_product_pickup_reservation(
  uuid,text,uuid,text,text
) from public,anon,authenticated;
revoke all on function public.cancel_product_pickup_reservation(
  uuid,text,text,text,text,numeric
) from public,anon,authenticated;
revoke all on function public.expire_product_pickup_reservations()
  from public,anon,authenticated;
revoke all on function public.admin_save_homepage_product_placement(
  uuid,uuid,uuid,text,integer,timestamptz,timestamptz,text,uuid,text
) from public,anon,authenticated;
grant execute on function public.advance_product_pickup_reservation(
  uuid,text,uuid,text,text
) to service_role;
grant execute on function public.cancel_product_pickup_reservation(
  uuid,text,text,text,text,numeric
) to service_role;
grant execute on function public.expire_product_pickup_reservations()
  to service_role;
grant execute on function public.admin_save_homepage_product_placement(
  uuid,uuid,uuid,text,integer,timestamptz,timestamptz,text,uuid,text
) to service_role;

update public.engine_settings
set draft_value='"20260725106000"'::jsonb,
    published_value='"20260725106000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

commit;
