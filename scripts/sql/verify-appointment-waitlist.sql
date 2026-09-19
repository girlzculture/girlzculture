-- Isolated local database only. Every fixture, override and reservation rolls back.
begin;
create function pg_temp.wait_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Waitlist assertion: %',label; end if;end $$;
create function pg_temp.wait_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.wait_assert(rejected,expected);end $$;
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
 perform pg_temp.wait_assert(public.is_marketplace_visible(a),'real publication diagnostic fixture');
 perform set_config('request.jwt.claim.role','service_role',true);
 args:=jsonb_build_object('salon_id',a,'style_id',sa,'stylist_id',pa,'starts_after',at_time-interval '1 hour','starts_before',at_time+interval '1 hour','locale','es');
 result:=public.manage_appointment_waitlist(customer_a,'join',request_a,args);
 perform pg_temp.wait_assert(jsonb_array_length(result)=1 and result->0->>'status'='waiting','join and fresh persisted list');
 perform pg_temp.wait_assert(jsonb_array_length(public.manage_appointment_waitlist(customer_a,'join',request_a,args))=1,'join retry is idempotent');
 perform pg_temp.wait_reject(format('select public.manage_appointment_waitlist(%L,%L,%L,%L)',customer_b,'join',request_a,args),'WAITLIST_REQUEST_CONFLICT');
 perform pg_temp.wait_reject(format('select public.manage_appointment_waitlist(%L,%L,%L,%L)',customer_b,'join',gen_random_uuid(),args||jsonb_build_object('style_id',sb)),'WAITLIST_SERVICE_UNAVAILABLE');
 perform pg_temp.wait_reject(format('select public.manage_appointment_waitlist(%L,%L,%L,%L)',owner_a,'join',gen_random_uuid(),args),'WAITLIST_ACCESS_DENIED');
 perform pg_temp.wait_assert(jsonb_array_length(public.read_business_waitlist(a,owner_a))=1,'authorized owner sees own queue');
 perform pg_temp.wait_reject(format('select public.read_business_waitlist(%L,%L)',a,owner_b),'WAITLIST_ACCESS_DENIED');
 perform public.manage_appointment_waitlist(customer_b,'leave',request_a);
 perform pg_temp.wait_assert((select status='waiting' from public.appointment_waitlist where id=request_a),'foreign customer cannot cancel');
 perform public.manage_appointment_waitlist(customer_b,'join',request_b,args);
 insert into public.bookings(id,salon_id,style_id,stylist_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status)
 values(source_id,a,sa,pa,'Cancelled fixture',at_time,1,100,10,90,'Paid','Cancelled');
 result:=public.due_appointment_waitlist();
 perform pg_temp.wait_assert(jsonb_array_length(result)=2,'matching cancellation produces candidates');
 perform pg_temp.wait_assert(not(result->0 ? 'guest_name') and not(result->0 ? 'guest_email'),'cancelled customer facts never reach matching worker');
 offer_a:=public.offer_appointment_waitlist(request_a,source_id,pa,'{"title":"Fixture opening","body":"Review only"}');
 offer_b:=public.offer_appointment_waitlist(request_b,source_id,pa,'{"title":"Fixture opening","body":"Review only"}');
 perform pg_temp.wait_assert(offer_a is not null and offer_b is not null,'two eligible customers receive reviewable offers');
 perform pg_temp.wait_assert(public.offer_appointment_waitlist(request_a,source_id,pa,'{}') is null,'scheduler retry cannot duplicate offer or notification');
 perform pg_temp.wait_assert((select count(*)=0 from public.booking_checkout_intents where salon_id=a),'offers do not reserve or charge');
 payload:=jsonb_build_object('waitlist_offer_id',offer_a);
 perform pg_temp.wait_reject(format('select public.reserve_booking_checkout(%L,%L,%L,%L,null,%L,1,15,%L,100,10)',a,sa,pa,customer_b,at_time,payload),'WAITLIST_OFFER_UNAVAILABLE');
 perform pg_temp.wait_assert((select count(*)=0 from public.booking_checkout_intents where salon_id=a),'invalid claim rolls entire hold back');
 update public.appointment_waitlist_offers set expires_at=now()-interval '1 second' where id=offer_a;
 perform pg_temp.wait_reject(format('select public.reserve_booking_checkout(%L,%L,%L,%L,null,%L,1,15,%L,100,10)',a,sa,pa,customer_a,at_time,payload),'WAITLIST_OFFER_UNAVAILABLE');
 update public.appointment_waitlist_offers set expires_at=now()+interval '1 hour' where id=offer_a;
 update public.platform_identities set status='Disabled' where user_id=customer_a;
 perform pg_temp.wait_reject(format('select public.reserve_booking_checkout(%L,%L,%L,%L,null,%L,1,15,%L,100,10)',a,sa,pa,customer_a,at_time,payload),'WAITLIST_OFFER_UNAVAILABLE');
 update public.platform_identities set status='Active' where user_id=customer_a;
 intent:=public.reserve_booking_checkout(a,sa,pa,customer_a,null,at_time,1,15,payload,100,10);
 perform pg_temp.wait_assert((select status='claimed' and intent_id=intent from public.appointment_waitlist_offers where id=offer_a),'offer atomically associated with actual hold');
 perform pg_temp.wait_reject(format('select public.reserve_booking_checkout(%L,%L,%L,%L,null,%L,1,15,%L,100,10)',a,sa,pa,customer_b,at_time,jsonb_build_object('waitlist_offer_id',offer_b)),'BOOKING_RESOURCE_CONFLICT');
 update public.booking_checkout_intents set status='Paid' where id=intent;
 insert into public.bookings(salon_id,style_id,stylist_id,customer_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,origin_checkout_intent_id,waitlist_offer_id)
 values(a,sa,pa,customer_a,'Booked fixture',at_time,1,100,10,90,'Paid','Confirmed',intent,offer_a) returning id into book;
 perform pg_temp.wait_assert((select status='fulfilled' from public.appointment_waitlist where id=request_a),'confirmed booking fulfills only winner');
 perform pg_temp.wait_assert((select status='booked' and booking_id=book from public.appointment_waitlist_offers where id=offer_a),'offer shows authoritative booking');
 perform pg_temp.wait_assert((select status='waiting' from public.appointment_waitlist where id=request_b),'other customer is not silently booked');
 perform public.manage_appointment_waitlist(customer_b,'leave',request_b);
 perform pg_temp.wait_assert((select status='withdrawn' from public.appointment_waitlist_offers where id=offer_b),'leaving withdraws unclaimed offers');
 perform pg_temp.wait_assert(not has_table_privilege('authenticated','public.appointment_waitlist','select,insert,update,delete'),'no raw data API access');
 perform pg_temp.wait_assert(not has_function_privilege('authenticated','public.offer_appointment_waitlist(uuid,uuid,uuid,jsonb)','execute'),'no direct offer creation');
 perform pg_temp.wait_assert(not has_function_privilege('anon','public.manage_appointment_waitlist(uuid,text,uuid,jsonb)','execute'),'no anonymous management');
end $$;
rollback;
