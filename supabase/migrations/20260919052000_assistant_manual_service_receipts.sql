--177: reviewed recording of an already received own-business service payment.
-- Reuses the canonical operating books and request-id idempotency; no provider charge.
begin;
alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check(tool in ('get_manual_sale_options','prepare_manual_service_sale','get_client_record','get_business_media','search_platform_knowledge','get_business_summary','get_bookings','get_availability','get_business_profile','get_services_and_prices','get_business_policies','get_customers','get_professionals','get_products','get_booking_messages','get_reviews','get_promotions','get_plan_status','get_profile_completion','get_earnings_summary','get_upcoming_appointments','get_calendar_gaps','prepare_manual_appointment','prepare_manual_reschedule','prepare_manual_cancellation','prepare_business_hours','prepare_service_edit','prepare_professional_draft','prepare_product_draft','prepare_promotion_draft','prepare_booking_note','prepare_business_profile_update','prepare_availability_block','prepare_service','prepare_customer_message','prepare_business_policy_update'));
alter table public.gc_assistant_requests drop constraint gc_assistant_requests_permission_check;
alter table public.gc_assistant_requests add constraint gc_assistant_requests_permission_check check(permission in ('finance_log','finance_manage','client_history','overview','bookings','availability','my_page','photos','styles','stylists','products','reviews','promotions','earnings'));
-- Keep all established actions unchanged behind the existing service-only entry.
alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_manual_sale;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;s public.salons%rowtype;v_service public.styles%rowtype;v_prof public.stylists%rowtype;
 v_at timestamptz;v_at_text text;v_finance jsonb;v_expected jsonb;v_write jsonb;v_sale public.business_finance_sales%rowtype;v_receipt public.business_finance_receipts%rowtype;v_saved jsonb;v_failure text;v_replayed boolean;
