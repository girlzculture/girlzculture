-- Local disposable database only. All sample settings and notifications roll back.
begin;
create temporary table growth_assertions(label text);
create function pg_temp.growth_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Growth assertion: %',label;end if;insert into growth_assertions values(label);end $$;
create function pg_temp.growth_reject(command text,expected text) returns void language plpgsql as $$
declare blocked boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then blocked:=true;else raise;end if;end;perform pg_temp.growth_assert(blocked,expected);end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();service_a uuid:=gen_random_uuid();service_b uuid:=gen_random_uuid();
 professional uuid:=gen_random_uuid();booking uuid:=gen_random_uuid();j jsonb;plan text;settings jsonb;rev integer:=0;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(owner_a,'growth-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'growth-b@example.test','',now(),'{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier) values
 (a,owner_a,'Growth A','growth-fixture-a','growth-a@example.test','Active','active','Starter'),(b,owner_b,'Growth B','growth-fixture-b','growth-b@example.test','Active','active','Premium');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,is_draft)
 select x.id,x.salon_id,g.id,'Stored service',1,1,100,false from(values(service_a,a),(service_b,b))x(id,salon_id) cross join lateral(select id from public.service_groups where is_active and archived_at is null limit 1)g;
 insert into public.stylists(id,salon_id,name,is_active,is_draft)values(professional,a,'Stored professional',true,false);
 update public.engine_settings set published_value='[24,2]'::jsonb where setting_key='notifications.booking_reminder_hours';
 perform set_config('request.jwt.claim.role','service_role',true);
 insert into public.business_verification_locations(salon_id,address_street,address_city,address_state,address_zip,visit_status,visited_at,verified_by,visit_evidence) values(a,'1 Fixture Road','Fixture','NY','10001','verified',now()-interval '1 day',owner_a,'Disposable test visit only, not a genuine verification.');
 settings:='{"reminder_hours":null,"waitlist_service_ids":[],"waitlist_professional_ids":[]}'::jsonb;
 foreach plan in array array['Solo','Starter','Solo Pro','Growth','Premium'] loop
  update public.salons set subscription_tier=plan where id=a;
  j:=public.read_business_growth_settings(a,owner_a);
  perform pg_temp.growth_assert((j->>'reminder_limit')::integer=case when plan='Premium' then 6 when plan in ('Solo Pro','Growth') then 2 else 0 end,plan||' reminder entitlement');
  perform pg_temp.growth_assert(j->>'waitlist_mode'=case when plan='Premium' then 'targeted' when plan in ('Solo Pro','Growth') then 'automated' else 'manual' end,plan||' waitlist entitlement');
  if plan in ('Solo','Starter') then
   perform pg_temp.growth_reject(format('select public.save_business_growth_settings(%L,%L,%s,%L)',a,owner_a,rev,settings||'{"reminder_hours":[48]}'::jsonb),'GROWTH_PLAN_REQUIRED');
  else
   j:=public.save_business_growth_settings(a,owner_a,rev,settings||'{"reminder_hours":[48,3]}'::jsonb);rev:=rev+1;
   perform pg_temp.growth_assert(public.business_reminder_hours(a)=array[48,3] and (j->>'revision')::integer=rev,plan||' persisted hours/readback');
  end if;
  if plan<>'Premium' then
   perform pg_temp.growth_reject(format('select public.save_business_growth_settings(%L,%L,%s,%L)',a,owner_a,rev,settings||jsonb_build_object('waitlist_service_ids',array[service_a])),'GROWTH_PLAN_REQUIRED');
  end if;
 end loop;
 perform pg_temp.growth_reject(format('select public.read_business_growth_settings(%L,%L)',a,owner_b),'GROWTH_ACCESS_DENIED');
 perform pg_temp.growth_reject(format('select public.save_business_growth_settings(%L,%L,%s,%L)',a,owner_a,rev-1,settings),'GROWTH_STALE');
 perform pg_temp.growth_reject(format('select public.save_business_growth_settings(%L,%L,%s,%L)',a,owner_a,rev,settings||'{"salon_id":"spoof"}'),'GROWTH_INVALID');
 perform pg_temp.growth_reject(format('select public.save_business_growth_settings(%L,%L,%s,%L)',a,owner_a,rev,settings||'{"reminder_hours":[24,24]}'),'GROWTH_INVALID');
 perform pg_temp.growth_reject(format('select public.save_business_growth_settings(%L,%L,%s,%L)',a,owner_a,rev,settings||'{"reminder_hours":[0]}'),'GROWTH_INVALID');
 perform pg_temp.growth_reject(format('select public.save_business_growth_settings(%L,%L,%s,%L)',a,owner_a,rev,settings||jsonb_build_object('waitlist_service_ids',array[service_b])),'GROWTH_INVALID');
 j:=public.save_business_growth_settings(a,owner_a,rev,settings||jsonb_build_object('reminder_hours',array[72,48,24,12,3,1],'waitlist_service_ids',array[service_a],'waitlist_professional_ids',array[professional]));rev:=rev+1;
 perform pg_temp.growth_assert(j->'effective_reminder_hours'='[72,48,24,12,3,1]'::jsonb,'Premium six effective reminders');
 perform pg_temp.growth_assert(public.business_automated_waitlist_allowed(a,service_a,professional),'targeted match');
 perform pg_temp.growth_assert(not public.business_automated_waitlist_allowed(a,service_b,professional),'unselected service excluded');
 perform pg_temp.growth_assert(not public.business_automated_waitlist_allowed(a,service_a,null),'unselected professional excluded');
 update public.salons set subscription_tier='Growth' where id=a;
 perform pg_temp.growth_assert(public.business_reminder_hours(a)=array[72,48],'downgrade enforces two current reminders without deleting configuration');
 update public.salons set subscription_tier='Starter' where id=a;
 perform pg_temp.growth_assert(public.business_reminder_hours(a)=array[24,2],'downgrade restores platform default');
 perform pg_temp.growth_assert(not public.business_automated_waitlist_allowed(a,service_a,professional),'downgrade immediately blocks auto offers');
 insert into public.bookings(id,salon_id,style_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status)
 values(booking,a,service_a,now()+interval '48 hours',1,100,10,90,'Paid','Confirmed');
 perform pg_temp.growth_assert(not exists(select 1 from public.due_booking_reminders(48) where id=booking),'standard plan never queues custom hour');
 update public.salons set subscription_tier='Growth' where id=a;
 perform pg_temp.growth_assert(exists(select 1 from public.due_booking_reminders(48) where id=booking),'current custom schedule queues actual booking');
 perform pg_temp.growth_assert(48=any(public.booking_reminder_hours_in_use()),'scheduler enumerates saved custom hour');
 update public.salons set subscription_tier='Starter' where id=a;
 perform pg_temp.growth_assert(public.claim_scheduled_notification_delivery(booking,'booking_reminder_48h','customer','email','fixture@example.test','growth-downgrade',0) is null,'queued custom hour denied at final channel gate after downgrade');
 perform pg_temp.growth_assert(not has_table_privilege('authenticated','public.business_growth_settings','select,insert,update,delete'),'private settings no direct browser data access');
 perform pg_temp.growth_assert(not has_function_privilege('authenticated','public.save_business_growth_settings(uuid,uuid,integer,jsonb)','execute'),'no unscoped browser mutation');
 perform pg_temp.growth_assert(not has_function_privilege('service_role','gc_private.offer_appointment_waitlist_core(uuid,uuid,uuid,jsonb)','execute'),'old unguarded offer inaccessible to server role');
