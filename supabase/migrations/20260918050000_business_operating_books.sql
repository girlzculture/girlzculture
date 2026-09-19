begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Supplement existing booking/provider records; never create another charge or
-- copy a platform receipt into a second sale. Browser roles have no table access.
create table public.business_finance_sales (
  id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
  occurred_at timestamptz not null, recorded_at timestamptz not null default now(),
  source text not null check(source in ('walk_in','phone','social','other')),
  kind text not null check(kind in ('service','product')), name text not null check(length(trim(name)) between 1 and 200),
  stylist_id uuid references public.stylists(id), client_name text check(length(client_name)<=120),
  list_cents bigint not null check(list_cents between 0 and 100000000),
  discount_cents bigint not null default 0 check(discount_cents>=0 and discount_cents<=list_cents),
  agreed_cents bigint generated always as(list_cents-discount_cents) stored,
  cost_cents bigint check(cost_cents between 0 and 100000000), quantity integer not null default 1 check(quantity between 1 and 10000),
  status text not null default 'completed' check(status in ('completed','cancelled')),
  compensation jsonb not null default '{"kind":"none","version":null}', created_by uuid not null,
  unique(salon_id,id), check(kind<>'service' or stylist_id is not null)
);
create table public.business_finance_receipts (
  id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
  sale_id uuid, booking_id uuid references public.bookings(id), product_order_id uuid references public.product_orders(id),
  occurred_at timestamptz not null, recorded_at timestamptz not null default now(),
  stage text not null check(stage in ('deposit','balance','full','refund')),
  method text not null check(method in ('cash','card','transfer','other')),
  amount_cents bigint not null check(amount_cents between 1 and 100000000),
  original_payment_id uuid, note text check(length(note)<=1000), created_by uuid not null,
  unique(salon_id,id), foreign key(salon_id,sale_id) references public.business_finance_sales(salon_id,id),
  foreign key(salon_id,original_payment_id) references public.business_finance_receipts(salon_id,id),
  check(num_nonnulls(sale_id,booking_id,product_order_id)=1),
  check((stage='refund')=(original_payment_id is not null))
);
create table public.business_finance_expenses (
  id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
  occurred_at timestamptz not null, recorded_at timestamptz not null default now(),
  category text not null check(length(trim(category)) between 1 and 100),
  amount_cents bigint not null check(amount_cents between 1 and 100000000),
  treatment text not null check(treatment in ('operating','inventory_asset')),
  note text check(length(note)<=1000), created_by uuid not null
);
create table public.business_compensation_arrangements (
  id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
  stylist_id uuid not null references public.stylists(id), effective_from date not null,
  kind text not null check(kind in ('commission','booth','employee','none')),
  basis text check(basis in ('before_discount','after_discount')), percent numeric(5,2) check(percent between 0 and 100),
  amount_cents bigint check(amount_cents between 0 and 100000000), period text check(period in ('week','month')),
  created_at timestamptz not null default now(), created_by uuid not null,
  check((kind='commission' and percent is not null and basis is not null and amount_cents is null and period is null)
    or (kind in ('booth','employee') and amount_cents is not null and period is not null and percent is null and basis is null)
    or (kind='none' and num_nonnulls(percent,basis,amount_cents,period)=0)),
  unique(salon_id,stylist_id,effective_from), unique(salon_id,id)
);
create table public.business_compensation_obligations (
  id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
  stylist_id uuid not null references public.stylists(id), due_at timestamptz not null,
  kind text not null check(kind in ('wage','booth_rent')), amount_cents bigint not null check(amount_cents between 0 and 100000000),
  arrangement_version uuid not null, period_start date not null, period_end date not null check(period_end>=period_start),
  created_at timestamptz not null default now(), created_by uuid not null,
  foreign key(salon_id,arrangement_version) references public.business_compensation_arrangements(salon_id,id),
  unique(salon_id,arrangement_version,period_start), unique(salon_id,id)
);
create table public.business_compensation_payments (
  id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
  stylist_id uuid not null references public.stylists(id), occurred_at timestamptz not null,
  obligation_id uuid, kind text not null check(kind in ('commission','wage','booth_rent')),
  amount_cents bigint not null check(amount_cents between 1 and 100000000), method text not null check(method in ('cash','card','transfer','other')),
  created_at timestamptz not null default now(), created_by uuid not null,
  foreign key(salon_id,obligation_id) references public.business_compensation_obligations(salon_id,id),
  check((kind='commission')=(obligation_id is null))
);
create table public.business_finance_operations (
  salon_id uuid not null references public.salons(id), actor_id uuid not null, request_id uuid not null,
  action text not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(salon_id,actor_id,request_id)
);
do $$ declare t text; begin
  foreach t in array array['business_finance_sales','business_finance_receipts','business_finance_expenses','business_compensation_arrangements','business_compensation_obligations','business_compensation_payments','business_finance_operations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to service_role',t);
    execute format('create index on public.%I(salon_id)',t);
  end loop;
