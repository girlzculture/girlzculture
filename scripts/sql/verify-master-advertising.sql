begin;
create temporary table ad_assertions(label text);grant insert,select on ad_assertions to service_role;
create function pg_temp.a_assert(ok boolean,label text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Advertising assertion: %',label;end if;insert into ad_assertions values(label);end $$;
create function pg_temp.a_reject(command text,expected text)returns void language plpgsql as $$declare rejected boolean:=false;begin begin execute command;exception when others then if sqlerrm=expected then rejected:=true;else raise;end if;end;perform pg_temp.a_assert(rejected,expected);end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();admin uuid:=gen_random_uuid();space uuid:=gen_random_uuid();space2 uuid:=gen_random_uuid();request uuid:=gen_random_uuid();request2 uuid:=gen_random_uuid();input jsonb;j jsonb;q jsonb;result jsonb;first jsonb;plan text;campaign uuid;fingerprint text;demo uuid:=gen_random_uuid();demo_owner uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)values(oa,'ads-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'ads-b@example.test','',now(),'{"role":"salon_owner"}'),(admin,'ads-admin@example.test','',now(),'{"role":"admin"}');
 insert into public.admin_users(id,user_id,email,status,is_super_admin)values(admin,admin,'ads-admin@example.test','Active',true);
 insert into public.salons(id,user_id,name,slug,email,status,is_discoverable,accepting_bookings,subscription_status,subscription_tier,latitude,longitude,geocode_status,address_needs_review)values
 (a,oa,'Ad A','ads-a','ads-a@example.test','Active',true,true,'active','Premium',40,-73,'success',false),(b,ob,'Foreign secret','ads-b','ads-b@example.test','Active',true,true,'active','Premium',40,-73,'success',false);
 insert into public.salon_applications(salon_id,user_id,business_name,owner_name,business_email,phone,street_address,city,state,zip_code,business_type,status,selected_plan,business_setup_type)
 values(a,oa,'Ad A','Owner','ads-a@example.test','+12125550100','123 Fixture Street','Fixture','NY','10001','Hair Salon','Approved','Premium','single_location_staffed'),(b,ob,'Ad B','Owner','ads-b@example.test','+12125550101','124 Fixture Street','Fixture','NY','10001','Hair Salon','Approved','Premium','single_location_staffed');
 insert into public.salon_publication_overrides(salon_id,application_id,reason,overridden_gates,gate_snapshot,granted_by)
 select x.salon_id,x.id,'Isolated local acceptance fixture only',(select jsonb_agg(key)from jsonb_each(public.salon_publication_diagnostic(x.salon_id)->'checks')),public.salon_publication_diagnostic(x.salon_id),x.user_id from public.salon_applications x where salon_id in(a,b);
 update public.salons set is_discoverable=true,accepting_bookings=true,status='Active',owner_unpublished_at=null where id in(a,b);
 perform pg_temp.a_assert(public.is_marketplace_visible(a),'actual visibility predicate');
 perform set_config('request.jwt.claim.role','service_role',true);
 input:=jsonb_build_object('id',space,'title','Future sponsored placement','price_cents',10000,'opens_at',now()+interval '49 hours','starts_at',now()+interval '7 days','ends_at',now()+interval '14 days','capacity',1,'radius_miles',25);
 set local role service_role;
 perform pg_temp.a_reject(format('select public.admin_ad_spaces(%L,''create'',%L)',oa,input),'AD_ACCESS_DENIED');
 perform pg_temp.a_reject(format('select public.admin_ad_spaces(%L,''create'',%L)',admin,input||jsonb_build_object('opens_at',now()+interval '47 hours')),'AD_EARLY_ACCESS_REQUIRED');
 j:=public.admin_ad_spaces(admin,'create',input);perform pg_temp.a_assert(jsonb_array_length(j->'spaces')=1,'admin creates reviewed inventory');
 j:=public.admin_ad_spaces(admin,'create',input);perform pg_temp.a_assert(jsonb_array_length(j->'spaces')=1,'create response loss does not duplicate inventory');
 perform pg_temp.a_reject(format('select public.admin_ad_spaces(%L,''create'',%L)',admin,input||'{"price_cents":9000}'),'AD_REQUEST_REUSED');
 j:=public.read_business_ad_spaces(a,oa);perform pg_temp.a_assert(jsonb_array_length(j->'offers')=0,'even Premium cannot see inventory earlier than 48h');
 reset role;update gc_private.ad_spaces set opens_at=now()+interval '47 hours' where id=space;
 insert into public.business_verification_locations(salon_id,address_street,address_city,address_state,address_zip,visit_status,visited_at,verified_by,visit_evidence,latitude,longitude,geocode_status)values(a,'1 Fixture Road','Fixture','NY','10001','verified',now()-interval '1 day',admin,'Local fixture only; no production approval.',40,-73,'success');
 update public.salons set service_location_type='storefront' where id=a;
 update public.salons set latitude=40,longitude=-73,geocode_status='success',address_needs_review=false where id=b;
 foreach plan in array array['Solo','Solo Pro','Starter','Growth','Premium']loop
  update public.salons set subscription_tier=plan where id=a;set local role service_role;j:=public.read_business_ad_spaces(a,oa);
  perform pg_temp.a_assert((j->'benefits'->>'discount_percent')::integer=case when plan='Premium' then 15 when plan in('Solo Pro','Growth')then 5 else 0 end,plan||' discount');
  perform pg_temp.a_assert((j->'benefits'->>'credit_available_cents')::integer=case when plan in('Solo Pro','Growth','Premium')then 1000 else 0 end,plan||' credit');
  perform pg_temp.a_assert(jsonb_array_length(j->'offers')=case when plan='Premium' then 1 else 0 end,plan||' early access');
  reset role;
 end loop;
 set local role service_role;
 q:=j->'offers'->0;fingerprint:=q->>'fingerprint';
 perform pg_temp.a_assert(q->>'discount_cents'='1500' and q->>'credit_cents'='1000' and q->>'balance_cents'='7500','discount before credit exact cents');
 perform pg_temp.a_reject(format('select public.read_business_ad_spaces(%L,%L)',a,ob),'AD_ACCESS_DENIED');
 perform pg_temp.a_reject(format('select public.read_business_ad_spaces(%L,%L)',b,oa),'AD_ACCESS_DENIED');
 perform pg_temp.a_assert(j::text not like '%Foreign secret%' and jsonb_array_length(j->'reservations')=0,'only owned reservations projected');

 first:=public.reserve_business_ad_space(a,oa,space,request,fingerprint);
 perform pg_temp.a_assert(first->>'verified'='true','reservation saved');
 perform pg_temp.a_assert(public.reserve_business_ad_space(a,oa,space,request,fingerprint)=first,'lost response replay same durable reservation');
 perform pg_temp.a_reject(format('select public.reserve_business_ad_space(%L,%L,%L,%L,%L)',b,ob,space,request,fingerprint),'AD_REQUEST_REUSED');
 perform pg_temp.a_reject(format('select public.reserve_business_ad_space(%L,%L,%L,%L,%L)',b,ob,space,request2,fingerprint),'AD_NOT_AVAILABLE');
 j:=public.read_business_ad_spaces(a,oa);perform pg_temp.a_assert(j->'benefits'->>'credit_available_cents'='0' and jsonb_array_length(j->'reservations')=1,'reserved credit removed immediately and readback');
 perform pg_temp.a_reject(format('select public.cancel_business_ad_reservation(%L,%L,%L)',b,ob,request),'AD_NOT_FOUND');
 j:=public.cancel_business_ad_reservation(a,oa,request);perform pg_temp.a_assert(j->>'verified'='true','owner cancellation verified');
 j:=public.read_business_ad_spaces(a,oa);perform pg_temp.a_assert(j->'benefits'->>'credit_available_cents'='1000','cancel restores unused period allowance');
 perform pg_temp.a_assert(public.reserve_business_ad_space(a,oa,space,request,fingerprint)=first,'cancelled replay never resurrects');
 j:=public.reserve_business_ad_space(a,oa,space,request2,fingerprint);
 input:=jsonb_build_object('id',request2,'invoice_reference','fixture-invoice-1','received_cents',7500);
 perform pg_temp.a_reject(format('select public.admin_ad_spaces(%L,''fulfill'',%L)',admin,input),'AD_INVOICE_REQUIRED');
 perform pg_temp.a_reject(format('select public.admin_ad_spaces(%L,''fulfill'',%L)',admin,input||'{"payment_verified":true,"received_cents":7499}'),'AD_INVOICE_REQUIRED');
 j:=public.admin_ad_spaces(admin,'fulfill',input||'{"payment_verified":true}');
 reset role;
 select campaign_id into campaign from gc_private.ad_reservations where id=request2;
 perform pg_temp.a_assert(exists(select 1 from public.featured_salon_campaigns where id=campaign and salon_id=a and placement_basis='paid' and status='Scheduled'),'canonical campaign created only after exact invoice evidence');
 perform pg_temp.a_assert(exists(select 1 from public.marketing_entitlements e join public.featured_salon_campaigns c on c.entitlement_id=e.id where c.id=campaign and e.source='verified_invoice' and e.amount_minor=7500),'canonical paid ledger records received balance not invented list price');
 perform pg_temp.a_assert(exists(select 1 from public.featured_campaign_audit where campaign_id=campaign),'canonical audit recorded');
 set local role service_role;
 j:=public.admin_ad_spaces(admin,'fulfill',input||'{"payment_verified":true}');
 perform pg_temp.a_reject(format('select public.cancel_business_ad_reservation(%L,%L,%L)',a,oa,request2),'AD_ALREADY_FULFILLED');
 reset role;perform pg_temp.a_assert((select count(*)=1 from public.featured_salon_campaigns where salon_id=a),'fulfill replay never creates second placement');
 -- The same paid placement can find a private home/mobile origin without
 -- returning the address or precise coordinates, and fixed storefronts retain
 -- their established distance and ranking inputs.
 update public.featured_salon_campaigns set starts_at=now()-interval '1 hour' where id=campaign;
 update public.marketing_entitlements set valid_from=now()-interval '1 hour' where id=(select entitlement_id from public.featured_salon_campaigns where id=campaign);
 perform pg_temp.a_assert(exists(select 1 from public.discover_featured_salons(40,-73,25,'test',12,0)where id=a and latitude=40 and longitude=-73 and distance_miles=0),'storefront exact coordinates and distance unchanged');
 update public.salons set service_location_type='home',home_address_public=false where id=a;
 perform pg_temp.a_assert(public.read_business_ad_spaces(a,oa)->>'eligible'='true','private home qualifies through verified location');
 perform pg_temp.a_assert(exists(select 1 from public.discover_featured_salons(40,-73,25,'test',12,0)where id=a and latitude is null and longitude is null and distance_miles=0),'home origin used for distance but never returned');
 update public.salons set service_location_type='mobile',travel_radius_miles=1 where id=a;
 perform pg_temp.a_assert(exists(select 1 from public.discover_featured_salons(40,-73,25,'test',12,0)where id=a and latitude is null and longitude is null),'mobile eligible in own travel radius');
 perform pg_temp.a_assert(not exists(select 1 from public.discover_featured_salons(40.05,-73,25,'test',12,0)where id=a),'mobile outside travel radius never shown even if ad covers radius');
 -- Fresh quotes must react to both balances and downgrades; no rollover.
 insert into gc_private.ad_spaces(id,title,price_cents,opens_at,starts_at,ends_at,capacity,radius_miles,created_by)values(space2,'Second period fixture',1000,now()-interval '1 day',now()+interval '21 days',now()+interval '28 days',10,25,admin);
 q:=gc_private.ad_quote(a,space2);perform pg_temp.a_assert(q->>'credit_cents'='0','same-period credit cannot be double spent');
 update gc_private.ad_reservations set created_at=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'-interval '1 day' where id=request2;
 q:=gc_private.ad_quote(a,space2);perform pg_temp.a_assert(q->>'credit_cents'='850' and q->>'balance_cents'='0','new Premium month capped at 1000 without rollover');
 fingerprint:=q->>'fingerprint';update public.salons set subscription_tier='Starter' where id=a;
 set local role service_role;
 perform pg_temp.a_reject(format('select public.reserve_business_ad_space(%L,%L,%L,%L,%L)',a,oa,space2,gen_random_uuid(),fingerprint),'AD_QUOTE_CHANGED');
 reset role;update public.salons set subscription_tier='Premium' where id=a;set local role service_role;
 request:=gen_random_uuid();j:=public.reserve_business_ad_space(a,oa,space2,request,fingerprint);j:=public.admin_ad_spaces(admin,'fulfill',jsonb_build_object('id',request,'invoice_reference','','received_cents',0,'payment_verified',false));
 reset role;
 perform pg_temp.a_assert(exists(select 1 from gc_private.ad_reservations r join public.featured_salon_campaigns c on c.id=r.campaign_id join public.marketing_entitlements e on e.id=c.entitlement_id where r.id=request and e.source='platform_credit' and e.amount_minor=850),'fully credited reservation has real credit entitlement and no fake invoice');
 -- Credits from an earlier month in this quarter still count after a
 -- downgrade to quarterly Growth: changing plan never resets the ledger.
 update gc_private.ad_reservations set created_at=date_trunc('quarter',now() at time zone 'UTC') at time zone 'UTC' where id=request2;
 update public.salons set subscription_tier='Growth' where id=a;
 j:=gc_private.ad_benefits(a);
 perform pg_temp.a_assert(j->>'credit_available_cents'='0','quarterly allowance includes every consumed credit in the quarter');
 perform pg_temp.a_assert((j->>'period_start')::timestamptz=date_trunc('quarter',now() at time zone 'UTC') at time zone 'UTC','quarter uses exact UTC boundary');
 update public.salons set subscription_status='cancelled' where id=a;
 j:=gc_private.ad_benefits(a);perform pg_temp.a_assert(j->>'discount_percent'='0' and j->>'credit_available_cents'='0','inactive plan benefits removed');
 perform pg_temp.a_assert(not has_table_privilege('service_role','gc_private.ad_reservations','select') and not has_table_privilege('authenticated','gc_private.ad_spaces','select'),'raw data private');
 perform pg_temp.a_assert(not has_function_privilege('authenticated','public.reserve_business_ad_space(uuid,uuid,uuid,uuid,text)','execute'),'browser cannot forge business/actor');
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)values(demo_owner,'advertising@sample.invalid','',now(),'{"gc_demo":true}','{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,is_demo,status,subscription_status,subscription_tier)values(demo,demo_owner,'Sample ads','sample-ads-fixture','advertising@sample.invalid',true,'Active','active','Premium');
 set local role service_role;
 j:=public.read_business_ad_spaces(demo,demo_owner);perform pg_temp.a_assert(j->>'is_demo'='true' and j->>'eligible'='false','demo marked and never ad eligible');
 perform pg_temp.a_reject(format('select public.reserve_business_ad_space(%L,%L,%L,%L,%L)',demo,demo_owner,space2,gen_random_uuid(),repeat('a',32)),'AD_BUSINESS_NOT_ELIGIBLE');
 reset role;
 -- No generated provider identifier, notification or customer record.
 perform pg_temp.a_assert(not exists(select 1 from public.marketing_entitlements where salon_id=a and source='stripe_payment'),'no Stripe operation or fabricated provider evidence');
end $$;
select count(*)||' advertising assertions passed'from ad_assertions;
rollback;
