--180: assistant confirmation creates a canonical customer-approved proposal, never moves the booking.
begin;
alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check(tool in ('prepare_booking_reschedule_proposal','get_outstanding_balances','get_manual_sale_options','prepare_manual_service_sale','get_client_record','get_business_media','search_platform_knowledge','get_business_summary','get_bookings','get_availability','get_business_profile','get_services_and_prices','get_business_policies','get_customers','get_professionals','get_products','get_booking_messages','get_reviews','get_promotions','get_plan_status','get_profile_completion','get_earnings_summary','get_upcoming_appointments','get_calendar_gaps','prepare_manual_appointment','prepare_manual_reschedule','prepare_manual_cancellation','prepare_business_hours','prepare_service_edit','prepare_professional_draft','prepare_product_draft','prepare_promotion_draft','prepare_booking_note','prepare_business_profile_update','prepare_availability_block','prepare_service','prepare_customer_message','prepare_business_policy_update'));
alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_booking_proposal;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;s public.salons%rowtype;b public.bookings%rowtype;st public.styles%rowtype;pr public.stylists%rowtype;
 p public.booking_reschedule_proposals%rowtype;o public.booking_reschedule_options%rowtype;before_json jsonb;expected jsonb;options jsonb;saved jsonb;
 v_proposal_id uuid;at_time timestamptz;end_time timestamptz;local_start timestamp;local_end timestamp;day_name text;h jsonb;ph jsonb;expiry_hours numeric:=72;configured text;replayed boolean;failure text;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_booking_reschedule_proposal' then return public.confirm_gc_assistant_request_before_booking_proposal(p_request,p_salon,p_actor,p_digest);end if;
 select * into s from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 perform pg_advisory_xact_lock(hashtextextended('p0-calendar:'||p_salon::text,0));
 select * into b from public.bookings where id=(r.arguments->>'booking_id')::uuid and salon_id=p_salon for update;
 if not found or not public.p0_actor_has_permission(p_salon,p_actor,'bookings') or not public.p0_actor_can_manage_professional(p_salon,p_actor,b.stylist_id) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if r.permission<>'bookings' or r.risk_class<>4 then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is null and (r.failure_code is not null or r.expires_at<=now()) then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 replayed:=r.confirmed_at is not null;
 begin
  if not replayed then
   if (select count(*) from jsonb_object_keys(r.arguments))<>5 or r.arguments-array['booking_id','date','time','reason','message']<>'{}'::jsonb
    or exists(select 1 from jsonb_each(r.arguments) where jsonb_typeof(value)<>'string')
    or length(trim(r.arguments->>'reason')) not between 1 and 300 or length(r.arguments->>'message')>600
    or r.arguments->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or r.arguments->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   if b.booking_origin<>'marketplace' or lower(b.status) not in ('confirmed','pending') or b.appointment_datetime<=now() or b.service_started_at is not null then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   select * into st from public.styles where id=b.style_id and salon_id=p_salon for share;
   if not found then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   if b.stylist_id is not null then
    select * into pr from public.stylists where id=b.stylist_id and salon_id=p_salon and is_active is true and is_draft is not true and archived_at is null for share;
    if not found or (pr.assigned_service_ids is not null and not b.style_id=any(pr.assigned_service_ids)) then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   elsif exists(select 1 from public.stylists where salon_id=p_salon and is_active and archived_at is null) then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   before_json:=jsonb_build_object('booking_id',b.id,'public_reference',b.public_reference,'customer_name',b.guest_name,'appointment_datetime',to_char(b.appointment_datetime at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'duration_hours',b.duration_hours,'buffer_minutes',coalesce(b.buffer_minutes,15),'stylist_id',b.stylist_id,'style_id',b.style_id,'status',b.status,'service_started_at',b.service_started_at,'estimated_total',b.estimated_total,'deposit_amount',b.deposit_amount,'deposit_status',b.deposit_status,'deposit_rule_snapshot',b.deposit_rule_snapshot);
   at_time:=((r.arguments->>'date')||' '||(r.arguments->>'time'))::timestamp at time zone coalesce(nullif(s.time_zone,''),'America/New_York');
   if not isfinite(at_time) or at_time<=now()+interval '30 minutes' or at_time=b.appointment_datetime then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   select published_value#>>'{}' into configured from public.engine_settings where setting_key='booking.reschedule_proposal_expiry_hours' and status='Published';
   if configured ~ '^[0-9]+(\.[0-9]+)?$' and configured::numeric between 1 and 336 then expiry_hours:=configured::numeric;end if;
   expected:=jsonb_build_object('customer_name',b.guest_name,'public_reference',b.public_reference,'service_name',st.name,'professional_name',pr.name,'previous_appointment_datetime',before_json->'appointment_datetime','appointment_datetime',to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'duration_hours',b.duration_hours,'buffer_minutes',coalesce(b.buffer_minutes,15),'stylist_id',b.stylist_id,'estimated_total',b.estimated_total,'deposit_amount',b.deposit_amount,'time_zone',coalesce(nullif(s.time_zone,''),'America/New_York'),'reason',regexp_replace(r.arguments->>'reason','^\s+|\s+$','','g'),'message',regexp_replace(r.arguments->>'message','^\s+|\s+$','','g'),'expiry_hours',expiry_hours);
   if r.before_summary is distinct from before_json or r.execution_payload is distinct from expected then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   -- Recheck the same hours and occupancy constraints under the calendar lock.
   -- Creating an offer reserves no time; customer acceptance still rechecks independently.
   end_time:=at_time+make_interval(secs=>(b.duration_hours*3600+coalesce(b.buffer_minutes,15)*60)::double precision);
   local_start:=at_time at time zone s.time_zone;local_end:=end_time at time zone s.time_zone;
   day_name:=(array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from local_start)::integer+1];
   h:=public.p0_hours_window(s.hours->day_name);
   if h is null or local_start::date<>local_end::date or local_start::time<(h->>'open')::time or local_end::time>(h->>'close')::time or (s.is_closed_override and s.closed_override_date=local_start::date) then raise exception 'ASSISTANT_AVAILABILITY_CONFLICT';end if;
   if b.stylist_id is not null then ph:=public.p0_hours_window(pr.availability->day_name);if ph is null or local_start::time<(ph->>'open')::time or local_end::time>(ph->>'close')::time then raise exception 'ASSISTANT_AVAILABILITY_CONFLICT';end if;end if;
   if exists(select 1 from public.bookings x where x.salon_id=p_salon and x.id<>b.id and x.is_active_booking and (b.stylist_id is null or x.stylist_id is null or x.stylist_id=b.stylist_id) and x.appointment_datetime<end_time and x.blocked_until>at_time)
    or exists(select 1 from public.booking_checkout_intents x where x.salon_id=p_salon and x.status='Pending' and x.expires_at>now() and (b.stylist_id is null or x.stylist_id is null or x.stylist_id=b.stylist_id) and x.appointment_datetime<end_time and x.blocked_until>at_time)
    or exists(select 1 from public.salon_blockouts x where x.salon_id=p_salon and x.released_at is null and (x.stylist_id is null or b.stylist_id is null or x.stylist_id=b.stylist_id) and x.starts_at<end_time and x.ends_at>at_time)
    then raise exception 'ASSISTANT_AVAILABILITY_CONFLICT';end if;
   options:=jsonb_build_array(jsonb_build_object('appointment_datetime',expected->'appointment_datetime','duration_hours',b.duration_hours,'stylist_id',b.stylist_id,'stylist_name',coalesce(pr.name,'Any available stylist')));
   v_proposal_id:=public.create_booking_reschedule_proposal(b.id,p_salon,p_actor,'Salon',expected->>'reason',nullif(expected->>'message',''),options,now()+make_interval(secs=>(expiry_hours*3600)::double precision),r.id);
  else v_proposal_id:=(r.result->>'proposal_id')::uuid;end if;
  select * into p from public.booking_reschedule_proposals where id=v_proposal_id and salon_id=p_salon and booking_id=b.id and proposed_by_user_id=p_actor and client_request_id=r.id;
  if not found then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  select * into o from public.booking_reschedule_options where proposal_id=p.id;
  if not found or (select count(*) from public.booking_reschedule_options x where x.proposal_id=p.id)<>1
   or o.appointment_datetime is distinct from (r.execution_payload->>'appointment_datetime')::timestamptz or o.stylist_id is distinct from (r.execution_payload->>'stylist_id')::uuid or o.duration_hours is distinct from (r.execution_payload->>'duration_hours')::numeric then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  if not replayed and (p.status<>'Pending' or (select appointment_datetime from public.bookings where id=b.id) is distinct from b.appointment_datetime) then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  saved:=jsonb_build_object('booking_id',b.id,'proposal_id',p.id,'status',case when p.status='Pending' and p.expires_at<=now() then 'Expired' else p.status end,'expires_at',p.expires_at,'appointment_datetime',o.appointment_datetime,'professional_name',r.execution_payload->>'professional_name','customer_acceptance_required',true,'assistant_changed_booking',false);
  if not replayed then
   update public.gc_assistant_requests set confirmed_at=now(),result=saved where id=r.id;
   insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'confirmed',p_actor,jsonb_build_object('after',saved,'risk_class',4));
  end if;
  return jsonb_build_object('verified',true,'replayed',replayed,'result',saved);
 exception when others then
  failure:=case when sqlerrm in ('ASSISTANT_PREVIEW_STALE','ASSISTANT_ACCESS_DENIED','ASSISTANT_INVALID_INPUT','ASSISTANT_AVAILABILITY_CONFLICT','ASSISTANT_READBACK_FAILED') then sqlerrm else 'ASSISTANT_ACTION_FAILED' end;
  if not replayed then update public.gc_assistant_requests set failure_code=failure where id=r.id;end if;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_booking_proposal(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_booking_proposal(uuid,uuid,uuid,text) to service_role;
grant select on public.bookings,public.styles,public.stylists,public.salons,public.engine_settings,public.platform_identities,public.salon_team_members,public.subscriptions,public.booking_reschedule_proposals,public.booking_reschedule_options,public.booking_checkout_intents,public.salon_blockouts to service_role;
grant update(id) on public.bookings,public.styles,public.stylists,public.salons,public.salon_team_members,public.subscriptions to service_role;
grant update(user_id) on public.platform_identities to service_role;
update public.engine_settings set published_value='"20260919084221"'::jsonb,draft_value='"20260919084221"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
