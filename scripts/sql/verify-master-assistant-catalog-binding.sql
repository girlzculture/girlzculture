-- Disposable local database; all fictional records are rolled back.
begin;
do $$
declare actor uuid:=gen_random_uuid(); business uuid:=gen_random_uuid(); service uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid(); day date:=current_date+10; starts timestamptz; args jsonb; payload jsonb; result jsonb; v_booking uuid;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)
 values(actor,'catalog-binding@example.test','',now(),'{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,hours,time_zone)
 values(business,actor,'Catalog fixture','catalog-fixture-'||business,'catalog-binding@example.test','Active','active','Premium',(select jsonb_object_agg(d,'{"open":"09:00","close":"19:00","closed":false}'::jsonb) from unnest(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) d),'America/New_York');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,buffer_minutes,is_draft)
 select service,business,g.id,'Quick finish',0.5,0.5,50,15,false from public.service_groups g where g.is_active and g.archived_at is null order by g.name limit 1;
 perform set_config('request.jwt.claim.role','service_role',true);
 starts:=(day::text||' 15:30')::timestamp at time zone 'America/New_York';
 args:=jsonb_build_object('guest_name','Alma fixture','guest_email','','guest_phone','','style_id',null,'service_name','','duration_minutes',null,'stylist_id',null,'date',day,'time','15:30','source','walk_in','notes','');
 payload:=jsonb_build_object('appointment_datetime',starts,'duration_minutes',30,'buffer_minutes',15,'stylist_id',null,'service_name','Quick finish','time_zone','America/New_York','service_facts',(select jsonb_build_object('id',s.id,'name',s.name,'duration_min_hours',s.duration_min_hours,'duration_max_hours',s.duration_max_hours,'buffer_minutes',s.buffer_minutes,'is_draft',s.is_draft,'archived_at',s.archived_at) from public.styles s where s.id=service));
 perform public.save_gc_assistant_request(jsonb_build_object('id',request_id,'salon_id',business,'requested_by',actor,'locale','en','tool','prepare_manual_appointment','arguments',args,'execution_payload',payload,'before_summary','{}'::jsonb,'risk_class',3,'permission','bookings','digest',repeat('a',64)),'[]');
 if exists(select 1 from public.bookings where business_added_request_id=request_id)then raise exception 'Preview wrote booking';end if;
 result:=public.confirm_gc_assistant_request(request_id,business,actor,repeat('a',64));
 if result->>'verified' is distinct from 'true' then raise exception 'Confirmation failed: %',result;end if;
 v_booking:=(result->'result'->>'id')::uuid;
 if not exists(select 1 from public.bookings b where b.id=v_booking and b.style_id=service and b.appointment_datetime=starts and b.duration_hours=0.5 and b.buffer_minutes=15 and b.booking_origin='business_added' and b.customer_id is null and b.deposit_amount=0 and b.estimated_total=0)then raise exception 'Selected catalog service, exact time or manual boundary lost';end if;
 result:=public.confirm_gc_assistant_request(request_id,business,actor,repeat('a',64));
 if result->>'replayed' is distinct from 'true' or (select count(*) from public.bookings b where b.business_added_request_id=request_id)<>1 then raise exception 'Duplicate confirmation';end if;
 if has_function_privilege('authenticated','public.save_business_added_appointment(uuid,uuid,uuid,jsonb,jsonb,jsonb,text)','execute') then raise exception 'Public write exposed';end if;
 raise notice 'Master assistant catalog binding: 5 checks passed';
end $$;
rollback;
