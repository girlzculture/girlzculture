begin;

-- Customer-safe style discovery must not depend on direct SELECT privileges on
-- salons. The function projects only fields needed by /styles and applies the
-- same marketplace-visibility gate used by public salon discovery.
create or replace function public.list_public_style_catalog(
  p_limit integer default 500
)
returns table (
  name text,
  category text,
  category_id uuid,
  service_category_name text,
  service_category_slug text,
  salon_id uuid,
  price_display_min numeric,
  base_price numeric,
  photos jsonb,
  length_options jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    styles.name,
    styles.category,
    styles.category_id,
    categories.name as service_category_name,
    categories.slug as service_category_slug,
    styles.salon_id,
    styles.price_display_min,
    styles.base_price,
    coalesce(to_jsonb(styles.photos), '[]'::jsonb) as photos,
    coalesce(to_jsonb(styles.length_options), '[]'::jsonb) as length_options
  from public.styles
  join public.salons on salons.id = styles.salon_id
  left join public.service_categories categories
    on categories.id = styles.category_id
  where styles.archived_at is null
    and coalesce(styles.is_draft, false) = false
    and public.is_marketplace_visible(salons.id)
  order by styles.name, styles.salon_id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke all on function public.list_public_style_catalog(integer) from public;
grant execute on function public.list_public_style_catalog(integer)
  to anon, authenticated, service_role;

comment on function public.list_public_style_catalog(integer) is
  'Customer-safe published style projection. Prevents public callers from requiring direct salons-table access.';

create table if not exists public.integration_health_checks (
  integration_key text primary key
    check (integration_key ~ '^[a-z][a-z0-9_]{1,49}$'),
  state text not null
    check (state in ('healthy', 'degraded', 'not_configured')),
  last_checked_at timestamptz not null default now(),
  last_success_at timestamptz,
  safe_error text,
  environment text not null default 'unknown',
  checked_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (safe_error is null or char_length(safe_error) <= 500)
);

alter table public.integration_health_checks enable row level security;
drop policy if exists integration_health_checks_admin_read
  on public.integration_health_checks;
create policy integration_health_checks_admin_read
  on public.integration_health_checks
  for select
  to authenticated
  using (public.admin_has_permission('settings'));

revoke all on table public.integration_health_checks from anon, authenticated;
grant select on table public.integration_health_checks to authenticated;
grant all on table public.integration_health_checks to service_role;

create index if not exists integration_health_checks_state_idx
  on public.integration_health_checks(state, last_checked_at desc);

update public.engine_settings
set draft_value = '"20260724180000"'::jsonb,
    published_value = '"20260724180000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

commit;
