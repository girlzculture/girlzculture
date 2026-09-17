begin;

-- Add translation-only API Free support. Existing providers, enablement,
-- owner/customer monetary caps and emergency-stop settings remain unchanged.
alter table public.ai_automation_features
  drop constraint ai_automation_features_provider_key_check;
alter table public.ai_automation_features
  add constraint ai_automation_features_provider_key_check
  check (provider_key in ('test','openai','anthropic','google','deepl'));
alter table public.ai_automation_features
  add constraint ai_deepl_translation_only
  check (provider_key <> 'deepl' or (feature_key = 'translation_drafts' and model_key = 'deepl-api-free'));

alter table public.ai_usage_events add column provider_baseline_units bigint not null default 0
  check (provider_baseline_units >= 0);

create function public.reserve_deepl_translation_usage(
  p_user uuid, p_characters integer, p_remote_count bigint, p_remote_limit bigint
) returns uuid
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare
  f public.ai_automation_features%rowtype;
  used bigint;
  daily bigint;
  baseline bigint;
  request_id uuid;
begin
  select * into f from public.ai_automation_features
    where feature_key = 'translation_drafts' for update;
  if not found or not f.is_enabled or f.provider_key <> 'deepl'
    or f.model_key <> 'deepl-api-free' or p_user is null
    or p_characters is null or p_characters <= 0 or p_characters > 128000
    or p_remote_count is null or p_remote_count < 0
    or p_remote_limit is null or p_remote_limit <= 0
    or not exists (select 1 from public.engine_settings
      where setting_key = 'ai.emergency_kill_switch' and published_value = 'false'::jsonb)
  then raise exception 'DEEPL_ALLOWANCE_UNAVAILABLE'; end if;

  select coalesce(sum(input_units),0), count(*) filter (where created_at >= date_trunc('day',now())), coalesce(max(provider_baseline_units),0)
    into used, daily, baseline from public.ai_usage_events
    where feature_key = f.feature_key and provider_key = 'deepl'
      and created_at >= date_trunc('month',now());
  -- Keep failed/uncertain reservations. Provider usage is near-real-time and
  -- may include use outside this app; the Free endpoint is the final quota cap.
  -- Carry the highest external-use baseline forward. A second simultaneous
  -- caller may have the same stale provider count; it must also count the
  -- first caller's newly committed reservation, not take max(remote,local).
  baseline := greatest(baseline,p_remote_count-used,0);
  if daily >= f.daily_request_limit
    or (select count(*) from public.ai_usage_events where feature_key=f.feature_key
      and requested_by=p_user and created_at>now()-interval '1 minute') >= 12
  then raise exception 'DEEPL_RATE_LIMIT'; end if;
  if baseline + used + p_characters > least(p_remote_limit,500000)
  then raise exception 'DEEPL_QUOTA_EXHAUSTED'; end if;
  insert into public.ai_usage_events(feature_key,provider_key,model_key,outcome,input_units,provider_baseline_units,estimated_cost_cents,requested_by,safe_error_code)
    values(f.feature_key,f.provider_key,f.model_key,'blocked',p_characters,baseline,0,p_user,'RESERVED')
    returning id into request_id;
  return request_id;
end $$;
revoke all on function public.reserve_deepl_translation_usage(uuid,integer,bigint,bigint) from public,anon,authenticated;
grant execute on function public.reserve_deepl_translation_usage(uuid,integer,bigint,bigint) to service_role;

update public.engine_settings set published_value='"20260916204952"'::jsonb,
  draft_value='"20260916204952"'::jsonb, updated_at=now() where setting_key='integrations.expected_migration';
commit;
