begin;
do $$ declare definition text;begin
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if definition not like '%get_outstanding_balances%' or definition not like '%prepare_manual_service_sale%' or definition not like '%get_client_record%' then raise exception '179 tool registration missing';end if;
 if has_function_privilege('anon','public.save_gc_assistant_request(jsonb,jsonb)','execute') or has_function_privilege('authenticated','public.save_gc_assistant_request(jsonb,jsonb)','execute') then raise exception '179 exposed service-only audit function';end if;
 if not has_function_privilege('service_role','public.save_gc_assistant_request(jsonb,jsonb)','execute') then raise exception '179 service audit unavailable';end if;
 if has_table_privilege('anon','public.gc_assistant_requests','insert') or has_table_privilege('authenticated','public.gc_assistant_requests','insert') then raise exception '179 broadened audit writes';end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename='gc_assistant_requests' and roles::text ~ 'anon' and cmd in ('INSERT','ALL')) then raise exception '179 anonymous audit writes';end if;
end $$;
rollback;
