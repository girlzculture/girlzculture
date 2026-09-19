-- Read-only registration remains service-audited; this transaction changes no data.
\set ON_ERROR_STOP on
begin;
do $$ declare definition text;begin
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if definition not like '%calculate_service_selection%' or definition not like '%get_booking_price_details%' or definition not like '%get_business_settings%' or definition not like '%prepare_booking_reschedule_proposal%' then raise exception '186 tool registration missing';end if;
 if has_function_privilege('anon','public.save_gc_assistant_request(jsonb,jsonb)','execute') or has_function_privilege('authenticated','public.save_gc_assistant_request(jsonb,jsonb)','execute') then raise exception '186 exposed service-only audit function';end if;
 if not has_function_privilege('service_role','public.save_gc_assistant_request(jsonb,jsonb)','execute') then raise exception '186 service audit unavailable';end if;
 if has_table_privilege('anon','public.gc_assistant_requests','insert') or has_table_privilege('authenticated','public.gc_assistant_requests','insert') then raise exception '186 broadened audit writes';end if;
end $$;
do $$ declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();read_id uuid:=gen_random_uuid();payload jsonb;saved jsonb;denied boolean;begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(oa,'money-read-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'money-read-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'money-read-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,time_zone) values(a,oa,'Money read A','money-read-a','money-read-a@example.test','Active','active','Premium','UTC'),(b,ob,'Money read B','money-read-b','money-read-b@example.test','Active','active','Premium','UTC');
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions) values(a,staff,'money-read-staff@example.test','Staff','Manager','Active','{"styles":true,"bookings":true}');
 payload:=jsonb_build_object('id',read_id,'salon_id',a,'requested_by',staff,'locale','fr','tool','calculate_service_selection','arguments','{}'::jsonb,'execution_payload','{}'::jsonb,'risk_class',1,'permission','styles','digest',repeat('a',64),'before_summary','{}'::jsonb,'result','{"subtotal_cents":10000}'::jsonb);
 perform set_config('request.jwt.claim.role','service_role',true);set local role service_role;
 saved:=public.save_gc_assistant_request(payload,'[]'::jsonb);
 if saved->>'tool'<>'calculate_service_selection' or saved->>'permission'<>'styles' or (saved->>'risk_class')::integer<>1 then raise exception '186 read audit did not preserve identity';end if;
 if (select count(*) from public.gc_assistant_audit where request_id=(payload->>'id')::uuid and event='read')<>1 then raise exception '186 read audit missing';end if;
 saved:=public.save_gc_assistant_request(payload||'{"result":{"subtotal_cents":20000}}'::jsonb,'[]'::jsonb);
 if saved->'result'->>'subtotal_cents'<>'20000' then raise exception '186 concurrent replay did not return fresh authorized read';end if;
 saved:=public.save_gc_assistant_request(payload||jsonb_build_object('id',gen_random_uuid(),'tool','get_booking_price_details','permission','bookings','arguments',jsonb_build_object('booking_id',gen_random_uuid())),'[]'::jsonb);
 if saved->>'tool'<>'get_booking_price_details' or (saved->>'risk_class')::integer<>1 then raise exception '186 booking read registration failed';end if;
 denied:=false;begin perform public.save_gc_assistant_request(payload||jsonb_build_object('id',gen_random_uuid(),'salon_id',b),'[]'::jsonb);exception when others then if sqlerrm like '%ASSISTANT_ACCESS_DENIED%' then denied:=true;else raise;end if;end;
 if not denied then raise exception '186 foreign business read audit accepted';end if;
 reset role;update public.salon_team_members set permissions='{}'::jsonb where salon_id=a and user_id=staff;
 set local role service_role;denied:=false;begin perform public.save_gc_assistant_request(payload,'[]'::jsonb);exception when others then if sqlerrm like '%ASSISTANT_ACCESS_DENIED%' then denied:=true;else raise;end if;end;
 if not denied then raise exception '186 revoked settings replay accepted';end if;
 reset role;
end $$;
rollback;
