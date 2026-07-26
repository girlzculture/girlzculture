begin;

-- Forward-only publication of the founder-approved launch palette. Existing
-- assets, user content, and non-brand settings are untouched.
with launch_tokens(setting_key, token_value) as (
  values
    ('branding.primary_color', '"#0083A6"'::jsonb),
    ('branding.accent_color', '"#E0A34E"'::jsonb),
    ('branding.cta_color', '"#0083A6"'::jsonb),
    ('branding.page_background', '"#FFFFFF"'::jsonb),
    ('branding.card_background', '"#FFFFFF"'::jsonb),
    ('branding.header_background', '"#FFFFFF"'::jsonb),
    ('branding.footer_background', '"#0083A6"'::jsonb),
    ('branding.heading_color', '"#0D1114"'::jsonb),
    ('branding.body_color', '"#0D1114"'::jsonb),
    ('branding.muted_color', '"#52616A"'::jsonb),
    ('branding.link_color', '"#0083A6"'::jsonb),
    ('branding.success_color', '"#147D64"'::jsonb),
    ('branding.warning_color', '"#FF6868"'::jsonb),
    ('branding.error_color', '"#C83F4A"'::jsonb),
    ('branding.hover_color', '"#006B88"'::jsonb),
    ('branding.focus_color', '"#0083A6"'::jsonb),
    ('branding.disabled_color', '"#E6EAED"'::jsonb)
)
update public.engine_settings as setting
set draft_value=token.token_value,
    published_value=token.token_value,
    status='Published',
    version=greatest(coalesce(setting.version,0),coalesce(setting.published_version,0))+1,
    published_version=greatest(coalesce(setting.version,0),coalesce(setting.published_version,0))+1,
    updated_at=now()
from launch_tokens token
where setting.setting_key=token.setting_key
  and (setting.published_value is distinct from token.token_value
    or setting.draft_value is distinct from token.token_value);

commit;
