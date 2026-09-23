-- Disposable database only; real quote/reservation/finalization boundaries, no provider calls.
begin;
create function pg_temp.travel_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Travel assertion: %',label;end if;end $$;
create function pg_temp.travel_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.travel_assert(rejected,expected);end $$;
do $$
declare owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();customer_a uuid:=gen_random_uuid();customer_b uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();
 q jsonb;stale jsonb;expired jsonb;args jsonb;destination jsonb:='{"address_street":"100 Sample Avenue","address_line2":"2","address_city":"New York","address_state":"NY","address_zip":"10001"}';
 email_hash text:=encode(sha256(convert_to('travel-client-a@example.test','UTF8')),'hex');intent uuid;book uuid;claim_sql text;terms jsonb;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)values
 (owner_a,'travel-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'travel-owner-b@example.test','',now(),'{"role":"salon_owner"}'),
 (customer_a,'travel-client-a@example.test','',now(),'{"role":"customer"}'),(customer_b,'travel-client-b@example.test','',now(),'{"role":"customer"}');
 insert into public.customers(id,name,email)values(customer_a,'Travel fixture A','travel-client-a@example.test'),(customer_b,'Travel fixture B','travel-client-b@example.test');
 insert into public.salons(id,user_id,name,slug,email,subscription_status,subscription_tier,service_location_type,offers_mobile,travel_radius_miles,travel_fee_cents)values
 (a,owner_a,'Travel A','travel-a','travel-owner-a@example.test','active','Premium','mobile',true,10,1500),
 (b,owner_b,'Travel B','travel-b','travel-owner-b@example.test','active','Premium','storefront',false,null,0);
 insert into public.subscriptions(salon_id,tier,status)values(a,'Premium','active'),(b,'Premium','active');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,is_draft)
 select f.id,f.business,g.id,'Travel service',1,1,100,false from(values(sa,a),(sb,b))f(id,business)cross join lateral(select id from public.service_groups limit 1)g;
 insert into public.stylists(id,salon_id,name,is_active,is_draft)values(pa,a,'Travel professional',true,false);
 insert into public.business_verification_locations(salon_id,address_street,address_city,address_state,address_zip,latitude,longitude,address_fingerprint,geocode_status)
 values(a,'Private origin','New York','NY','10001',40.75,-73.99,'private-origin','success');
 -- Existing, audited publication override is local fixture setup, not a stub of eligibility.
 insert into public.salon_applications(salon_id,user_id,business_name,owner_name,business_email,phone,street_address,city,state,zip_code,business_type,status,selected_plan,business_setup_type)
 values(a,owner_a,'Travel A','Travel owner','travel-owner-a@example.test','+13055550123','Private origin','New York','NY','10001','Hair Salon','Approved','Premium','single_location_staffed');
 insert into public.salon_publication_overrides(salon_id,application_id,reason,overridden_gates,gate_snapshot,granted_by)
 select a,x.id,'Isolated mobile-booking acceptance fixture',(select jsonb_agg(key) from jsonb_each(public.salon_publication_diagnostic(a)->'checks')),public.salon_publication_diagnostic(a),owner_a from public.salon_applications x where salon_id=a;
 update public.salons set is_discoverable=true,accepting_bookings=true,status='Active',owner_unpublished_at=null where id=a;
 perform pg_temp.travel_assert(public.is_marketplace_visible(a),'published eligible fixture');
 perform pg_temp.travel_assert((select address_street is null and latitude is null from public.salons where id=a),'private mobile origin is never public');
 perform set_config('request.jwt.claim.role','service_role',true);
 q:=public.create_business_travel_quote(a,customer_a,email_hash,destination,40.76,-73.98);
 perform pg_temp.travel_assert(q->'address'=destination and(q->>'fee_cents')::integer=1500 and q-array['id','address','fee_cents','expires_at']='{}','minimal quote without hidden coordinates');
 perform pg_temp.travel_reject(format('select public.create_business_travel_quote(%L,%L,%L,%L,41.9,-74.5)',a,customer_a,email_hash,destination),'TRAVEL_OUTSIDE_RADIUS');
 perform pg_temp.travel_reject(format('select public.create_business_travel_quote(%L,%L,%L,%L,40.76,-73.98)',a,owner_a,email_hash,destination),'TRAVEL_CUSTOMER_REQUIRED');
 perform pg_temp.travel_reject(format('select public.create_business_travel_quote(%L,%L,%L,%L,40.76,-73.98)',b,customer_a,email_hash,destination),'TRAVEL_NOT_AVAILABLE');
 args:=jsonb_build_object('service_visit_mode','mobile','travel_quote_id',q->>'id','travel_fee_cents',1500,'customer_id',customer_a,'guest_email','travel-client-a@example.test');
 claim_sql:=format('select public.reserve_booking_checkout(%L,%L,%L,%L,%L,now()+interval ''5 days'',1,15,%%L,115,10)',a,sa,pa,customer_a,'travel-client-a@example.test');
 perform pg_temp.travel_reject(format(claim_sql,args||jsonb_build_object('customer_id',customer_b)),'TRAVEL_QUOTE_FORBIDDEN');
 perform pg_temp.travel_reject(format(claim_sql,args||'{"guest_email":"travel-client-b@example.test"}'),'TRAVEL_QUOTE_FORBIDDEN');
 perform pg_temp.travel_reject(format(claim_sql,args||'{"travel_fee_cents":0}'),'TRAVEL_TERMS_CHANGED');
 perform pg_temp.travel_reject(format(claim_sql,'{}'),'TRAVEL_ADDRESS_REQUIRED');
 stale:=public.create_business_travel_quote(a,customer_a,email_hash,destination,40.76,-73.98);
 update public.salons set travel_fee_cents=2000,location_settings_revision=location_settings_revision+1 where id=a;
 perform pg_temp.travel_reject(format(claim_sql,args||jsonb_build_object('travel_quote_id',stale->>'id')),'TRAVEL_TERMS_CHANGED');
 update public.salons set travel_fee_cents=1500,location_settings_revision=location_settings_revision+1 where id=a;
 expired:=public.create_business_travel_quote(a,customer_a,email_hash,destination,40.76,-73.98);
 update public.business_travel_quotes set expires_at=now()-interval '1 minute' where id=(expired->>'id')::uuid;
 perform pg_temp.travel_reject(format(claim_sql,args||jsonb_build_object('travel_quote_id',expired->>'id')),'TRAVEL_QUOTE_EXPIRED');
 q:=public.create_business_travel_quote(a,customer_a,email_hash,destination,40.76,-73.98);
 args:=args||jsonb_build_object('travel_quote_id',q->>'id');
 execute format(claim_sql,args)into intent;
 perform pg_temp.travel_assert((select intent_id=intent from public.business_travel_quotes where id=(q->>'id')::uuid),'quote atomically claimed');
 perform pg_temp.travel_reject(format('insert into public.booking_checkout_intents(salon_id,style_id,payload,total_amount,deposit_amount)values(%L,%L,%L,115,10)',a,sa,args),'TRAVEL_QUOTE_EXPIRED');
 perform pg_temp.travel_reject(format('update public.booking_checkout_intents set payload=payload-''service_location_snapshot'' where id=%L',intent),'TRAVEL_TERMS_IMMUTABLE');
 update public.booking_checkout_intents set status='Paid' where id=intent;
 insert into public.bookings(salon_id,style_id,stylist_id,customer_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,origin_checkout_intent_id)
 values(a,sa,pa,customer_a,'Travel fixture',now()+interval '5 days',1,115,10,105,'Paid','Confirmed',intent)returning id,service_location_snapshot into book,terms;
 perform pg_temp.travel_assert(terms->'address'=destination and(terms->>'travel_fee_cents')::integer=1500,'authoritative destination and fee preserved');
 perform pg_temp.travel_assert((select estimated_total=115 and deposit_amount=10 and balance_due=105 from public.bookings where id=book),'service deposit unchanged, travel added to balance');
 update public.salons set travel_fee_cents=9000 where id=a;
 perform pg_temp.travel_assert((select service_location_snapshot=terms from public.bookings where id=book),'later settings never rewrite booked terms');
 perform pg_temp.travel_reject(format('update public.bookings set service_location_snapshot=''{}'' where id=%L',book),'BOOKING_LOCATION_IMMUTABLE');
 perform pg_temp.travel_assert(public.confirmed_business_booking_location(book,customer_a,null)->>'address_street'='100 Sample Avenue','authorized customer sees agreed destination');
 perform pg_temp.travel_reject(format('select public.confirmed_business_booking_location(%L,%L,null)',book,customer_b),'BOOKING_LOCATION_FORBIDDEN');
 update public.bookings set status='Cancelled' where id=book;
 perform pg_temp.travel_assert(public.confirmed_business_booking_location(book,customer_a,null)->>'address_street' is null,'cancelled booking does not disclose address');
 update public.business_travel_quotes set expires_at=now()-interval '2 days' where salon_id=a;
 perform pg_temp.travel_assert(public.expire_business_travel_quotes()>=4,'expired duplicate addresses removed');
 perform pg_temp.travel_assert((select service_location_snapshot=terms from public.bookings where id=book),'retention preserves authoritative booked destination');
 perform pg_temp.travel_assert(not has_table_privilege('authenticated','public.business_travel_quotes','select') and not has_function_privilege('anon','public.create_business_travel_quote(uuid,uuid,text,jsonb,double precision,double precision)','execute'),'private quote API only');
end $$;
rollback;
select 'Mobile booking: 25 authorization, radius, fee, claim, persistence and retention checks passed.';
