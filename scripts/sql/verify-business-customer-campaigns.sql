-- Isolated disposable PostgreSQL only. Synthetic records; no transport runs.
\set ON_ERROR_STOP on
begin;
create function pg_temp.campaign_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Campaign assertion: %',label;end if;end $$;
create function pg_temp.campaign_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.campaign_assert(rejected,expected);end $$;
do $$
declare oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();ca uuid:=gen_random_uuid();cb uuid:=gen_random_uuid();cc uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();ba uuid:=gen_random_uuid();bb uuid:=gen_random_uuid();bc uuid:=gen_random_uuid();bg uuid:=gen_random_uuid();
 post_id uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();cancel_id uuid:=gen_random_uuid();consent_id uuid:=gen_random_uuid();stale_id uuid:=gen_random_uuid();
 source jsonb;copies jsonb;result jsonb;claimed jsonb;again jsonb;count_before integer;review_id uuid;partial_id uuid:=gen_random_uuid();support_id uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 (oa,'campaign-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'campaign-owner-b@example.test','',now(),'{"role":"salon_owner"}'),
 (ca,'campaign-client-a@example.test','',now(),'{"role":"customer"}'),(cb,'campaign-client-b@example.test','',now(),'{"role":"customer"}'),(cc,'campaign-client-c@example.test','',now(),'{"role":"customer"}'),
 (staff,'campaign-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.customers(id,email,name) values(ca,'campaign-client-a@example.test','Own client A'),(cb,'campaign-client-b@example.test','Foreign client'),(cc,'campaign-client-c@example.test','Own client C');
 insert into public.salons(id,user_id,name,slug,email,status,is_discoverable,accepting_bookings,subscription_status,subscription_tier,gallery_photos,photo_metadata) values
 (a,oa,'Campaign A','campaign-fixture-a','campaign-owner-a@example.test','Active',true,true,'active','Premium','["https://fixture.invalid/own.jpg"]','{}'),
 (b,ob,'Campaign B','campaign-fixture-b','campaign-owner-b@example.test','Active',true,true,'active','Premium','[]','{}');
 insert into public.subscriptions(salon_id,tier,status) values(a,'Premium','active'),(b,'Premium','active');
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions) values(a,staff,'campaign-staff@example.test','Campaign staff','Manager','Active','{"promotions":true,"bookings":true}');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max,is_draft)
 select sa,a,g.id,'Campaign service',1,1,100,100,100,false from public.service_groups g limit 1;
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,is_draft)
 select sb,b,g.id,'Foreign service',1,1,100,false from public.service_groups g limit 1;
 insert into public.bookings(id,salon_id,customer_id,style_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status) values
 (ba,a,ca,sa,'Own client A','campaign-client-a@example.test',now()-interval '1 day',1,100,10,90,'Paid','Completed'),
 (bb,b,cb,sb,'Foreign client','campaign-client-b@example.test',now()-interval '1 day',1,100,10,90,'Paid','Completed'),
 (bc,a,cc,sa,'Own client C','campaign-client-c@example.test',now()-interval '2 days',1,100,10,90,'Paid','Completed'),
 (bg,a,null,sa,'Booking-only guest','campaign-guest@example.test',now()-interval '3 days',1,100,10,90,'Paid','Completed');
 insert into public.business_communication_preferences(salon_id,customer_id,marketing,email_enabled,locale) values(a,ca,true,true,'fr'),(b,cb,true,true,'en'),(a,cc,true,true,'es');
 insert into public.business_communication_preferences(salon_id,guest_booking_id,marketing,email_enabled) values(a,bg,true,true);
 insert into public.salon_applications(salon_id,user_id,business_name,owner_name,business_email,phone,street_address,city,state,zip_code,business_type,status,selected_plan,business_setup_type)
 values(a,oa,'Campaign A','Owner A','campaign-owner-a@example.test','+13055550123','123 Fixture Street','Miami','FL','33101','Hair Salon','Approved','Premium','solo_professional');
 insert into public.salon_publication_overrides(salon_id,application_id,reason,overridden_gates,gate_snapshot,granted_by)
 select a,x.id,'Isolated local campaign fixture',(select jsonb_agg(key) from jsonb_each(public.salon_publication_diagnostic(a)->'checks')),public.salon_publication_diagnostic(a),oa from public.salon_applications x where salon_id=a;
 update public.salons set status='Active',is_discoverable=true,owner_unpublished_at=null where id=a;
 update public.engine_settings set published_value='["email"]' where setting_key='notifications.channels';
 source:=jsonb_build_object('photo_urls',jsonb_build_array('https://fixture.invalid/own.jpg'),'service_id',sa,'promotion_id',null,'booking_id',null);
 select jsonb_object_agg(l,jsonb_build_object('title','Reviewed campaign title','body','Reviewed own business update.','tags','[]'::jsonb)) into copies from unnest(array['en','fr','es','zh-CN'])l;
 perform set_config('request.jwt.claim.role','service_role',true);set local role service_role;
 perform public.save_business_marketing_post(a,oa,post_id,0,source,copies);
 perform pg_temp.campaign_reject(format('select public.save_customer_campaign(%L,%L,%L,%L,1,array[%L]::uuid[])',a,oa,campaign,post_id,ca),'CAMPAIGN_SOURCE_CHANGED');
 perform public.approve_business_marketing_post(a,oa,post_id,1,now(),now()+interval '1 day',array['en','fr','es','zh-CN'],true);
 result:=public.customer_campaign_workspace(a,oa,'');
 perform pg_temp.campaign_assert(jsonb_array_length(result->'clients')=2,'only own served registered opted-in customers');
 perform pg_temp.campaign_assert(result::text not like '%Foreign client%' and result::text not like '%Booking-only guest%' and result::text not like '%campaign-client-a@example.test%','projection excludes foreign, guest and full addresses');
 perform pg_temp.campaign_reject(format('select public.customer_campaign_workspace(%L,%L)',a,ob),'CAMPAIGN_FORBIDDEN');
 perform pg_temp.campaign_reject(format('select public.customer_campaign_workspace(%L,%L)',a,staff),'CAMPAIGN_FORBIDDEN');
 perform pg_temp.campaign_reject(format('select public.save_customer_campaign(%L,%L,%L,%L,2,array[%L]::uuid[])',a,oa,campaign,post_id,cb),'CAMPAIGN_CONSENT_CHANGED');
 perform public.save_customer_campaign(a,oa,campaign,post_id,2,array[ca,cc]);
 perform public.save_customer_campaign(a,oa,campaign,post_id,2,array[cc,ca]);
 perform pg_temp.campaign_assert((select count(*)=2 from public.business_customer_campaign_recipients where campaign_id=campaign),'save retry preserves one recipient per customer');
 perform pg_temp.campaign_reject(format('select public.save_customer_campaign(%L,%L,%L,%L,2,array[%L]::uuid[])',a,oa,campaign,post_id,ca),'CAMPAIGN_REQUEST_REUSED');
 perform pg_temp.campaign_reject(format('select public.claim_customer_campaign_email(%L,%L,%L)',a,oa,campaign),'CAMPAIGN_REVIEW_REQUIRED');
 perform pg_temp.campaign_reject(format('select public.confirm_customer_campaign(%L,%L,%L,1,array[''fr''])',a,oa,campaign),'CAMPAIGN_REVIEW_REQUIRED');
 perform pg_temp.campaign_reject(format('select public.confirm_customer_campaign(%L,%L,%L,1,array[null]::text[])',a,oa,campaign),'CAMPAIGN_REVIEW_REQUIRED');
 perform pg_temp.campaign_reject(format('select public.confirm_customer_campaign(%L,%L,%L,null,array[''fr'',''es''])',a,oa,campaign),'CAMPAIGN_STALE');
 perform public.confirm_customer_campaign(a,oa,campaign,1,array['fr','es']);
 perform public.confirm_customer_campaign(a,oa,campaign,1,array['fr','es']);
 select count(*) into count_before from public.notification_delivery_log;
 claimed:=public.claim_customer_campaign_email(a,oa,campaign);
 perform pg_temp.campaign_assert(claimed->>'attempt_id' is not null and claimed->>'locale' in('fr','es'),'fresh recipient claim uses reviewed saved language');
 perform public.finish_customer_campaign_email(a,campaign,(claimed->>'customer_id')::uuid,(claimed->>'attempt_id')::uuid,'uncertain',support_id);
 perform pg_temp.campaign_assert((select r.support_reference=support_id and l.error_message like '%'||support_id::text from public.business_customer_campaign_recipients r join public.notification_delivery_log l on l.id=r.delivery_log_id where r.campaign_id=campaign and r.customer_id=(claimed->>'customer_id')::uuid),'uncertain support reference persists in recipient and canonical log');
 again:=public.claim_customer_campaign_email(a,oa,campaign);
 perform pg_temp.campaign_assert(again->>'customer_id'<>claimed->>'customer_id','uncertain recipient is never retried');
 perform public.finish_customer_campaign_email(a,campaign,(again->>'customer_id')::uuid,(again->>'attempt_id')::uuid,'accepted');
 perform pg_temp.campaign_assert(public.claim_customer_campaign_email(a,oa,campaign) is null,'terminal recipients cannot be reclaimed');
 perform pg_temp.campaign_assert((select count(*)=count_before+2 from public.notification_delivery_log),'one existing canonical delivery log per selected customer');
 -- Even long after the provider's idempotency retention, no latch is reclaimed.
 update public.business_customer_campaign_recipients set status='processing',attempted_at=now()-interval '10 days' where campaign_id=campaign;
 perform pg_temp.campaign_assert(public.claim_customer_campaign_email(a,oa,campaign) is null,'crashed/expired processing attempt cannot be retried');
 -- A new review is required when language/revision or verified address changes,
 -- even though marketing and the email channel remain opted in.
 review_id:=gen_random_uuid();perform public.save_customer_campaign(a,oa,review_id,post_id,2,array[ca]);
 update public.business_communication_preferences set locale='en',revision=revision+1 where salon_id=a and customer_id=ca;
 perform pg_temp.campaign_reject(format('select public.confirm_customer_campaign(%L,%L,%L,1,array[''fr''])',a,oa,review_id),'CAMPAIGN_CONSENT_CHANGED');
 update public.business_communication_preferences set locale='fr',revision=revision+1 where salon_id=a and customer_id=ca;
 review_id:=gen_random_uuid();perform public.save_customer_campaign(a,oa,review_id,post_id,2,array[ca]);
 reset role;update auth.users set email='campaign-changed@example.test' where id=ca;set local role service_role;
 perform pg_temp.campaign_reject(format('select public.confirm_customer_campaign(%L,%L,%L,1,array[''fr''])',a,oa,review_id),'CAMPAIGN_CONSENT_CHANGED');
 reset role;update auth.users set email='campaign-client-a@example.test' where id=ca;set local role service_role;
 perform public.save_customer_campaign(a,oa,partial_id,post_id,2,array[ca,cc]);
 perform public.confirm_customer_campaign(a,oa,partial_id,1,array['fr','es']);
 claimed:=public.claim_customer_campaign_email(a,oa,partial_id);
 perform public.finish_customer_campaign_email(a,partial_id,(claimed->>'customer_id')::uuid,(claimed->>'attempt_id')::uuid,'accepted');
 perform public.cancel_customer_campaign(a,oa,partial_id);
 perform pg_temp.campaign_assert((select count(*)=1 from public.business_customer_campaign_recipients where campaign_id=partial_id and status='accepted' and attempt_id=(claimed->>'attempt_id')::uuid),'cancellation preserves the attempted accepted recipient');
 perform pg_temp.campaign_assert((select count(*)=1 from public.business_customer_campaign_recipients where campaign_id=partial_id and status='skipped' and attempt_id is null),'cancellation skips only the unstarted recipient');
 perform public.save_customer_campaign(a,oa,cancel_id,post_id,2,array[ca]);
 perform public.cancel_customer_campaign(a,oa,cancel_id);
 perform pg_temp.campaign_assert((select bool_and(status='skipped' and attempt_id is null) from public.business_customer_campaign_recipients where campaign_id=cancel_id),'cancel before send has no attempt');
 perform pg_temp.campaign_reject(format('select public.claim_customer_campaign_email(%L,%L,%L)',a,oa,cancel_id),'CAMPAIGN_REVIEW_REQUIRED');
 perform public.save_customer_campaign(a,oa,consent_id,post_id,2,array[ca]);
 perform public.confirm_customer_campaign(a,oa,consent_id,1,array['fr']);
 perform public.unsubscribe_business_communications((select id from public.business_communication_preferences where salon_id=a and customer_id=ca),gen_random_uuid());
 result:=public.claim_customer_campaign_email(a,oa,consent_id);
 perform pg_temp.campaign_assert(result->>'skipped'='true' and (select outcome_code='consent_changed' and attempt_id is null from public.business_customer_campaign_recipients where campaign_id=consent_id),'fresh opt-out prevents provider reservation');
 perform public.save_customer_campaign(a,oa,stale_id,post_id,2,array[cc]);
 perform public.confirm_customer_campaign(a,oa,stale_id,1,array['es']);
 reset role;update public.styles set base_price=150 where id=sa;set local role service_role;
 result:=public.claim_customer_campaign_email(a,oa,stale_id);
 perform pg_temp.campaign_assert(result->>'skipped'='true' and (select outcome_code='source_changed' from public.business_customer_campaign_recipients where campaign_id=stale_id),'changed service facts cannot send approved old copy');
 reset role;
 perform pg_temp.campaign_assert(not has_table_privilege('authenticated','public.business_customer_campaigns','SELECT') and not has_table_privilege('anon','public.business_customer_campaign_recipients','SELECT'),'private RLS tables');
 perform pg_temp.campaign_assert(not has_function_privilege('authenticated','public.claim_customer_campaign_email(uuid,uuid,uuid)','EXECUTE'),'client cannot call dispatch directly');
 raise notice 'Campaign181: real service_role scope, consent, review, cancellation, fresh source, ledger and no-retry assertions PASS';
end $$;
rollback;
