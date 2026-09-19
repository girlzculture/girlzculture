-- Synthetic local-only actual-role checks. All rows are rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.reschedule_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assistant proposal assertion: %',label;end if;end $$;
create function pg_temp.reschedule_reject(command text,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then denied:=true;else raise;end if;end;perform pg_temp.reschedule_assert(denied,expected);end $$;
create function pg_temp.proposal_draft(bid uuid,a uuid,new_time timestamptz) returns jsonb language plpgsql as $$
declare b public.bookings%rowtype;s public.salons%rowtype;se text;pr text;rid uuid:=gen_random_uuid();args jsonb;before_json jsonb;payload jsonb;
begin
 select * into b from public.bookings where id=bid;select * into s from public.salons where id=b.salon_id;
 select name into se from public.styles where id=b.style_id;select name into pr from public.stylists where id=b.stylist_id;
 args:=jsonb_build_object('booking_id',bid,'date',to_char(new_time at time zone s.time_zone,'YYYY-MM-DD'),'time',to_char(new_time at time zone s.time_zone,'HH24:MI'),'reason','Customer requested later time','message','Please review this proposed time.');
 before_json:=jsonb_build_object('booking_id',b.id,'public_reference',b.public_reference,'customer_name',b.guest_name,'appointment_datetime',to_char(b.appointment_datetime at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'duration_hours',b.duration_hours,'buffer_minutes',coalesce(b.buffer_minutes,15),'stylist_id',b.stylist_id,'style_id',b.style_id,'status',b.status,'service_started_at',b.service_started_at,'estimated_total',b.estimated_total,'deposit_amount',b.deposit_amount,'deposit_status',b.deposit_status,'deposit_rule_snapshot',b.deposit_rule_snapshot);
 payload:=jsonb_build_object('customer_name',b.guest_name,'public_reference',b.public_reference,'service_name',se,'professional_name',pr,'previous_appointment_datetime',before_json->'appointment_datetime','appointment_datetime',to_char(new_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'duration_hours',b.duration_hours,'buffer_minutes',coalesce(b.buffer_minutes,15),'stylist_id',b.stylist_id,'estimated_total',b.estimated_total,'deposit_amount',b.deposit_amount,'time_zone',s.time_zone,'reason',args->>'reason','message',args->>'message','expiry_hours',72);
 return public.save_gc_assistant_request(jsonb_build_object('id',rid,'salon_id',b.salon_id,'requested_by',a,'locale','en','tool','prepare_booking_reschedule_proposal','arguments',args,'execution_payload',payload,'risk_class',4,'permission','bookings','digest',repeat('a',64),'before_summary',before_json),'["CUSTOMER_ACCEPTANCE_REQUIRED"]'::jsonb);
end $$;
do $$
declare oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();a uuid:=gen_random_uuid();bb uuid:=gen_random_uuid();se uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();bid uuid:=gen_random_uuid();block_id uuid:=gen_random_uuid();
 at_time timestamptz:=(date_trunc('day',now() at time zone 'UTC')+interval '3 days 10 hours') at time zone 'UTC';new_time timestamptz:=(date_trunc('day',now() at time zone 'UTC')+interval '3 days 15 hours') at time zone 'UTC';hours jsonb;original jsonb;draft jsonb;reply jsonb;again jsonb;proposal uuid;option_id uuid;n bigint;
begin
 select jsonb_object_agg(d,'{"open":"08:00","close":"20:00","closed":false}'::jsonb) into hours from unnest(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])d;
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(oa,'assistant-proposal-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'assistant-proposal-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'assistant-proposal-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,time_zone,hours) values(a,oa,'Proposal A','assistant-proposal-a','assistant-proposal-a@example.test','Active','active','Premium','UTC',hours),(bb,ob,'Proposal B','assistant-proposal-b','assistant-proposal-b@example.test','Active','active','Premium','UTC',hours);
 insert into public.subscriptions(salon_id,tier,status) values(a,'Premium','active'),(bb,'Premium','active');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,is_draft) select se,a,id,'Silk Press',1,1,120,false from public.service_groups where is_active and archived_at is null limit 1;
 insert into public.stylists(id,salon_id,name,is_active,is_draft,availability) values(pa,a,'Aisha',true,false,hours),(pb,a,'Other professional',true,false,hours);
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions,stylist_id) values(a,staff,'assistant-proposal-staff@example.test','Staff','Stylist','Active','{"bookings":true}',pa);
 insert into public.bookings(id,salon_id,style_id,stylist_id,appointment_datetime,duration_hours,buffer_minutes,estimated_total,deposit_amount,balance_due,deposit_status,status,guest_name) values(bid,a,se,pa,at_time,1,15,120,12,108,'Paid','Confirmed','Sarah');
 select to_jsonb(b) into original from public.bookings b where id=bid;
 perform set_config('request.jwt.claim.role','service_role',true);set local role service_role;
 draft:=pg_temp.proposal_draft(bid,oa,new_time);
 perform pg_temp.reschedule_assert(not exists(select 1 from public.booking_reschedule_proposals where booking_id=bid) and not exists(select 1 from public.booking_guest_access_tokens where booking_id=bid),'prepare creates no proposal or token');
 perform pg_temp.reschedule_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',bb,ob,repeat('a',64)),'ASSISTANT_REQUEST_NOT_FOUND');
 perform pg_temp.reschedule_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',a,oa,repeat('b',64)),'ASSISTANT_PREVIEW_STALE');
 reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.reschedule_assert(reply->>'verified'='true','confirmed proposal: '||reply::text);proposal:=(reply->'result'->>'proposal_id')::uuid;
 perform pg_temp.reschedule_assert(reply->'result'->>'status'='Pending' and reply->'result'->>'assistant_changed_booking'='false','truthful pending result');
 perform pg_temp.reschedule_assert((select to_jsonb(b)=original from public.bookings b where id=bid),'all booked terms unchanged');
 again:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.reschedule_assert(again->>'replayed'='true' and again->'result'=reply->'result','fresh durable idempotent replay');
 perform pg_temp.reschedule_assert((select count(*)=1 from public.booking_reschedule_proposals where booking_id=bid) and (select count(*)=1 from public.gc_assistant_audit where request_id=(draft->>'id')::uuid and event='confirmed'),'one canonical proposal and audit');
 perform pg_temp.reschedule_assert(not exists(select 1 from public.booking_guest_access_tokens where booking_id=bid),'confirmation SQL issues no token or send');
 -- Fresh authoritative conflict and scope changes are checked before creating anything else.
 draft:=pg_temp.proposal_draft(bid,oa,new_time+interval '1 day');reset role;
 insert into public.salon_blockouts(id,salon_id,stylist_id,starts_at,ends_at,reason) values(block_id,a,pa,new_time+interval '1 day',new_time+interval '1 day 2 hours','Conflict fixture');set local role service_role;
 reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.reschedule_assert(reply->>'code'='ASSISTANT_AVAILABILITY_CONFLICT','new conflict refuses confirmation');
 draft:=pg_temp.proposal_draft(bid,staff,new_time);reset role;update public.salon_team_members set stylist_id=pb where user_id=staff;set local role service_role;
 perform pg_temp.reschedule_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',a,staff,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 reset role;update public.salon_team_members set stylist_id=pa where user_id=staff;set local role service_role;draft:=pg_temp.proposal_draft(bid,staff,new_time);reset role;update public.salon_team_members set permissions='{}' where user_id=staff;set local role service_role;
 perform pg_temp.reschedule_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',draft->>'id',a,staff,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 draft:=pg_temp.proposal_draft(bid,oa,new_time);update public.gc_assistant_requests set execution_payload=jsonb_set(execution_payload,'{deposit_amount}','0') where id=(draft->>'id')::uuid;
 reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.reschedule_assert(reply->>'code'='ASSISTANT_PREVIEW_STALE','tampered payment terms fail');
 perform pg_temp.reschedule_assert((select count(*)=1 from public.booking_reschedule_proposals where booking_id=bid),'failed proposals atomic, existing proposal preserved');
 select id into option_id from public.booking_reschedule_options where proposal_id=proposal;
 -- Only the established customer response function moves the appointment.
 perform public.respond_booking_reschedule(proposal,option_id,'accept');
 perform pg_temp.reschedule_assert((select appointment_datetime=new_time and estimated_total=120 and deposit_amount=12 and duration_hours=1 and stylist_id=pa from public.bookings where id=bid),'customer acceptance moves time only');
 select to_jsonb(r) into draft from public.gc_assistant_requests r where r.result->>'proposal_id'=proposal::text;
 again:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.reschedule_assert(again->'result'->>'status'='Accepted','replay reports fresh accepted state');

 -- Declining a second proposal leaves the accepted appointment and terms intact.
 draft:=pg_temp.proposal_draft(bid,oa,new_time+interval '2 days');reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));
 perform pg_temp.reschedule_assert(reply->>'verified'='true','second independent proposal');
 perform public.respond_booking_reschedule((reply->'result'->>'proposal_id')::uuid,null,'decline');
 again:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.reschedule_assert(again->'result'->>'status'='Declined' and (select appointment_datetime=new_time from public.bookings where id=bid),'declined replay and unchanged appointment');
 draft:=pg_temp.proposal_draft(bid,oa,new_time+interval '3 days');reply:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));
 reset role;update public.booking_reschedule_proposals set expires_at=now()-interval '1 minute' where id=(reply->'result'->>'proposal_id')::uuid;set local role service_role;
 again:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.reschedule_assert(again->'result'->>'status'='Expired','expired pending offer is not falsely awaiting acceptance');
 select to_jsonb(r) into draft from public.gc_assistant_requests r where r.result->>'proposal_id'=proposal::text;
 reset role;delete from public.booking_reschedule_options where id=option_id;set local role service_role;
 again:=public.confirm_gc_assistant_request((draft->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.reschedule_assert(again->>'code'='ASSISTANT_READBACK_FAILED','missing durable option cannot replay success');
 reset role;
 perform pg_temp.reschedule_assert(not has_function_privilege('authenticated','public.confirm_gc_assistant_request(uuid,uuid,uuid,text)','execute') and not has_function_privilege('anon','public.confirm_gc_assistant_request(uuid,uuid,uuid,text)','execute'),'backend-only confirmation');
end $$;
rollback;
