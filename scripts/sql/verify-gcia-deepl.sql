-- Disposable CI database only. All fixtures and settings roll back.
begin;
create function pg_temp.gcia_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'GCIA assertion failed: %',label; end if; end $$;
create function pg_temp.gcia_reject(command text,expected text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin execute command;
  exception when others then if position(expected in sqlerrm)>0 then rejected:=true; else raise; end if; end;
  perform pg_temp.gcia_assert(rejected,expected);
end $$;
do $$
declare actor uuid:=gen_random_uuid(); reservation uuid; before_caps jsonb;
begin
  select jsonb_agg(jsonb_build_array(feature_key,monthly_budget_cents)) into before_caps
    from public.ai_automation_features where feature_key in ('gc_owner_assistant','beauty_concierge');
  insert into auth.users(id,email) values(actor,'gcia-quota@example.test');
  perform pg_temp.gcia_assert(not has_function_privilege('anon','public.reserve_deepl_translation_usage(uuid,integer,bigint,bigint)','execute'),'anonymous cannot reserve');
  perform pg_temp.gcia_assert(not has_function_privilege('authenticated','public.reserve_deepl_translation_usage(uuid,integer,bigint,bigint)','execute'),'authenticated clients cannot reserve');
  perform pg_temp.gcia_assert(has_function_privilege('service_role','public.reserve_deepl_translation_usage(uuid,integer,bigint,bigint)','execute'),'reviewed server can reserve');
  perform pg_temp.gcia_reject('update public.ai_automation_features set provider_key=''deepl'',model_key=''deepl-api-free'' where feature_key=''gc_owner_assistant''','ai_deepl_translation_only');
  perform pg_temp.gcia_reject('update public.ai_automation_features set provider_key=''deepl'',model_key=''paid'' where feature_key=''translation_drafts''','ai_deepl_translation_only');
  perform pg_temp.gcia_reject(format('select public.reserve_deepl_translation_usage(%L,100,0,500000)',actor),'DEEPL_ALLOWANCE_UNAVAILABLE');
  update public.ai_automation_features set is_enabled=true,provider_key='deepl',model_key='deepl-api-free',daily_request_limit=25 where feature_key='translation_drafts';
  update public.engine_settings set published_value='true' where setting_key='ai.emergency_kill_switch';
  perform pg_temp.gcia_reject(format('select public.reserve_deepl_translation_usage(%L,100,0,500000)',actor),'DEEPL_ALLOWANCE_UNAVAILABLE');
  update public.engine_settings set published_value='false' where setting_key='ai.emergency_kill_switch';
  perform pg_temp.gcia_reject('select public.reserve_deepl_translation_usage(null,100,0,500000)','DEEPL_ALLOWANCE_UNAVAILABLE');
  perform pg_temp.gcia_reject(format('select public.reserve_deepl_translation_usage(%L,0,0,500000)',actor),'DEEPL_ALLOWANCE_UNAVAILABLE');
  perform pg_temp.gcia_reject(format('select public.reserve_deepl_translation_usage(%L,100,499950,500000)',actor),'DEEPL_QUOTA_EXHAUSTED');
  reservation:=public.reserve_deepl_translation_usage(actor,100,0,500000);
  perform pg_temp.gcia_assert((select estimated_cost_cents=0 and input_units=100 and safe_error_code='RESERVED' from public.ai_usage_events where id=reservation),'reserve free characters before outbound call');
  update public.ai_usage_events set outcome='failed' where id=reservation;
  perform pg_temp.gcia_reject(format('select public.reserve_deepl_translation_usage(%L,1,0,100)',actor),'DEEPL_QUOTA_EXHAUSTED');
  perform public.reserve_deepl_translation_usage(actor,25,499950,500000);
  perform public.reserve_deepl_translation_usage(actor,25,499950,500000);
  perform pg_temp.gcia_reject(format('select public.reserve_deepl_translation_usage(%L,1,499950,500000)',actor),'DEEPL_QUOTA_EXHAUSTED');
  perform pg_temp.gcia_assert((select sum(input_units)=150 from public.ai_usage_events where requested_by=actor),'stale provider count cannot overwrite reservations');
  update public.ai_automation_features set daily_request_limit=1 where feature_key='translation_drafts';
  perform pg_temp.gcia_reject(format('select public.reserve_deepl_translation_usage(%L,1,0,500000)',actor),'DEEPL_RATE_LIMIT');
  perform pg_temp.gcia_assert(before_caps=(select jsonb_agg(jsonb_build_array(feature_key,monthly_budget_cents)) from public.ai_automation_features where feature_key in ('gc_owner_assistant','beauty_concierge')),'owner/customer caps preserved');
end $$;
select 'DeepL governance: 16 security, quota, stop, audit and budget assertions passed.';
rollback;
