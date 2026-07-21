-- Repair the admin salon inventory query and expose every operational filter.
-- Parameter names are deliberately prefixed so PL/pgSQL never confuses a
-- function argument with columns such as location_markets.center_latitude.
begin;

drop function if exists public.admin_list_salons(
  uuid,text,text,uuid,text,text,numeric,boolean,double precision,
  double precision,double precision,text,text,integer,integer
);

create function public.admin_list_salons(
  p_acting_admin_id uuid,
  p_search_text text default null,
  p_state_filter text default null,
  p_market_filter uuid default null,
  p_status_filter text default null,
  p_plan_filter text default null,
  p_minimum_rating numeric default null,
  p_address_review_filter boolean default null,
  p_center_latitude double precision default null,
  p_center_longitude double precision default null,
  p_radius_miles double precision default null,
  p_setup_filter text default null,
  p_subscription_filter text default null,
  p_discoverability_filter boolean default null,
  p_sort_field text default 'name',
  p_sort_direction text default 'asc',
  p_result_limit integer default 25,
  p_result_offset integer default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  owner_name text,
  email text,
  phone text,
  logo_url text,
  cover_photo_url text,
  address_city text,
  address_state text,
  address_zip text,
  borough text,
  market_id uuid,
  market_name text,
  status text,
  subscription_tier text,
  subscription_status text,
  rating_overall numeric,
  review_count integer,
  address_needs_review boolean,
  geocode_status text,
  latitude double precision,
  longitude double precision,
  onboarding_progress smallint,
  onboarding_completed_at timestamptz,
  setup_complete boolean,
  subscription_eligible boolean,
  is_discoverable boolean,
  distance_miles double precision,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_admin_allowed boolean;
  v_search text := nullif(trim(coalesce(p_search_text, '')), '');
begin
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = p_acting_admin_id
      and au.status = 'Active'
      and (
        coalesce(au.is_super_admin, false)
        or coalesce((au.permissions ->> 'salons')::boolean, false)
      )
  ) into v_admin_allowed;

  if not v_admin_allowed then
    raise exception 'Forbidden';
  end if;

  if p_radius_miles is not null and
     (p_center_latitude is null or p_center_longitude is null) then
    raise exception 'Choose a center before applying a radius.';
  end if;

  return query
  with prepared as (
    select
      s.*,
      lm.name as resolved_market_name,
      (s.onboarding_completed_at is not null and s.onboarding_progress = 100) as resolved_setup_complete,
      (
        s.status = 'Active'
        and lower(coalesce(s.subscription_status, '')) in ('active', 'trialing')
      ) as resolved_subscription_eligible,
      case
        when p_center_latitude is not null
          and p_center_longitude is not null
          and s.latitude is not null
          and s.longitude is not null
        then public.distance_miles(
          p_center_latitude,
          p_center_longitude,
          s.latitude,
          s.longitude
        )
        else null
      end as resolved_distance
    from public.salons s
    left join public.location_markets lm on lm.id = s.market_id
  ), filtered as (
    select p.*
    from prepared p
    where (
        v_search is null
        or p.name ilike '%' || v_search || '%'
        or p.owner_name ilike '%' || v_search || '%'
        or p.email ilike '%' || v_search || '%'
        or p.phone ilike '%' || v_search || '%'
        or p.id::text ilike v_search || '%'
        or p.address_city ilike '%' || v_search || '%'
        or p.address_state ilike '%' || v_search || '%'
        or p.address_zip ilike '%' || v_search || '%'
        or p.borough ilike '%' || v_search || '%'
        or p.resolved_market_name ilike '%' || v_search || '%'
      )
      and (nullif(p_state_filter, '') is null or p.address_state = upper(p_state_filter))
      and (p_market_filter is null or p.market_id = p_market_filter)
      and (nullif(p_status_filter, '') is null or lower(p.status) = lower(p_status_filter))
      and (nullif(p_plan_filter, '') is null or lower(p.subscription_tier) = lower(p_plan_filter))
      and (p_minimum_rating is null or coalesce(p.rating_overall, 0) >= p_minimum_rating)
      and (p_address_review_filter is null or p.address_needs_review = p_address_review_filter)
      and (
        nullif(p_setup_filter, '') is null
        or (p_setup_filter = 'complete' and p.resolved_setup_complete)
        or (p_setup_filter = 'incomplete' and not p.resolved_setup_complete)
      )
      and (
        nullif(p_subscription_filter, '') is null
        or (p_subscription_filter = 'eligible' and p.resolved_subscription_eligible)
        or (p_subscription_filter = 'ineligible' and not p.resolved_subscription_eligible)
      )
      and (p_discoverability_filter is null or p.is_discoverable = p_discoverability_filter)
      and (
        p_radius_miles is null
        or (
          p.resolved_distance is not null
          and p.resolved_distance <= greatest(1, least(250, p_radius_miles))
        )
      )
  )
  select
    f.id,
    f.name,
    f.slug,
    f.owner_name,
    f.email,
    f.phone,
    f.logo_url,
    f.cover_photo_url,
    f.address_city,
    f.address_state,
    f.address_zip,
    f.borough,
    f.market_id,
    f.resolved_market_name,
    f.status,
    f.subscription_tier,
    f.subscription_status,
    coalesce(f.rating_overall, 0)::numeric,
    coalesce(f.review_count, 0)::integer,
    f.address_needs_review,
    f.geocode_status,
    f.latitude,
    f.longitude,
    f.onboarding_progress,
    f.onboarding_completed_at,
    f.resolved_setup_complete,
    f.resolved_subscription_eligible,
    f.is_discoverable,
    f.resolved_distance,
    count(*) over()
  from filtered f
  order by
    case when p_sort_field = 'rating' and p_sort_direction = 'desc' then f.rating_overall end desc nulls last,
    case when p_sort_field = 'rating' and p_sort_direction = 'asc' then f.rating_overall end asc nulls last,
    case when p_sort_field = 'reviews' and p_sort_direction = 'desc' then f.review_count end desc nulls last,
    case when p_sort_field = 'reviews' and p_sort_direction = 'asc' then f.review_count end asc nulls last,
    case when p_sort_field = 'status' and p_sort_direction = 'desc' then f.status end desc,
    case when p_sort_field = 'status' and p_sort_direction = 'asc' then f.status end asc,
    case when p_sort_field = 'distance' then f.resolved_distance end asc nulls last,
    case when p_sort_direction = 'desc' then f.name end desc,
    f.name asc,
    f.id asc
  limit greatest(1, least(100, coalesce(p_result_limit, 25)))
  offset greatest(0, coalesce(p_result_offset, 0));
end;
$$;

revoke all on function public.admin_list_salons(
  uuid,text,text,uuid,text,text,numeric,boolean,double precision,
  double precision,double precision,text,text,boolean,text,text,integer,integer
) from public, anon, authenticated;
grant execute on function public.admin_list_salons(
  uuid,text,text,uuid,text,text,numeric,boolean,double precision,
  double precision,double precision,text,text,boolean,text,text,integer,integer
) to service_role;

commit;