begin
 -- Existing lock order also serializes canonical finance recording and revocation.
 select * into s from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_manual_service_sale' then return public.confirm_gc_assistant_request_before_manual_sale(p_request,p_salon,p_actor,p_digest);end if;
 if r.permission not in ('finance_log','finance_manage') or r.risk_class<>4 or not public.p0_actor_has_permission(p_salon,p_actor,r.permission)
  or not public.p0_actor_can_manage_professional(p_salon,p_actor,(r.arguments->>'stylist_id')::uuid) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is null and (r.failure_code is not null or r.expires_at<=now()) then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 v_replayed:=r.confirmed_at is not null;
 begin
  if not v_replayed then
   if (select count(*) from jsonb_object_keys(r.arguments))<>9 or r.arguments - array['service_id','stylist_id','amount_cents','method','source','date','time','client_name','payment_received']<>'{}'::jsonb
    or r.arguments->'payment_received' is distinct from 'true'::jsonb
    or jsonb_typeof(r.arguments->'amount_cents') is distinct from 'number'
    or exists(select 1 from jsonb_each(r.arguments) where key in ('service_id','stylist_id','method','source','date','time') and jsonb_typeof(value)<>'string')
    or jsonb_typeof(r.arguments->'client_name') not in ('null','string')
    or r.arguments->>'amount_cents' !~ '^[1-9][0-9]*$' or (r.arguments->>'amount_cents')::bigint>100000000
    or r.arguments->>'method' not in ('cash','card','transfer','other') or r.arguments->>'source' not in ('walk_in','phone','social','other')
    or r.arguments->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or r.arguments->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(length(r.arguments->>'client_name'),0)>120 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   select * into v_service from public.styles where id=(r.arguments->>'service_id')::uuid and salon_id=p_salon and archived_at is null and not is_draft for share;
   if not found then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   select * into v_prof from public.stylists where id=(r.arguments->>'stylist_id')::uuid and salon_id=p_salon and archived_at is null for share;
   if not found then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   v_at:=((r.arguments->>'date')||' '||(r.arguments->>'time'))::timestamp at time zone coalesce(nullif(s.time_zone,''),'America/New_York');
   if not isfinite(v_at) or v_at>now()+interval '5 minutes' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   v_at_text:=to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
   v_finance:=jsonb_build_object('occurred_at',v_at_text,'source',r.arguments->>'source','kind','service','name',v_service.name,'product_id',null,'stylist_id',v_prof.id,'client_name',nullif(trim(r.arguments->>'client_name'),''),'list_cents',(r.arguments->>'amount_cents')::bigint,'discount_cents',0,'cost_cents',null,'quantity',1,'method',r.arguments->>'method');
   v_expected:=jsonb_build_object('service_name',v_service.name,'professional_name',v_prof.name,'amount_cents',(r.arguments->>'amount_cents')::bigint,'method',r.arguments->>'method','source',r.arguments->>'source','client_name',nullif(trim(r.arguments->>'client_name'),''),'occurred_at',v_at_text,'time_zone',coalesce(nullif(s.time_zone,''),'America/New_York'),'finance_payload',v_finance);
   if r.before_summary<>'{}'::jsonb or r.execution_payload is distinct from v_expected then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   v_write:=public.record_business_finance(p_salon,p_actor,r.id,'sale',v_finance);
   if v_write->>'verified'<>'true' then raise exception 'ASSISTANT_ACTION_FAILED';end if;
  else
   v_write:=jsonb_build_object('id',r.result->>'sale_id');
  end if;
  -- Read the actual durable sale and receipt on first confirmation AND retries.
  select * into v_sale from public.business_finance_sales where id=(v_write->>'id')::uuid and salon_id=p_salon and created_by=p_actor and kind='service' and status='completed';
  if not found or v_sale.stylist_id is distinct from (r.arguments->>'stylist_id')::uuid or v_sale.agreed_cents<>(r.arguments->>'amount_cents')::bigint then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  select * into v_receipt from public.business_finance_receipts where salon_id=p_salon and sale_id=v_sale.id and created_by=p_actor and stage='full' and amount_cents=v_sale.agreed_cents and method=r.arguments->>'method';
  if not found then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  v_saved:=jsonb_build_object('sale_id',v_sale.id,'receipt_id',v_receipt.id,'service_name',v_sale.name,'professional_name',r.execution_payload->>'professional_name','amount_cents',v_sale.agreed_cents,'method',v_receipt.method,'occurred_at',v_sale.occurred_at,'source',v_sale.source,'provider_charge',false);
  if not v_replayed then
   update public.gc_assistant_requests set confirmed_at=now(),result=v_saved where id=r.id;
   insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'confirmed',p_actor,jsonb_build_object('after',v_saved,'risk_class',4));
  end if;
  return jsonb_build_object('verified',true,'replayed',v_replayed,'result',v_saved);
 exception when others then
  v_failure:=case when sqlerrm in ('ASSISTANT_PREVIEW_STALE','ASSISTANT_ACCESS_DENIED','ASSISTANT_INVALID_INPUT','ASSISTANT_READBACK_FAILED') then sqlerrm else 'ASSISTANT_ACTION_FAILED' end;
  if not v_replayed then update public.gc_assistant_requests set failure_code=v_failure where id=r.id;end if;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'failed',p_actor,jsonb_build_object('code',v_failure));
  return jsonb_build_object('verified',false,'code',v_failure);
 end;
end $$;
revoke all on function public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_manual_sale(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_manual_sale(uuid,uuid,uuid,text) to service_role;
grant select on public.salons,public.platform_identities,public.salon_team_members,public.subscriptions,public.styles,public.stylists,public.business_finance_sales,public.business_finance_receipts to service_role;
grant update(id) on public.salons,public.salon_team_members,public.subscriptions,public.styles,public.stylists to service_role;
grant update(user_id) on public.platform_identities to service_role;
update public.engine_settings set published_value='"20260919052000"'::jsonb,draft_value='"20260919052000"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
