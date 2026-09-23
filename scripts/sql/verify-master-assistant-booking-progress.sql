-- Disposable fictional data; rollback all changes.
begin;
create temporary table progress_assertions(label text);grant select,insert on progress_assertions to service_role;
create function pg_temp.passert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assistant booking progress: %',label;end if;insert into progress_assertions values(label);end $$;
create function pg_temp.preject(command text,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then denied:=true;else raise;end if;end;perform pg_temp.passert(denied,expected);end $$;
create function pg_temp.pdraft(b uuid,a uuid,target uuid,op text,changes jsonb) returns jsonb language plpgsql as $$declare preview jsonb;args jsonb;begin
 args:=jsonb_build_object('operation',op,'record_id',target,'changes_json',changes::text);preview:=public.preview_gc_business_operation(b,a,args);
 return public.save_gc_assistant_request(jsonb_build_object('id',gen_random_uuid(),'salon_id',b,'requested_by',a,'locale','en','tool','prepare_booking_progress','arguments',args,'execution_payload',preview->'payload','before_summary',preview->'before','risk_class',4,'permission','bookings','digest',repeat('a',64)),'[]'::jsonb);
end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();pro uuid:=gen_random_uuid();pro2 uuid:=gen_random_uuid();ids uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];d jsonb;r jsonb;again jsonb;c jsonb;before jsonb;n integer;notifications bigint;action text;events bigint;manual uuid:=gen_random_uuid();late uuid:=gen_random_uuid();rev uuid;policy jsonb;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)values(oa,'progress-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'progress-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'progress-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier)values(a,oa,'Progress A','progress-a','progress-a@example.test','Active','active','Premium'),(b,ob,'Progress B','progress-b','progress-b@example.test','Active','active','Premium');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price) select sa,a,id,'Service A',1,1,100 from public.service_groups where is_active limit 1;
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price) select sb,b,id,'Private service B',1,1,999 from public.service_groups where is_active limit 1;
 insert into public.stylists(id,salon_id,name,is_draft,is_active)values(pro,a,'Assigned professional',false,true),(pro2,a,'Other professional',false,true);
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions,stylist_id)values(a,staff,'progress-staff@example.test','Limited','Staff','Active','{"bookings":true}',pro);
 perform set_config('request.jwt.claim.role','service_role',true);
 for n in 1..6 loop
  insert into public.bookings(id,salon_id,style_id,stylist_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,booking_origin)
   values(ids[n],case when n=6 then b else a end,case when n=6 then sb else sa end,case when n=6 then null else pro end,'Invented client','fictional@example.test',now()+(case when n=1 then interval '0 hours' when n in(2,5) then -n*interval '2 days' else n*interval '2 days' end),1,100,10,90,'Not paid','Confirmed','marketplace');
 end loop;

 policy:='{"cancellation_hours":24,"rescheduling_hours":24,"grace_minutes":15,"no_show":"contact_business","late_arrival":"contact_business","deposit_treatment":"platform_rules","balance_due":"after_service","satisfaction":"contact_business","preparation":"","guests":"ask_first","children":"ask_first","walk_ins":"ask_first","notes":"","refund_satisfaction":"case_by_case","refund_terms":"Contact us within seven days about amounts handled directly by our business."}';
 insert into public.business_policy_revisions(salon_id,policy,source_locale,created_by)values(a,policy,'en',oa)returning id into rev;
 perform public.publish_business_policy(a,oa,rev,null);
 insert into public.bookings(id,salon_id,style_id,stylist_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,booking_origin,cancelled_by,cancelled_at,cancellation_notice_minutes)
 values(late,a,sa,pro,'Fictional cancelled client','cancelled@example.test',now()-interval '2 days',1,100,10,90,'Not paid','Cancelled','marketplace','customer',now()-interval '49 hours',60);
 insert into public.bookings(id,salon_id,style_id,stylist_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,booking_origin,business_added_request_id,business_added_by,source,business_policy_acceptance_kind)
 values(manual,a,sa,pro2,'Invented manual client',now(),1,0,0,0,'Not collected by Girlz Culture','Confirmed','business_added',gen_random_uuid(),oa,'phone','business_added_not_accepted');
 select count(*) into notifications from public.notification_delivery_log;

 perform set_config('request.jwt.claim.role','service_role',true);
 c:='{"action":"check_in","reason_code":null,"reason_detail":null,"attested":true}';
 set local role service_role;
 perform pg_temp.preject(format('select pg_temp.pdraft(%L,%L,%L,%L,%L)',a,oa,ids[6],'booking_service',c),'ASSISTANT_RECORD_NOT_FOUND');
 perform pg_temp.preject(format('select pg_temp.pdraft(%L,%L,%L,%L,%L)',b,oa,ids[6],'booking_service',c),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.preject(format('select pg_temp.pdraft(%L,%L,%L,%L,%L)',a,oa,ids[1],'booking_service',c||'{"attested":false}'),'ASSISTANT_INVALID_INPUT');
 perform pg_temp.preject(format('select pg_temp.pdraft(%L,%L,%L,%L,%L)',a,oa,ids[1],'booking_service',c||'{"action":"admin_correct"}'),'ASSISTANT_INVALID_INPUT');
 perform pg_temp.preject(format('select pg_temp.pdraft(%L,%L,%L,%L,%L)',a,oa,ids[1],'booking_service',c||'{"action":"complete"}'),'ASSISTANT_BOOKING_NOT_READY');
 d:=pg_temp.pdraft(a,staff,ids[1],'booking_service',c);reset role;
 perform pg_temp.passert((select status='Confirmed' and checked_in_at is null from public.bookings where id=ids[1]),'preparation is read only');
 foreach action in array array['check_in','start','complete'] loop
  set local role service_role;
  d:=pg_temp.pdraft(a,staff,ids[1],'booking_service',c||jsonb_build_object('action',action));
  r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,staff,repeat('a',64));perform pg_temp.passert(r->'verified'='true','canonical lifecycle '||action||' '||r::text);
  again:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,staff,repeat('a',64));perform pg_temp.passert(again->'replayed'='true' and again->'result'=r->'result','exact replay '||action);
  reset role;
 end loop;
 perform pg_temp.passert((select status='Completed' and checked_in_at is not null and service_started_at is not null and service_completed_at is not null and estimated_total=100 and deposit_amount=10 and balance_due=90 and deposit_status='Not paid' from public.bookings where id=ids[1]),'lifecycle canonical readback preserves money');
 perform pg_temp.passert((select count(*)=3 from public.booking_audit_log log where log.booking_id=ids[1] and log.action in('checked_in','service_started','service_completed')),'replay never duplicates lifecycle audit');
 perform pg_temp.preject(format('select pg_temp.pdraft(%L,%L,%L,%L,%L)',a,oa,ids[3],'booking_service',c),'ASSISTANT_CHECK_IN_REASON_REQUIRED');
 perform pg_temp.preject(format('select pg_temp.pdraft(%L,%L,%L,%L,%L)',a,oa,ids[2],'booking_service',c),'ASSISTANT_CHECK_IN_REASON_REQUIRED');
 perform pg_temp.preject(format('select pg_temp.pdraft(%L,%L,%L,%L,%L)',a,oa,ids[3],'booking_service',c||'{"reason_code":"other"}'),'ASSISTANT_CHECK_IN_REASON_REQUIRED');
 d:=pg_temp.pdraft(a,oa,ids[3],'booking_service',c||'{"reason_code":"customer_arrived_early","reason_detail":"Owner verified arrival"}');
 perform pg_temp.passert(d#>>'{execution_payload,exception_kind}'='early','early review binds exact exception');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.passert(r->'verified'='true','attested early check-in');
 perform pg_temp.passert((select check_in_exception_kind='early' and check_in_attested and check_in_reason_code='customer_arrived_early' from public.bookings where id=ids[3]),'canonical attestation readback');
 d:=pg_temp.pdraft(a,oa,ids[5],'booking_service',c||'{"reason_code":"customer_arrived_late","reason_detail":"Owner verified late arrival"}');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.passert(r->'verified'='true','attested late check-in');
 c:='{"action":"confirm","kind":"no_show","reason":"Verified own missed appointment"}';
 perform pg_temp.preject(format('select pg_temp.pdraft(%L,%L,%L,%L,%L)',a,oa,ids[4],'booking_attendance',c),'ASSISTANT_BOOKING_NOT_READY');
 perform pg_temp.preject(format('select pg_temp.pdraft(%L,%L,%L,%L,%L)',a,oa,ids[1],'booking_attendance',c),'ASSISTANT_BOOKING_NOT_READY');
 d:=pg_temp.pdraft(a,oa,ids[2],'booking_attendance',c);
 perform pg_temp.passert(not exists(select 1 from public.business_booking_incidents where booking_id=ids[2]),'no incident until confirmation');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.passert(r->'verified'='true','no-show confirmation '||r::text);
 again:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.passert(again->'replayed'='true','incident replay');
 perform pg_temp.passert((select count(*)=1 from public.business_booking_incident_events where booking_id=ids[2]),'one durable incident event');
 perform pg_temp.passert((select status='No Show' and deposit_amount=10 and balance_due=90 from public.bookings where id=ids[2]),'no-show does not collect money');
 foreach action in array array['void','reinstate'] loop
  d:=pg_temp.pdraft(a,oa,ids[2],'booking_attendance',jsonb_build_object('action',action,'kind',null,'reason','Owner reviewed evidence'));
  r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.passert(r->'verified'='true','incident correction '||action);
 end loop;
 perform pg_temp.passert((select count(*)=3 from public.business_booking_incident_events where booking_id=ids[2]),'corrections preserve complete history');
 d:=pg_temp.pdraft(a,staff,ids[3],'booking_service','{"action":"start","reason_code":null,"reason_detail":null,"attested":true}');
 update public.bookings set stylist_id=pro2 where id=ids[3];
 perform pg_temp.preject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,staff,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 d:=pg_temp.pdraft(a,oa,ids[3],'booking_service','{"action":"start","reason_code":null,"reason_detail":null,"attested":true}');
 update public.bookings set guest_name='Concurrent edited name' where id=ids[3];
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.passert(r->>'code'='ASSISTANT_PREVIEW_STALE','concurrent edit fails before transition');
 d:=pg_temp.pdraft(a,staff,ids[5],'booking_service','{"action":"start","reason_code":null,"reason_detail":null,"attested":true}');
 update public.salon_team_members set permissions='{}' where salon_id=a and user_id=staff;
 perform pg_temp.preject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,staff,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.passert((select status='Confirmed' from public.bookings where id=ids[6]) and not exists(select 1 from public.business_booking_incidents where salon_id=b),'other business data and incidents unchanged');

 c:='{"action":"confirm","kind":"late_cancellation","reason":"Verified against original 24-hour cancellation policy"}';
 d:=pg_temp.pdraft(a,oa,late,'booking_attendance',c);
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.passert(r->'verified'='true','late cancellation with captured policy '||r::text);
 perform pg_temp.passert((select status='Cancelled' and estimated_total=100 and deposit_amount=10 and balance_due=90 from public.bookings where id=late),'attendance never changes original cancellation money');
 update public.business_booking_incidents set status='review_requested' where booking_id=late;
 d:=pg_temp.pdraft(a,oa,late,'booking_attendance','{"action":"void","kind":null,"reason":"Owner accepted correction request"}');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.passert(r->'verified'='true','customer review can be resolved by voiding');
 perform pg_temp.passert((select status='voided' from public.business_booking_incidents where booking_id=late),'customer correction readback');
 foreach action in array array['check_in','start','complete'] loop
  d:=pg_temp.pdraft(a,oa,manual,'booking_service',jsonb_build_object('action',action,'reason_code',null,'reason_detail',null,'attested',true));
  if action='check_in' then
   perform pg_temp.preject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,oa,repeat('b',64)),'ASSISTANT_PREVIEW_STALE');
   update public.gc_assistant_requests set expires_at=now()-interval '1 minute' where id=(d->>'id')::uuid;
   perform pg_temp.preject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,oa,repeat('a',64)),'ASSISTANT_PREVIEW_EXPIRED');
   d:=pg_temp.pdraft(a,oa,manual,'booking_service',jsonb_build_object('action',action,'reason_code',null,'reason_detail',null,'attested',true));
  end if;
  r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,oa,repeat('a',64));perform pg_temp.passert(r->'verified'='true','manual appointment '||action||' '||r::text);
 end loop;
 perform pg_temp.passert((select status='Completed' and estimated_total=0 and deposit_amount=0 and balance_due=0 and deposit_status='Not collected by Girlz Culture' from public.bookings where id=manual),'manual lifecycle never fabricates collected payment');
 perform pg_temp.passert((select count(*)=notifications from public.notification_delivery_log),'no customer notification');
 perform pg_temp.passert(not has_function_privilege('authenticated','public.preview_gc_booking_progress(uuid,uuid,jsonb)','EXECUTE') and not has_function_privilege('anon','public.confirm_gc_assistant_request(uuid,uuid,uuid,text)','EXECUTE'),'no browser bypass');
end $$;
select count(*) as passed_booking_progress_assertions from progress_assertions;
rollback;
