begin;

-- Search previously required both the authoritative subscription relation and
-- the denormalized salons.subscription_status mirror. A delayed mirror update
-- could therefore hide an otherwise public, subscribed salon. Keep a single
-- source of truth through is_marketplace_visible/has_active_subscription.
create or replace function public.discover_nearby_salons_ranked(
  origin_latitude double precision,
  origin_longitude double precision,
  radius_miles double precision default 50,
  style_query text default null,
  minimum_rating numeric default null,
  minimum_price numeric default null,
  maximum_price numeric default null,
  sort_mode text default 'distance',
  result_limit integer default 20,
  result_offset integer default 0
)
returns table(id uuid,name text,slug text,address_city text,address_state text,borough text,cover_photo_url text,verification_status text,rating_overall numeric,review_count integer,latitude double precision,longitude double precision,starting_price numeric,services jsonb,distance_miles double precision,total_count bigint)
language sql stable security invoker set search_path=public as $$
  with validated as(
    select greatest(1.0,least(100.0,coalesce(radius_miles,50.0))) radius,
      greatest(1,least(50,coalesce(result_limit,20))) page_size,
      greatest(0,coalesce(result_offset,0)) page_offset,
      greatest(0.0,least(3.0,public.engine_number_setting('search.max_plan_distance_bonus_miles',1.5)::double precision)) max_bonus,
      nullif(public.normalize_marketplace_search(style_query),'') normalized_style
  ), candidates as(
    select s.id,s.name,s.slug,s.address_city,s.address_state,s.borough,s.cover_photo_url,s.verification_status,
      coalesce(s.rating_overall,0)::numeric rating_overall,coalesce(s.review_count,0)::integer review_count,
      s.latitude::double precision latitude,s.longitude::double precision longitude,prices.starting_price,
      coalesce(service_list.services,'[]'::jsonb) services,
      public.distance_miles(origin_latitude,origin_longitude,s.latitude,s.longitude) distance_miles,
      case lower(coalesce(s.subscription_tier,'')) when 'premium' then v.max_bonus when 'growth' then v.max_bonus/2 else 0 end plan_distance_bonus
    from public.salons s cross join validated v
    left join lateral(select min(st.price_display_min)::numeric starting_price from public.styles st where st.salon_id=s.id and st.archived_at is null and coalesce(st.is_draft,false)=false and st.price_display_min>=0) prices on true
    left join lateral(select jsonb_agg(jsonb_build_object('id',listed.id,'name',listed.name) order by listed.name) services from(select st.id,st.name from public.styles st where st.salon_id=s.id and st.archived_at is null and coalesce(st.is_draft,false)=false order by st.name limit 12)listed)service_list on true
    where public.is_marketplace_visible(s.id)
      and lower(coalesce(s.status,''))='active'
      and coalesce(s.is_discoverable,false)
      and lower(coalesce(s.geocode_status,''))='success'
      and coalesce(s.address_needs_review,false)=false
      and s.latitude is not null and s.longitude is not null
      and s.latitude between origin_latitude-(v.radius/69.0) and origin_latitude+(v.radius/69.0)
      and s.longitude between origin_longitude-(v.radius/(69.172*greatest(0.01,cos(radians(origin_latitude))))) and origin_longitude+(v.radius/(69.172*greatest(0.01,cos(radians(origin_latitude)))))
      and(v.normalized_style is null or exists(
        select 1 from public.styles fs
        where fs.salon_id=s.id and fs.archived_at is null and coalesce(fs.is_draft,false)=false
          and (
            public.normalize_marketplace_search(fs.name) like '%'||v.normalized_style||'%'
            or v.normalized_style like '%'||public.normalize_marketplace_search(fs.name)||'%'
          )
      ))
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
    case when sort_mode='distance' then greatest(0,e.distance_miles-e.plan_distance_bonus) end asc nulls last,
    e.distance_miles asc,e.rating_overall desc,e.review_count desc,e.id
  limit(select page_size from validated) offset(select page_offset from validated)
$$;

revoke all on function public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,numeric,numeric,numeric,text,integer,integer) from public;
grant execute on function public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,numeric,numeric,numeric,text,integer,integer) to anon,authenticated;
comment on function public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,numeric,numeric,numeric,text,integer,integer) is 'Organic local discovery uses authoritative marketplace/subscription eligibility, canonical miles, normalized service matching, and bounded tier ranking only after radius eligibility.';

commit;
