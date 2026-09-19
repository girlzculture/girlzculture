-- Read-only registration remains service-audited; this transaction changes no data.
\set ON_ERROR_STOP on
begin;
do $$ declare definition text;begin
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if definition not like '%get_business_settings%' or definition not like '%get_business_profile%' or definition not like '%prepare_booking_reschedule_proposal%' then raise exception '185 tool registration missing';end if;
 if has_function_privilege('anon','public.save_gc_assistant_request(jsonb,jsonb)','execute') or has_function_privilege('authenticated','public.save_gc_assistant_request(jsonb,jsonb)','execute') then raise exception '185 exposed service-only audit function';end if;
 if not has_function_privilege('service_role','public.save_gc_assistant_request(jsonb,jsonb)','execute') then raise exception '185 service audit unavailable';end if;
 if has_table_privilege('anon','public.gc_assistant_requests','insert') or has_table_privilege('authenticated','public.gc_assistant_requests','insert') then raise exception '185 broadened audit writes';end if;
end $$;
do $$ declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();read_id uuid:=gen_random_uuid();payload jsonb;saved jsonb;denied boolean;begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(oa,'profile-read-a@example.test','',now(),'{"role":"salon_owner"}'),(ob,'profile-read-b@example.test','',now(),'{"role":"salon_owner"}'),(staff,'profile-read-staff@example.test','',now(),'{"role":"salon_team"}');
 update public.platform_identities set primary_role='salon_team' where user_id=staff;
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier,time_zone) values(a,oa,'Profile read A','profile-read-a','profile-read-a@example.test','Active','active','Premium','UTC'),(b,ob,'Profile read B','profile-read-b','profile-read-b@example.test','Active','active','Premium','UTC');
 insert into public.salon_team_members(salon_id,user_id,email,name,role,status,permissions) values(a,staff,'profile-read-staff@example.test','Staff','Manager','Active','{"settings":true}');
 payload:=jsonb_build_object('id',read_id,'salon_id',a,'requested_by',staff,'locale','fr','tool','get_business_settings','arguments','{}'::jsonb,'execution_payload','{}'::jsonb,'risk_class',1,'permission','settings','digest',repeat('a',64),'before_summary','{}'::jsonb,'result','{"saved_ui_locale":"fr"}'::jsonb);
 perform set_config('request.jwt.claim.role','service_role',true);set local role service_role;
 saved:=public.save_gc_assistant_request(payload,'[]'::jsonb);
 if saved->>'tool'<>'get_business_settings' or saved->>'permission'<>'settings' or (saved->>'risk_class')::integer<>1 then raise exception '185 read audit did not preserve identity';end if;
 if (select count(*) from public.gc_assistant_audit where request_id=(payload->>'id')::uuid and event='read')<>1 then raise exception '185 read audit missing';end if;
 saved:=public.save_gc_assistant_request(payload||'{"result":{"saved_ui_locale":"es"}}'::jsonb,'[]'::jsonb);
 if saved->'result'->>'saved_ui_locale'<>'es' then raise exception '185 concurrent replay did not return fresh authorized read';end if;
 denied:=false;begin perform public.save_gc_assistant_request(payload||jsonb_build_object('id',gen_random_uuid(),'salon_id',b),'[]'::jsonb);exception when others then if sqlerrm like '%ASSISTANT_ACCESS_DENIED%' then denied:=true;else raise;end if;end;
 if not denied then raise exception '185 foreign business read audit accepted';end if;
 reset role;update public.salon_team_members set permissions='{}'::jsonb where salon_id=a and user_id=staff;
 set local role service_role;denied:=false;begin perform public.save_gc_assistant_request(payload,'[]'::jsonb);exception when others then if sqlerrm like '%ASSISTANT_ACCESS_DENIED%' then denied:=true;else raise;end if;end;
 if not denied then raise exception '185 revoked settings replay accepted';end if;
 reset role;
end $$;
rollback;
