-- Launch discovery defaults and bounded tier weighting within the truthful
-- local candidate set. Subscription details are never returned to customers.
begin;

update public.engine_settings
set draft_value='50'::jsonb,published_value='50'::jsonb,version=version+1,published_version=greatest(published_version+1,version+1),updated_at=now(),published_at=now()
where setting_key='search.default_radius_miles'
  and coalesce(published_value,'25'::jsonb)='25'::jsonb;

insert into public.engine_settings(setting_key,category,display_name,description,value_type,draft_value,published_value,status,impact_level,validation,help_text,impact_description,is_public,is_secret_status,sort_order)
values(
  'search.max_plan_distance_bonus_miles','search_language','Maximum plan ranking distance bonus',
  'Largest proximity adjustment a qualifying plan may receive after local radius and service eligibility are enforced.',
  'number','1.5','1.5','Published','customer','{"min":0,"max":3}',
  'Premium receives the configured maximum and Growth receives half. Zero disables the adjustment. Plans never bypass the local radius.',
  'Within an eligible local set, adjusted distance = real distance minus at most this many miles. Real distance remains the tie-breaker.',
  false,false,20
)
on conflict(setting_key) do nothing;

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
      greatest(0.0,least(3.0,public.engine_number_setting('search.max_plan_distance_bonus_miles',1.5)::double precision)) max_bonus
  ), candidates as(
    select s.id,s.name,s.slug,s.address_city,s.address_state,s.borough,s.cover_photo_url,s.verification_status,
      coalesce(s.rating_overall,0)::numeric rating_overall,coalesce(s.review_count,0)::integer review_count,
      s.latitude::double precision latitude,s.longitude::double precision longitude,prices.starting_price,
      coalesce(service_list.services,'[]'::jsonb) services,
      public.distance_miles(origin_latitude,origin_longitude,s.latitude,s.longitude) distance_miles,
      case lower(coalesce(s.subscription_tier,'')) when 'premium' then v.max_bonus when 'growth' then v.max_bonus/2 else 0 end plan_distance_bonus
    from public.salons s cross join validated v
    left join lateral(select min(st.price_display_min)::numeric starting_price from public.styles st where st.salon_id=s.id and st.archived_at is null and st.price_display_min>=0) prices on true
    left join lateral(select jsonb_agg(jsonb_build_object('id',listed.id,'name',listed.name) order by listed.name) services from(select st.id,st.name from public.styles st where st.salon_id=s.id and st.archived_at is null order by st.name limit 12)listed)service_list on true
    where public.is_marketplace_visible(s.id) and s.status='Active' and s.is_discoverable and s.subscription_status in('active','trialing')
      and s.geocode_status='success' and not s.address_needs_review and s.latitude is not null and s.longitude is not null
      and s.latitude between origin_latitude-(v.radius/69.0) and origin_latitude+(v.radius/69.0)
      and s.longitude between origin_longitude-(v.radius/(69.172*greatest(0.01,cos(radians(origin_latitude))))) and origin_longitude+(v.radius/(69.172*greatest(0.01,cos(radians(origin_latitude)))))
      and(nullif(trim(style_query),'') is null or exists(select 1 from public.styles fs where fs.salon_id=s.id and fs.archived_at is null and fs.name ilike '%'||trim(style_query)||'%'))
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
comment on function public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,numeric,numeric,numeric,text,integer,integer) is 'Eligible local salons only. Adjusted distance subtracts a bounded 0..3 mile plan bonus; real distance is the next sort key and subscription tier is never returned.';

commit;
