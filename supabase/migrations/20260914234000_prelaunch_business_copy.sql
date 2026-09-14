begin;

-- The founder-approved public language does not use a "founding business"
-- label. Keep the governed Engine value aligned with the server fallback.
with approved_copy as (
  select to_jsonb(
    'Girlz Culture is onboarding beauty and wellness businesses as we prepare to launch our marketplace. Submit your application to join now.'::text
  ) as value
)
update public.engine_settings as setting
set draft_value = approved_copy.value,
    published_value = approved_copy.value,
    status = 'Published',
    version = greatest(
      coalesce(setting.version, 0),
      coalesce(setting.published_version, 0)
    ) + 1,
    published_version = greatest(
      coalesce(setting.version, 0),
      coalesce(setting.published_version, 0)
    ) + 1,
    updated_at = now(),
    published_at = now()
from approved_copy
where setting.setting_key = 'marketplace.prelaunch_description'
  and setting.published_value is distinct from approved_copy.value;

update public.engine_settings
set published_value = '"20260914234000"'::jsonb,
    draft_value = '"20260914234000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

commit;
