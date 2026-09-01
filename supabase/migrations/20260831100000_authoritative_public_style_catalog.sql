begin;

-- Browse Styles is a catalog surface, not an offering-row feed. Aggregate all
-- eligible published offerings first and apply p_limit only to the resulting
-- canonical master-style rows. This prevents a busy style or salon from
-- consuming the old pre-aggregation row cap and hiding valid catalog entries.
drop function if exists public.list_public_style_catalog(integer);
drop function if exists public.list_public_style_catalog(integer, integer);
create function public.list_public_style_catalog(
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  master_style_id uuid,
  name text,
  category_id uuid,
  service_group_id uuid,
  service_category_name text,
  service_category_slug text,
  salon_count bigint,
  starting_price numeric,
  image text,
  lengths text[],
  search_terms text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with eligible_offerings as (
    select
      managed.id as master_style_id,
      managed.name,
      managed.sort_order as master_sort_order,
      category.id as category_id,
      category.name as service_category_name,
      category.slug as service_category_slug,
      service_group.id as service_group_id,
      offered.salon_id,
      coalesce(
        nullif(offered.price_display_min, 0),
        nullif(offered.base_price, 0)
      ) as starting_price,
      nullif(
        btrim(
          case
            when jsonb_typeof(coalesce(offered.photos, '[]'::jsonb)) = 'array'
              then offered.photos ->> 0
            else null
          end
        ),
        ''
      ) as image,
      case
        when jsonb_typeof(coalesce(offered.length_options, '[]'::jsonb)) = 'array'
          then coalesce(offered.length_options, '[]'::jsonb)
        else '[]'::jsonb
      end as length_options
    from public.styles offered
    join public.salons salon
      on salon.id = offered.salon_id
    join public.master_styles managed
      on managed.id = offered.master_style_id
      and managed.is_active = true
      and managed.archived_at is null
    join public.service_groups service_group
      on service_group.id = managed.service_group_id
      and service_group.id = offered.service_group_id
      and service_group.is_active = true
      and service_group.archived_at is null
    join public.service_categories category
      on category.id = managed.category_id
      and category.id = service_group.category_id
      and category.id = offered.category_id
      and category.is_active = true
      and category.archived_at is null
    where offered.master_style_id is not null
      and offered.archived_at is null
      and coalesce(offered.is_draft, false) = false
      and public.is_marketplace_visible(salon.id)
  ),
  catalog as (
    select
      offered.master_style_id,
      offered.name,
      offered.master_sort_order,
      offered.category_id,
      offered.service_group_id,
      offered.service_category_name,
      offered.service_category_slug,
      count(distinct offered.salon_id)::bigint as salon_count,
      min(offered.starting_price)::numeric as starting_price,
      min(offered.image) as image
    from eligible_offerings offered
    group by
      offered.master_style_id,
      offered.name,
      offered.master_sort_order,
      offered.category_id,
      offered.service_group_id,
      offered.service_category_name,
      offered.service_category_slug
  ),
  catalog_lengths as (
    select
      offered.master_style_id,
      array_agg(distinct option_value.label order by option_value.label)
        filter (where option_value.label is not null) as lengths
    from eligible_offerings offered
    cross join lateral (
      select nullif(
        btrim(coalesce(
          option ->> 'label',
          option ->> 'value',
          case
            when jsonb_typeof(option) = 'string' then option #>> '{}'
            else null
          end
        )),
        ''
      ) as label
      from jsonb_array_elements(offered.length_options) option
    ) option_value
    group by offered.master_style_id
  ),
  catalog_search_terms as (
    select
      rule.target_id as master_style_id,
      array_agg(distinct btrim(term.value) order by btrim(term.value))
        filter (where nullif(btrim(term.value), '') is not null) as search_terms
    from public.search_language_rules rule
    cross join lateral unnest(
      array[rule.canonical_term]
      || coalesce(rule.aliases, '{}'::text[])
      || coalesce(rule.keywords, '{}'::text[])
      || coalesce(rule.common_phrases, '{}'::text[])
      || coalesce(rule.misspellings, '{}'::text[])
    ) term(value)
    where rule.target_type = 'service'
      and rule.is_active = true
    group by rule.target_id
  )
  select
    catalog.master_style_id,
    catalog.name,
    catalog.category_id,
    catalog.service_group_id,
    catalog.service_category_name,
    catalog.service_category_slug,
    catalog.salon_count,
    catalog.starting_price,
    catalog.image,
    coalesce(catalog_lengths.lengths, '{}'::text[]) as lengths,
    coalesce(catalog_search_terms.search_terms, '{}'::text[]) as search_terms
  from catalog
  left join catalog_lengths
    on catalog_lengths.master_style_id = catalog.master_style_id
  left join catalog_search_terms
    on catalog_search_terms.master_style_id = catalog.master_style_id
  order by
    catalog.salon_count desc,
    catalog.master_sort_order asc,
    catalog.name asc,
    catalog.master_style_id asc
  limit least(greatest(coalesce(p_limit, 500), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_public_style_catalog(integer, integer) from public;
grant execute on function public.list_public_style_catalog(integer, integer)
  to anon, authenticated, service_role;

comment on function public.list_public_style_catalog(integer, integer) is
  'Customer-safe paginated canonical Browse Styles catalog. Aggregates all eligible published offerings before paging and returns active catalog identity, complete lengths, approved search terms, salon count, price, and representative media.';

update public.engine_settings
set published_value = '"20260831100000"'::jsonb,
    draft_value = '"20260831100000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

notify pgrst, 'reload schema';

commit;
