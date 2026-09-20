-- Disposable test database only; all fixtures roll back.
begin;
create function pg_temp.deposit_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Deposit assertion failed: %',label; end if; end $$;
create function pg_temp.deposit_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false; begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.deposit_assert(rejected,expected);end $$;
do $$
declare owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();customer_a uuid:=gen_random_uuid();customer_b uuid:=gen_random_uuid();business_a uuid:=gen_random_uuid();business_b uuid:=gen_random_uuid();style_a uuid:=gen_random_uuid();style_b uuid:=gen_random_uuid();book_a uuid:=gen_random_uuid();book_b uuid:=gen_random_uuid();future_a uuid:=gen_random_uuid();op uuid:=gen_random_uuid();result jsonb;again jsonb;rule jsonb:='{"rate":20,"threshold_amount":300,"threshold_rate":40,"repeat_incident_count":2,"repeat_incident_rate":50,"incident_window_days":365}';version uuid;intent uuid:=gen_random_uuid();price_snapshot jsonb:='{"deposit":20,"rate":20,"subtotal":100,"basis":"eligible_service_subtotal_before_discounts"}';staff uuid:=gen_random_uuid();professional uuid:=gen_random_uuid();guest_token uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(owner_a,'deposit-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'deposit-owner-b@example.test','',now(),'{"role":"salon_owner"}'),(customer_a,'deposit-customer-a@example.test','',now(),'{"role":"customer"}'),(customer_b,'deposit-customer-b@example.test','',now(),'{"role":"customer"}');
 insert into public.customers(id,name,email) values(customer_a,'Customer A','deposit-customer-a@example.test'),(customer_b,'Customer B','deposit-customer-b@example.test');
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(staff,'deposit-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier) values(business_a,owner_a,'Deposits A','deposits-a','deposit-owner-a@example.test','Active','active','Premium'),(business_b,owner_b,'Deposits B','deposits-b','deposit-owner-b@example.test','Active','active','Premium');
 insert into public.stylists(id,salon_id,name) values(professional,business_a,'Assigned stylist');
 insert into public.salon_team_members(salon_id,user_id,stylist_id,email,name,role,status,permissions) values(business_a,staff,professional,'deposit-staff@example.test','Assigned stylist','Stylist','Active','{"bookings":true}');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max)
 select fixture.style_id,fixture.business_id,g.id,fixture.name,1,1,100,100,100 from (values(style_a,business_a,'Style A'),(style_b,business_b,'Style B')) fixture(style_id,business_id,name)
 cross join lateral(select id from public.service_groups where is_active and archived_at is null order by sort_order,name limit 1) g;
 perform set_config('request.jwt.claim.role','service_role',true);
 result:=public.save_business_deposit_rule(business_a,owner_a,op,null,rule);version:=(result->>'id')::uuid;
 again:=public.save_business_deposit_rule(business_a,owner_a,op,null,rule);
 perform pg_temp.deposit_assert(result=again,'same settings retry is idempotent');
 perform pg_temp.deposit_assert((select count(*)=1 from public.business_deposit_rules where salon_id=business_a),'one immutable version');
 perform pg_temp.deposit_reject(format('select public.save_business_deposit_rule(%L,%L,%L,null,%L::jsonb)',business_b,owner_a,gen_random_uuid(),rule),'DEPOSIT_OWNER_REQUIRED');
 perform pg_temp.deposit_reject(format('select public.save_business_deposit_rule(%L,%L,%L,null,%L::jsonb)',business_a,owner_a,gen_random_uuid(),rule),'DEPOSIT_RULE_CHANGED');
 perform pg_temp.deposit_reject(format('select public.save_business_deposit_rule(%L,%L,%L,%L,%L::jsonb)',business_a,owner_a,gen_random_uuid(),version,rule||'{"repeat_incident_count":1.1}'),'DEPOSIT_RULE_INVALID');
 perform pg_temp.deposit_reject(format('select public.save_business_deposit_rule(%L,%L,%L,%L,%L::jsonb)',business_a,owner_a,gen_random_uuid(),version,rule||'{"salon_id":"forged"}'),'DEPOSIT_RULE_INVALID');
 insert into public.bookings(id,salon_id,style_id,customer_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status) values
  (book_a,business_a,style_a,customer_a,'Customer A','deposit-customer-a@example.test',now()-interval '2 days',1,100,0,100,'No Payment Required','Confirmed'),
  (book_b,business_b,style_b,customer_a,'Customer A','deposit-customer-a@example.test',now()-interval '3 days',1,100,0,100,'No Payment Required','Confirmed'),
  (future_a,business_a,style_a,customer_a,'Customer A','deposit-customer-a@example.test',now()+interval '3 days',1,100,0,100,'No Payment Required','Confirmed');
 perform pg_temp.deposit_reject(format('select public.record_business_booking_incident(%L,%L,%L,%L,%L,%L,%L)',business_a,owner_a,future_a,gen_random_uuid(),'confirm','no_show','Not yet due'),'INCIDENT_NOT_VERIFIED');
 perform pg_temp.deposit_reject(format('select public.record_business_booking_incident(%L,%L,%L,%L,%L,%L,%L)',business_a,owner_a,book_b,gen_random_uuid(),'confirm','no_show','Foreign record'),'INCIDENT_BOOKING_NOT_FOUND');
 perform pg_temp.deposit_reject(format('select public.record_business_booking_incident(%L,%L,%L,%L,%L,%L,%L)',business_a,staff,book_a,gen_random_uuid(),'confirm','no_show','Unassigned record'),'INCIDENT_ACCESS_DENIED');
 perform public.record_business_booking_incident(business_b,owner_b,book_b,gen_random_uuid(),'confirm','no_show','Owner verified absence after scheduled service ended');
 perform pg_temp.deposit_assert(public.own_business_incident_count(business_a,customer_a,'deposit-customer-a@example.test',365)=0,'another business cannot increase this deposit');
 perform pg_temp.deposit_assert(public.own_business_incident_count(business_b,customer_a,'deposit-customer-a@example.test',365)=1,'own business incident counts');
 op:=gen_random_uuid();result:=public.record_business_booking_incident(business_a,owner_a,book_a,op,'confirm','no_show','Owner verified absence');again:=public.record_business_booking_incident(business_a,owner_a,book_a,op,'confirm','no_show','Owner verified absence');
 perform pg_temp.deposit_assert(result=again and public.own_business_incident_count(business_a,customer_a,'deposit-customer-a@example.test',365)=1,'no-show retry is one incident');
 perform pg_temp.deposit_assert(public.own_business_incident_count(business_a,null,'deposit-customer-a@example.test',365)=0,'unverified guest input does not identify a customer');
 perform pg_temp.deposit_reject(format('select public.request_booking_incident_review(%L,%L,%L)',customer_b,book_a,'Not my booking'),'INCIDENT_BOOKING_NOT_FOUND');
 perform public.request_booking_incident_review(customer_a,book_a,'Please check my arrival record');
 perform pg_temp.deposit_assert(public.own_business_incident_count(business_a,customer_a,null,365)=0,'disputed incident excluded pending review');
 perform public.record_business_booking_incident(business_a,owner_a,book_a,gen_random_uuid(),'void',null,'Corrected after reviewing attendance');
 perform pg_temp.deposit_assert((select status='Confirmed' from public.bookings where id=book_a),'correction restores prior appointment status');
 perform pg_temp.deposit_assert((select count(*)=3 from public.business_booking_incident_events where booking_id=book_a),'original, customer review and correction retained');
 perform public.record_business_booking_incident(business_a,owner_a,book_a,gen_random_uuid(),'reinstate',null,'Reviewed attendance evidence');
 insert into public.booking_guest_access_tokens(id,booking_id,token_hash,purpose,expires_at) values(guest_token,book_a,repeat('a',64),'manage',now()+interval '1 hour');
 perform pg_temp.deposit_reject(format('select public.request_booking_incident_review(null,%L,%L,%L)',book_b,'Wrong guest booking',guest_token),'INCIDENT_BOOKING_NOT_FOUND');
 perform public.request_booking_incident_review(null,book_a,'Guest correction request',guest_token);
 perform pg_temp.deposit_assert(public.own_business_incident_count(business_a,customer_a,null,365)=0,'secure guest review excludes disputed incident');
 perform pg_temp.deposit_assert((select count(*)=1 from public.business_booking_incident_events where guest_token_id=guest_token),'guest review keeps token provenance, never another customer actor');
 insert into public.booking_checkout_intents(id,salon_id,style_id,appointment_datetime,payload,total_amount,deposit_amount) values(intent,business_a,style_a,now()+interval '4 days',jsonb_build_object('deposit_rule_snapshot',price_snapshot,'deposit_amount',20,'estimated_total',80,'balance_due',60),80,20);
 insert into public.bookings(salon_id,style_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,origin_checkout_intent_id) values(business_a,style_a,'Snapshot fixture',now()+interval '4 days',1,80,20,60,'Paid','Confirmed',intent);
 perform pg_temp.deposit_assert((select deposit_rule_snapshot=price_snapshot from public.bookings where origin_checkout_intent_id=intent),'combined/normal completion copies exact accepted deposit terms');
 perform public.save_business_deposit_rule(business_a,owner_a,gen_random_uuid(),version,rule||'{"rate":25}');
 perform pg_temp.deposit_assert((select deposit_rule_snapshot=price_snapshot and deposit_amount=20 from public.bookings where origin_checkout_intent_id=intent),'new rate does not rewrite booked terms');
 perform pg_temp.deposit_reject(format('update public.bookings set deposit_rule_snapshot=%L::jsonb where origin_checkout_intent_id=%L','{"deposit":99}',intent),'DEPOSIT_SNAPSHOT_IMMUTABLE');
 perform pg_temp.deposit_assert(not has_function_privilege('authenticated','public.own_business_incident_count(uuid,uuid,text,integer)','execute'),'browser cannot enumerate incident counts');
 perform pg_temp.deposit_assert(not has_table_privilege('authenticated','public.business_booking_incidents','select') and not has_table_privilege('anon','public.business_deposit_rules','select'),'raw incidents and private rule history unavailable to browser');
 perform pg_temp.deposit_assert(not has_function_privilege('anon','public.save_business_deposit_rule(uuid,uuid,uuid,uuid,jsonb)','execute'),'no public mutation bypass');
 perform pg_temp.deposit_assert(not has_table_privilege('service_role','public.business_deposit_rules','update') and not has_table_privilege('service_role','public.business_booking_incident_events','delete'),'server cannot rewrite rule or incident audit history directly');
end $$;
rollback;
