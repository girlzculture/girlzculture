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
  actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); business uuid:=gen_random_uuid(); other_business uuid:=gen_random_uuid();
  service uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); manual uuid; result jsonb; args jsonb; payload jsonb; original jsonb;
  future_date date:=(now() at time zone 'America/New_York')::date+10; starts timestamptz; rev uuid; marketplace uuid:=gen_random_uuid();
  policy jsonb:='{"cancellation_hours":24,"rescheduling_hours":24,"grace_minutes":15,"no_show":"contact_business","late_arrival":"contact_business","deposit_treatment":"platform_rules","balance_due":"after_service","satisfaction":"contact_business","preparation":"","guests":"ask_first","children":"ask_first","walk_ins":"ask_first","notes":"","refund_satisfaction":"case_by_case","refund_terms":"Contact us within seven days about amounts handled directly by our business."}';
  baseline_count bigint; next_request uuid; record_id uuid; record_before jsonb; note_id uuid;
  draft_tool text; draft_permission text; draft_table text; draft_values jsonb; draft_id uuid; draft_args jsonb;
begin
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
    (actor,'ops-owner@example.test','',now(),'{"role":"salon_owner"}'),(other_actor,'ops-other@example.test','',now(),'{"role":"salon_owner"}');
  insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,hours,time_zone) values
    (business,actor,'Operational fixture','ops-fixture','ops-owner@example.test','Active','active','Gold',(select jsonb_object_agg(day,'{"open":"09:00","close":"19:00","closed":false}'::jsonb) from unnest(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) day),'America/New_York'),
    (other_business,other_actor,'Other operational fixture','ops-other','ops-other@example.test','Active','active','Gold','{}','America/New_York');
  insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max,buffer_minutes,is_draft)
    select service,business,g.id,'Medium knotless braids',1,1,100,100,100,15,false from public.service_groups g where g.is_active and g.archived_at is null order by g.sort_order,g.name limit 1;
  insert into public.business_policy_revisions(salon_id,policy,source_locale,created_by) values(business,policy,'en',actor) returning id into rev;
  perform public.publish_business_policy(business,actor,rev,null);
  perform set_config('request.jwt.claim.role','service_role',true);
  starts:=(future_date::text||' 13:00')::timestamp at time zone 'America/New_York';
  args:=jsonb_build_object('guest_name','Sheila','guest_email','sheila@example.test','guest_phone','','style_id',service,'service_name','','duration_minutes',null,'stylist_id',null,'date',future_date,'time','13:00','source','phone','notes','Owner-only preparation note');
  payload:=jsonb_build_object('appointment_datetime',starts,'duration_minutes',60,'buffer_minutes',15,'stylist_id',null,'service_name','Medium knotless braids','time_zone','America/New_York','service_facts',(select jsonb_build_object('id',s.id,'name',s.name,'duration_min_hours',s.duration_min_hours,'duration_max_hours',s.duration_max_hours,'buffer_minutes',s.buffer_minutes,'is_draft',s.is_draft,'archived_at',s.archived_at) from public.styles s where id=service));
  select total_bookings into baseline_count from public.platform_admin_overview_metrics();
  perform public.save_gc_assistant_request(jsonb_build_object('id',request_id,'salon_id',business,'requested_by',actor,'locale','en','tool','prepare_manual_appointment','arguments',args,'execution_payload',payload,'before_summary','{}'::jsonb,'risk_class',3,'permission','bookings','digest',repeat('a',64)),'[]');
  perform pg_temp.p0_assert(not exists(select 1 from public.bookings where business_added_request_id=request_id),'preview creates no appointment');
  result:=public.confirm_gc_assistant_request(request_id,business,actor,repeat('a',64));
  perform pg_temp.p0_assert(result->>'verified'='true','manual appointment confirmation: '||result::text);
  manual:=(result->'result'->>'id')::uuid;
  select to_jsonb(b) into original from public.bookings b where b.id=manual;
  perform pg_temp.p0_assert(original->>'booking_origin'='business_added' and original->>'source'='phone','immutable origin and acquisition source');
  perform pg_temp.p0_assert(original->>'business_added_by'=actor::text and original->>'created_at' is not null,'creator and timestamp');
  perform pg_temp.p0_assert(original->>'customer_id' is null,'no fabricated customer account');
  perform pg_temp.p0_assert(original->>'deposit_status'='Not collected by Girlz Culture' and (original->>'estimated_total')::numeric=0 and (original->>'deposit_amount')::numeric=0,'no marketplace GMV or payment');
  perform pg_temp.p0_assert((original->>'platform_fee')::numeric=0 and (original->>'net_amount_owed_salon')::numeric=0,'no commission or payout');
  perform pg_temp.p0_assert(original->>'business_policy_accepted_at' is null and original->>'platform_policy_accepted_at' is null and original->>'business_policy_acceptance_kind'='business_added_not_accepted','no false customer policy acceptance');
  perform pg_temp.p0_assert(original->>'business_policy_revision_id' is null and original->'business_policy_snapshot'='{}'::jsonb,'manual booking does not masquerade as accepted policy evidence');
  perform pg_temp.p0_assert(not exists(select 1 from public.booking_conversation_events where booking_id=manual),'no claimed customer chat join');
  perform pg_temp.p0_assert((select body='Owner-only preparation note' from public.owner_booking_notes where booking_id=manual),'private note saved separately');
  perform pg_temp.p0_assert(not has_table_privilege('anon','public.owner_booking_notes','select') and not has_table_privilege('authenticated','public.owner_booking_notes','insert'),'private notes no public or browser writes');
  perform pg_temp.p0_assert((select total_bookings=baseline_count from public.platform_admin_overview_metrics()),'manual source excluded from marketplace acquisition analytics');
  perform pg_temp.p0_assert((select blocked_until=starts+interval '75 minutes' and booking_window @> starts from public.bookings where id=manual),'manual appointment blocks real shared occupancy with buffer');
  result:=public.confirm_gc_assistant_request(request_id,business,actor,repeat('a',64));
  perform pg_temp.p0_assert(result->>'replayed'='true' and (select count(*)=1 from public.bookings where business_added_request_id=request_id),'confirmation retry cannot duplicate');
  perform pg_temp.p0_reject(format('select public.save_business_added_appointment(%L,%L,%L,%L::jsonb,%L::jsonb,%L::jsonb,%L)',business,other_actor,gen_random_uuid(),args,payload,'{}','prepare_manual_appointment'),'ASSISTANT_ACCESS_DENIED');
  perform pg_temp.p0_reject(format('select public.reserve_booking_checkout(%L,%L,null,null,%L,%L,1,15,%L::jsonb,100,10)',business,service,'marketplace-guest@example.test',starts,'{}'),'BOOKING_RESOURCE_CONFLICT');
  perform pg_temp.p0_reject(format('update public.bookings set booking_origin=%L where id=%L','marketplace',manual),'BOOKING_ORIGIN_IMMUTABLE');
  perform pg_temp.p0_reject(format('update public.bookings set deposit_amount=10,deposit_status=%L where id=%L','Paid',manual),'BUSINESS_APPOINTMENT_MARKETPLACE_CREDIT_FORBIDDEN');
  perform pg_temp.p0_reject(format('insert into public.booking_review_links(booking_id,token_hash,expires_at) values(%L,%L,now()+interval ''1 day'')',manual,'ops-token'),'BUSINESS_APPOINTMENT_REVIEW_INELIGIBLE');
  perform pg_temp.p0_assert(not has_function_privilege('authenticated','public.save_business_added_appointment(uuid,uuid,uuid,jsonb,jsonb,jsonb,text)','execute'),'no direct client manual write RPC');
  -- An overlapping confirmed proposal rolls back the attempted appointment and
  -- retains its failed audit without weakening the first reservation.
  next_request:=gen_random_uuid();
  perform public.save_gc_assistant_request(jsonb_build_object('id',next_request,'salon_id',business,'requested_by',actor,'locale','fr','tool','prepare_manual_appointment','arguments',args||'{"guest_email":"other@example.test"}','execution_payload',payload,'before_summary','{}'::jsonb,'risk_class',3,'permission','bookings','digest',repeat('b',64)),'[]');
  result:=public.confirm_gc_assistant_request(next_request,business,actor,repeat('b',64));
  perform pg_temp.p0_assert(result->>'verified'='false' and result->>'code'='ASSISTANT_AVAILABILITY_CONFLICT','overlap rejected atomically');
  perform pg_temp.p0_assert((select count(*)=1 from public.gc_assistant_audit audit where audit.request_id=next_request and event='failed'),'conflict audit retained');
  -- A later business policy revision must not replace marketplace acceptance.
  insert into public.bookings(id,salon_id,style_id,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,status,guest_name,guest_email,business_policy_revision_id,business_policy_captured_at,business_policy_accepted_at,business_policy_acceptance_kind,business_policy_acceptance_evidence,platform_policy_accepted_at)
    values(marketplace,business,service,starts+interval '1 day',1,100,0,100,'Confirmed','Maria','maria@example.test',rev,now(),now(),'guest',jsonb_build_object('channel','marketplace_checkout','guest_email','maria@example.test','acknowledgement_version','business-policy-v1'),now());
  perform pg_temp.p0_assert((select business_policy_snapshot=policy and business_policy_version=1 and business_policy_accepted_at is not null from public.bookings where id=marketplace),'exact refund-policy acceptance evidence');
  perform pg_temp.p0_reject(format('update public.bookings set business_policy_accepted_at=now()+interval ''1 day'' where id=%L',marketplace),'BOOKING_POLICY_ACCEPTANCE_IMMUTABLE');
  perform pg_temp.p0_reject(format('update public.bookings set business_policy_snapshot=%L::jsonb where id=%L','{}',marketplace),'BOOKING_POLICY_SNAPSHOT_IMMUTABLE');
  -- Normal message provenance is immutable alongside original content.
  insert into public.booking_messages(booking_id,salon_id,sender_user_id,sender_role,body,original_body,source_locale,source_locale_provenance) values(marketplace,business,actor,'salon','Bonjour Maria','Bonjour Maria','fr','sender_selected') returning id into record_id;
  perform pg_temp.p0_reject(format('update public.booking_messages set source_locale=%L where id=%L','en',record_id),'MESSAGE_SOURCE_IMMUTABLE');
  perform pg_temp.p0_reject(format('update public.booking_messages set source_locale_provenance=%L where id=%L','unknown',record_id),'MESSAGE_SOURCE_IMMUTABLE');
  -- Reschedule using the same durable booking ID; release the old occupancy.
  next_request:=gen_random_uuid();
  payload:=payload||jsonb_build_object('appointment_datetime',starts+interval '2 days');
  args:=jsonb_build_object('booking_id',manual,'date',future_date+2,'time','13:00','stylist_id',null);
  perform public.save_gc_assistant_request(jsonb_build_object('id',next_request,'salon_id',business,'requested_by',actor,'locale','es','tool','prepare_manual_reschedule','arguments',args,'execution_payload',payload,'before_summary',original,'risk_class',3,'permission','bookings','digest',repeat('c',64)),'[]');
  result:=public.confirm_gc_assistant_request(next_request,business,actor,repeat('c',64));
  perform pg_temp.p0_assert(result->>'verified'='true' and result->'result'->>'id'=manual::text,'manual reschedule retains identity: '||result::text);
  perform pg_temp.p0_assert((select not (booking_window @> starts) from public.bookings where id=manual),'old time released');
  select to_jsonb(b) into original from public.bookings b where id=manual;
  next_request:=gen_random_uuid();
  perform public.save_gc_assistant_request(jsonb_build_object('id',next_request,'salon_id',business,'requested_by',actor,'locale','wo','tool','prepare_manual_cancellation','arguments',jsonb_build_object('booking_id',manual,'reason','Customer called'),'execution_payload','{}'::jsonb,'before_summary',original,'risk_class',3,'permission','bookings','digest',repeat('d',64)),'[]');
  result:=public.confirm_gc_assistant_request(next_request,business,actor,repeat('d',64));
  perform pg_temp.p0_assert(result->>'verified'='true' and result->'result'->>'status'='Cancelled','manual cancellation without Stripe: '||result::text);
  perform pg_temp.p0_assert((select not is_active_booking and deposit_amount=0 from public.bookings where id=manual),'cancellation releases occupancy without refund');
  -- Legacy salon subscription flags cannot grant product/promotion capabilities.
  foreach draft_tool in array array['prepare_product_draft','prepare_promotion_draft'] loop
    draft_table:=case draft_tool when 'prepare_product_draft' then 'salon_products' else 'salon_promotions' end;
    payload:=jsonb_build_object('table',draft_table,'record_id',null,'values','{}'::jsonb);
    perform pg_temp.p0_reject(format('select public.save_owner_catalog_draft(%L,%L,%L,%L::jsonb,%L::jsonb)',business,actor,draft_tool,payload,'{}'),'ASSISTANT_PLAN_REQUIRED');
  end loop;
  insert into public.subscriptions(salon_id,tier,status,current_period_end) values(business,'Premium','active',now()+interval '30 days');
  -- Every new catalog action reaches the real atomic confirmation transaction.
  foreach draft_tool in array array['prepare_professional_draft','prepare_product_draft','prepare_promotion_draft'] loop
    next_request:=gen_random_uuid();
    draft_table:=case draft_tool when 'prepare_professional_draft' then 'stylists' when 'prepare_product_draft' then 'salon_products' else 'salon_promotions' end;
    draft_permission:=case draft_table when 'stylists' then 'stylists' when 'salon_products' then 'products' else 'promotions' end;
    draft_values:=case draft_table
      when 'stylists' then '{"name":"Danielle","bio":"Original biography","specialties":[],"years_experience":5,"is_active":false,"is_draft":true}'::jsonb
      when 'salon_products' then '{"name":"Conditioner","description":"Original product","price":25,"is_visible":false,"product_status":"Draft"}'::jsonb
      else jsonb_build_object('title','Autumn','public_headline','Autumn','description','Original offer','promotion_type','percentage','discount_value',10,'starts_at',now()+interval '2 days','ends_at',now()+interval '10 days','timezone','America/New_York','status','Draft','is_active',false,'target_scope','salon') end;
    payload:=jsonb_build_object('table',draft_table,'record_id',null,'values',draft_values);
    perform public.save_gc_assistant_request(jsonb_build_object('id',next_request,'salon_id',business,'requested_by',actor,'locale','zh-CN','tool',draft_tool,'arguments','{}'::jsonb,'execution_payload',payload,'before_summary','{}'::jsonb,'risk_class',3,'permission',draft_permission,'digest',repeat('e',64)),'[]');
    result:=public.confirm_gc_assistant_request(next_request,business,actor,repeat('e',64));
    perform pg_temp.p0_assert(result->>'verified'='true',draft_tool||' persists a draft: '||result::text);
    draft_id:=(result->'result'->>'id')::uuid;
    perform pg_temp.p0_assert(result->'result'->>'salon_id'=business::text and (result->'result'->>'is_draft'='true' or result->'result'->>'product_status'='Draft' or result->'result'->>'status'='Draft'),draft_tool||' has no publication');
    record_before:=result->'result';
    payload:=payload||jsonb_build_object('record_id',draft_id,'values',draft_values||case when draft_table='salon_promotions' then '{"title":"Edited"}'::jsonb else '{"name":"Edited"}'::jsonb end);
    result:=public.save_owner_catalog_draft(business,actor,draft_tool,payload,record_before);
    perform pg_temp.p0_assert(coalesce(result->>'name',result->>'title')='Edited',draft_tool||' edits same draft');
    perform pg_temp.p0_reject(format('select public.save_owner_catalog_draft(%L,%L,%L,%L::jsonb,%L::jsonb)',business,actor,draft_tool,payload,record_before),'ASSISTANT_PREVIEW_STALE');
    perform pg_temp.p0_reject(format('select public.save_owner_catalog_draft(%L,%L,%L,%L::jsonb,%L::jsonb)',business,other_actor,draft_tool,payload,result),'ASSISTANT_ACCESS_DENIED');
  end loop;
  -- Editing a service draft preserves its authoritative identity and materials.
  update public.styles set is_draft=true where id=service;
  select to_jsonb(st) into record_before from public.styles st where id=service;
  payload:=jsonb_build_object('table','styles','record_id',service,'values','{"name":"Edited braids","base_price":180,"price_display_min":180,"price_display_max":180,"duration_min_hours":2,"duration_max_hours":2,"buffer_minutes":15,"is_draft":true}'::jsonb);
  result:=public.save_owner_catalog_draft(business,actor,'prepare_service_edit',payload,record_before);
  perform pg_temp.p0_assert(result->>'id'=service::text and result->>'name'='Edited braids' and result->>'is_draft'='true','service edit reuses service transaction');
  -- New private notes follow the same preview and confirmation audit, never chat.
  next_request:=gen_random_uuid();
  select to_jsonb(b) into record_before from public.bookings b where id=manual;
  perform public.save_gc_assistant_request(jsonb_build_object('id',next_request,'salon_id',business,'requested_by',actor,'locale','en','tool','prepare_booking_note','arguments',jsonb_build_object('booking_id',manual,'note','Private follow-up'),'execution_payload','{}'::jsonb,'before_summary',record_before,'risk_class',3,'permission','bookings','digest',repeat('f',64)),'[]');
  result:=public.confirm_gc_assistant_request(next_request,business,actor,repeat('f',64));
  perform pg_temp.p0_assert(result->>'verified'='true' and (select count(*)=2 from public.owner_booking_notes where booking_id=manual),'private note is persisted once');
  perform pg_temp.p0_assert(not exists(select 1 from public.booking_messages where booking_id=manual),'private note never becomes a customer message');
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',other_actor::text,true);
  execute 'set local role authenticated';
  perform pg_temp.p0_assert((select count(*)=0 from public.owner_booking_notes where booking_id=manual),'other tenant cannot read private notes through RLS');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  perform pg_temp.p0_assert((select count(*)=2 from public.owner_booking_notes where booking_id=manual),'authorized owner can read private notes through RLS');
  execute 'reset role';
  perform pg_temp.p0_assert(public.p0_hours_window('"9:00 AM - 7:00 PM"'::jsonb)=public.p0_hours_window('{"open":"09:00","close":"19:00","closed":false}'::jsonb),'legacy and object business hours have equal meaning');
end $$;
select current_setting('p0.assertions')::integer as passed_operational_calendar_assertions;
rollback;
