-- Safe brand binary handling metadata, enforced review state, and the
-- founder-editable Concept 3 starting theme.

begin;

alter table public.platform_brand_assets
  add column if not exists placement_description text not null default '',
  add column if not exists draft_reviewed_at timestamptz,
  add column if not exists draft_reviewed_by uuid references auth.users(id) on delete set null;

update public.platform_brand_assets
set placement_description = case asset_key
  when 'primary_header_logo' then 'Desktop and tablet public headers and primary navigation.'
  when 'mobile_logo' then 'Compact public mobile header and small-screen navigation.'
  when 'light_logo' then 'Dark public surfaces, dark footer, and dark campaign panels.'
  when 'dark_logo' then 'Light public surfaces, customer account, salon dashboard, and admin dashboard.'
  when 'email_logo' then 'Transactional email headers, booking messages, receipts, and support email.'
  when 'favicon' then 'Browser tabs and saved browser bookmarks.'
  when 'app_icon' then 'Installed PWA, mobile home screen, and supported app launch surfaces.'
  when 'social_share_image' then 'Open Graph and social-link previews when a page has no record-specific image.'
  else placement_description
end
where placement_description = '';

update storage.buckets
set allowed_mime_types = array[
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon'
]
where id = 'platform-brand-assets';

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,draft_value,
  published_value,status,version,published_version,impact_level,validation,
  help_text,impact_description,is_public,is_secret_status,sort_order,
  affected_surfaces
) values
('branding.accent_color','branding_design','Accent color','Secondary brand accent used for badges and supporting emphasis.','color','"#B88A44"','"#B88A44"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Concept 3 starts with Bronze.','Public, customer, salon, admin, email, and responsive previews.',true,false,20,array['Public site','Customer account','Salon dashboard','Admin dashboard','Email']),
('branding.page_background','branding_design','Page background','Default background behind platform pages.','color','"#FFF8F0"','"#FFF8F0"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Concept 3 starts with Cream.','All web surfaces and responsive previews.',true,false,30,array['Public site','Customer account','Salon dashboard','Admin dashboard']),
('branding.card_background','branding_design','Card background','Default elevated card and form-panel background.','color','"#FFF8F0"','"#FFF8F0"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Keep adequate separation from the page background.','Cards on public and authenticated surfaces.',true,false,40,array['Public site','Customer account','Salon dashboard','Admin dashboard']),
('branding.header_background','branding_design','Header background','Default platform header and navigation background.','color','"#FFF8F0"','"#FFF8F0"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Preview logo contrast before publishing.','Public, customer, salon, and admin headers.',true,false,50,array['Public site','Customer account','Salon dashboard','Admin dashboard']),
('branding.footer_background','branding_design','Footer background','Default dark footer and footer-callout background.','color','"#281F16"','"#281F16"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Concept 3 starts with Espresso.','Public footer and dark email footer surfaces.',true,false,60,array['Public site','Email']),
('branding.heading_color','branding_design','Heading color','Editorial heading and primary wordmark color.','color','"#281F16"','"#281F16"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Concept 3 starts with Espresso.','Headings across every platform surface.',true,false,70,array['Public site','Customer account','Salon dashboard','Admin dashboard','Email']),
('branding.body_color','branding_design','Body text color','Default readable body and control text.','color','"#281F16"','"#281F16"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Maintain WCAG contrast against page and card backgrounds.','Body copy and controls across every surface.',true,false,80,array['Public site','Customer account','Salon dashboard','Admin dashboard','Email']),
('branding.muted_color','branding_design','Muted text color','Supporting descriptions, labels, and metadata.','color','"#6B7A4E"','"#6B7A4E"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Concept 3 starts with Olive Green.','Supporting text on every platform surface.',true,false,90,array['Public site','Customer account','Salon dashboard','Admin dashboard','Email']),
('branding.link_color','branding_design','Link color','Text links and secondary interactive emphasis.','color','"#C65A3A"','"#C65A3A"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Concept 3 starts with Terracotta.','Links across public and authenticated surfaces.',true,false,100,array['Public site','Customer account','Salon dashboard','Admin dashboard']),
('branding.success_color','branding_design','Success color','Confirmed, completed, healthy, and successful states.','color','"#6B7A4E"','"#6B7A4E"','Published',1,1,'safety','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Do not rely on color alone to convey state.','Status states across dashboards, checkout, and email.',true,false,110,array['Public site','Customer account','Salon dashboard','Admin dashboard','Email']),
('branding.warning_color','branding_design','Warning color','Pending, caution, and attention-needed states.','color','"#B88A44"','"#B88A44"','Published',1,1,'safety','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Do not rely on color alone to convey state.','Status states across dashboards, checkout, and email.',true,false,120,array['Public site','Customer account','Salon dashboard','Admin dashboard','Email']),
('branding.error_color','branding_design','Error color','Validation, failed, cancelled, and destructive states.','color','"#C65A3A"','"#C65A3A"','Published',1,1,'safety','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Do not rely on color alone to convey state.','Validation and error states across every surface.',true,false,130,array['Public site','Customer account','Salon dashboard','Admin dashboard','Email']),
('branding.hover_color','branding_design','Hover color','Pointer-hover state for primary interactive controls.','color','"#A9472F"','"#A9472F"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Keep text contrast readable.','Desktop and pointer-enabled controls.',true,false,140,array['Public site','Customer account','Salon dashboard','Admin dashboard']),
('branding.focus_color','branding_design','Focus color','Keyboard focus ring and active accessibility outline.','color','"#D4AF37"','"#D4AF37"','Published',1,1,'safety','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Never remove visible keyboard focus.','Keyboard-accessible controls across every surface.',true,false,150,array['Public site','Customer account','Salon dashboard','Admin dashboard']),
('branding.disabled_color','branding_design','Disabled color','Unavailable and disabled control background.','color','"#E7D7C1"','"#E7D7C1"','Published',1,1,'customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Disabled controls also retain native disabled semantics.','Disabled controls across every web surface.',true,false,160,array['Public site','Customer account','Salon dashboard','Admin dashboard']),
('branding.heading_font','branding_design','Heading font','Editorial heading and wordmark font family.','text','"Playfair Display"','"Playfair Display"','Published',1,1,'customer','{"allowed":["Playfair Display","Fraunces","Georgia"]}','Only approved, bundled font families may be published.','Headings across public, customer, salon, admin, and email previews.',true,false,170,array['Public site','Customer account','Salon dashboard','Admin dashboard','Email']),
('branding.body_font','branding_design','Body font','Body copy, labels, forms, and user-interface font family.','text','"Montserrat"','"Montserrat"','Published',1,1,'customer','{"allowed":["Montserrat","Inter","Arial"]}','Only approved, bundled font families may be published.','Body and UI text across every platform surface.',true,false,180,array['Public site','Customer account','Salon dashboard','Admin dashboard','Email'])
on conflict(setting_key) do nothing;

