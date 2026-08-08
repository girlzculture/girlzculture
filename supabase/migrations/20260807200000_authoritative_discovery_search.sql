begin;

-- A zero/negative result_limit is the repository-controlled "all results"
-- contract used by trusted server-side discovery. Customer JWTs remain capped
-- at 50 even when they call the RPC directly. Organic distance ordering must
-- use the one canonical great-circle distance and must not silently move a
-- farther salon ahead of a nearer salon.
drop function if exists public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,numeric,numeric,numeric,text,integer,integer);
create or replace function public.discover_nearby_salons_ranked(
  origin_latitude double precision,
  origin_longitude double precision,
  radius_miles double precision default 50,
  style_query text default null,
  master_style_filter uuid default null,
  minimum_rating numeric default null,
  minimum_price numeric default null,
  maximum_price numeric default null,
  sort_mode text default 'distance',
  result_limit integer default 20,
  result_offset integer default 0
)
returns table(id uuid,name text,slug text,address_city text,address_state text,borough text,cover_photo_url text,verification_status text,rating_overall numeric,review_count integer,latitude double precision,longitude double precision,starting_price numeric,services jsonb,distance_miles double precision,total_count bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
  with validated as(
    select greatest(1.0,least(100.0,coalesce(radius_miles,50.0))) radius,
      case
        when coalesce(result_limit,20) <= 0 and auth.role()='service_role' then null
        when coalesce(result_limit,20) <= 0 then 50
        else greatest(1,least(50,coalesce(result_limit,20)))
      end page_size,
      greatest(0,coalesce(result_offset,0)) page_offset,
      least(
        180.0,
        greatest(1.0,least(100.0,coalesce(radius_miles,50.0))) /
          (69.172*greatest(0.01,cos(radians(origin_latitude))))
      ) longitude_delta,
      nullif(public.normalize_marketplace_search(style_query),'') normalized_style
  ), candidates as(
    select s.id,s.name,s.slug,s.address_city,s.address_state,s.borough,s.cover_photo_url,s.verification_status,
      coalesce(s.rating_overall,0)::numeric rating_overall,coalesce(s.review_count,0)::integer review_count,
      s.latitude::double precision latitude,s.longitude::double precision longitude,prices.starting_price,
      coalesce(service_list.services,'[]'::jsonb) services,
      public.distance_miles(origin_latitude,origin_longitude,s.latitude,s.longitude) distance_miles
    from public.salons s cross join validated v
    left join lateral(
      select min(st.price_display_min)::numeric starting_price
      from public.styles st
      where st.salon_id=s.id
        and st.archived_at is null
        and coalesce(st.is_draft,false)=false
        and st.price_display_min>=0
        and (
          (master_style_filter is not null and st.master_style_id=master_style_filter)
          or (
            master_style_filter is null
            and (
              v.normalized_style is null
              or public.normalize_marketplace_search(st.name) like '%'||v.normalized_style||'%'
              or v.normalized_style like '%'||public.normalize_marketplace_search(st.name)||'%'
            )
          )
        )
    ) prices on true
    left join lateral(select jsonb_agg(jsonb_build_object('id',listed.id,'name',listed.name) order by listed.name) services from(select st.id,st.name from public.styles st where st.salon_id=s.id and st.archived_at is null and coalesce(st.is_draft,false)=false order by st.name)listed)service_list on true
    where public.is_marketplace_visible(s.id)
      and lower(coalesce(s.status,''))='active'
      and coalesce(s.is_discoverable,false)
      and lower(coalesce(s.geocode_status,''))='success'
      and coalesce(s.address_needs_review,false)=false
      and s.latitude is not null and s.longitude is not null
      and s.latitude between origin_latitude-(v.radius/69.0) and origin_latitude+(v.radius/69.0)
      -- Longitude values wrap at +/-180. LEAST gives the shortest angular
      -- separation so salons on opposite sides of the antimeridian remain
      -- eligible for the exact great-circle radius check below.
      and least(
        abs(s.longitude-origin_longitude),
        360.0-abs(s.longitude-origin_longitude)
      ) <= v.longitude_delta
      and(
        (master_style_filter is not null and exists(
          select 1 from public.styles fs
          where fs.salon_id=s.id and fs.archived_at is null and coalesce(fs.is_draft,false)=false
            and fs.master_style_id=master_style_filter
        ))
        or (master_style_filter is null and (v.normalized_style is null or exists(
        select 1 from public.styles fs
        where fs.salon_id=s.id and fs.archived_at is null and coalesce(fs.is_draft,false)=false
          and (
            public.normalize_marketplace_search(fs.name) like '%'||v.normalized_style||'%'
            or v.normalized_style like '%'||public.normalize_marketplace_search(fs.name)||'%'
          )
        )))
      )
  ),eligible as(
    select c.* from candidates c cross join validated v where c.distance_miles<=v.radius
      and(minimum_rating is null or c.rating_overall>=minimum_rating)
      and(minimum_price is null or c.starting_price>=minimum_price)
      and(maximum_price is null or c.starting_price<=maximum_price)
  )
  select e.id,e.name,e.slug,e.address_city,e.address_state,e.borough,e.cover_photo_url,e.verification_status,e.rating_overall,e.review_count,e.latitude,e.longitude,e.starting_price,e.services,e.distance_miles,count(*)over()
  from eligible e
  order by
    case when sort_mode='rating' then e.rating_overall end desc nulls last,
    case when sort_mode='price_low' then e.starting_price end asc nulls last,
    case when sort_mode='price_high' then e.starting_price end desc nulls last,
    e.distance_miles asc,e.rating_overall desc,e.review_count desc,e.id
  -- PostgreSQL treats LIMIT NULL as LIMIT ALL. Only service-role calls can
  -- reach that branch; direct customer roles are capped at 50 above.
  limit(select page_size from validated)
  offset(select page_offset from validated)
$$;

-- The application invokes organic discovery only through the monitored server
-- route and its service-role client. Earlier migrations intentionally removed
-- direct salon-table access from public JWT roles, so granting this SECURITY
-- INVOKER function to anon/authenticated would advertise an unusable contract.
-- Keep the projection server-only and explicitly grant its immutable distance
-- dependency to the same role (PUBLIC execute was revoked in the location
-- foundation migration).
revoke all on function public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer) from public,anon,authenticated;
grant execute on function public.distance_miles(double precision,double precision,double precision,double precision) to service_role;
grant execute on function public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer) to service_role;
comment on function public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer) is 'Server-only authoritative organic discovery: current marketplace visibility, canonical coordinates and miles, pure nearest-first distance ordering, exact master-style filtering when supplied, and a service-role-only no-cap contract when result_limit is zero.';

-- Browse Styles needs a durable catalog identity in addition to display copy.
-- Replacing the function changes only its returned projection; no application
-- data or grants are removed.
drop function if exists public.list_public_style_catalog(integer);
create function public.list_public_style_catalog(
  p_limit integer default 500
)
returns table (
  name text,
  category text,
  category_id uuid,
  master_style_id uuid,
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
    styles.master_style_id,
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
  'Customer-safe published style projection with stable master style identity. Direct salons-table access is not required.';

update public.engine_settings
set published_value='"20260807200000"'::jsonb,
    draft_value='"20260807200000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';

commit;
