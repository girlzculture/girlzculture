begin;
set local lock_timeout='5s';
do $$declare d text;begin
 select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if d is null then raise exception 'ASSISTANT_TOOL_CONTRACT_MISSING';end if;
 alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
 execute 'alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check (tool=''get_appointment_waitlist'' or '||substr(d,7)||')';
end $$;
create function public.preview_gc_assistant_waitlist(p_salon uuid,p_actor uuid,p_args jsonb)returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c jsonb;w public.appointment_waitlist%rowtype;b public.bookings%rowtype;st public.styles%rowtype;professional uuid;candidate jsonb;label text;
begin
 if not public.p0_actor_has_permission(p_salon,p_actor,'bookings') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if jsonb_typeof(p_args) is distinct from 'object' or p_args-array['operation','record_id','changes_json']<>'{}' or not p_args?&array['operation','record_id','changes_json'] or p_args->>'operation'<>'waitlist_offer' or jsonb_typeof(p_args->'changes_json') is distinct from 'string' or octet_length(p_args->>'changes_json')>1000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 c:=(p_args->>'changes_json')::jsonb;
 if jsonb_typeof(c) is distinct from 'object' or c-array['source_booking_id','stylist_id']<>'{}' or not c?&array['source_booking_id','stylist_id'] then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 select * into w from public.appointment_waitlist where id=(p_args->>'record_id')::uuid and salon_id=p_salon;
 if not found or not public.p0_actor_can_manage_professional(p_salon,p_actor,w.stylist_id) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 professional:=(c->>'stylist_id')::uuid;
 select x into candidate from jsonb_array_elements(public.business_waitlist_openings(p_salon,p_actor,w.id))x where x->>'source_booking_id'=c->>'source_booking_id' and x->>'offer_id' is null;
 if candidate is null then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if not public.p0_actor_can_manage_professional(p_salon,p_actor,professional) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if candidate->>'stylist_id' is not null and (candidate->>'stylist_id')::uuid is distinct from professional then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if professional is not null then
  select name into label from public.stylists where id=professional and salon_id=p_salon and is_active and not coalesce(is_draft,false);
  if not found then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 end if;
 select * into b from public.bookings where id=(c->>'source_booking_id')::uuid and salon_id=p_salon;
 select * into st from public.styles where id=w.style_id and salon_id=p_salon;
 return jsonb_build_object('salon_id',p_salon,'before',jsonb_build_object('request',md5(to_jsonb(w)::text),'source',md5(to_jsonb(b)::text),'service',md5(to_jsonb(st)::text)),
  'payload',jsonb_build_object('operation','waitlist_offer','record_id',w.id,'source_booking_id',b.id,'stylist_id',professional,'professional_name',label,'service_name',st.name,'customer_name',(select name from public.customers where id=w.customer_id),'appointment_at',b.appointment_datetime,'time_zone',candidate->>'time_zone','notification_locale',w.locale,'booking_created',false,'payment_action',false,'notification_queued',true));
exception when invalid_text_representation then raise exception 'ASSISTANT_INVALID_INPUT';
 when others then if sqlerrm like 'WAITLIST_ACCESS%' then raise exception 'ASSISTANT_ACCESS_DENIED';else raise;end if;
end $$;
alter function public.preview_gc_business_operation(uuid,uuid,jsonb) rename to preview_gc_business_operation_before_waitlist;
create function public.preview_gc_business_operation(p_salon uuid,p_actor uuid,p_args jsonb)returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if p_args->>'operation'='waitlist_offer' then return public.preview_gc_assistant_waitlist(p_salon,p_actor,p_args);end if;
 return public.preview_gc_business_operation_before_waitlist(p_salon,p_actor,p_args);
end $$;
alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_waitlist;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text)returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;fresh jsonb;offer_id uuid;copy jsonb;v_result jsonb;failure text;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_booking_progress' or r.arguments->>'operation'<>'waitlist_offer' then return public.confirm_gc_assistant_request_before_waitlist(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 if not public.p0_actor_has_permission(p_salon,p_actor,'bookings') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if r.risk_class<>4 or r.permission<>'bookings' then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if not public.p0_actor_can_manage_professional(p_salon,p_actor,(r.execution_payload->>'stylist_id')::uuid) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.confirmed_at is not null then
  if not exists(select 1 from public.appointment_waitlist w where w.id=(r.arguments->>'record_id')::uuid and w.salon_id=p_salon and public.p0_actor_can_manage_professional(p_salon,p_actor,w.stylist_id)) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
  return jsonb_build_object('verified',true,'replayed',true,'result',r.result);
 end if;
 if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 begin
  perform 1 from public.appointment_waitlist where id=(r.arguments->>'record_id')::uuid and salon_id=p_salon for update;
  perform 1 from public.bookings where id=(r.execution_payload->>'source_booking_id')::uuid and salon_id=p_salon for update;
  fresh:=public.preview_gc_assistant_waitlist(p_salon,p_actor,r.arguments);
  if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload-'notification_copy' then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  copy:=r.execution_payload->'notification_copy';
  if jsonb_typeof(copy) is distinct from 'object' or copy-array['title','body']<>'{}' or jsonb_typeof(copy->'title') is distinct from 'string' or length(copy->>'title') not between 1 and 160 or jsonb_typeof(copy->'body') is distinct from 'string' or length(copy->>'body') not between 1 and 1000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  offer_id:=public.offer_business_waitlist(p_salon,p_actor,(r.arguments->>'record_id')::uuid,(r.execution_payload->>'source_booking_id')::uuid,(r.execution_payload->>'stylist_id')::uuid,copy);
  if not exists(select 1 from public.appointment_waitlist_offers o join public.appointment_waitlist w on w.id=o.request_id where o.id=offer_id and w.salon_id=p_salon and o.request_id=(r.arguments->>'record_id')::uuid and o.source_booking_id=(r.execution_payload->>'source_booking_id')::uuid) then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  v_result:=jsonb_build_object('operation','waitlist_offer','offer_id',offer_id,'appointment_at',r.execution_payload->'appointment_at','service_name',r.execution_payload->'service_name','customer_name',r.execution_payload->'customer_name','booking_created',false,'payment_action',false,'notification_queued',true);
  update public.gc_assistant_requests set confirmed_at=now(),result=v_result where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'confirmed',p_actor,jsonb_build_object('after',v_result,'risk_class',4));
  return jsonb_build_object('verified',true,'replayed',false,'result',v_result);
 exception when others then
  failure:=case when sqlerrm~'^ASSISTANT_[A-Z_]+$' then sqlerrm when sqlerrm like 'WAITLIST_%' then 'ASSISTANT_PREVIEW_STALE' else 'ASSISTANT_ACTION_FAILED' end;
  update public.gc_assistant_requests set failure_code=failure where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function public.preview_gc_assistant_waitlist(uuid,uuid,jsonb),public.preview_gc_business_operation(uuid,uuid,jsonb),public.preview_gc_business_operation_before_waitlist(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_waitlist(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.preview_gc_assistant_waitlist(uuid,uuid,jsonb),public.preview_gc_business_operation(uuid,uuid,jsonb),public.preview_gc_business_operation_before_waitlist(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_waitlist(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923212146"',draft_value='"20260923212146"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