-- Replace only the untouched legacy seed values. Founder-published custom
-- values are preserved exactly.
with changed as (
  update public.engine_settings
  set category = 'branding_design',
      draft_value = '"#C65A3A"'::jsonb,
      published_value = '"#C65A3A"'::jsonb,
      version = version + 1,
      published_version = version + 1,
      updated_at = now(),
      published_at = now(),
      affected_surfaces = array['Public site','Customer account','Salon dashboard','Admin dashboard','Email']
  where setting_key = 'branding.primary_color'
    and draft_value = '"#5B1A6B"'::jsonb
    and published_value = '"#5B1A6B"'::jsonb
  returning id,version,published_value
)
insert into public.engine_setting_versions(
  setting_id,version,action,value,previous_value,reason,environment
)
select id,version,'Published',published_value,'"#5B1A6B"'::jsonb,
  'Repository Concept 3 initial theme; untouched legacy seed only.','all'
from changed
on conflict(setting_id,version) do nothing;

with changed as (
  update public.engine_settings
  set category = 'branding_design',
      draft_value = '"#C65A3A"'::jsonb,
      published_value = '"#C65A3A"'::jsonb,
      version = version + 1,
      published_version = version + 1,
      updated_at = now(),
      published_at = now(),
      affected_surfaces = array['Public site','Customer account','Salon dashboard','Admin dashboard','Email']
  where setting_key = 'branding.cta_color'
    and draft_value = '"#D6186B"'::jsonb
    and published_value = '"#D6186B"'::jsonb
  returning id,version,published_value
)
insert into public.engine_setting_versions(
  setting_id,version,action,value,previous_value,reason,environment
)
select id,version,'Published',published_value,'"#D6186B"'::jsonb,
  'Repository Concept 3 initial theme; untouched legacy seed only.','all'
from changed
on conflict(setting_id,version) do nothing;

update public.engine_settings
set draft_value = '"20260724160000"'::jsonb,
    published_value = '"20260724160000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

commit;
