begin;

-- Expand the locale registry from the launch set into a BCP-47 compatible,
-- administrator-managed registry. Locale values remain identifiers; translated
-- interface copy is versioned separately below.
alter table public.supported_locales drop constraint if exists supported_locales_locale_check;
alter table public.supported_locales
  add constraint supported_locales_locale_check
  check (locale ~ '^[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Z]{2}|[0-9]{3}))?$');
alter table public.supported_locales
  add column if not exists text_direction text not null default 'ltr'
    check (text_direction in ('ltr','rtl')),
  add column if not exists fallback_locale text,
  add column if not exists archived_at timestamptz;

insert into public.supported_locales(locale,display_name,native_name,intl_locale,is_enabled,is_default,sort_order,text_direction,fallback_locale) values
('en','English','English','en-US',true,true,10,'ltr',null),
('es','Spanish','Español','es-US',true,false,20,'ltr','en'),
('fr','French','Français','fr-FR',true,false,30,'ltr','en'),
('ht','Haitian Creole','Kreyòl ayisyen','ht-HT',true,false,40,'ltr','en'),
('pt','Portuguese','Português','pt-BR',true,false,50,'ltr','en'),
('zh-CN','Chinese (Simplified)','简体中文','zh-CN',true,false,60,'ltr','en'),
('zh-TW','Chinese (Traditional)','繁體中文','zh-TW',true,false,70,'ltr','en'),
('fil','Filipino','Filipino','fil-PH',true,false,80,'ltr','en'),
('vi','Vietnamese','Tiếng Việt','vi-VN',true,false,90,'ltr','en'),
('ko','Korean','한국어','ko-KR',true,false,100,'ltr','en'),
('ja','Japanese','日本語','ja-JP',true,false,110,'ltr','en'),
('ar','Arabic','العربية','ar-US',true,false,120,'rtl','en'),
('ru','Russian','Русский','ru-RU',true,false,130,'ltr','en'),
('uk','Ukrainian','Українська','uk-UA',true,false,140,'ltr','en'),
('pl','Polish','Polski','pl-PL',true,false,150,'ltr','en'),
('de','German','Deutsch','de-DE',true,false,160,'ltr','en'),
('it','Italian','Italiano','it-IT',true,false,170,'ltr','en'),
('el','Greek','Ελληνικά','el-GR',true,false,180,'ltr','en'),
('he','Hebrew','עברית','he-IL',true,false,190,'rtl','en'),
('fa','Persian','فارسی','fa-IR',true,false,200,'rtl','en'),
('hi','Hindi','हिन्दी','hi-IN',true,false,210,'ltr','en'),
('ur','Urdu','اردو','ur-PK',true,false,220,'rtl','en'),
('bn','Bengali','বাংলা','bn-BD',true,false,230,'ltr','en'),
('pa','Punjabi','ਪੰਜਾਬੀ','pa-IN',true,false,240,'ltr','en'),
('gu','Gujarati','ગુજરાતી','gu-IN',true,false,250,'ltr','en'),
('ta','Tamil','தமிழ்','ta-IN',true,false,260,'ltr','en'),
('te','Telugu','తెలుగు','te-IN',true,false,270,'ltr','en'),
('ne','Nepali','नेपाली','ne-NP',true,false,280,'ltr','en'),
('th','Thai','ไทย','th-TH',true,false,290,'ltr','en'),
('id','Indonesian','Bahasa Indonesia','id-ID',true,false,300,'ltr','en'),
('sw','Swahili','Kiswahili','sw-KE',true,false,310,'ltr','en'),
('am','Amharic','አማርኛ','am-ET',true,false,320,'ltr','en'),
('so','Somali','Soomaali','so-SO',true,false,330,'ltr','en'),
('yo','Yoruba','Yorùbá','yo-NG',true,false,340,'ltr','en'),
('ig','Igbo','Igbo','ig-NG',true,false,350,'ltr','en'),
('ak','Akan (Twi)','Akan (Twi)','ak-GH',true,false,360,'ltr','en'),
('wo','Wolof','Wolof','wo-SN',true,false,370,'ltr','en')
on conflict(locale) do update set
  display_name=excluded.display_name,
  native_name=excluded.native_name,
  intl_locale=excluded.intl_locale,
  text_direction=excluded.text_direction,
  fallback_locale=excluded.fallback_locale,
  sort_order=excluded.sort_order,
  updated_at=now();

create unique index if not exists supported_locales_one_default_idx
  on public.supported_locales(is_default) where is_default;

create table if not exists public.translation_entry_versions (
  id uuid primary key default gen_random_uuid(),
  translation_entry_id uuid not null references public.translation_entries(id) on delete cascade,
  version integer not null,
  translated_text text not null default '',
  status text not null,
  change_reason text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(translation_entry_id,version)
);
create index if not exists translation_versions_entry_created_idx
  on public.translation_entry_versions(translation_entry_id,created_at desc);
