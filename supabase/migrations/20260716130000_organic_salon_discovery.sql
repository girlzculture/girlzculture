-- Organic, customer-safe proximity discovery. Subscription tier is purposely
-- not returned or used as an organic ranking signal.
begin;

create or replace function public.discover_nearby_salons(
  origin_latitude double precision,
  origin_longitude double precision,
  radius_miles double precision default 25,
  style_query text default null,
  minimum_rating numeric default null,
  minimum_price numeric default null,
  maximum_price numeric default null,
  sort_mode text default 'distance',
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  address_city text,
  address_state text,
  borough text,
  cover_photo_url text,
  verification_status text,
  rating_overall numeric,
  review_count integer,
  latitude double precision,
  longitude double precision,
  starting_price numeric,
  services jsonb,
  distance_miles double precision,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with validated as (
    select
      greatest(1.0, least(100.0, coalesce(radius_miles, 25.0))) as radius,
      greatest(1, least(50, coalesce(result_limit, 20))) as page_size,
      greatest(0, coalesce(result_offset, 0)) as page_offset
  ), candidates as (
    select
      s.id,
      s.name,
      s.slug,
      s.address_city,
      s.address_state,
      s.borough,
      s.cover_photo_url,
      s.verification_status,
      coalesce(s.rating_overall, 0)::numeric as rating_overall,
      coalesce(s.review_count, 0)::integer as review_count,
      s.latitude,
      s.longitude,
      prices.starting_price,
      coalesce(service_list.services, '[]'::jsonb) as services,
      public.distance_miles(origin_latitude, origin_longitude, s.latitude, s.longitude) as distance_miles
    from public.salons s
    cross join validated v
    left join lateral (
      select min(st.price_display_min)::numeric as starting_price
      from public.styles st
      where st.salon_id = s.id
        and st.price_display_min is not null and st.price_display_min >= 0
    ) prices on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', listed.id, 'name', listed.name) order by listed.name) as services
      from (
        select st.id, st.name from public.styles st
        where st.salon_id = s.id
        order by st.name limit 12
      ) listed
    ) service_list on true
    where public.is_marketplace_visible(s.id)
      and s.status = 'Active'
      and s.is_discoverable = true
      and s.subscription_status in ('active','trialing')
      and s.geocode_status = 'success'
      and s.address_needs_review = false
      and s.latitude is not null and s.longitude is not null
      and s.latitude between origin_latitude - (v.radius / 69.0) and origin_latitude + (v.radius / 69.0)
      and s.longitude between origin_longitude - (v.radius / (69.172 * greatest(0.01, cos(radians(origin_latitude)))))
                          and origin_longitude + (v.radius / (69.172 * greatest(0.01, cos(radians(origin_latitude)))))
      and (nullif(trim(style_query), '') is null or exists (
        select 1 from public.styles filter_style
        where filter_style.salon_id = s.id
          and filter_style.name ilike '%' || trim(style_query) || '%'
      ))
  ), eligible as (
    select * from candidates
    cross join validated v
    where candidates.distance_miles <= v.radius
      and (minimum_rating is null or candidates.rating_overall >= minimum_rating)
      and (minimum_price is null or candidates.starting_price >= minimum_price)
      and (maximum_price is null or candidates.starting_price <= maximum_price)
  )
  select
    e.id, e.name, e.slug, e.address_city, e.address_state, e.borough,
    e.cover_photo_url, e.verification_status, e.rating_overall, e.review_count,
    e.latitude, e.longitude, e.starting_price, e.services, e.distance_miles,
    count(*) over() as total_count
  from eligible e
  cross join validated v
  order by
    case when sort_mode = 'rating' then e.rating_overall end desc nulls last,
    case when sort_mode = 'price_low' then e.starting_price end asc nulls last,
    case when sort_mode = 'price_high' then e.starting_price end desc nulls last,
    e.distance_miles asc,
    e.rating_overall desc,
    e.review_count desc,
    e.id asc
  limit (select page_size from validated)
  offset (select page_offset from validated);
$$;

revoke all on function public.discover_nearby_salons(double precision,double precision,double precision,text,numeric,numeric,numeric,text,integer,integer) from public;
grant execute on function public.discover_nearby_salons(double precision,double precision,double precision,text,numeric,numeric,numeric,text,integer,integer) to anon, authenticated;

comment on function public.discover_nearby_salons(double precision,double precision,double precision,text,numeric,numeric,numeric,text,integer,integer)
  is 'Customer-safe, organic, nearest-first salon discovery. Never exposes subscription tier or owner contact data.';

commit;
