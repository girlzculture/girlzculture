-- Disposable clean database only. All application fixtures roll back.
begin;
select set_config('p0.assertions','0',true);
create function pg_temp.p0_assert(ok boolean,label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'P0 assertion failed: %',label; end if;
  perform set_config('p0.assertions',(current_setting('p0.assertions')::int+1)::text,true);
end $$;
create function pg_temp.p0_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin execute command;
  exception when others then if position(expected in sqlerrm)>0 then rejected:=true; else raise; end if; end;
  perform pg_temp.p0_assert(rejected,expected);
end $$;
do $$
#variable_conflict error
declare
  actor_a uuid:=gen_random_uuid(); actor_b uuid:=gen_random_uuid(); business_a uuid:=gen_random_uuid(); business_b uuid:=gen_random_uuid();
  customer_a uuid:=gen_random_uuid(); team_a uuid:=gen_random_uuid();
  revision_a uuid; revision_b uuid; service_a uuid:=gen_random_uuid(); booking_a uuid:=gen_random_uuid(); message_a uuid;
  booking_during_payment uuid:=gen_random_uuid();
  combined_intent uuid; checkout_intent uuid; combined_booking uuid; fixture_session text;
  service_request uuid:=gen_random_uuid(); availability_request uuid:=gen_random_uuid(); policy_request uuid:=gen_random_uuid(); read_request uuid:=gen_random_uuid();
  catalog public.master_styles%rowtype; proposal jsonb; saved_service uuid;
  request_a uuid:=gen_random_uuid(); request_b uuid:=gen_random_uuid(); request_c uuid:=gen_random_uuid(); result jsonb;
  policy_a jsonb:='{"cancellation_hours":24,"rescheduling_hours":24,"grace_minutes":15,"no_show":"contact_business","late_arrival":"contact_business","deposit_treatment":"platform_rules","balance_due":"after_service","satisfaction":"contact_business","preparation":"","guests":"ask_first","children":"ask_first","walk_ins":"ask_first","notes":"Fixture original policy"}';
begin
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)
    values(actor_a,'p0-a@example.test','',now(),'{"role":"salon_owner"}'),(actor_b,'p0-b@example.test','',now(),'{"role":"salon_owner"}'),
      (customer_a,'p0-customer@example.test','',now(),'{"role":"customer"}'),(team_a,'p0-team@example.test','',now(),'{"role":"salon_staff"}');
  insert into public.customers(id,name,email) values(customer_a,'P0 Customer','p0-customer@example.test');
  insert into public.salons(id,user_id,name,slug,email,status,subscription_status,description)
    values(business_a,actor_a,'P0 Business A','p0-business-a','p0-a@example.test','Active','active','Original description'),
      (business_b,actor_b,'P0 Business B','p0-business-b','p0-b@example.test','Active','active','B private description');
  insert into public.salon_team_members(salon_id,user_id,email,name,status,permissions)
    values(business_a,team_a,'p0-team@example.test','P0 Team','Active','{"bookings":true}');
  perform pg_temp.p0_assert(public.p0_actor_has_permission(business_a,actor_a,'my_page'),'owner permission');
  perform pg_temp.p0_assert(not public.p0_actor_has_permission(business_b,actor_a,'my_page'),'tenant isolation');
  perform pg_temp.p0_assert(not has_function_privilege('authenticated','public.confirm_gc_assistant_request(uuid,uuid,uuid,text)','execute'),'no direct authenticated mutation RPC');
  perform pg_temp.p0_assert(not has_table_privilege('authenticated','public.gc_assistant_requests','insert,update,delete'),'no model/client proposal writes');
  insert into public.business_policy_revisions(salon_id,policy,source_locale,created_by) values(business_a,policy_a,'en',actor_a) returning id into revision_a;
  perform pg_temp.p0_reject(format('select public.publish_business_policy(%L,%L,%L,null)',business_a,actor_b,revision_a),'FORBIDDEN');
  result:=public.publish_business_policy(business_a,actor_a,revision_a,null);
  perform pg_temp.p0_assert(result->>'version'='1','first policy version');
  result:=public.publish_business_policy(business_a,actor_a,revision_a,null);
  perform pg_temp.p0_assert(result->>'version'='1','policy publication retry');
  perform pg_temp.p0_reject(format('update public.business_policy_revisions set policy=%L::jsonb where id=%L','{}',revision_a),'PUBLISHED_POLICY_IMMUTABLE');

  insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max)
    select service_a,business_a,g.id,'P0 Fixture Service',1,1,100,100,100 from public.service_groups g where g.is_active and g.archived_at is null order by g.sort_order,g.name limit 1;
  insert into public.bookings(id,customer_id,salon_id,style_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,guest_name,guest_email)
    values(booking_a,customer_a,business_a,service_a,now()+interval '10 days',1,100,10,90,'Paid','Confirmed','P0 Customer','p0-customer@example.test');
  perform pg_temp.p0_assert((select business_policy_snapshot=policy_a and business_policy_version=1 and business_policy_revision_id=revision_a from public.bookings where id=booking_a),'exact booking snapshot');
  perform pg_temp.p0_assert((select count(*)=1 from public.booking_conversation_events where booking_id=booking_a),'one automatic conversation event');
  perform pg_temp.p0_assert((select facts->>'customer_name'='P0 Customer' and facts->>'business_name'='P0 Business A' and facts->>'reference' is not null and facts->>'time_zone' is not null from public.booking_conversation_events where booking_id=booking_a),'authoritative welcome facts');
  insert into public.business_policy_revisions(salon_id,policy,source_locale,created_by) values(business_a,policy_a||'{"cancellation_hours":48}','en',actor_a) returning id into revision_b;
  perform public.publish_business_policy(business_a,actor_a,revision_b,revision_a);
  perform pg_temp.p0_assert((select business_policy_snapshot=policy_a and business_policy_version=1 from public.bookings where id=booking_a),'future policy does not rewrite booking');
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into public.bookings(id,salon_id,style_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,guest_name,guest_email,business_policy_revision_id,business_policy_captured_at)
    values(booking_during_payment,business_a,service_a,now()+interval '11 days',1,100,10,90,'Paid','Confirmed','P0 Payment Customer','p0-payment@example.test',revision_a,now()-interval '2 minutes');
  perform pg_temp.p0_assert((select business_policy_snapshot=policy_a and business_policy_version=1 from public.bookings where id=booking_during_payment),'policy changed during payment preserves accepted version');
  -- Execute the existing combined checkout finalizer, including its no-charge
  -- path. Synthetic payment metadata stays inside this rolled-back database.
  foreach fixture_session in array array['cs_p0_fixture',null::text] loop
    checkout_intent:=gen_random_uuid(); combined_intent:=gen_random_uuid();
    insert into public.booking_checkout_intents(id,salon_id,style_id,payload,total_amount,deposit_amount,stripe_checkout_session_id)
      values(checkout_intent,business_a,service_a,jsonb_build_object('salon_id',business_a,'style_id',service_a,'appointment_datetime',now()+case when fixture_session is null then interval '16 days' else interval '15 days' end,'duration_hours',1,'buffer_minutes',0,'estimated_total',100,'deposit_amount',0,'balance_due',100,'business_policy_revision_id',revision_a,'business_policy_captured_at',now()-interval '2 minutes'),100,0,fixture_session);
    insert into public.commerce_checkout_intents(id,salon_id,guest_name,guest_email,fulfillment_method,booking_intent_id,idempotency_key)
      values(combined_intent,business_a,'P0 Combined Customer','p0-combined@example.test','Pickup',checkout_intent,combined_intent::text);
    result:=public.complete_combined_checkout(combined_intent,jsonb_build_object('checkout_session_id',fixture_session,'payment_mode','test'));
    combined_booking:=(result->>'booking_id')::uuid;
    perform pg_temp.p0_assert((select business_policy_version=1 and business_policy_snapshot=policy_a from public.bookings where id=combined_booking),'combined checkout preserves reviewed policy, session='||coalesce(fixture_session,'no charge'));
    perform pg_temp.p0_assert((select count(*)=1 from public.booking_conversation_events where booking_id=combined_booking),'combined checkout opens one conversation');
    result:=public.complete_combined_checkout(combined_intent,'{}');
    perform pg_temp.p0_assert(result->>'already_completed'='true','combined checkout retry is idempotent');
  end loop;
  perform set_config('request.jwt.claim.role','anon',true);
  perform pg_temp.p0_reject(format('update public.bookings set business_policy_snapshot=%L::jsonb where id=%L','{}',booking_a),'BOOKING_POLICY_SNAPSHOT_IMMUTABLE');

  insert into public.gc_assistant_requests(id,salon_id,requested_by,locale,tool,arguments,risk_class,permission,digest,before_summary)
    values(request_a,business_a,actor_a,'en','prepare_business_profile_update','{"field":"description","text":"Reviewed new description","hours":null}',4,'my_page',repeat('a',64),'{"description":"Original description"}');
  perform pg_temp.p0_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',request_a,business_b,actor_b,repeat('a',64)),'ASSISTANT_REQUEST_NOT_FOUND');
  perform pg_temp.p0_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',request_a,business_a,actor_a,repeat('b',64)),'ASSISTANT_PREVIEW_STALE');
  result:=public.confirm_gc_assistant_request(request_a,business_a,actor_a,repeat('a',64));
  perform pg_temp.p0_assert(result->>'verified'='true' and result->>'replayed'='false','confirmed deterministic write');
  perform pg_temp.p0_assert((select description='Reviewed new description' from public.salons where id=business_a),'authoritative profile persisted');
  result:=public.confirm_gc_assistant_request(request_a,business_a,actor_a,repeat('a',64));
  perform pg_temp.p0_assert(result->>'replayed'='true','idempotent confirmation');
  perform pg_temp.p0_assert((select count(*)=1 from public.gc_assistant_audit where request_id=request_a and event='confirmed'),'one confirmation audit');
  perform pg_temp.p0_assert((select description='B private description' from public.salons where id=business_b),'other tenant unchanged');

  insert into public.gc_assistant_requests(id,salon_id,requested_by,locale,tool,arguments,risk_class,permission,digest,before_summary)
    values(request_b,business_a,actor_a,'en','prepare_business_profile_update','{"field":"description","text":"Must not save","hours":null}',4,'my_page',repeat('b',64),'{"description":"Original description"}');
  result:=public.confirm_gc_assistant_request(request_b,business_a,actor_a,repeat('b',64));
  perform pg_temp.p0_assert(result->>'verified'='false' and result->>'code'='ASSISTANT_PREVIEW_STALE','concurrent editor invalidates preview');
  perform pg_temp.p0_assert((select count(*)=1 from public.gc_assistant_audit where request_id=request_b and event='failed'),'safe failure audit');
  update public.platform_identities set status='Disabled' where user_id=actor_a;
  perform pg_temp.p0_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',request_a,business_a,actor_a,repeat('a',64)),'ASSISTANT_ACCESS_DENIED');
  update public.platform_identities set status='Active' where user_id=actor_a;

  insert into public.gc_assistant_requests(id,salon_id,requested_by,locale,tool,arguments,risk_class,permission,digest,before_summary)
    select request_c,business_a,actor_a,'fr','prepare_customer_message',jsonb_build_object('booking_id',booking_a,'body',E'  Original message\nReference GC123; $180  '),4,'bookings',repeat('c',64),jsonb_build_object('id',b.id,'status',b.status,'appointment_datetime',b.appointment_datetime) from public.bookings b where b.id=booking_a;
  result:=public.confirm_gc_assistant_request(request_c,business_a,actor_a,repeat('c',64));
  perform pg_temp.p0_assert(result->>'verified'='true','message deterministic write');
  perform public.confirm_gc_assistant_request(request_c,business_a,actor_a,repeat('c',64));
  select id into message_a from public.booking_messages where client_request_id=request_c;
  perform pg_temp.p0_assert((select count(*)=1 from public.booking_messages where client_request_id=request_c),'message retry cannot duplicate');
  perform pg_temp.p0_assert((select body=E'  Original message\nReference GC123; $180  ' and original_body=body and source_locale='fr' from public.booking_messages where id=message_a),'original message preserved exactly');
  perform pg_temp.p0_reject(format('update public.booking_messages set original_body=%L where id=%L','Rewritten',message_a),'MESSAGE_SOURCE_IMMUTABLE');
  perform pg_temp.p0_reject(format('update public.booking_conversation_events set facts=%L::jsonb where booking_id=%L','{}',booking_a),'BOOKING_EVENT_IMMUTABLE');

  proposal:=jsonb_build_object('id',read_request,'salon_id',business_a,'requested_by',actor_a,'locale','zh-CN','tool','get_business_profile','arguments','{}'::jsonb,'execution_payload','{}'::jsonb,'risk_class',1,'permission','my_page','digest',repeat('d',64),'before_summary','{}'::jsonb,'result',jsonb_build_object('description','Reviewed new description'));
  perform public.save_gc_assistant_request(proposal,'[]');
  perform public.save_gc_assistant_request(proposal,'[]');
  perform pg_temp.p0_assert((select count(*)=1 from public.gc_assistant_audit where request_id=read_request and event='read'),'atomic read audit replay');
  perform pg_temp.p0_reject(format('select public.save_gc_assistant_request(%L::jsonb,%L::jsonb)',proposal||'{"locale":"fr"}','[]'),'ASSISTANT_IDEMPOTENCY_CONFLICT');

  perform set_config('request.jwt.claim.role','service_role',true);
  select * into catalog from public.master_styles where is_active and service_group_id is not null order by name limit 1;
  perform pg_temp.p0_assert(catalog.id is not null,'existing active catalog available');
  proposal:=jsonb_build_object('id',service_request,'salon_id',business_a,'requested_by',actor_a,'locale','fr','tool','prepare_service','arguments',jsonb_build_object('master_style_id',catalog.id,'name','P0 Assistant Service','price',180,'duration_hours',4,'requested_deposit',null,'length_addons','[{"name":"Waist length","price":40}]'::jsonb),'execution_payload',jsonb_build_object('master_style_id',null,'category',catalog.category,'category_id',catalog.category_id,'service_group_id',catalog.service_group_id,'name','P0 Assistant Service','base_price',180,'price_display_min',180,'price_display_max',180,'duration_min_hours',4,'duration_max_hours',4,'length_options','[{"value":"Waist","label":"Waist","price_add":40}]'::jsonb,'is_draft',true),'risk_class',3,'permission','styles','digest',repeat('e',64),'before_summary','{}'::jsonb,'result',null);
  perform public.save_gc_assistant_request(proposal,'[]');
  perform pg_temp.p0_assert(not exists(select 1 from public.styles where salon_id=business_a and name='P0 Assistant Service'),'service preview has no business mutation');
  result:=public.confirm_gc_assistant_request(service_request,business_a,actor_a,repeat('e',64));
  perform pg_temp.p0_assert(result->>'verified'='true','service uses existing authoritative save RPC');
  saved_service:=(result#>>'{result,record,id}')::uuid;
  perform pg_temp.p0_assert((select is_draft and base_price=180 and length_options->0->>'price_add'='40' and duration_min_hours=4 from public.styles where id=saved_service),'service draft and price add-on persisted');
  perform public.confirm_gc_assistant_request(service_request,business_a,actor_a,repeat('e',64));
  perform pg_temp.p0_assert((select count(*)=1 from public.styles where salon_id=business_a and name='P0 Assistant Service'),'service confirmation cannot duplicate');

  proposal:=jsonb_build_object('id',availability_request,'salon_id',business_a,'requested_by',actor_a,'locale','wo','tool','prepare_availability_block','arguments',jsonb_build_object('start',now()+interval '20 days','end',now()+interval '20 days 2 hours','time_zone',(select time_zone from public.salons where id=business_a),'stylist_id',null,'reason','P0 personal appointment'),'execution_payload','{}'::jsonb,'risk_class',3,'permission','availability','digest',repeat('f',64),'before_summary','{}'::jsonb,'result',null);
  perform public.save_gc_assistant_request(proposal,'[]');
  result:=public.confirm_gc_assistant_request(availability_request,business_a,actor_a,repeat('f',64));
  perform pg_temp.p0_assert(result->>'verified'='true','availability uses existing override RPC');
  perform pg_temp.p0_assert((select count(*)=1 from public.salon_blockouts where salon_id=business_a and starts_at=now()+interval '20 days' and ends_at=now()+interval '20 days 2 hours'),'availability exact preview range persisted');

  proposal:=jsonb_build_object('id',policy_request,'salon_id',business_a,'requested_by',actor_a,'locale','es','tool','prepare_business_policy_update','arguments',jsonb_build_object('policy',policy_a||'{"grace_minutes":20}'),'execution_payload','{}'::jsonb,'risk_class',4,'permission','my_page','digest',repeat('1',64),'before_summary',jsonb_build_object('revision_id',revision_b),'result',null);
  perform public.save_gc_assistant_request(proposal,'[]');
  result:=public.confirm_gc_assistant_request(policy_request,business_a,actor_a,repeat('1',64));
  perform pg_temp.p0_assert(result->>'verified'='true' and result#>>'{result,version}'='3','Assistant policy publishes a real next version');
  perform pg_temp.p0_assert((select business_policy_snapshot=policy_a and business_policy_version=1 from public.bookings where id=booking_a),'Assistant policy cannot rewrite old booking evidence');

  perform pg_temp.p0_assert((select count(*)=1 from public.notifications where user_id=customer_a and metadata->>'message_id'=message_a::text),'one in-app notification for the actual customer');
  perform pg_temp.p0_assert(public.claim_booking_message_translation(message_a,'fr'),'first translation job claims a bounded lease');
  perform pg_temp.p0_assert(not public.claim_booking_message_translation(message_a,'fr'),'duplicate translation job cannot spend twice');
  update public.booking_message_translation_jobs set retry_after=now()-interval '1 second' where message_id=message_a and locale='fr';
  perform pg_temp.p0_assert(public.claim_booking_message_translation(message_a,'fr'),'expired translation job can retry');
  insert into public.booking_message_translations(message_id,locale,translated_body,source_hash,provider)
    values(message_a,'fr','Texte traduit — GC123; $180',repeat('a',64),'local-fixture');
  perform pg_temp.p0_assert(not public.claim_booking_message_translation(message_a,'fr'),'cached translation does not spend again');

  -- Launch-enabled visibility uses the real publication diagnostic, including
  -- an explicit internal fixture override, and the existing test registry.
  -- Neither the flag nor a separate fake visibility function can hide a bug.
  insert into public.salon_applications(salon_id,user_id,business_name,owner_name,business_email,phone,street_address,city,state,zip_code,business_type,status,selected_plan,business_setup_type)
    values(business_b,actor_b,'P0 Business B','P0 Owner','p0-b@example.test','+13055550123','123 Fixture Street','Miami','FL','33101','Hair Salon','Approved','Growth','solo_professional');
  insert into public.salon_publication_overrides(salon_id,application_id,reason,overridden_gates,gate_snapshot,granted_by)
    select business_b,a.id,'Isolated local acceptance fixture only',
      (select jsonb_agg(key) from jsonb_each(public.salon_publication_diagnostic(business_b)->'checks')),
      public.salon_publication_diagnostic(business_b),actor_b
    from public.salon_applications a where a.salon_id=business_b;
  update public.salons set is_discoverable=true,accepting_bookings=true,status='Active',owner_unpublished_at=null where id=business_b;
  perform pg_temp.p0_assert(public.is_marketplace_visible(business_b),'launch-enabled genuine fixture is discoverable');
  with batch as (insert into public.test_data_batches(name,environment,created_by) values('P0 isolated marketplace verification','development',actor_b) returning id)
    insert into public.test_data_registry(batch_id,record_type,record_id,record_label,registered_by)
      select id,'salon',business_b::text,'P0 registered demonstration',actor_b from batch;
  perform pg_temp.p0_assert((public.salon_publication_diagnostic(business_b)->>'discovery_eligible')::boolean,'registered demo otherwise meets genuine publication criteria');
  perform pg_temp.p0_assert(not public.is_marketplace_visible(business_b),'registered demo is excluded even when eligible and launch enabled');

  -- Real database role switching exercises RLS, rather than calling only the
  -- permission helper as a superuser. No fixture data survives this transaction.
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',actor_b::text,true);
  execute 'set local role authenticated';
  perform pg_temp.p0_assert((select count(*)=0 from public.booking_messages where id=message_a),'other tenant cannot read original message through RLS');
  perform pg_temp.p0_assert((select count(*)=0 from public.booking_conversation_events where booking_id=booking_a),'other tenant cannot read welcome through RLS');
  perform pg_temp.p0_assert((select count(*)=0 from public.booking_message_translations where message_id=message_a),'other tenant cannot read cached translation through RLS');
  perform pg_temp.p0_assert((select count(*)=0 from public.gc_assistant_requests where id=request_a),'other tenant cannot read Assistant proposal through RLS');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',customer_a::text,true);
  execute 'set local role authenticated';
  perform pg_temp.p0_assert((select count(*)=1 from public.booking_messages where id=message_a),'booking customer can read original through RLS');
  perform pg_temp.p0_assert((select count(*)=1 from public.booking_message_translations where message_id=message_a),'booking customer can read cached display through RLS');
  perform pg_temp.p0_assert((select count(*)=0 from public.gc_assistant_requests where id=request_a),'customer cannot read owner Assistant history');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',team_a::text,true);
  execute 'set local role authenticated';
  perform pg_temp.p0_assert((select count(*)=1 from public.booking_messages where id=message_a),'active permitted team can read original through RLS');
  execute 'reset role';
  update public.salon_team_members set permissions='{}' where user_id=team_a;
  execute 'set local role authenticated';
  perform pg_temp.p0_assert((select count(*)=0 from public.booking_messages where id=message_a),'revoked team permission takes effect without new session');
  perform pg_temp.p0_assert((select count(*)=0 from public.booking_message_translations where message_id=message_a),'revoked team permission also closes translation cache');
  execute 'reset role';
end $$;
select current_setting('p0.assertions')::int as passed_p0_database_assertions;
rollback;
