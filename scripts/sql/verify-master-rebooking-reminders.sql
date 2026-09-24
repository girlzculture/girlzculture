begin;
create temporary table rebooking_assertions(label text);
grant insert,select on rebooking_assertions to service_role;
create function pg_temp.r_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Rebooking assertion: %',label;end if;insert into rebooking_assertions values(label);end $$;
create function pg_temp.r_reject(command text,expected text) returns void language plpgsql as $$declare rejected boolean:=false;begin begin execute command;exception when others then if sqlerrm=expected then rejected:=true;else raise;end if;end;perform pg_temp.r_assert(rejected,expected);end $$;
do $$
declare oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();ca uuid:=gen_random_uuid();cb uuid:=gen_random_uuid();cc uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();ba uuid:=gen_random_uuid();bb uuid:=gen_random_uuid();bc uuid:=gen_random_uuid();bg uuid:=gen_random_uuid();
 j jsonb;claim jsonb;plan text;rev integer:=0;future_id uuid:=gen_random_uuid();reference uuid:=gen_random_uuid();demo uuid:=gen_random_uuid();demo_owner uuid:=gen_random_uuid();
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
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions) values(a,staff,'campaign-staff@example.test','Campaign staff','Manager','Active','{"promotions":true,"bookings":true}');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max,is_draft)
 select sa,a,g.id,'Campaign service',1,1,100,100,100,false from public.service_groups g limit 1;
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,is_draft)
 select sb,b,g.id,'Foreign service',1,1,100,false from public.service_groups g limit 1;
 insert into public.bookings(id,salon_id,customer_id,style_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status) values
 (ba,a,ca,sa,'Own client A','campaign-client-a@example.test',now()-interval '60 days',1,100,10,90,'Paid','Completed'),
 (bb,b,cb,sb,'Foreign client','campaign-client-b@example.test',now()-interval '60 days',1,100,10,90,'Paid','Completed'),
 (bc,a,cc,sa,'Own client C','campaign-client-c@example.test',now()-interval '70 days',1,100,10,90,'Paid','Completed'),
 (bg,a,null,sa,'Booking-only guest','campaign-guest@example.test',now()-interval '3 days',1,100,10,90,'Paid','Completed');
 insert into public.business_communication_preferences(salon_id,customer_id,marketing,email_enabled,locale) values(a,ca,true,true,'fr'),(b,cb,true,true,'en'),(a,cc,true,true,'es');
 insert into public.business_communication_preferences(salon_id,guest_booking_id,marketing,email_enabled) values(a,bg,true,true);
 insert into public.salon_applications(salon_id,user_id,business_name,owner_name,business_email,phone,street_address,city,state,zip_code,business_type,status,selected_plan,business_setup_type)
 values(a,oa,'Campaign A','Owner A','campaign-owner-a@example.test','+13055550123','123 Fixture Street','Miami','FL','33101','Hair Salon','Approved','Premium','solo_professional');
 insert into public.salon_publication_overrides(salon_id,application_id,reason,overridden_gates,gate_snapshot,granted_by)
 select a,x.id,'Isolated local campaign fixture',(select jsonb_agg(key) from jsonb_each(public.salon_publication_diagnostic(a)->'checks')),public.salon_publication_diagnostic(a),oa from public.salon_applications x where salon_id=a;
 update public.salons set status='Active',is_discoverable=true,owner_unpublished_at=null where id=a;
 update public.engine_settings set published_value='["email"]' where setting_key='notifications.channels';
 insert into public.business_verification_locations(salon_id,address_street,address_city,address_state,address_zip,visit_status,visited_at,verified_by,visit_evidence) values(a,'1 Fixture Road','Fixture','NY','10001','verified',now()-interval '1 day',oa,'Disposable rebooking fixture visit only.');
 perform set_config('request.jwt.claim.role','service_role',true);
 set local role service_role;
 j:=public.read_business_rebooking_settings(a,oa);
 perform pg_temp.r_assert(j->>'enabled'='false' and j->>'revision'='0','defaults off without modifying consent');
 perform pg_temp.r_reject(format('select public.read_business_rebooking_settings(%L,%L)',a,ob),'REBOOKING_ACCESS_DENIED');
 perform pg_temp.r_reject(format('select public.read_business_rebooking_settings(%L,%L)',b,oa),'REBOOKING_ACCESS_DENIED');
 perform pg_temp.r_reject(format('select public.read_business_rebooking_settings(%L,%L)',a,staff),'REBOOKING_ACCESS_DENIED');
 perform pg_temp.r_reject(format('select public.save_business_rebooking_settings(%L,%L,0,true,42,1,array[]::uuid[],false)',a,oa),'REBOOKING_PLAN_REQUIRED');
 reset role;
 foreach plan in array array['Solo','Starter','Solo Pro','Growth','Premium'] loop
  update public.salons set subscription_tier=plan where id=a;
  set local role service_role;
  j:=public.read_business_rebooking_settings(a,oa);
  perform pg_temp.r_assert((j->>'automatic')::boolean=(plan in('Solo Pro','Growth','Premium')),plan||' actual entitlement');
  if plan in('Solo','Starter') then
   perform pg_temp.r_reject(format('select public.save_business_rebooking_settings(%L,%L,%s,true,42,1,array[]::uuid[],true)',a,oa,rev),'REBOOKING_PLAN_REQUIRED');
  else
   j:=public.save_business_rebooking_settings(a,oa,rev,true,42,1,'{}',true);rev:=rev+1;
   perform pg_temp.r_assert((j->>'revision')::integer=rev and j->>'effective_enabled'='true',plan||' enabled readback');
  end if;
  reset role;
 end loop;
 set local role service_role;
 perform pg_temp.r_reject(format('select public.save_business_rebooking_settings(%L,%L,%s,true,42,1,array[%L]::uuid[],true)',a,oa,rev,sb),'REBOOKING_INVALID');
 perform pg_temp.r_reject(format('select public.save_business_rebooking_settings(%L,%L,%s,true,1,1,array[]::uuid[],true)',a,oa,rev),'REBOOKING_INVALID');
 perform pg_temp.r_reject(format('select public.save_business_rebooking_settings(%L,%L,0,true,42,1,array[]::uuid[],true)',a,oa),'REBOOKING_STALE');
 perform pg_temp.r_assert(jsonb_array_length(public.due_business_rebooking_reminders())=2,'two own registered opted-in absent clients only');
 perform pg_temp.r_assert(public.due_business_rebooking_reminders()::text not like '%'||cb||'%' and public.due_business_rebooking_reminders()::text not like '%@%','no foreign identity or contact in due list');
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(a,cb,bb) is null,'foreign customer and booking cannot be claimed');
 j:=public.save_business_rebooking_settings(a,oa,rev,true,42,2,array[sa],true);rev:=rev+1;
 perform pg_temp.r_assert(public.due_business_rebooking_reminders()='[]'::jsonb,'segmentation uses own completed count');
 reset role;
 insert into public.bookings(salon_id,customer_id,style_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status)values(a,ca,sa,now()-interval '90 days',1,100,10,90,'Paid','Completed');
 set local role service_role;
 perform pg_temp.r_assert(jsonb_array_length(public.due_business_rebooking_reminders())=1,'premium returning-client and last-service segment');
 reset role;
 update public.salons set subscription_tier='Growth' where id=a;
 set local role service_role;
 perform pg_temp.r_assert(public.due_business_rebooking_reminders()='[]'::jsonb,'downgrade suspends previous premium segment');
 perform pg_temp.r_reject(format('select public.save_business_rebooking_settings(%L,%L,%s,true,42,2,array[]::uuid[],true)',a,oa,rev),'REBOOKING_PLAN_REQUIRED');
 j:=public.save_business_rebooking_settings(a,oa,rev,true,42,1,'{}',true);rev:=rev+1;
 reset role;
 update public.business_communication_preferences set marketing=false where salon_id=a and customer_id=ca;
 set local role service_role;
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(a,ca,ba) is null,'consent revoked after queue prevents send');
 reset role;
 update public.business_communication_preferences set marketing=true where salon_id=a and customer_id=ca;
 insert into public.business_communication_preferences(salon_id,guest_booking_id,marketing,email_enabled) values(a,ba,false,true);
 set local role service_role;
 perform pg_temp.r_assert(jsonb_array_length(public.due_business_rebooking_reminders())=1,'booking opt-out is excluded before worker limit');
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(a,ca,ba) is null,'booking-specific opt-out cannot be bypassed');
 reset role;
 delete from public.business_communication_preferences where salon_id=a and guest_booking_id=ba;
 update auth.users set email_confirmed_at=null where id=ca;
 set local role service_role;
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(a,ca,ba) is null,'unverified address cannot receive');
 reset role;
 update auth.users set email_confirmed_at=now() where id=ca;
 insert into public.bookings(id,salon_id,customer_id,style_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status)values(future_id,a,ca,sa,now()+interval '2 days',1,100,10,90,'Paid','Confirmed');
 set local role service_role;
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(a,ca,ba) is null,'new future own appointment prevents send');
 reset role;
 update public.bookings set status='Cancelled' where id=future_id;
 insert into public.bookings(salon_id,customer_id,style_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status)values(b,ca,sb,now()+interval '3 days',1,100,10,90,'Paid','Confirmed');
 update public.engine_settings set published_value='[]' where setting_key='notifications.channels';
 set local role service_role;
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(a,ca,ba) is null,'fresh channel availability checked');
 reset role;
 update public.engine_settings set published_value='["email"]' where setting_key='notifications.channels';
 update public.salons set subscription_tier='Starter' where id=a;
 set local role service_role;
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(a,ca,ba) is null,'plan downgrade between due and claim prevents send');
 reset role;
 update public.salons set subscription_tier='Growth' where id=a;
 set local role service_role;
 claim:=public.claim_business_rebooking_reminder(a,ca,ba);
 perform pg_temp.r_assert(claim->>'salon_id'=a::text and claim->>'destination'='campaign-client-a@example.test' and claim->>'locale'='fr','own claim succeeds regardless of other business appointments');
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(a,ca,ba) is null,'processing latch cannot be reclaimed');
 perform pg_temp.r_reject(format('select public.finish_business_rebooking_reminder(%L,%L,''accepted'',null)',b,claim->>'attempt_id'),'REBOOKING_ACCESS_DENIED');
 perform public.finish_business_rebooking_reminder(a,(claim->>'attempt_id')::uuid,'uncertain',reference);
 perform public.finish_business_rebooking_reminder(a,(claim->>'attempt_id')::uuid,'uncertain',reference);
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(a,ca,ba) is null,'uncertain outcome is not retried');
 j:=public.read_business_rebooking_settings(a,oa);
 perform pg_temp.r_assert(j->'attempts'->0->>'support_reference'=reference::text and j->'attempts'->0->>'status'='uncertain','exact protected incident visible without client details');
 perform pg_temp.r_assert(j::text not like '%campaign-client%' and j::text not like '%'||ca||'%','settings history omits customer identity and address');
 reset role;
 update gc_private.rebooking_attempts set attempted_at=now()-interval '40 days' where salon_id=a;
 set local role service_role;
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(a,ca,ba) is null,'old provider idempotency expiry does not reopen visit');
 j:=public.save_business_rebooking_settings(a,oa,rev,false,42,1,'{}',false);rev:=rev+1;
 perform pg_temp.r_assert(public.due_business_rebooking_reminders()='[]'::jsonb,'owner disabled automation takes effect immediately');
 reset role;
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)values(demo_owner,'rebooking@sample.invalid','',now(),'{"gc_demo":true}','{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,is_demo,status,subscription_status,subscription_tier)values(demo,demo_owner,'Sample','sample-rebooking','rebooking@sample.invalid',true,'Active','active','Premium');
 set local role service_role;
 perform pg_temp.r_reject(format('select public.save_business_rebooking_settings(%L,%L,0,true,42,1,array[]::uuid[],true)',demo,demo_owner),'REBOOKING_PLAN_REQUIRED');
 perform pg_temp.r_assert(public.claim_business_rebooking_reminder(demo,ca,ba) is null,'demo cannot enter provider delivery');
 reset role;
 perform pg_temp.r_assert(not has_function_privilege('authenticated','public.claim_business_rebooking_reminder(uuid,uuid,uuid)','execute'),'browser cannot claim provider send');
 perform pg_temp.r_assert(not has_function_privilege('service_role','gc_private.rebooking_candidates(uuid)','execute'),'raw candidate contacts unavailable through service API');
 perform pg_temp.r_assert(not has_table_privilege('authenticated','gc_private.rebooking_attempts','select'),'private delivery latch not browser-readable');
end $$;
select count(*)||' rebooking assertions passed' from rebooking_assertions;
rollback;