end $$;

-- Scope is derived from the verified actor, never the requested stylist ID.
create function public.business_finance_scope(p_salon uuid,p_user uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_stylist uuid;
begin
  if public.p0_actor_has_permission(p_salon,p_user,'earnings') then return jsonb_build_object('kind','business','stylist_id',null); end if;
  if public.p0_actor_has_permission(p_salon,p_user,'earnings_own') then
    select m.stylist_id into v_stylist from public.salon_team_members m join public.stylists s on s.id=m.stylist_id and s.salon_id=m.salon_id
      where m.salon_id=p_salon and m.user_id=p_user and m.status='Active';
    if v_stylist is not null then return jsonb_build_object('kind','own','stylist_id',v_stylist); end if;
  end if;
  raise exception 'FINANCE_ACCESS_DENIED';
end $$;

create function public.business_compensation_snapshot(p_salon uuid,p_stylist uuid,p_at timestamptz) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce((select jsonb_strip_nulls(jsonb_build_object('kind',a.kind,'version',a.id,'basis',a.basis,'percent',a.percent))
    from public.business_compensation_arrangements a join public.salons s on s.id=a.salon_id
    where a.salon_id=p_salon and a.stylist_id=p_stylist and a.effective_from<=(p_at at time zone coalesce(nullif(s.time_zone,''),'America/New_York'))::date
    order by a.effective_from desc limit 1),'{"kind":"none","version":null}'::jsonb);
$$;
alter table public.bookings add column operating_compensation jsonb not null default '{"kind":"none","version":null}';
-- Existing records keep an explicit unknown/no-arrangement snapshot. Never
-- infer historic wages or commission from a newly configured agreement.
create function public.snapshot_booking_compensation() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if TG_OP='INSERT' then new.operating_compensation:=public.business_compensation_snapshot(new.salon_id,new.stylist_id,new.created_at);
  else new.operating_compensation:=old.operating_compensation; end if;
  return new;
end $$;
create trigger booking_compensation_snapshot before insert or update on public.bookings for each row execute function public.snapshot_booking_compensation();

create function public.record_business_finance(p_salon uuid,p_user uuid,p_request uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; v_prior public.business_finance_operations%rowtype; v_sale public.business_finance_sales%rowtype;
  v_booking public.bookings%rowtype; v_order public.product_orders%rowtype; v_original public.business_finance_receipts%rowtype;
  v_agreement public.business_compensation_arrangements%rowtype; v_obligation public.business_compensation_obligations%rowtype;
  v_stylist uuid; v_at timestamptz; v_cents bigint; v_total bigint; v_paid bigint; v_result jsonb; v_full boolean; v_owner boolean;
  v_period_start date; v_period_end date; v_business_today date;
begin
  if p_request is null or p_action is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then raise exception 'FINANCE_INVALID_RECORD'; end if;
  -- Serialize entries for this business (including retries/refunds/balances),
  -- then re-check identity/membership while their rows remain locked.
  perform 1 from public.salons where id=p_salon for update;
  perform 1 from public.platform_identities where user_id=p_user for share;
  perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_user for share;
  v_full:=public.p0_actor_has_permission(p_salon,p_user,'finance_manage');
  v_owner:=exists(select 1 from public.salons where id=p_salon and user_id=p_user) and v_full;
  if not v_full and not (p_action in ('sale','receipt') and public.p0_actor_has_permission(p_salon,p_user,'finance_log')) then raise exception 'FINANCE_ACCESS_DENIED'; end if;
  if not public.p0_business_plan_active(p_salon) then raise exception 'FINANCE_PLAN_REQUIRED'; end if;
  select (now() at time zone coalesce(nullif(time_zone,''),'America/New_York'))::date into v_business_today from public.salons where id=p_salon;
  if exists(select 1 from jsonb_each(p_payload) where (key like '%\_cents' escape '\' or key='quantity') and value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$')) then raise exception 'FINANCE_INVALID_AMOUNT'; end if;
  select * into v_prior from public.business_finance_operations where salon_id=p_salon and actor_id=p_user and request_id=p_request;
  if found then
    if v_prior.action<>p_action or v_prior.payload<>p_payload then raise exception 'FINANCE_REQUEST_CONFLICT'; end if;
    return v_prior.result;
  end if;
  v_at:=coalesce((p_payload->>'occurred_at')::timestamptz,now());
  if not isfinite(v_at) or v_at>now()+interval '5 minutes' then raise exception 'FINANCE_INVALID_DATE'; end if;
  v_stylist:=(p_payload->>'stylist_id')::uuid;
  if v_stylist is not null and not exists(select 1 from public.stylists where salon_id=p_salon and id=v_stylist and archived_at is null) then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
  v_cents:=(p_payload->>'amount_cents')::bigint;
  if p_action='sale' then
    if p_payload->>'kind'='service' and v_stylist is null then raise exception 'FINANCE_INVALID_RECORD'; end if;
    insert into public.business_finance_sales(salon_id,occurred_at,source,kind,name,stylist_id,client_name,list_cents,discount_cents,cost_cents,quantity,compensation,created_by)
      values(p_salon,v_at,p_payload->>'source',p_payload->>'kind',trim(p_payload->>'name'),v_stylist,nullif(trim(p_payload->>'client_name'),''),
        (p_payload->>'list_cents')::bigint,coalesce((p_payload->>'discount_cents')::bigint,0),(p_payload->>'cost_cents')::bigint,
        coalesce((p_payload->>'quantity')::integer,1),public.business_compensation_snapshot(p_salon,v_stylist,v_at),p_user) returning * into v_sale;
    if v_sale.agreed_cents>0 then
      insert into public.business_finance_receipts(salon_id,sale_id,occurred_at,stage,method,amount_cents,created_by)
        values(p_salon,v_sale.id,v_at,'full',p_payload->>'method',v_sale.agreed_cents,p_user);
    end if;
    v_id:=v_sale.id;
  elsif p_action='receipt' then
    if num_nonnulls(p_payload->>'sale_id',p_payload->>'booking_id',p_payload->>'product_order_id')<>1 then raise exception 'FINANCE_INVALID_RECORD'; end if;
    if p_payload->>'sale_id' is not null then
      select * into v_sale from public.business_finance_sales where salon_id=p_salon and id=(p_payload->>'sale_id')::uuid and status<>'cancelled';
      if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
      v_total:=v_sale.agreed_cents;
      select coalesce(sum(amount_cents),0) into v_paid from public.business_finance_receipts where salon_id=p_salon and sale_id=v_sale.id and stage<>'refund';
    elsif p_payload->>'booking_id' is not null then
      select * into v_booking from public.bookings where salon_id=p_salon and id=(p_payload->>'booking_id')::uuid and regexp_replace(lower(status),'[ _-]','','g') not in ('cancelled','canceled','noshow');
      if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
      if v_booking.payment_mode='test' then raise exception 'FINANCE_TEST_PAYMENT'; end if;
      -- A paid-looking label alone is not proof of a provider receipt.
      if v_booking.booking_origin='marketplace' and v_booking.deposit_amount>0 and not coalesce(v_booking.payment_mode='live' and v_booking.payment_verified_at is not null and v_booking.stripe_charge_id like 'ch_%' and lower(replace(v_booking.deposit_status,' ','')) in ('paid','succeeded','refunded','partiallyrefunded','refundpending'),false) then raise exception 'FINANCE_DEPOSIT_UNVERIFIED'; end if;
      v_total:=round(v_booking.estimated_total*100);
      select coalesce(sum(amount_cents),0) into v_paid from public.business_finance_receipts where salon_id=p_salon and booking_id=v_booking.id and stage<>'refund';
      if v_booking.booking_origin='marketplace' then v_paid:=v_paid+round(v_booking.deposit_amount*100); end if;
    else
      select * into v_order from public.product_orders where salon_id=p_salon and id=(p_payload->>'product_order_id')::uuid and reservation_status in ('Reserved','Ready for pickup','Collected');
      if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
      if not coalesce(v_order.payment_mode='live' and v_order.paid_at is not null and v_order.stripe_charge_id like 'ch_%',false) then raise exception 'FINANCE_DEPOSIT_UNVERIFIED'; end if;
      v_total:=round(v_order.total_amount*100);
      select coalesce(sum(amount_cents),0)+round(v_order.deposit_amount*100) into v_paid from public.business_finance_receipts where salon_id=p_salon and product_order_id=v_order.id and stage<>'refund';
    end if;
    if v_cents is null or v_cents<=0 or v_total is null or v_cents>v_total-v_paid then raise exception 'FINANCE_RECEIPTS_EXCEED_SALE'; end if;
    insert into public.business_finance_receipts(salon_id,sale_id,booking_id,product_order_id,occurred_at,stage,method,amount_cents,note,created_by)
      values(p_salon,v_sale.id,v_booking.id,v_order.id,v_at,'balance',p_payload->>'method',v_cents,p_payload->>'note',p_user) returning id into v_id;
  elsif p_action='refund' then
    select * into v_original from public.business_finance_receipts where salon_id=p_salon and id=(p_payload->>'original_payment_id')::uuid and stage<>'refund';
    if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
    select coalesce(sum(amount_cents),0) into v_paid from public.business_finance_receipts where salon_id=p_salon and original_payment_id=v_original.id;
    if v_cents is null or v_cents<=0 or v_cents>v_original.amount_cents-v_paid or v_at<v_original.occurred_at or length(trim(coalesce(p_payload->>'note','')))=0 then raise exception 'FINANCE_INVALID_REFUND'; end if;
    insert into public.business_finance_receipts(salon_id,sale_id,booking_id,product_order_id,occurred_at,stage,method,amount_cents,original_payment_id,note,created_by)
      values(p_salon,v_original.sale_id,v_original.booking_id,v_original.product_order_id,v_at,'refund',v_original.method,v_cents,v_original.id,p_payload->>'note',p_user) returning id into v_id;
  elsif p_action='expense' then
    insert into public.business_finance_expenses(salon_id,occurred_at,category,amount_cents,treatment,note,created_by)
      values(p_salon,v_at,trim(p_payload->>'category'),v_cents,p_payload->>'treatment',p_payload->>'note',p_user) returning id into v_id;
  elsif p_action='arrangement' then
    if not v_owner then raise exception 'FINANCE_OWNER_REQUIRED'; end if;
    if (p_payload->>'effective_from')::date<v_business_today then raise exception 'FINANCE_HISTORICAL_ARRANGEMENT'; end if;
    insert into public.business_compensation_arrangements(salon_id,stylist_id,effective_from,kind,basis,percent,amount_cents,period,created_by)
      values(p_salon,v_stylist,(p_payload->>'effective_from')::date,p_payload->>'kind',p_payload->>'basis',(p_payload->>'percent')::numeric,v_cents,p_payload->>'period',p_user) returning id into v_id;
  elsif p_action='obligation' then
    select * into v_agreement from public.business_compensation_arrangements where salon_id=p_salon and id=(p_payload->>'arrangement_version')::uuid and kind in ('booth','employee');
    if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
    v_period_start:=(p_payload->>'period_start')::date;
    v_period_end:=(v_period_start+case v_agreement.period when 'week' then interval '7 days' else interval '1 month' end-interval '1 day')::date;
    if v_period_start<v_agreement.effective_from or exists(select 1 from public.business_compensation_arrangements a where a.salon_id=p_salon and a.stylist_id=v_agreement.stylist_id and a.effective_from>v_agreement.effective_from and a.effective_from<=v_period_start) then raise exception 'FINANCE_INVALID_PERIOD'; end if;
    if exists(select 1 from public.business_compensation_obligations o where o.salon_id=p_salon and o.stylist_id=v_agreement.stylist_id and o.period_start<=v_period_end and o.period_end>=v_period_start) then raise exception 'FINANCE_PERIOD_OVERLAP'; end if;
    insert into public.business_compensation_obligations(salon_id,stylist_id,due_at,kind,amount_cents,arrangement_version,period_start,period_end,created_by)
      values(p_salon,v_agreement.stylist_id,(p_payload->>'due_at')::timestamptz,case v_agreement.kind when 'booth' then 'booth_rent' else 'wage' end,
        v_agreement.amount_cents,v_agreement.id,(p_payload->>'period_start')::date,
        ((p_payload->>'period_start')::date+case v_agreement.period when 'week' then interval '7 days' else interval '1 month' end-interval '1 day')::date,p_user) returning id into v_id;
  elsif p_action='compensation_payment' then
    if p_payload->>'kind'<>'commission' then
      select * into v_obligation from public.business_compensation_obligations where salon_id=p_salon and id=(p_payload->>'obligation_id')::uuid and stylist_id=v_stylist and kind=p_payload->>'kind';
      if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
      select coalesce(sum(amount_cents),0) into v_paid from public.business_compensation_payments where salon_id=p_salon and obligation_id=v_obligation.id;
      if v_cents>v_obligation.amount_cents-v_paid then raise exception 'FINANCE_PAYMENT_EXCEEDS_DUE'; end if;
    end if;
    insert into public.business_compensation_payments(salon_id,stylist_id,occurred_at,obligation_id,kind,amount_cents,method,created_by)
      values(p_salon,v_stylist,v_at,v_obligation.id,p_payload->>'kind',v_cents,p_payload->>'method',p_user) returning id into v_id;
  else raise exception 'FINANCE_INVALID_ACTION'; end if;
  v_result:=jsonb_build_object('id',v_id,'verified',true);
  insert into public.business_finance_operations(salon_id,actor_id,request_id,action,payload,result) values(p_salon,p_user,p_request,p_action,p_payload,v_result);
  return v_result;
exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'FINANCE_INVALID_RECORD';
when unique_violation then raise exception 'FINANCE_RECORD_CONFLICT';
end $$;

-- Read only minimum financial fields. No contact addresses, provider secrets,
-- other businesses, or unrelated staff records enter screens/models/exports.
create function public.read_business_finance(p_salon uuid,p_user uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_scope jsonb; v_stylist uuid; v_result jsonb; v_count bigint;
begin
  perform 1 from public.platform_identities where user_id=p_user for share;
  perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_user for share;
  v_scope:=public.business_finance_scope(p_salon,p_user); v_stylist:=(v_scope->>'stylist_id')::uuid;
  select jsonb_build_object(
    'scope',v_scope,
    'sales',coalesce((select jsonb_agg((to_jsonb(s)-'created_by')||case when v_stylist is null then '{}'::jsonb else '{"cost_cents":null,"client_name":null}'::jsonb end) from public.business_finance_sales s where s.salon_id=p_salon and (v_stylist is null or s.stylist_id=v_stylist)),'[]'),
    'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'salon_id',b.salon_id,'stylist_id',b.stylist_id,'customer_id',case when v_stylist is null then b.customer_id else null end,'guest_name',case when v_stylist is null then b.guest_name else null end,
      'name',coalesce(b.manual_service_name,s.name,'Service'),'created_at',b.created_at,'appointment_datetime',b.appointment_datetime,'service_completed_at',b.service_completed_at,'status',b.status,
      'booking_origin',b.booking_origin,'source',b.source,'estimated_total',b.estimated_total,'subtotal_before_promotion',b.subtotal_before_promotion,'deposit_amount',b.deposit_amount,
      'deposit_status',b.deposit_status,'payment_mode',b.payment_mode,'payment_verified_at',b.payment_verified_at,'verified_charge',coalesce(b.stripe_charge_id like 'ch_%',false),
      'refund_status',b.refund_status,'refund_amount',b.refund_amount,'refund_completed_at',b.refund_completed_at,'verified_refund',coalesce(b.stripe_refund_id like 're_%',false),'operating_compensation',b.operating_compensation))
      from public.bookings b left join public.styles s on s.id=b.style_id and s.salon_id=b.salon_id where b.salon_id=p_salon and (v_stylist is null or b.stylist_id=v_stylist)),'[]'),
    'receipts',coalesce((select jsonb_agg(to_jsonb(r)-'created_by'-'note') from public.business_finance_receipts r where r.salon_id=p_salon and (v_stylist is null
      or exists(select 1 from public.business_finance_sales s where s.salon_id=p_salon and s.id=r.sale_id and s.stylist_id=v_stylist)
      or exists(select 1 from public.bookings b where b.salon_id=p_salon and b.id=r.booking_id and b.stylist_id=v_stylist))),'[]'),
    'expenses',case when v_stylist is null then coalesce((select jsonb_agg(to_jsonb(e)-'created_by') from public.business_finance_expenses e where e.salon_id=p_salon),'[]') else '[]' end,
    'arrangements',coalesce((select jsonb_agg(to_jsonb(a)-'created_by') from public.business_compensation_arrangements a where a.salon_id=p_salon and (v_stylist is null or a.stylist_id=v_stylist)),'[]'),
    'obligations',coalesce((select jsonb_agg(to_jsonb(o)-'created_by') from public.business_compensation_obligations o where o.salon_id=p_salon and (v_stylist is null or o.stylist_id=v_stylist)),'[]'),
    'compensation_payments',coalesce((select jsonb_agg(to_jsonb(p)-'created_by') from public.business_compensation_payments p where p.salon_id=p_salon and (v_stylist is null or p.stylist_id=v_stylist)),'[]'),
    'stylists',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'salon_id',s.salon_id,'name',s.name)) from public.stylists s where s.salon_id=p_salon and (v_stylist is null or s.id=v_stylist)),'[]'),
    'product_orders',case when v_stylist is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'salon_id',o.salon_id,'public_reference',o.public_reference,'customer_id',o.customer_id,'guest_name',o.guest_name,
      'created_at',o.created_at,'fulfilled_at',o.fulfilled_at,'paid_at',o.paid_at,'fulfillment_status',o.fulfillment_status,'reservation_status',o.reservation_status,
      'subtotal',o.subtotal,'discount_amount',o.discount_amount,'tax_amount',o.tax_amount,'shipping_amount',o.shipping_amount,'total_amount',o.total_amount,'currency',o.currency,
      'deposit_amount',o.deposit_amount,'payment_status',o.payment_status,'payment_mode',o.payment_mode,'verified_charge',coalesce(o.stripe_charge_id like 'ch_%',false),
      'items',(select coalesce(jsonb_agg(jsonb_build_object('product_name',i.product_name,'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.line_total)),'[]') from public.product_order_items i where i.order_id=o.id)
    )) from public.product_orders o where o.salon_id=p_salon),'[]') end,
    'product_refunds',case when v_stylist is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'salon_id',r.salon_id,'order_id',r.order_id,'amount',r.amount,'status',r.status,'completed_at',r.completed_at,'verified_refund',coalesce(r.stripe_refund_id like 're_%',false)
    )) from public.product_order_refunds r join public.product_orders o on o.id=r.order_id and o.salon_id=r.salon_id where r.salon_id=p_salon),'[]') end
  ) into v_result;
  select sum(jsonb_array_length(value)) into v_count from jsonb_each(v_result) where jsonb_typeof(value)='array';
  if v_count>100000 then raise exception 'FINANCE_RANGE_TOO_LARGE'; end if;
  return v_result;
end $$;
create function public.business_finance_entry_options(p_salon uuid,p_user uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not (public.p0_actor_has_permission(p_salon,p_user,'finance_log') or public.p0_actor_has_permission(p_salon,p_user,'finance_manage')) then raise exception 'FINANCE_ACCESS_DENIED'; end if;
  return jsonb_build_object('stylists',coalesce((select jsonb_agg(jsonb_build_object('id',id,'salon_id',salon_id,'name',name)) from public.stylists where salon_id=p_salon and archived_at is null),'[]'));
end $$;
revoke all on function public.business_finance_scope(uuid,uuid),public.business_compensation_snapshot(uuid,uuid,timestamptz),public.snapshot_booking_compensation(),public.record_business_finance(uuid,uuid,uuid,text,jsonb),public.read_business_finance(uuid,uuid),public.business_finance_entry_options(uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_finance_scope(uuid,uuid),public.record_business_finance(uuid,uuid,uuid,text,jsonb),public.read_business_finance(uuid,uuid) to service_role;
grant execute on function public.business_finance_entry_options(uuid,uuid) to service_role;
update public.engine_settings set published_value='"20260918050000"'::jsonb,draft_value='"20260918050000"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
