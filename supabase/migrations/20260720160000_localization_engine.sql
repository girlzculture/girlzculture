-- Platform localization registry. English is the safe source/fallback locale.
create table if not exists public.supported_locales (
  locale text primary key check(locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  display_name text not null,
  native_name text not null,
  intl_locale text not null,
  is_enabled boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.supported_locales(locale,display_name,native_name,intl_locale,is_enabled,is_default,sort_order) values
('en','English','English','en-US',true,true,1),('es','Spanish','Español','es-US',true,false,2),('fr','French','Français','fr-FR',true,false,3),('wo','Wolof','Wolof','wo-SN',true,false,4)
on conflict(locale) do nothing;

create table if not exists public.translation_entries (
  id uuid primary key default gen_random_uuid(),
  translation_key text not null check(length(translation_key) between 2 and 180),
  locale text not null references public.supported_locales(locale),
  namespace text not null default 'common',
  source_text text not null default '',
  translated_text text not null default '',
  status text not null default 'Draft' check(status in ('Missing','Draft','Reviewed','Published')),
  impact_level text not null default 'standard' check(impact_level in ('standard','customer','booking','billing','security','safety','legal')),
  version integer not null default 1,
  machine_generated boolean not null default false,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  published_by uuid references auth.users(id),
  published_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(translation_key,locale)
);
create index if not exists translation_entries_locale_status_idx on public.translation_entries(locale,status,namespace);

create table if not exists public.localized_content (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  field_key text not null,
  locale text not null references public.supported_locales(locale),
  source_text text not null default '',
  translated_text text not null default '',
  status text not null default 'Draft' check(status in ('Missing','Draft','Reviewed','Published')),
  impact_level text not null default 'customer' check(impact_level in ('standard','customer','booking','billing','security','safety','legal')),
  version integer not null default 1,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  published_by uuid references auth.users(id),
  published_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(entity_type,entity_id,field_key,locale)
);

alter table public.supported_locales enable row level security;
alter table public.translation_entries enable row level security;
alter table public.localized_content enable row level security;
drop policy if exists supported_locales_public_read on public.supported_locales;
drop policy if exists translation_published_read on public.translation_entries;
drop policy if exists translation_admin_write on public.translation_entries;
drop policy if exists localized_content_published_read on public.localized_content;
drop policy if exists localized_content_admin_write on public.localized_content;
drop policy if exists supported_locales_admin_write on public.supported_locales;
create policy supported_locales_public_read on public.supported_locales for select using(is_enabled or public.is_admin());
create policy translation_published_read on public.translation_entries for select using(status='Published' or public.admin_has_permission('content'));
create policy translation_admin_write on public.translation_entries for all to authenticated using(public.admin_has_permission('content')) with check(public.admin_has_permission('content'));
create policy localized_content_published_read on public.localized_content for select using(status='Published' or public.admin_has_permission('content'));
create policy localized_content_admin_write on public.localized_content for all to authenticated using(public.admin_has_permission('content')) with check(public.admin_has_permission('content'));
create policy supported_locales_admin_write on public.supported_locales for all to authenticated using(public.admin_has_permission('settings')) with check(public.admin_has_permission('settings'));

-- Seed stable global keys. Non-English values remain reviewed drafts until an admin publishes them.
insert into public.translation_entries(translation_key,locale,namespace,source_text,translated_text,status,impact_level) values
('nav.styles','en','navigation','Browse Styles','Browse Styles','Published','standard'),
('nav.salons','en','navigation','Find Salons','Find Salons','Published','standard'),
('nav.how','en','navigation','How It Works','How It Works','Published','standard'),
('nav.about','en','navigation','About Us','About Us','Published','standard'),
('nav.blog','en','navigation','Blog','Blog','Published','standard'),
('nav.partner','en','navigation','Partner With Us','Partner With Us','Published','standard'),
('nav.login','en','navigation','Log in','Log in','Published','security'),
('nav.signup','en','navigation','Sign up','Sign up','Published','security')
on conflict(translation_key,locale) do nothing;

create or replace function public.translation_version_guard() returns trigger language plpgsql as $$ begin new.version:=old.version+1;new.updated_at:=now();return new;end $$;
drop trigger if exists translation_entry_version on public.translation_entries;
drop trigger if exists localized_content_version on public.localized_content;
create trigger translation_entry_version before update on public.translation_entries for each row execute function public.translation_version_guard();
create trigger localized_content_version before update on public.localized_content for each row execute function public.translation_version_guard();
