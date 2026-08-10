-- Keep server-side search on the same eligibility boundary as public discovery.
-- This migration is additive and idempotent: it does not rewrite salon or
-- catalog data, and it grants only narrowly scoped function execution.

begin;

create or replace function public.marketplace_visible_salon_ids(
  p_limit integer default 500
)
returns table(salon_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select salon.id
  from public.salons salon
  where public.is_marketplace_visible(salon.id)
  order by salon.id
  limit greatest(1, least(coalesce(p_limit, 500), 2000));
$$;

comment on function public.marketplace_visible_salon_ids(integer) is
  'Returns only canonical marketplace-visible salon identifiers for bounded server-side suggestion queries.';

revoke all on function public.marketplace_visible_salon_ids(integer)
  from public, anon, authenticated;
grant execute on function public.marketplace_visible_salon_ids(integer)
  to service_role;

-- discoverNearbySalons resolves aliases through the service-role client before
-- calling the authoritative discovery RPC. Earlier history granted this
-- resolver only to anon/authenticated, so production could silently skip alias
-- resolution even though the underlying search remained available.
grant execute on function public.resolve_search_service_query(text)
  to service_role;

update public.engine_settings
set published_value='"20260809170000"'::jsonb,
    draft_value='"20260809170000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst, 'reload schema';

commit;
