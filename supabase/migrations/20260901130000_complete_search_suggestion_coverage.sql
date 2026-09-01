-- Give server-side autocomplete a stable, bounded page over the complete
-- canonical marketplace-eligible salon set. The prior helper accepted only a
-- total limit and capped the result at 2,000, so callers could not continue.

begin;

create or replace function public.marketplace_visible_salon_ids_page(
  p_after uuid default null,
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
    and (p_after is null or salon.id > p_after)
  order by salon.id
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

comment on function public.marketplace_visible_salon_ids_page(uuid, integer) is
  'Returns one stable keyset page of canonical marketplace-visible salon identifiers without imposing a total-result cap.';

revoke all on function public.marketplace_visible_salon_ids_page(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.marketplace_visible_salon_ids_page(uuid, integer)
  to service_role;

update public.engine_settings
set published_value = '"20260901130000"'::jsonb,
    draft_value = '"20260901130000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

notify pgrst, 'reload schema';

commit;
