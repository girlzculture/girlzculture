-- Reviewed lifecycle and own-business attendance; no provider operations.
begin;
set local lock_timeout='5s';
do $$declare definition text;begin
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if definition is null then raise exception 'ASSISTANT_TOOL_CONTRACT_MISSING';end if;
 alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
 execute 'alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check (tool=''prepare_booking_progress'' or '||substr(definition,7)||')';
end $$;
create function public.preview_gc_booking_progress(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype;i public.business_booking_incidents%rowtype;c jsonb;op text;target uuid;action text;status_key text;next_status text;exception_kind text;offset_minutes integer;schema jsonb;
begin
 if not public.p0_actor_has_permission(p_salon,p_actor,'bookings') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if jsonb_typeof(p_args) is distinct from 'object' or not p_args?&array['operation','record_id','changes_json'] or p_args-array['operation','record_id','changes_json']<>'{}' or jsonb_typeof(p_args->'changes_json') is distinct from 'string' or octet_length(p_args->>'changes_json')>6000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 op:=p_args->>'operation';target:=(p_args->>'record_id')::uuid;c:=(p_args->>'changes_json')::jsonb;
 schema:='{"booking_service":{"type":"object","properties":{"action":{"type":"string","enum":["check_in","start","complete"]},"reason_code":{"type":["string","null"],"maxLength":80,"minLength":0},"reason_detail":{"type":["string","null"],"maxLength":500,"minLength":0},"attested":{"type":"boolean"}},"required":["action","reason_code","reason_detail","attested"],"additionalProperties":false},"booking_attendance":{"type":"object","properties":{"action":{"type":"string","enum":["confirm","void","reinstate"]},"kind":{"type":["string","null"],"enum":["no_show","late_cancellation",null]},"reason":{"type":"string","maxLength":1000,"minLength":1}},"required":["action","kind","reason"],"additionalProperties":false}}'::jsonb->op;
 if schema is null or target is null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 perform gc_private.assert_catalog_value(c,schema);
 action:=c->>'action';
 select * into b from public.bookings where id=target and salon_id=p_salon;
 if not found then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) and exists(select 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor and status='Active' and stylist_id is not null and stylist_id is distinct from b.stylist_id) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 status_key:=lower(coalesce(b.status,''));
 if op='booking_service' then
  if c->'attested' is distinct from 'true'::jsonb then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if action='check_in' then
   if status_key<>'confirmed' or b.checked_in_at is not null then raise exception 'ASSISTANT_BOOKING_NOT_READY';end if;
   offset_minutes:=floor(extract(epoch from(now()-b.appointment_datetime))/60)::integer;
   exception_kind:=case when offset_minutes < -30 then 'early' when offset_minutes>60 then 'late' end;
   if exception_kind='early' and not coalesce(c->>'reason_code'=any(array['customer_arrived_early','customer_requested_earlier_by_phone','customer_requested_earlier_by_message','salon_and_customer_agreed_earlier','customer_arrived_as_walk_in','appointment_changed_outside_platform','other']),false)
     or exception_kind='late' and not coalesce(c->>'reason_code'=any(array['customer_arrived_late','salon_running_behind','salon_and_customer_agreed_later','appointment_changed_outside_platform','service_completed_check_in_not_recorded','technical_problem','staff_forgot_check_in','other']),false)
     or c->>'reason_code'='other' and coalesce(length(trim(c->>'reason_detail')),0)=0 then raise exception 'ASSISTANT_CHECK_IN_REASON_REQUIRED';end if;
   next_status:='Ready';
  elsif action='start' then
   if status_key<>'ready' or b.checked_in_at is null or b.service_started_at is not null then raise exception 'ASSISTANT_BOOKING_NOT_READY';end if;
   next_status:='In Progress';
  else
   if status_key<>'in progress' or b.service_started_at is null or b.service_completed_at is not null then raise exception 'ASSISTANT_BOOKING_NOT_READY';end if;
   next_status:='Completed';
  end if;
  if action<>'check_in' and (c->'reason_code'<>'null' or c->'reason_detail'<>'null') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 else
  select * into i from public.business_booking_incidents where booking_id=b.id and salon_id=p_salon;
  if action='confirm' then
   if i.id is not null or c->>'kind' is null then raise exception 'ASSISTANT_BOOKING_NOT_READY';end if;
   if c->>'kind'='no_show' then
    if b.appointment_datetime+b.duration_hours*interval '1 hour'>now() or regexp_replace(status_key,'[ _-]','','g') not in('confirmed','arrivingsoon','noshow') or b.service_started_at is not null then raise exception 'ASSISTANT_BOOKING_NOT_READY';end if;
    next_status:='No Show';
   else
    if status_key not in('cancelled','canceled') or lower(coalesce(b.cancelled_by,b.cancellation_initiated_by,''))<>'customer' or b.cancelled_at is null or b.cancellation_notice_minutes is null or nullif(b.business_policy_snapshot->>'cancellation_hours','') is null or b.cancellation_notice_minutes>=(b.business_policy_snapshot->>'cancellation_hours')::numeric*60 then raise exception 'ASSISTANT_BOOKING_NOT_READY';end if;
    next_status:=b.status;
   end if;
  else
   if c->'kind'<>'null' or i.id is null or (action='void' and i.status not in('confirmed','review_requested')) or (action='reinstate' and i.status not in('voided','review_requested')) then raise exception 'ASSISTANT_BOOKING_NOT_READY';end if;
   if i.kind='no_show' then
    if action='reinstate' and (regexp_replace(status_key,'[ _-]','','g') not in('confirmed','arrivingsoon','noshow') or b.service_started_at is not null) then raise exception 'ASSISTANT_BOOKING_NOT_READY';end if;
    next_status:=case when action='reinstate' then 'No Show' when b.status='No Show' then case when regexp_replace(lower(coalesce(i.previous_booking_status,'')),'[ _-]','','g')='noshow' then 'Confirmed' else coalesce(i.previous_booking_status,'Confirmed') end else b.status end;
   else next_status:=b.status;end if;
  end if;
 end if;
 return jsonb_build_object('salon_id',p_salon,'before',jsonb_build_object('status',b.status,'fingerprint',md5(to_jsonb(b)::text||coalesce(to_jsonb(i)::text,''))),'payload',jsonb_build_object('operation',op,'record_id',b.id,'record_name',coalesce(b.public_reference,b.confirmation_code,b.id::text),'changes',c,'next_status',next_status,'exception_kind',exception_kind,'time_zone',(select time_zone from public.salons where id=p_salon),'scheduled_at',b.appointment_datetime,'provider_action',false,'notification_sent',false));
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'ASSISTANT_INVALID_INPUT';
end $$;
alter function public.preview_gc_business_operation(uuid,uuid,jsonb) rename to preview_gc_business_operation_before_booking_progress;
create function public.preview_gc_business_operation(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if p_args->>'operation' in('booking_service','booking_attendance') then return public.preview_gc_booking_progress(p_salon,p_actor,p_args);end if;
 return public.preview_gc_business_operation_before_booking_progress(p_salon,p_actor,p_args);
end $$;
alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_booking_progress;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;b public.bookings%rowtype;actual public.bookings%rowtype;fresh jsonb;c jsonb;receipt jsonb;incident jsonb;failure text;role_name text;key text;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_booking_progress' then return public.confirm_gc_assistant_request_before_booking_progress(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 if not public.p0_actor_has_permission(p_salon,p_actor,'bookings') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if r.risk_class<>4 or r.permission<>'bookings' then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 select * into b from public.bookings where id=(r.arguments->>'record_id')::uuid and salon_id=p_salon for update;
 if not found then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) and exists(select 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor and status='Active' and stylist_id is not null and stylist_id is distinct from b.stylist_id) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.confirmed_at is not null then return jsonb_build_object('verified',true,'replayed',true,'result',r.result);end if;
 if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 begin
  perform 1 from public.business_booking_incidents where salon_id=p_salon and booking_id=b.id for update;
  fresh:=public.preview_gc_booking_progress(p_salon,p_actor,r.arguments);
  if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  c:=r.execution_payload->'changes';role_name:=case when exists(select 1 from public.salons where id=p_salon and user_id=p_actor) then 'Business owner' else 'Business team' end;
  if r.arguments->>'operation'='booking_service' then
   perform public.transition_booking_service_v2(b.id,p_salon,p_actor,role_name,c->>'action',c->>'reason_code',c->>'reason_detail',(c->>'attested')::boolean,null,r.execution_payload->>'time_zone');
  else
   incident:=public.record_business_booking_incident(p_salon,p_actor,b.id,r.id,c->>'action',c->>'kind',c->>'reason');
   if incident->'verified' is distinct from 'true'::jsonb or incident->>'booking_id' is distinct from b.id::text or not exists(select 1 from public.business_booking_incidents i where i.id=(incident->>'id')::uuid and i.salon_id=p_salon and i.booking_id=b.id and i.status=incident->>'status') then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  end if;
  select * into actual from public.bookings where id=b.id and salon_id=p_salon;
  if not found or actual.status is distinct from r.execution_payload->>'next_status' then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  foreach key in array array['estimated_total','deposit_amount','balance_due','deposit_status','balance_status','appointment_datetime','duration_hours','stylist_id','style_id','customer_id','guest_email'] loop
   if to_jsonb(actual)->key is distinct from to_jsonb(b)->key then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  end loop;
  receipt:=jsonb_build_object('operation',r.arguments->'operation','record_id',b.id,'record_name',r.execution_payload->'record_name','status',actual.status,'checked_in_at',actual.checked_in_at,'service_started_at',actual.service_started_at,'service_completed_at',actual.service_completed_at,'incident',incident,'provider_action',false,'notification_sent',false);
  update public.gc_assistant_requests set confirmed_at=now(),result=receipt where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'confirmed',p_actor,jsonb_build_object('after',receipt,'risk_class',4));
  return jsonb_build_object('verified',true,'replayed',false,'result',receipt);
 exception when others then
  failure:=case when sqlerrm~'^ASSISTANT_[A-Z_]+$' then sqlerrm when sqlerrm~'CHECK_IN.*REQUIRED' then 'ASSISTANT_CHECK_IN_REASON_REQUIRED' when sqlerrm~'BOOKING_NOT_READY|INCIDENT_NOT_VERIFIED|INCIDENT_ALREADY_RECORDED' then 'ASSISTANT_BOOKING_NOT_READY' when sqlerrm~'CONFLICT|STALE' then 'ASSISTANT_PREVIEW_STALE' else 'ASSISTANT_ACTION_FAILED' end;
  update public.gc_assistant_requests set failure_code=failure where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function public.preview_gc_booking_progress(uuid,uuid,jsonb),public.preview_gc_business_operation(uuid,uuid,jsonb),public.preview_gc_business_operation_before_booking_progress(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_booking_progress(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.preview_gc_booking_progress(uuid,uuid,jsonb),public.preview_gc_business_operation(uuid,uuid,jsonb),public.preview_gc_business_operation_before_booking_progress(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_booking_progress(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923191632"',draft_value='"20260923191632"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
