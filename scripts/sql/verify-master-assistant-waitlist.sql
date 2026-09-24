\set ON_ERROR_STOP on
begin;
create temporary table waitlist_assertions(label text);grant insert,select on waitlist_assertions to service_role;
create function pg_temp.wassert(ok boolean,label text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assistant waitlist: %',label;end if;insert into waitlist_assertions values(label);end $$;
create function pg_temp.wreject(command text,expected text)returns void language plpgsql as $$declare rejected boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.wassert(rejected,expected);end $$;
create function pg_temp.wdraft(b uuid,a uuid,request uuid,source uuid,professional uuid)returns jsonb language plpgsql as $$declare args jsonb;v jsonb;begin
 args:=jsonb_build_object('operation','waitlist_offer','record_id',request,'changes_json',jsonb_build_object('source_booking_id',source,'stylist_id',professional)::text);v:=public.preview_gc_business_operation(b,a,args);
 return public.save_gc_assistant_request(jsonb_build_object('id',gen_random_uuid(),'salon_id',b,'requested_by',a,'locale','en','tool','prepare_booking_progress','arguments',args,'execution_payload',(v->'payload')||jsonb_build_object('notification_copy',jsonb_build_object('title','Opening offer','body','Review this invitation. No booking or charge.')),'before_summary',v->'before','risk_class',4,'permission','bookings','digest',repeat('a',64)),'[]');
end $$;
create function pg_temp.wnotices() returns bigint language sql security definer set search_path=pg_catalog,public as $$ select count(*) from public.notifications $$;
do $$declare owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();customer_a uuid:=gen_random_uuid();customer_b uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();pa uuid:=gen_random_uuid();pb uuid:=gen_random_uuid();request_a uuid:=gen_random_uuid();request_b uuid:=gen_random_uuid();source_id uuid:=gen_random_uuid();at_time timestamptz:=date_trunc('hour',now()+interval '10 days');args jsonb;result jsonb;d jsonb;r jsonb;bookings_count bigint;notices_count bigint;begin
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
 perform set_config('request.jwt.claim.role','service_role',true);
 args:=jsonb_build_object('salon_id',a,'style_id',sa,'stylist_id',pa,'starts_after',at_time-interval '1 hour','starts_before',at_time+interval '1 hour','locale','es');
 result:=public.manage_appointment_waitlist(customer_a,'join',request_a,args);
 perform public.manage_appointment_waitlist(customer_b,'leave',request_a);
 perform public.manage_appointment_waitlist(customer_b,'join',request_b,args);
 insert into public.bookings(id,salon_id,style_id,stylist_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status)
 values(source_id,a,sa,pa,'Cancelled fixture',at_time,1,100,10,90,'Paid','Cancelled');

 select count(*) into bookings_count from public.bookings;
 select pg_temp.wnotices() into notices_count;
 set local role service_role;
 perform pg_temp.wreject(format('select pg_temp.wdraft(%L,%L,%L,%L,%L)',a,owner_b,request_a,source_id,pa),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.wreject(format('select pg_temp.wdraft(%L,%L,%L,%L,%L)',b,owner_b,request_a,source_id,pa),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.wreject(format('select pg_temp.wdraft(%L,%L,%L,%L,%L)',a,owner_a,request_a,source_id,pb),'ASSISTANT_PREVIEW_STALE');
 d:=pg_temp.wdraft(a,owner_a,request_a,source_id,pa);
 perform pg_temp.wassert(not exists(select 1 from public.appointment_waitlist_offers where request_id=request_a),'review cannot send an offer');
 perform pg_temp.wassert((pg_temp.wnotices()=notices_count),'review creates no notification');
 perform pg_temp.wreject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,owner_a,repeat('b',64)),'ASSISTANT_PREVIEW_STALE');
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,owner_a,repeat('a',64));perform pg_temp.wassert(r->'verified'='true','offer readback '||r::text);
 perform pg_temp.wassert((select count(*)=1 from public.appointment_waitlist_offers where request_id=request_a),'one canonical offer');
 perform pg_temp.wassert((select count(*)=bookings_count from public.bookings),'no appointment created');
 select pg_temp.wnotices() into notices_count;
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,owner_a,repeat('a',64));perform pg_temp.wassert(r->'replayed'='true','safe response-loss replay');
 perform pg_temp.wassert((pg_temp.wnotices()=notices_count),'replay no duplicate notification');
 perform pg_temp.wassert((select count(*)=1 from public.gc_assistant_audit where request_id=(d->>'id')::uuid and event='confirmed'),'one confirmed audit');
 d:=pg_temp.wdraft(a,owner_a,request_b,source_id,pa);
 reset role;
 update public.styles set base_price=150 where id=sa;
 set local role service_role;
 r:=public.confirm_gc_assistant_request((d->>'id')::uuid,a,owner_a,repeat('a',64));perform pg_temp.wassert(r->>'code'='ASSISTANT_PREVIEW_STALE','changed source invalidates confirmation');
 perform pg_temp.wassert(not exists(select 1 from public.appointment_waitlist_offers where request_id=request_b),'stale proposal sends nothing');
 d:=pg_temp.wdraft(a,owner_a,request_b,source_id,pa);
 reset role;update public.platform_identities set status='Disabled' where user_id=owner_a;set local role service_role;
 perform pg_temp.wreject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,owner_a,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
 reset role;update public.platform_identities set status='Active' where user_id=owner_a;update public.gc_assistant_requests set expires_at=now()-interval '1 minute' where id=(d->>'id')::uuid;set local role service_role;
 perform pg_temp.wreject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',d->>'id',a,owner_a,repeat('a',64)),'ASSISTANT_PREVIEW_EXPIRED');
 perform pg_temp.wassert(not has_function_privilege('authenticated','public.preview_gc_assistant_waitlist(uuid,uuid,jsonb)','execute'),'server-only proposal');
end $$;
select count(*) as passed_waitlist_assertions from waitlist_assertions;
rollback;