alter table public.translation_entry_versions enable row level security;
drop policy if exists translation_versions_admin_read on public.translation_entry_versions;
drop policy if exists translation_versions_admin_write on public.translation_entry_versions;
create policy translation_versions_admin_read on public.translation_entry_versions
  for select to authenticated using(public.admin_has_permission('content'));
create policy translation_versions_admin_write on public.translation_entry_versions
  for insert to authenticated with check(public.admin_has_permission('content'));

-- Provider-neutral AI governance. No credential or arbitrary executable prompt
-- is publicly readable, and generated output is always a reviewable draft.
create table if not exists public.ai_automation_features (
  feature_key text primary key check(feature_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  display_name text not null,
  description text not null default '',
  is_enabled boolean not null default false,
  provider_key text not null default 'test' check(provider_key in ('test','openai','anthropic','google')),
  model_key text not null default 'deterministic-test',
  approved_models jsonb not null default '["deterministic-test"]'::jsonb,
  human_review_required boolean not null default true,
  daily_request_limit integer not null default 25 check(daily_request_limit between 0 and 10000),
  monthly_budget_cents integer not null default 0 check(monthly_budget_cents between 0 and 10000000),
  timeout_ms integer not null default 15000 check(timeout_ms between 1000 and 120000),
  fallback_behavior text not null default 'deterministic' check(fallback_behavior in ('deterministic','disabled','manual')),
  pii_policy text not null default 'redact' check(pii_policy in ('redact','reject','approved_internal')),
  moderation_required boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null references public.ai_automation_features(feature_key) on delete cascade,
  version integer not null check(version > 0),
  template_text text not null check(length(template_text) between 10 and 12000),
  status text not null default 'Draft' check(status in ('Draft','Reviewed','Published','Archived')),
  change_reason text,
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  published_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(feature_key,version)
);

create table if not exists public.ai_generation_drafts (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null references public.ai_automation_features(feature_key),
  prompt_version integer,
  provider_key text not null,
  model_key text not null,
  input_summary text not null default '',
  output_text text not null default '',
  status text not null default 'AI-generated draft' check(status in ('AI-generated draft','Approved','Rejected','Expired')),
  safety_flags jsonb not null default '[]'::jsonb,
  requested_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  expires_at timestamptz not null default (now()+interval '30 days')
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null references public.ai_automation_features(feature_key),
  provider_key text not null,
  model_key text not null,
  outcome text not null check(outcome in ('completed','fallback','blocked','failed')),
  input_units integer not null default 0 check(input_units >= 0),
  output_units integer not null default 0 check(output_units >= 0),
  estimated_cost_cents numeric(12,4) not null default 0 check(estimated_cost_cents >= 0),
  requested_by uuid references auth.users(id),
  safe_error_code text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_feature_created_idx on public.ai_usage_events(feature_key,created_at desc);

alter table public.ai_automation_features enable row level security;
alter table public.ai_prompt_versions enable row level security;
alter table public.ai_generation_drafts enable row level security;
alter table public.ai_usage_events enable row level security;
drop policy if exists ai_features_admin_manage on public.ai_automation_features;
drop policy if exists ai_prompts_admin_manage on public.ai_prompt_versions;
drop policy if exists ai_drafts_admin_manage on public.ai_generation_drafts;
drop policy if exists ai_usage_admin_read on public.ai_usage_events;
create policy ai_features_admin_manage on public.ai_automation_features for all to authenticated
  using(public.admin_has_permission('settings')) with check(public.admin_has_permission('settings'));
create policy ai_prompts_admin_manage on public.ai_prompt_versions for all to authenticated
  using(public.admin_has_permission('settings')) with check(public.admin_has_permission('settings'));
create policy ai_drafts_admin_manage on public.ai_generation_drafts for all to authenticated
  using(public.admin_has_permission('settings')) with check(public.admin_has_permission('settings'));
create policy ai_usage_admin_read on public.ai_usage_events for select to authenticated
  using(public.admin_has_permission('settings'));

insert into public.ai_automation_features(feature_key,display_name,description,approved_models,fallback_behavior) values
('search_suggestions','Search suggestion enhancement','Draft related style and service search terms; deterministic search remains authoritative.','["deterministic-test"]','deterministic'),
('search_vocabulary','Search vocabulary drafts','Draft synonyms, phrases and misspellings for human review.','["deterministic-test"]','deterministic'),
('translation_drafts','Translation drafts','Create clearly labeled translation drafts that require human publication.','["deterministic-test"]','manual'),
('salon_description','Salon description drafts','Help authorized users draft salon descriptions without publishing them.','["deterministic-test"]','manual'),
('editorial_drafts','Editorial content drafts','Draft article outlines and copy for editorial review.','["deterministic-test"]','manual'),
('support_response','Support response drafts','Draft support replies; an authorized person must send them.','["deterministic-test"]','manual'),
('moderation_assist','Moderation assistance','Flag potentially unsafe content without making final moderation decisions.','["deterministic-test"]','manual'),
('review_summary','Review and complaint summaries','Summarize selected records without changing the source records.','["deterministic-test"]','manual'),
('admin_insights','Admin insight summaries','Produce non-binding operational summaries for administrators.','["deterministic-test"]','manual')
on conflict(feature_key) do nothing;

-- Reconcile the original category names with the 21-area Engine information
-- architecture. This changes administration labels only, never business data.
update public.engine_settings set category=case category
  when 'general_branding' then 'branding_design'
  when 'identity_security' then 'users_roles'
  when 'salon_activation' then 'salon_lifecycle'
  when 'booking_rules' then 'booking_availability'
  when 'payments_plans' then 'payments_subscriptions'
  when 'service_catalog' then 'service_taxonomies'
  when 'search_language' then 'search_discovery'
  when 'location_markets' then 'markets_service_areas'
  when 'homepage_composition' then 'homepage_composition'
  when 'content_legal' then 'pages_sections'
  when 'trust_badges' then 'trust_quality'
  when 'notifications' then 'notifications_templates'
  when 'languages' then 'languages_translations'
  when 'media' then 'media_uploads'
  when 'quality_support' then 'customer_support'
  when 'test_data' then 'test_data_maintenance'
  when 'configuration_history' then 'configuration_history'
  else category end;

insert into public.engine_settings(setting_key,category,display_name,description,value_type,draft_value,published_value,status,impact_level,validation,help_text,impact_description,is_public,is_secret_status,sort_order) values
('navigation.public_menu','navigation_menus','Public navigation items','Ordered public header destinations.','relationship','[]','[]','Published','customer','{"maxItems":20}','Use only approved internal destinations.','Changes public navigation after publication.',true,false,10),
('pages.default_layout','pages_sections','Default editorial layout','Approved layout used by new editorial pages.','text','"editorial"','"editorial"','Published','customer','{"allowed":["editorial","guide","legal","campaign"]}','Custom scripts and arbitrary HTML are never allowed.','Controls presentation for future pages.',true,false,20),
('promotions.rollout_percent','promotions_campaigns','Promotion feature rollout','Percentage of eligible traffic that can see enabled promotional experiences.','percentage','100','100','Published','customer','{"min":0,"max":100}','Campaign eligibility and payment integrity remain protected.','Affects controlled promotion visibility.',false,false,10),
('features.controlled_rollout_percent','promotions_campaigns','Default controlled rollout','Default percentage for bounded feature rollouts.','percentage','0','0','Published','safety','{"min":0,"max":100}','Set to zero to keep a new feature unavailable.','Affects only features explicitly connected to this setting.',false,false,20),
('ai.emergency_kill_switch','ai_automation','AI emergency kill switch','Disables every AI-assisted feature while preserving deterministic platform behavior.','boolean','true','true','Published','security','{}','Keep enabled until an approved provider, model, budget, and review workflow are configured.','When enabled, every AI request uses a deterministic or manual fallback.',false,false,1),
('integrations.expected_migration','integrations_system','Expected database migration','Latest repository migration expected in the connected database.','text','"20260721100000"','"20260721100000"','Published','security','{"pattern":"^[0-9]{14}$"}','Status only; migrations are applied by the approved deployment workflow.','Used to explain database deployment status without exposing SQL.',false,false,10),
('support.response_target_hours','customer_support','Support response target','Internal target for the first human response to a support request.','number','24','24','Published','customer','{"min":1,"max":168,"integer":true}','This is a service target, not an automatic promise to customers.','Affects support dashboard prioritization.',false,false,10)
on conflict(setting_key) do update set category=excluded.category,display_name=excluded.display_name,description=excluded.description,validation=excluded.validation,help_text=excluded.help_text,impact_description=excluded.impact_description;

-- Safe status registry. It stores expected component names and the last
-- repository-declared migration, never provider secrets or raw responses.
create table if not exists public.engine_system_components (
  component_key text primary key,
  display_name text not null,
  component_type text not null check(component_type in ('database','storage','payments','maps','email','sms','push','translation','ai','deployment')),
  is_required boolean not null default false,
  help_text text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.engine_system_components enable row level security;
drop policy if exists engine_components_admin_read on public.engine_system_components;
create policy engine_components_admin_read on public.engine_system_components for select to authenticated using(public.admin_has_permission('settings'));
insert into public.engine_system_components(component_key,display_name,component_type,is_required,help_text) values
('supabase','Supabase database','database',true,'Required for platform data and authentication.'),
('storage','Supabase Storage','storage',true,'Required for salon and editorial media.'),
('stripe','Stripe','payments',true,'Required for subscriptions and reservation deposits.'),
('maps','Maps and geocoding','maps',false,'Improves location search and directions.'),
('email','Transactional email','email',true,'Sends account, booking and support messages.'),
('sms','Transactional SMS','sms',false,'Optional booking notifications.'),
('push','Web push','push',false,'Optional live notification channel.'),
('translation','Translation registry','translation',true,'Controls published interface languages.'),
('ai','AI provider','ai',false,'Optional; core features retain deterministic fallbacks.'),
('deployment','Migration deployment','deployment',true,'Applies reviewed migrations through CI/CD.')
on conflict(component_key) do update set display_name=excluded.display_name,component_type=excluded.component_type,is_required=excluded.is_required,help_text=excluded.help_text;

-- Constrained navigation registry. Administrators can change labels, approved
-- destinations, order, visibility, and badges without injecting markup.
create table if not exists public.navigation_items (
  id uuid primary key default gen_random_uuid(),
  surface text not null check(surface in ('header','mobile_menu','mobile_bottom','footer')),
  group_key text not null default 'main' check(group_key ~ '^[a-z][a-z0-9_-]{1,39}$'),
  item_key text not null check(item_key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  label text not null check(length(label) between 1 and 80),
  translation_key text check(translation_key is null or translation_key ~ '^[a-z][a-z0-9_.-]{1,179}$'),
  href text not null check(href ~ '^/[A-Za-z0-9_/?=&.%#-]*$'),
  sort_order integer not null default 0 check(sort_order between 0 and 100000),
  is_enabled boolean not null default true,
  show_new_badge boolean not null default false,
  archived_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(surface,item_key)
);
create index if not exists navigation_items_surface_sort_idx on public.navigation_items(surface,group_key,sort_order) where archived_at is null;
alter table public.navigation_items enable row level security;
drop policy if exists navigation_items_public_read on public.navigation_items;
drop policy if exists navigation_items_admin_manage on public.navigation_items;
create policy navigation_items_public_read on public.navigation_items for select using((is_enabled and archived_at is null) or public.admin_has_permission('content'));
create policy navigation_items_admin_manage on public.navigation_items for all to authenticated using(public.admin_has_permission('content')) with check(public.admin_has_permission('content'));

insert into public.navigation_items(surface,group_key,item_key,label,translation_key,href,sort_order,is_enabled,show_new_badge) values
('header','main','styles','Browse Styles','nav.styles','/styles',10,true,false),
('header','main','salons','Find Salons','nav.salons','/salons',20,true,false),
('header','main','how','How It Works','nav.how','/how-it-works',30,true,false),
('header','main','about','About Us','nav.about','/about',40,true,false),
('header','main','blog','Blog','nav.blog','/blog',50,true,false),
('header','main','partner','Partner With Us','nav.partner','/partner',60,true,true),
('mobile_menu','main','styles','Browse Styles','nav.styles','/styles',10,true,false),
('mobile_menu','main','salons','Find Salons','nav.salons','/salons',20,true,false),
('mobile_menu','main','how','How It Works','nav.how','/how-it-works',30,true,false),
('mobile_menu','main','about','About Us','nav.about','/about',40,true,false),
('mobile_menu','main','blog','Blog','nav.blog','/blog',50,true,false),
('mobile_menu','main','partner','Partner With Us','nav.partner','/partner',60,true,false),
('mobile_menu','main','social','Social','nav.social','/social',70,true,false),
('mobile_bottom','main','home','Home','nav.home','/',10,true,false),
('mobile_bottom','main','search','Search','nav.search','/salons',20,true,false),
('mobile_bottom','main','bookings','Bookings','nav.bookings','/account',30,true,false),
('mobile_bottom','main','social','Social','nav.social','/social',40,true,false),
('mobile_bottom','main','profile','Profile','nav.profile','/account?tab=inbox',50,true,false),
('footer','company','about','About Us',null,'/about',10,true,false),
('footer','company','press','Press',null,'/press',20,true,false),
('footer','company','blog','Blog','nav.blog','/blog',30,true,false),
('footer','company','testimonials','Testimonials',null,'/testimonials',40,true,false),
('footer','support','help','Help Center',null,'/help',10,true,false),
('footer','support','safety','Safety & Trust',null,'/safety',20,true,false),
('footer','support','contact','Contact Us',null,'/contact',30,true,false),
('footer','support','complaint','Submit a Complaint',null,'/complaint',40,true,false),
('footer','professionals','partner','Partner With Us','nav.partner','/partner',10,true,false)
on conflict(surface,item_key) do nothing;

commit;
