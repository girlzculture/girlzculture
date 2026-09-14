begin;

-- Founder-approved first-production AI allowance: $50/month total, split into
-- two independent $25 caps. One feature cannot consume the other feature's
-- allowance. Both retain deterministic/manual fallbacks and the global kill
-- switch remains available for immediate shutdown.
do $$
declare
  changed_count integer;
begin
  update public.ai_automation_features
  set is_enabled = true,
      provider_key = 'openai',
      model_key = 'gpt-5.4-nano',
      approved_models = '["gpt-5.4-nano"]'::jsonb,
      human_review_required = case
        when feature_key = 'gc_owner_assistant' then true
        else false
      end,
      daily_request_limit = case
        when feature_key = 'beauty_concierge' then 500
        else 25
      end,
      monthly_budget_cents = 2500,
      timeout_ms = case
        when feature_key = 'beauty_concierge' then 8000
        else 15000
      end,
      fallback_behavior = 'deterministic',
      pii_policy = 'redact',
      moderation_required = true,
      updated_by = null,
      updated_at = now()
  where feature_key in ('beauty_concierge', 'gc_owner_assistant');

  get diagnostics changed_count = row_count;
  if changed_count <> 2 then
    raise exception 'AI_PILOT_FEATURE_INVENTORY_INCOMPLETE';
  end if;
end $$;

-- Reserve before provider work while holding the feature row lock. This is
-- the enforcement boundary for both daily request limits and monthly cost,
-- including simultaneous public Concierge requests.
create or replace function public.reserve_governed_ai_usage(
  p_feature text,
  p_user uuid,
  p_cost_cents numeric
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  f public.ai_automation_features%rowtype;
  used numeric;
  daily bigint;
  request_id uuid;
begin
  if p_feature not in ('beauty_concierge', 'gc_owner_assistant', 'translation_drafts') then
    raise exception 'ASSISTANT_UNAVAILABLE';
  end if;

  select * into f
  from public.ai_automation_features
  where feature_key = p_feature
  for update;

  if not found
    or not f.is_enabled
    or f.provider_key <> 'openai'
    or (p_feature <> 'beauty_concierge' and p_user is null)
    or p_cost_cents is null
    or p_cost_cents <= 0
    or p_cost_cents > 1000000
    or not exists (
      select 1
      from public.engine_settings
      where setting_key = 'ai.emergency_kill_switch'
        and published_value = 'false'::jsonb
    )
  then
    raise exception 'ASSISTANT_UNAVAILABLE';
  end if;

  select
    coalesce(sum(estimated_cost_cents), 0),
    count(*) filter (where created_at >= date_trunc('day', now()))
  into used, daily
  from public.ai_usage_events
  where feature_key = f.feature_key
    and created_at >= date_trunc('month', now());

  if used + p_cost_cents > f.monthly_budget_cents
    or daily >= f.daily_request_limit
    or (
      p_user is not null
      and (
        select count(*)
        from public.ai_usage_events
        where feature_key = f.feature_key
          and requested_by = p_user
          and created_at > now() - interval '1 minute'
      ) >= 12
    )
  then
    raise exception 'ASSISTANT_BUDGET_LIMIT';
  end if;

  insert into public.ai_usage_events(
    feature_key,
    provider_key,
    model_key,
    outcome,
    estimated_cost_cents,
    requested_by,
    safe_error_code
  ) values (
    f.feature_key,
    f.provider_key,
    f.model_key,
    'blocked',
    p_cost_cents,
    p_user,
    'RESERVED'
  ) returning id into request_id;

  return request_id;
end $$;

revoke all on function public.reserve_governed_ai_usage(text, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.reserve_governed_ai_usage(text, uuid, numeric)
  to service_role;

-- Enabling provider-backed features requires publishing the existing global
-- kill switch to false. Preserve the Engine version/audit contract so the
-- change remains visible and reversible in platform administration.
do $$
declare
  current_setting public.engine_settings%rowtype;
  next_version integer;
  previous_value jsonb;
begin
  select * into current_setting
  from public.engine_settings
  where setting_key = 'ai.emergency_kill_switch'
  for update;

  if not found then
    raise exception 'AI_KILL_SWITCH_SETTING_MISSING';
  end if;

  if current_setting.draft_value is distinct from 'false'::jsonb
    or current_setting.published_value is distinct from 'false'::jsonb
  then
    next_version := current_setting.version + 1;
    previous_value := current_setting.published_value;

    update public.engine_settings
    set draft_value = 'false'::jsonb,
        published_value = 'false'::jsonb,
        status = 'Published',
        version = next_version,
        published_version = next_version,
        updated_by = null,
        updated_at = now(),
        published_by = null,
        published_at = now()
    where id = current_setting.id;

    insert into public.engine_setting_versions(
      setting_id,
      version,
      action,
      value,
      previous_value,
      reason,
      environment,
      created_by
    ) values (
      current_setting.id,
      next_version,
      'Published',
      'false'::jsonb,
      previous_value,
      'Founder approved the $50 monthly AI pilot split equally across Beauty Concierge and GC Assistant.',
      'production',
      null
    );

    update public.engine_publication_state
    set revision = revision + 1,
        last_published_at = now(),
        last_published_by = null
    where singleton;
  end if;
end $$;

commit;
