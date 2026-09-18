begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

alter table public.salon_products add column stock_revision bigint not null default 1;
create table public.business_supplies (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120), unit text not null default 'units' check(length(trim(unit)) between 1 and 30),
 inventory_quantity integer not null default 0 check(inventory_quantity between 0 and 1000000),
 low_stock_threshold integer not null default 5 check(low_stock_threshold between 0 and 1000000),
 stock_revision bigint not null default 1, archived_at timestamptz, created_at timestamptz not null default now(), unique(salon_id,id)
);
create table public.business_stock_movements (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 product_id uuid references public.salon_products(id) on delete cascade, supply_id uuid, name text not null,
 before_quantity integer, after_quantity integer not null, revision bigint not null,
 reason text not null check(reason in ('opening','system_change','restock','correction','consumption','offline_sale','settings')),
 note text check(length(note)<=500), actor_id uuid, request_id uuid, sale_id uuid, expense_id uuid,
 created_at timestamptz not null default now(),
 check(num_nonnulls(product_id,supply_id)=1), foreign key(salon_id,supply_id) references public.business_supplies(salon_id,id),
 foreign key(salon_id,sale_id) references public.business_finance_sales(salon_id,id)
);
create index business_stock_movements_history on public.business_stock_movements(salon_id,created_at desc,id);
create table public.business_stock_operations (
 salon_id uuid not null references public.salons(id) on delete cascade, actor_id uuid not null, request_id uuid not null,
 action text not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(salon_id,actor_id,request_id)
);
do $$ declare t text; begin
 foreach t in array array['business_supplies','business_stock_movements','business_stock_operations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
create index business_supplies_business on public.business_supplies(salon_id);

-- One trigger observes every existing reservation/release/import stock change.
-- It does not deduct stock itself. Existing quantities are not fabricated as purchases.
create function public.guard_business_stock_revision() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.salon_id<>old.salon_id then raise exception 'STOCK_SCOPE_INVALID'; end if;
 if new.inventory_quantity is distinct from old.inventory_quantity or new.low_stock_threshold is distinct from old.low_stock_threshold
  or (to_jsonb(new)->'track_inventory') is distinct from (to_jsonb(old)->'track_inventory') then
  if auth.uid() is not null and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'STOCK_USE_GUARDED_WORKFLOW'; end if;
  new.stock_revision:=old.stock_revision+1;
 else new.stock_revision:=old.stock_revision; end if;
 return new;
end $$;
create function public.audit_business_stock() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_context jsonb:=coalesce(nullif(current_setting('gc.stock_context',true),''),'{}')::jsonb; v_reason text;
begin
 if TG_OP='UPDATE' and new.stock_revision=old.stock_revision then return new; end if;
 v_reason:=case when TG_OP='INSERT' then 'opening' when new.inventory_quantity=old.inventory_quantity then 'settings' else coalesce(v_context->>'reason','system_change') end;
 insert into public.business_stock_movements(salon_id,product_id,supply_id,name,before_quantity,after_quantity,revision,reason,note,actor_id,request_id,sale_id,expense_id)
 values(new.salon_id,case when TG_TABLE_NAME='salon_products' then new.id end,case when TG_TABLE_NAME='business_supplies' then new.id end,new.name,
  case when TG_OP='UPDATE' then old.inventory_quantity end,new.inventory_quantity,new.stock_revision,v_reason,v_context->>'note',
  (v_context->>'actor_id')::uuid,(v_context->>'request_id')::uuid,(v_context->>'sale_id')::uuid,(v_context->>'expense_id')::uuid);
 return new;
end $$;
create trigger stock_revision_guard before update on public.salon_products for each row execute function public.guard_business_stock_revision();
create trigger stock_change_audit after insert or update on public.salon_products for each row execute function public.audit_business_stock();
create trigger stock_revision_guard before update on public.business_supplies for each row execute function public.guard_business_stock_revision();
create trigger stock_change_audit after insert or update on public.business_supplies for each row execute function public.audit_business_stock();

create function public.read_business_stock(p_salon uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_products jsonb; v_supplies jsonb;
begin
 if not public.p0_actor_has_permission(p_salon,p_user,'products') then raise exception 'STOCK_ACCESS_DENIED'; end if;
 if (select count(*) from public.salon_products where salon_id=p_salon and archived_at is null)>10000 or
    (select count(*) from public.business_supplies where salon_id=p_salon and archived_at is null)>10000 then raise exception 'STOCK_RANGE_TOO_LARGE'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'inventory_quantity',inventory_quantity,'low_stock_threshold',low_stock_threshold,'track_inventory',track_inventory,'stock_revision',stock_revision,'unit','units') order by name,id),'[]') into v_products from public.salon_products where salon_id=p_salon and archived_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'unit',unit,'inventory_quantity',inventory_quantity,'low_stock_threshold',low_stock_threshold,'track_inventory',true,'stock_revision',stock_revision) order by name,id),'[]') into v_supplies from public.business_supplies where salon_id=p_salon and archived_at is null;
 return jsonb_build_object('products',v_products,'supplies',v_supplies,'movements',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc,m.id) from
  (select id,product_id,supply_id,name,before_quantity,after_quantity,revision,reason,note,created_at from public.business_stock_movements where salon_id=p_salon order by created_at desc,id limit 250)m),'[]'),'history_limit',250);
