-- Deterministic search-language controls and privacy-safe zero-result analytics.
begin;

create extension if not exists unaccent with schema extensions;

create table if not exists public.search_engine_settings (
  id boolean primary key default true check (id),
  stop_words text[] not null default array['a','an','and','for','i','me','my','need','please','the','to','want']::text[],
  fuzzy_distance integer not null default 2 check (fuzzy_distance between 0 and 3),
  zero_result_logging_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.search_engine_settings(id)
values (true)
on conflict (id) do nothing;

create table if not exists public.search_language_rules (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('service','category')),
  target_id uuid not null,
  canonical_term text not null check (length(trim(canonical_term)) between 1 and 120),
  aliases text[] not null default '{}',
  keywords text[] not null default '{}',
  common_phrases text[] not null default '{}',
  misspellings text[] not null default '{}',
  ranking_boost numeric(6,2) not null default 1 check (ranking_boost between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create unique index if not exists search_language_rules_target_unique_idx
  on public.search_language_rules(target_type, target_id);
create index if not exists search_language_rules_canonical_trgm_idx
  on public.search_language_rules using gin (canonical_term extensions.gin_trgm_ops);

create table if not exists public.search_zero_result_aggregates (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  query_hash text not null check (query_hash ~ '^[a-f0-9]{64}$'),
  token_count integer not null default 0 check (token_count between 0 and 100),
  locale text not null default 'en' check (length(locale) between 2 and 20),
  search_context text not null default 'public' check (length(search_context) between 1 and 40),
  searches bigint not null default 1 check (searches > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (occurred_on, query_hash, locale, search_context)
);

create index if not exists search_zero_result_recent_idx
  on public.search_zero_result_aggregates(occurred_on desc, searches desc);

insert into public.search_language_rules(
  target_type, target_id, canonical_term, aliases, keywords, common_phrases, misspellings, ranking_boost
)
select 'service', managed.id, managed.name,
  case
    when lower(managed.name) = 'locs' then array['hair locs','dreadlocks','dreads']::text[]
    when lower(managed.name) = 'box braids' then array['box braid']::text[]
    when lower(managed.name) = 'boho braids' then array['bohemian braids','boho braid']::text[]
    when lower(managed.name) like '%wash%' then array['hair wash','shampoo','wash and style']::text[]
    else '{}'::text[]
  end,
  case when lower(managed.name) like '%wash%' then array['clean hair','wash hair']::text[] else '{}'::text[] end,
  case when lower(managed.name) like '%wash%' then array['wash my hair','i need to wash my hair']::text[] else '{}'::text[] end,
  case when lower(managed.name) = 'locs' then array['locks']::text[] else '{}'::text[] end,
  case when lower(managed.name) in ('locs','box braids','boho braids') then 8 else 1 end
from public.master_styles managed
where managed.is_active
on conflict (target_type, target_id) do update
set canonical_term = excluded.canonical_term,
    aliases = case when cardinality(public.search_language_rules.aliases) = 0 then excluded.aliases else public.search_language_rules.aliases end,
    keywords = case when cardinality(public.search_language_rules.keywords) = 0 then excluded.keywords else public.search_language_rules.keywords end,
    common_phrases = case when cardinality(public.search_language_rules.common_phrases) = 0 then excluded.common_phrases else public.search_language_rules.common_phrases end,
    misspellings = case when cardinality(public.search_language_rules.misspellings) = 0 then excluded.misspellings else public.search_language_rules.misspellings end,
    updated_at = now();

insert into public.search_language_rules(target_type, target_id, canonical_term, ranking_boost)
select 'category', category.id, category.name, 1
from public.service_categories category
where category.is_active
on conflict (target_type, target_id) do update
set canonical_term = excluded.canonical_term, updated_at = now();

create or replace function public.sync_search_language_target()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_kind text;
begin
  target_kind := case when tg_table_name = 'master_styles' then 'service' else 'category' end;
  insert into public.search_language_rules(target_type, target_id, canonical_term, is_active, updated_at)
  values (target_kind, new.id, new.name, new.is_active, now())
  on conflict (target_type, target_id) do update
  set canonical_term = excluded.canonical_term,
      is_active = excluded.is_active,
      updated_at = now();
  return new;
end $$;

drop trigger if exists master_styles_sync_search_language on public.master_styles;
create trigger master_styles_sync_search_language
after insert or update of name, is_active on public.master_styles
for each row execute function public.sync_search_language_target();
drop trigger if exists service_categories_sync_search_language on public.service_categories;
create trigger service_categories_sync_search_language
after insert or update of name, is_active on public.service_categories
for each row execute function public.sync_search_language_target();

create or replace function public.normalize_marketplace_search(value text)
returns text language sql stable set search_path = public, extensions as $$
  select trim(regexp_replace(lower(extensions.unaccent(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.resolve_search_service_query(p_query text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  with input as (
    select public.normalize_marketplace_search(p_query) as query
  ), candidates as (
    select
      rule.canonical_term,
      greatest(
        case when public.normalize_marketplace_search(term.value) = input.query then 100 else 0 end,
        case when public.normalize_marketplace_search(term.value) like input.query || '%' then 80 else 0 end,
        case when public.normalize_marketplace_search(term.value) like '%' || input.query || '%' then 65 else 0 end,
        extensions.similarity(public.normalize_marketplace_search(term.value), input.query) * 60
      ) + rule.ranking_boost as score
    from input
    join public.search_language_rules rule on rule.target_type = 'service' and rule.is_active
    join public.master_styles managed on managed.id = rule.target_id and managed.is_active
    cross join lateral unnest(
      array[rule.canonical_term] || rule.aliases || rule.keywords || rule.common_phrases || rule.misspellings
    ) term(value)
    where input.query <> ''
      and exists (
        select 1
        from public.styles offered
        join public.salons salon on salon.id = offered.salon_id
        where offered.master_style_id = managed.id
          and salon.status = 'Active'
          and salon.is_discoverable
          and salon.subscription_status in ('active','trialing')
      )
      and (
        public.normalize_marketplace_search(term.value) = input.query
        or public.normalize_marketplace_search(term.value) like '%' || input.query || '%'
        or input.query like '%' || public.normalize_marketplace_search(term.value) || '%'
        or extensions.similarity(public.normalize_marketplace_search(term.value), input.query) >= 0.34
      )
  )
  select canonical_term from candidates order by score desc, canonical_term limit 1
$$;

revoke all on function public.resolve_search_service_query(text) from public;
grant execute on function public.resolve_search_service_query(text) to anon, authenticated;

alter table public.search_engine_settings enable row level security;
alter table public.search_language_rules enable row level security;
alter table public.search_zero_result_aggregates enable row level security;

drop policy if exists search_engine_settings_admin_all on public.search_engine_settings;
create policy search_engine_settings_admin_all on public.search_engine_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists search_language_rules_admin_all on public.search_language_rules;
create policy search_language_rules_admin_all on public.search_language_rules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists search_zero_result_aggregates_admin_read on public.search_zero_result_aggregates;
create policy search_zero_result_aggregates_admin_read on public.search_zero_result_aggregates
  for select to authenticated using (public.is_admin());

revoke all on public.search_engine_settings, public.search_language_rules, public.search_zero_result_aggregates from anon;
grant select, insert, update, delete on public.search_engine_settings, public.search_language_rules to authenticated;
grant select on public.search_zero_result_aggregates to authenticated;

commit;