end $$;
do $$
declare owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();customer_a uuid:=gen_random_uuid();customer_b uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();
 request_a uuid:=gen_random_uuid();request_b uuid:=gen_random_uuid();source_id uuid:=gen_random_uuid();offer_a uuid;offer_b uuid;intent uuid;book uuid;
 at_time timestamptz:=date_trunc('hour',now()+interval '10 days');args jsonb;result jsonb;payload jsonb;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 (owner_a,'wait-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'wait-owner-b@example.test','',now(),'{"role":"salon_owner"}'),
 (customer_a,'wait-client-a@example.test','',now(),'{"role":"customer"}'),(customer_b,'wait-client-b@example.test','',now(),'{"role":"customer"}');
 insert into public.customers(id,name,email) values(customer_a,'Wait A','wait-client-a@example.test'),(customer_b,'Wait B','wait-client-b@example.test');
 insert into public.salons(id,user_id,name,slug,email,status,is_discoverable,accepting_bookings,subscription_status,subscription_tier) values
 (a,owner_a,'Wait A','wait-business-a','wait-owner-a@example.test','Active',true,true,'active','Premium'),(b,owner_b,'Wait B','wait-business-b','wait-owner-b@example.test','Active',true,true,'active','Premium');
 insert into public.subscriptions(salon_id,tier,status) values(a,'Premium','active'),(b,'Premium','active');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max,is_draft)
 select f.id,f.business,g.id,f.name,1,1,100,100,100,false from(values(sa,a,'Wait service A'),(sb,b,'Wait service B'))f(id,business,name) cross join lateral(select id from public.service_groups limit 1)g;
 insert into public.stylists(id,salon_id,name,is_active,is_draft) values(pa,a,'Wait stylist A',true,false),(pb,b,'Wait stylist B',true,false);
 insert into public.salon_applications(salon_id,user_id,business_name,owner_name,business_email,phone,street_address,city,state,zip_code,business_type,status,selected_plan,business_setup_type)
 values(a,owner_a,'Wait A','Wait owner','wait-owner-a@example.test','+13055550123','123 Fixture Street','Miami','FL','33101','Hair Salon','Approved','Premium','solo_professional');
 insert into public.salon_publication_overrides(salon_id,application_id,reason,overridden_gates,gate_snapshot,granted_by)
 select a,x.id,'Isolated local acceptance fixture only',(select jsonb_agg(key) from jsonb_each(public.salon_publication_diagnostic(a)->'checks')),public.salon_publication_diagnostic(a),owner_a from public.salon_applications x where salon_id=a;
 update public.salons set is_discoverable=true,accepting_bookings=true,status='Active',owner_unpublished_at=null where id=a;
 perform pg_temp.growth_assert(public.is_marketplace_visible(a),'real publication diagnostic fixture');
 perform set_config('request.jwt.claim.role','service_role',true);
 args:=jsonb_build_object('salon_id',a,'style_id',sa,'stylist_id',pa,'starts_after',at_time-interval '1 hour','starts_before',at_time+interval '1 hour','locale','es');
 result:=public.manage_appointment_waitlist(customer_a,'join',request_a,args);
 perform pg_temp.growth_assert(jsonb_array_length(result)=1 and result->0->>'status'='waiting','join and fresh persisted list');
 perform pg_temp.growth_assert(jsonb_array_length(public.manage_appointment_waitlist(customer_a,'join',request_a,args))=1,'join retry is idempotent');
 perform pg_temp.growth_reject(format('select public.manage_appointment_waitlist(%L,%L,%L,%L)',customer_b,'join',request_a,args),'WAITLIST_REQUEST_CONFLICT');
 perform pg_temp.growth_reject(format('select public.manage_appointment_waitlist(%L,%L,%L,%L)',customer_b,'join',gen_random_uuid(),args||jsonb_build_object('style_id',sb)),'WAITLIST_SERVICE_UNAVAILABLE');
 perform pg_temp.growth_reject(format('select public.manage_appointment_waitlist(%L,%L,%L,%L)',owner_a,'join',gen_random_uuid(),args),'WAITLIST_ACCESS_DENIED');
 perform pg_temp.growth_assert(jsonb_array_length(public.read_business_waitlist(a,owner_a))=1,'authorized owner sees own queue');
 perform pg_temp.growth_reject(format('select public.read_business_waitlist(%L,%L)',a,owner_b),'WAITLIST_ACCESS_DENIED');
 perform public.manage_appointment_waitlist(customer_b,'leave',request_a);
 perform pg_temp.growth_assert((select status='waiting' from public.appointment_waitlist where id=request_a),'foreign customer cannot cancel');
 perform public.manage_appointment_waitlist(customer_b,'join',request_b,args);
 insert into public.bookings(id,salon_id,style_id,stylist_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status)
 values(source_id,a,sa,pa,'Cancelled fixture',at_time,1,100,10,90,'Paid','Cancelled');

 update public.subscriptions set tier='Starter' where salon_id=a;
 result:=public.due_appointment_waitlist();
 perform pg_temp.growth_assert(jsonb_array_length(result)=0,'manual tier does not auto-offer');
 perform pg_temp.growth_assert(public.offer_appointment_waitlist(request_a,source_id,pa,'{}') is null,'direct automated final gate denies manual tier');
 result:=public.business_waitlist_openings(a,owner_a,request_a);
 perform pg_temp.growth_assert(jsonb_array_length(result)=1,'manual owner can review real cancellation');
 perform pg_temp.growth_assert((select count(*)=0 from public.appointment_waitlist_offers where request_id=request_a),'review is read only');
 perform pg_temp.growth_reject(format('select public.business_waitlist_openings(%L,%L,%L)',a,owner_b,request_a),'WAITLIST_ACCESS_DENIED');
 perform pg_temp.growth_reject(format('select public.offer_business_waitlist(%L,%L,%L,%L,%L,%L)',b,owner_b,request_a,source_id,pa,'{}'),'WAITLIST_ACCESS_DENIED');
 offer_a:=public.offer_business_waitlist(a,owner_a,request_a,source_id,pa,'{"title":"Reviewed fixture","body":"Opening offer only"}');
 perform pg_temp.growth_assert(offer_a is not null,'explicit reviewed manual offer saved');
 result:=public.business_waitlist_openings(a,owner_a,request_a);
 perform pg_temp.growth_assert(result->0->>'offer_id'=offer_a::text,'response loss recovers authoritative active offer id');
 perform pg_temp.growth_assert(public.offer_business_waitlist(a,owner_a,request_a,source_id,pa,'{}')=offer_a,'exact offer replay returns existing record');
 perform pg_temp.growth_assert((select count(*)=1 from public.appointment_waitlist_offers where request_id=request_a),'replay never duplicates');
 perform pg_temp.growth_assert((select count(*)=0 from public.booking_checkout_intents where salon_id=a),'manual offer never reserves or charges');
 update public.subscriptions set tier='Premium' where salon_id=a;
 result:=public.due_appointment_waitlist();
 perform pg_temp.growth_assert(jsonb_array_length(result)=1,'automatic tier offers remaining matching customer');
end $$;
select count(*) || ' growth/automation SQL assertions passed' from growth_assertions;
rollback;