end $$;

create function public.record_business_stock(p_salon uuid,p_user uuid,p_request uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_prior public.business_stock_operations%rowtype; v_product public.salon_products%rowtype; v_supply public.business_supplies%rowtype;
 v_id uuid; v_before integer; v_after integer; v_revision bigint; v_quantity integer; v_cost bigint; v_expense uuid; v_result jsonb; v_reason text;
begin
 if p_request is null or p_action not in ('create_supply','restock','correction','consumption','settings','archive_supply') or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4000 then raise exception 'STOCK_INVALID_RECORD'; end if;
 if exists(select 1 from jsonb_each(p_payload) where key not in ('product_id','supply_id','name','unit','quantity','expected_revision','low_stock_threshold','track_inventory','note','cost_cents')) then raise exception 'STOCK_INVALID_RECORD'; end if;
 if exists(select 1 from jsonb_each(p_payload) where key in ('quantity','expected_revision','low_stock_threshold','cost_cents') and value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$')) then raise exception 'STOCK_INVALID_RECORD'; end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_user for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_user for share;
 if not public.p0_actor_has_permission(p_salon,p_user,'products') then raise exception 'STOCK_ACCESS_DENIED'; end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'STOCK_PLAN_REQUIRED'; end if;
 v_cost:=(p_payload->>'cost_cents')::bigint;
 if v_cost is not null and (v_cost not between 1 and 100000000 or p_action<>'restock') then raise exception 'STOCK_INVALID_RECORD'; end if;
 if v_cost is not null and not public.p0_actor_has_permission(p_salon,p_user,'finance_manage') then raise exception 'STOCK_FINANCE_PERMISSION_REQUIRED'; end if;
 select * into v_prior from public.business_stock_operations where salon_id=p_salon and actor_id=p_user and request_id=p_request;
 if found then if v_prior.action<>p_action or v_prior.payload<>p_payload then raise exception 'STOCK_REQUEST_CONFLICT'; end if; return v_prior.result; end if;
 v_quantity:=(p_payload->>'quantity')::integer;
 if p_action='create_supply' then
  if num_nonnulls(p_payload->>'product_id',p_payload->>'supply_id')<>0 then raise exception 'STOCK_INVALID_RECORD'; end if;
  perform set_config('gc.stock_context',jsonb_build_object('actor_id',p_user,'request_id',p_request)::text,true);
  insert into public.business_supplies(salon_id,name,unit,inventory_quantity,low_stock_threshold) values(p_salon,trim(p_payload->>'name'),trim(p_payload->>'unit'),coalesce(v_quantity,0),coalesce((p_payload->>'low_stock_threshold')::integer,5)) returning id,inventory_quantity,stock_revision into v_id,v_after,v_revision;
 else
  if num_nonnulls(p_payload->>'product_id',p_payload->>'supply_id')<>1 then raise exception 'STOCK_INVALID_RECORD'; end if;
  if p_payload->>'product_id' is not null then
   select * into v_product from public.salon_products where salon_id=p_salon and id=(p_payload->>'product_id')::uuid and archived_at is null for update;
   if not found then raise exception 'STOCK_RECORD_NOT_FOUND'; end if;
   v_id:=v_product.id;v_before:=v_product.inventory_quantity;v_revision:=v_product.stock_revision;
   if p_action in ('restock','correction','consumption') and not v_product.track_inventory then raise exception 'STOCK_NOT_TRACKED'; end if;
  else
   select * into v_supply from public.business_supplies where salon_id=p_salon and id=(p_payload->>'supply_id')::uuid and archived_at is null for update;
   if not found then raise exception 'STOCK_RECORD_NOT_FOUND'; end if;
   v_id:=v_supply.id;v_before:=v_supply.inventory_quantity;v_revision:=v_supply.stock_revision;
  end if;
  if v_revision is distinct from (p_payload->>'expected_revision')::bigint then raise exception 'STOCK_REVISION_CONFLICT'; end if;
  if p_action in ('restock','consumption') and (v_quantity is null or v_quantity<=0) then raise exception 'STOCK_INVALID_RECORD'; end if;
  if p_action='correction' and (v_quantity is null or length(trim(coalesce(p_payload->>'note','')))=0) then raise exception 'STOCK_INVALID_RECORD'; end if;
  v_after:=case p_action when 'restock' then v_before+v_quantity when 'consumption' then v_before-v_quantity when 'correction' then v_quantity else v_before end;
  if v_after not between 0 and 1000000 then raise exception 'STOCK_INSUFFICIENT'; end if;
  if v_cost is not null then
   insert into public.business_finance_expenses(salon_id,occurred_at,category,amount_cents,treatment,note,created_by)
   values(p_salon,now(),case when v_product.id is null then 'Supplies' else 'Retail restock' end,v_cost,case when v_product.id is null then 'operating' else 'inventory_asset' end,p_payload->>'note',p_user) returning id into v_expense;
  end if;
  v_reason:=case when p_action in ('restock','correction','consumption') then p_action else 'settings' end;
  perform set_config('gc.stock_context',jsonb_build_object('reason',v_reason,'note',p_payload->>'note','actor_id',p_user,'request_id',p_request,'expense_id',v_expense)::text,true);
  if v_product.id is not null then
   if p_action='archive_supply' then raise exception 'STOCK_INVALID_RECORD'; end if;
   update public.salon_products set inventory_quantity=v_after,
    low_stock_threshold=case when p_action='settings' then coalesce((p_payload->>'low_stock_threshold')::integer,low_stock_threshold) else low_stock_threshold end,
    track_inventory=case when p_action='settings' then coalesce((p_payload->>'track_inventory')::boolean,track_inventory) else track_inventory end
    where salon_id=p_salon and id=v_id returning stock_revision into v_revision;
  else
   update public.business_supplies set inventory_quantity=v_after,
    low_stock_threshold=case when p_action='settings' then coalesce((p_payload->>'low_stock_threshold')::integer,low_stock_threshold) else low_stock_threshold end,
    archived_at=case when p_action='archive_supply' then now() else archived_at end
    where salon_id=p_salon and id=v_id returning stock_revision into v_revision;
  end if;
 end if;
 perform set_config('gc.stock_context','',true);
 v_result:=jsonb_build_object('id',v_id,'quantity',v_after,'revision',v_revision,'verified',true);
 insert into public.business_stock_operations(salon_id,actor_id,request_id,action,payload,result) values(p_salon,p_user,p_request,p_action,p_payload,v_result);
 return v_result;
exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'STOCK_INVALID_RECORD';
end $$;
revoke all on function public.guard_business_stock_revision(),public.audit_business_stock(),public.read_business_stock(uuid,uuid),public.record_business_stock(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.read_business_stock(uuid,uuid),public.record_business_stock(uuid,uuid,uuid,text,jsonb) to service_role;

alter table public.business_finance_sales add column product_id uuid references public.salon_products(id);

create or replace function public.record_business_finance(p_salon uuid,p_user uuid,p_request uuid,p_action text,p_payload jsonb) returns jsonb
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
    insert into public.business_finance_sales(salon_id,occurred_at,source,kind,name,product_id,stylist_id,client_name,list_cents,discount_cents,cost_cents,quantity,compensation,created_by)
      values(p_salon,v_at,p_payload->>'source',p_payload->>'kind',trim(p_payload->>'name'),(p_payload->>'product_id')::uuid,v_stylist,nullif(trim(p_payload->>'client_name'),''),
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

-- Financial sale insert snapshots the own product and deducts tracked stock once.
-- Reservation/balance/provider receipts never insert a second offline sale.
create function public.record_offline_product_stock() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_product public.salon_products%rowtype;
begin
 if new.kind='service' then if new.product_id is not null then raise exception 'FINANCE_INVALID_RECORD'; end if; return new; end if;
 if new.product_id is null then raise exception 'FINANCE_PRODUCT_REQUIRED'; end if;
 select * into v_product from public.salon_products where salon_id=new.salon_id and id=new.product_id and archived_at is null for update;
 if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
 new.name:=v_product.name;
 if v_product.track_inventory and v_product.inventory_quantity<new.quantity then raise exception 'FINANCE_STOCK_INSUFFICIENT'; end if;
 return new;
end $$;
create function public.deduct_offline_product_stock() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.kind<>'product' then return new; end if;
 perform set_config('gc.stock_context',jsonb_build_object('reason','offline_sale','actor_id',new.created_by,'sale_id',new.id)::text,true);
 update public.salon_products set inventory_quantity=inventory_quantity-new.quantity where salon_id=new.salon_id and id=new.product_id and track_inventory;
 perform set_config('gc.stock_context','',true);
 return new;
end $$;
create trigger offline_product_identity before insert on public.business_finance_sales for each row execute function public.record_offline_product_stock();
create trigger offline_product_stock after insert on public.business_finance_sales for each row execute function public.deduct_offline_product_stock();
revoke all on function public.record_offline_product_stock(),public.deduct_offline_product_stock() from public,anon,authenticated;
create or replace function public.business_finance_entry_options(p_salon uuid,p_user uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not(public.p0_actor_has_permission(p_salon,p_user,'finance_log') or public.p0_actor_has_permission(p_salon,p_user,'finance_manage')) then raise exception 'FINANCE_ACCESS_DENIED'; end if;
 return jsonb_build_object('stylists',coalesce((select jsonb_agg(jsonb_build_object('id',id,'salon_id',salon_id,'name',name)) from public.stylists where salon_id=p_salon and archived_at is null),'[]'),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'price',price,'sale_price',sale_price)) from public.salon_products where salon_id=p_salon and archived_at is null),'[]'));
end $$;

create or replace function public.import_salon_products_spreadsheet(
  p_salon_id uuid,
  p_actor_user_id uuid,
  p_file_name text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row jsonb;
  v_record_id uuid;
  v_product_id uuid;
  v_name text;
  v_sku text;
  v_status text;
  v_pickup boolean;
  v_shipping boolean;
  v_visible boolean;
  v_created integer := 0;
  v_updated integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_salon_id is null
     or not exists (select 1 from public.salons where id = p_salon_id) then
    raise exception 'SALON_IMPORT_SALON_NOT_FOUND' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) < 1
     or jsonb_array_length(p_rows) > 1000 then
    raise exception 'SALON_IMPORT_PRODUCT_ROWS_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtext(p_salon_id::text || ':salon-product-spreadsheet')
  );

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_record_id := nullif(v_row->>'record_id', '')::uuid;
    v_name := nullif(trim(v_row->>'name'), '');
    v_sku := nullif(trim(v_row->>'sku'), '');
    v_status := coalesce(nullif(v_row->>'product_status', ''), 'Draft');
    v_pickup := coalesce((v_row->>'pickup_enabled')::boolean, false);
    v_shipping := coalesce((v_row->>'shipping_enabled')::boolean, false);
    v_visible := coalesce((v_row->>'is_visible')::boolean, true);
    if v_name is null then
      raise exception 'SALON_IMPORT_PRODUCT_NAME_REQUIRED' using errcode = '22023';
    end if;
    if v_status not in ('Draft', 'Active', 'Archived') then
      raise exception 'SALON_IMPORT_PRODUCT_STATUS_INVALID' using errcode = '22023';
    end if;
    if v_status = 'Active' and v_visible and not v_pickup and not v_shipping then
      raise exception 'SALON_IMPORT_PRODUCT_FULFILLMENT_REQUIRED'
        using errcode = '22023';
    end if;

    if v_record_id is not null then
      select product.id
      into v_product_id
      from public.salon_products product
      where product.id = v_record_id and product.salon_id = p_salon_id
      for update;
      if not found then
        raise exception 'SALON_IMPORT_PRODUCT_RECORD_NOT_FOUND'
          using errcode = 'P0002';
      end if;
    elsif v_sku is not null then
      select product.id
      into v_product_id
      from public.salon_products product
      where product.salon_id = p_salon_id
        and lower(trim(product.sku)) = lower(v_sku)
      order by (product.archived_at is null) desc, product.created_at desc
      limit 1
      for update;
    else
      select product.id
      into v_product_id
      from public.salon_products product
      where product.salon_id = p_salon_id
        and lower(trim(product.name)) = lower(v_name)
      order by (product.archived_at is null) desc, product.created_at desc
      limit 1
      for update;
    end if;

    if v_product_id is null then
      insert into public.salon_products (
        salon_id,
        name,
        description,
        price,
        sale_price,
        sku,
        is_visible,
        in_person_only,
        inventory_quantity,
        low_stock_threshold,
        track_inventory,
        product_status,
        pickup_enabled,
        pickup_prep_minutes,
        shipping_enabled,
        weight_ounces,
        dimensions,
        shipping_profile,
        shipping_price,
        tax_category,
        max_quantity_per_order,
        archived_at
      ) values (
        p_salon_id,
        v_name,
        coalesce(v_row->>'description', ''),
        (v_row->>'price')::numeric,
        nullif(v_row->>'sale_price', '')::numeric,
        v_sku,
        case when v_status = 'Archived' then false else v_visible end,
        not v_pickup and not v_shipping,
        (v_row->>'inventory_quantity')::integer,
        (v_row->>'low_stock_threshold')::integer,
        (v_row->>'track_inventory')::boolean,
        v_status,
        v_pickup,
        (v_row->>'pickup_prep_minutes')::integer,
        v_shipping,
        nullif(v_row->>'weight_ounces', '')::numeric,
        jsonb_build_object(
          'length', nullif(v_row->>'dimension_length', '')::numeric,
          'width', nullif(v_row->>'dimension_width', '')::numeric,
          'height', nullif(v_row->>'dimension_height', '')::numeric,
          'unit', 'in'
        ),
        nullif(v_row->>'shipping_profile', ''),
        (v_row->>'shipping_price')::numeric,
        v_row->>'tax_category',
        (v_row->>'max_quantity_per_order')::integer,
        case when v_status = 'Archived' then now() else null end
      )
      returning id into v_product_id;
      v_created := v_created + 1;
    else
      update public.salon_products
      set
        name = v_name,
        description = coalesce(v_row->>'description', ''),
        price = (v_row->>'price')::numeric,
        sale_price = nullif(v_row->>'sale_price', '')::numeric,
        sku = v_sku,
        is_visible = case when v_status = 'Archived' then false else v_visible end,
        in_person_only = not v_pickup and not v_shipping,
        -- Existing stock is adjusted in the guarded stock workflow, not a stale file.
        inventory_quantity = inventory_quantity,
        low_stock_threshold = (v_row->>'low_stock_threshold')::integer,
        track_inventory = (v_row->>'track_inventory')::boolean,
        product_status = v_status,
        pickup_enabled = v_pickup,
        pickup_prep_minutes = (v_row->>'pickup_prep_minutes')::integer,
        shipping_enabled = v_shipping,
        weight_ounces = nullif(v_row->>'weight_ounces', '')::numeric,
        dimensions = jsonb_build_object(
          'length', nullif(v_row->>'dimension_length', '')::numeric,
          'width', nullif(v_row->>'dimension_width', '')::numeric,
          'height', nullif(v_row->>'dimension_height', '')::numeric,
          'unit', 'in'
        ),
        shipping_profile = nullif(v_row->>'shipping_profile', ''),
        shipping_price = (v_row->>'shipping_price')::numeric,
        tax_category = v_row->>'tax_category',
        max_quantity_per_order = (v_row->>'max_quantity_per_order')::integer,
        archived_at = case when v_status = 'Archived' then now() else null end,
        updated_at = now()
      where id = v_product_id and salon_id = p_salon_id;
      v_updated := v_updated + 1;
    end if;
    v_ids := v_ids || jsonb_build_array(v_product_id);
  end loop;

  v_result := jsonb_build_object(
    'kind', 'products',
    'created', v_created,
    'updated', v_updated,
    'record_ids', v_ids
  );
  insert into public.salon_spreadsheet_imports (
    salon_id,
    actor_user_id,
    import_kind,
    file_name,
    rows_created,
    rows_updated,
    result
  ) values (
    p_salon_id,
    p_actor_user_id,
    'products',
    nullif(left(trim(coalesce(p_file_name, '')), 255), ''),
    v_created,
    v_updated,
    v_result
  );
  return v_result;
end;
$$;


update public.engine_settings set published_value='"20260918122816"',draft_value='"20260918122816"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
