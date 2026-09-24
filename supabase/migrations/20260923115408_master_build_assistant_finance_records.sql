begin;
do $$ declare definition text; begin
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if definition is null then raise exception 'ASSISTANT_TOOL_CONTRACT_MISSING';end if;
 alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
 execute 'alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check (tool in (''get_finance_records'',''prepare_finance_record'') or '||substr(definition,7)||')';
end $$;

create function public.read_gc_finance_records(p_salon uuid,p_actor uuid,p_start timestamptz,p_end timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare records jsonb;totals jsonb;
begin
 if not public.p0_actor_has_permission(p_salon,p_actor,'finance_manage') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start or p_end-p_start>interval '31 days' then raise exception 'ASSISTANT_INVALID_DATE_RANGE';end if;
 with rows as (
  select id,'receipt' kind,occurred_at,jsonb_build_object('id',id,'kind','receipt','occurred_at',occurred_at,'stage',stage,'method',method,'amount_cents',amount_cents,'sale_id',sale_id,'booking_id',booking_id,'product_order_id',product_order_id,'original_payment_id',original_payment_id) data from public.business_finance_receipts where salon_id=p_salon
  union all select id,'expense',occurred_at,jsonb_build_object('id',id,'kind','expense','occurred_at',occurred_at,'category',category,'treatment',treatment,'amount_cents',amount_cents) from public.business_finance_expenses where salon_id=p_salon
  union all select id,'sale',occurred_at,jsonb_build_object('id',id,'kind','sale','occurred_at',occurred_at,'name',name,'agreed_cents',agreed_cents,'status',status) from public.business_finance_sales where salon_id=p_salon
  union all select id,'booking',appointment_datetime,jsonb_build_object('id',id,'kind','booking','occurred_at',appointment_datetime,'reference',public_reference,'estimated_total',estimated_total,'status',status,'payment_mode',payment_mode) from public.bookings where salon_id=p_salon
  union all select id,'order',created_at,jsonb_build_object('id',id,'kind','order','occurred_at',created_at,'reference',public_reference,'total_amount',total_amount,'reservation_status',reservation_status,'payment_mode',payment_mode) from public.product_orders where salon_id=p_salon
 ), filtered as (select * from rows where occurred_at>=p_start and occurred_at<p_end)
 select coalesce((select jsonb_agg(data order by occurred_at desc,kind,id) from (select * from filtered order by occurred_at desc,kind,id limit 100)x),'[]'::jsonb),
  coalesce((select jsonb_object_agg(kind,n) from (select kind,count(*) n from filtered group by kind)x),'{}'::jsonb) into records,totals;
 return jsonb_build_object('salon_id',p_salon,'records',records,'totals',totals,'sample_data',(select is_demo from public.salons where id=p_salon));
end $$;

-- The same projection prepares and rechecks the immutable owner-reviewed draft.
-- Nothing is written, charged, refunded or notified by this function.
create function public.preview_gc_finance_record(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare action text;kind text;target uuid;at_time timestamptz;zone text;payload jsonb;before_json jsonb:='{}'::jsonb;label text;amount bigint;paid bigint;receipt public.business_finance_receipts%rowtype;
begin
 if not public.p0_actor_has_permission(p_salon,p_actor,'finance_manage') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if jsonb_typeof(p_args) is distinct from 'object' or not(p_args ?& array['action','record_id','record_kind','amount_cents','date','time','method','category','treatment','note','money_already_moved'])
 or p_args-array['action','record_id','record_kind','amount_cents','date','time','method','category','treatment','note','money_already_moved']<>'{}'::jsonb
 or p_args->'money_already_moved' is distinct from 'true'::jsonb or jsonb_typeof(p_args->'amount_cents') is distinct from 'number'
 or p_args->>'amount_cents' !~ '^[1-9][0-9]*$' or (p_args->>'amount_cents')::numeric>100000000
 or exists(select 1 from jsonb_each(p_args) where key in ('action','date','time','note') and jsonb_typeof(value)<>'string')
 or exists(select 1 from jsonb_each(p_args) where key in ('record_id','record_kind','method','category','treatment') and jsonb_typeof(value) not in ('string','null'))
 or p_args->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or p_args->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 or length(trim(p_args->>'note')) not between 1 and 1200 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 action:=p_args->>'action';kind:=p_args->>'record_kind';target:=(p_args->>'record_id')::uuid;amount:=(p_args->>'amount_cents')::bigint;
 select coalesce(nullif(time_zone,''),'America/New_York') into zone from public.salons where id=p_salon;
 at_time:=((p_args->>'date')||' '||(p_args->>'time'))::timestamp at time zone zone;
 if not isfinite(at_time) or at_time>now()+interval '5 minutes' or to_char(at_time at time zone zone,'YYYY-MM-DD HH24:MI')<>(p_args->>'date')||' '||(p_args->>'time') then raise exception 'ASSISTANT_INVALID_DATE_RANGE';end if;
 payload:=jsonb_build_object('occurred_at',to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'amount_cents',amount,'note',trim(p_args->>'note'));
 if action='expense' then
  if target is not null or kind is not null or p_args->>'method' is not null or length(trim(coalesce(p_args->>'category',''))) not between 1 and 80 or coalesce(p_args->>'treatment','') not in ('operating','inventory_asset') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  payload:=payload||jsonb_build_object('category',trim(p_args->>'category'),'treatment',p_args->>'treatment');label:=trim(p_args->>'category');
 elsif action in ('receipt','refund') then
  if target is null or p_args->>'category' is not null or p_args->>'treatment' is not null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if action='refund' then
   if kind is distinct from 'receipt' or p_args->>'method' is not null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   select * into receipt from public.business_finance_receipts where salon_id=p_salon and id=target and stage<>'refund';
   if not found then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
   select coalesce(sum(amount_cents),0) into paid from public.business_finance_receipts where salon_id=p_salon and original_payment_id=target;
   if amount>receipt.amount_cents-paid or at_time<receipt.occurred_at then raise exception 'ASSISTANT_FINANCE_AMOUNT_EXCEEDS_REMAINING';end if;
   before_json:=jsonb_build_object('original_payment_id',receipt.id,'original_amount_cents',receipt.amount_cents,'returned_cents',paid,'method',receipt.method);
   payload:=payload||jsonb_build_object('original_payment_id',target);label:='Recorded receipt';
  else
   if coalesce(kind,'') not in ('sale','booking','order') or coalesce(p_args->>'method','') not in ('cash','card','transfer','other') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   if kind='sale' then
    select jsonb_build_object('id',id,'agreed_cents',agreed_cents,'status',status),name into before_json,label from public.business_finance_sales where salon_id=p_salon and id=target;
   elsif kind='booking' then
    select jsonb_build_object('id',id,'estimated_total',estimated_total,'deposit_amount',deposit_amount,'deposit_status',deposit_status,'payment_mode',payment_mode,'payment_verified_at',payment_verified_at,'status',status),public_reference into before_json,label from public.bookings where salon_id=p_salon and id=target;
   else
    select jsonb_build_object('id',id,'total_amount',total_amount,'deposit_amount',deposit_amount,'payment_status',payment_status,'payment_mode',payment_mode,'paid_at',paid_at,'reservation_status',reservation_status),public_reference into before_json,label from public.product_orders where salon_id=p_salon and id=target;
   end if;
   if before_json is null then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
   select coalesce(sum(amount_cents),0) into paid from public.business_finance_receipts where salon_id=p_salon and stage<>'refund' and (kind='sale' and sale_id=target or kind='booking' and booking_id=target or kind='order' and product_order_id=target);
   before_json:=before_json||jsonb_build_object('recorded_received_cents',paid);
   payload:=payload||jsonb_build_object('sale_id',case when kind='sale' then target end,'booking_id',case when kind='booking' then target end,'product_order_id',case when kind='order' then target end,'method',p_args->>'method');
  end if;
 else raise exception 'ASSISTANT_INVALID_INPUT';end if;
 return jsonb_build_object('salon_id',p_salon,'before',before_json,'payload',jsonb_build_object('action',action,'record_label',coalesce(label,'Recorded transaction'),'amount_cents',amount,'occurred_at',payload->>'occurred_at','time_zone',zone,'finance_payload',payload,'provider_action',false));
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then raise exception 'ASSISTANT_INVALID_INPUT';
end $$;

alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_finance_records;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;fresh jsonb;written jsonb;saved jsonb;operation public.business_finance_operations%rowtype;failure text;replayed boolean;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_finance_record' then return public.confirm_gc_assistant_request_before_finance_records(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if r.permission<>'finance_manage' or r.risk_class<>4 or not public.p0_actor_has_permission(p_salon,p_actor,'finance_manage') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is null and (r.failure_code is not null or r.expires_at<=now()) then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 replayed:=r.confirmed_at is not null;
 begin
  if not replayed then
   fresh:=public.preview_gc_finance_record(p_salon,p_actor,r.arguments);
   if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   written:=public.record_business_finance(p_salon,p_actor,r.id,r.arguments->>'action',r.execution_payload->'finance_payload');
   if written->'verified' is distinct from 'true'::jsonb then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  end if;
  select * into operation from public.business_finance_operations where salon_id=p_salon and actor_id=p_actor and request_id=r.id;
  if not found or operation.action is distinct from r.arguments->>'action' or operation.payload is distinct from r.execution_payload->'finance_payload' then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  if operation.action='expense' then
   select to_jsonb(e) into saved from public.business_finance_expenses e where salon_id=p_salon and id=(operation.result->>'id')::uuid and created_by=p_actor;
  else
   select to_jsonb(e) into saved from public.business_finance_receipts e where salon_id=p_salon and id=(operation.result->>'id')::uuid and created_by=p_actor;
  end if;
  if saved is null or exists(select 1 from jsonb_each(operation.payload) kv where case when key='occurred_at' then (saved->>key)::timestamptz is distinct from (value#>>'{}')::timestamptz else saved->key is distinct from value end) then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  saved:=jsonb_build_object('id',saved->>'id','action',operation.action,'amount_cents',saved->'amount_cents','occurred_at',saved->'occurred_at','provider_action',false);
  if not replayed then
   update public.gc_assistant_requests set confirmed_at=now(),result=saved where id=r.id;
   insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'confirmed',p_actor,jsonb_build_object('after',saved,'risk_class',4));
  end if;
  return jsonb_build_object('verified',true,'replayed',replayed,'result',saved);
 exception when others then
  failure:=case when sqlerrm ~ '^ASSISTANT_[A-Z_]+$' then sqlerrm when sqlerrm in ('FINANCE_RECEIPTS_EXCEED_SALE','FINANCE_INVALID_REFUND') then 'ASSISTANT_FINANCE_AMOUNT_EXCEEDS_REMAINING' when sqlerrm in ('FINANCE_DEPOSIT_UNVERIFIED','FINANCE_TEST_PAYMENT') then 'ASSISTANT_FINANCE_PAYMENT_UNVERIFIED' else 'ASSISTANT_ACTION_FAILED' end;
  if not replayed then update public.gc_assistant_requests set failure_code=failure where id=r.id;end if;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function public.read_gc_finance_records(uuid,uuid,timestamptz,timestamptz),public.preview_gc_finance_record(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_finance_records(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_gc_finance_records(uuid,uuid,timestamptz,timestamptz),public.preview_gc_finance_record(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_finance_records(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923115408"'::jsonb,draft_value='"20260923115408"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
