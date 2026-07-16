-- Final marketplace discovery hardening: remove demonstration exceptions,
-- keep public salon reads column-safe, and add indexes for the production
-- discovery/campaign query paths.
begin;

create extension if not exists pg_trgm with schema extensions;

-- The public can only discover real, active, setup-complete, subscribed salons.
-- Owners and admins retain preview access through the same RLS helper.
create or replace function public.is_marketplace_visible(target_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.salons s
    where s.id = target_salon_id
      and (
        (
          s.status = 'Active'
          and s.is_discoverable = true
          and public.has_active_subscription(s.id)
          and public.salon_setup_complete(s.id)
        )
        or s.user_id = auth.uid()
        or public.is_admin()
      )
  );
$$;

revoke all on function public.is_marketplace_visible(uuid) from public;
grant execute on function public.is_marketplace_visible(uuid) to anon, authenticated;

-- RLS controls which rows are visible; column grants additionally prevent an
-- anonymous PostgREST request from asking for owner contact, subscription,
-- internal geocoding, payment, or moderation fields.
revoke select on table public.salons from anon;
revoke select on table public.salons from authenticated;
grant select (
  id, name, slug, description,
  address_street, address_line2, address_city, address_state, address_zip,
  latitude, longitude, hours, languages,
  logo_url, cover_photo_url, gallery_photos,
  verification_status, rating_overall, review_count,
  is_closed_override, closed_override_date, time_zone
) on table public.salons to anon, authenticated;

-- Campaign and audit rows are never directly public. Public discovery is only
-- through the narrow, customer-safe RPC return types.
revoke all on table public.marketing_entitlements from anon;
revoke all on table public.featured_salon_campaigns from anon;
revoke all on table public.featured_campaign_audit from anon;
revoke all on table public.trending_video_campaigns from anon;
revoke all on table public.trending_campaign_audit from anon;

create index if not exists salons_marketplace_coordinates_idx
  on public.salons(status, is_discoverable, subscription_status, address_needs_review, latitude, longitude)
  where latitude is not null and longitude is not null;

create index if not exists salons_public_name_trgm_idx
  on public.salons using gin (name extensions.gin_trgm_ops);

create index if not exists styles_discovery_idx
  on public.styles(salon_id, price_display_min, price_display_max, name);

create index if not exists master_styles_public_name_trgm_idx
  on public.master_styles using gin (name extensions.gin_trgm_ops)
  where is_active = true;

create index if not exists location_markets_public_name_trgm_idx
  on public.location_markets using gin (name extensions.gin_trgm_ops)
  where is_active = true;

create index if not exists subscriptions_discovery_status_idx
  on public.subscriptions(salon_id, status, current_period_end);

create index if not exists reviews_salon_rating_aggregation_idx
  on public.reviews(salon_id, rating_overall, created_at desc);

create index if not exists featured_campaigns_current_idx
  on public.featured_salon_campaigns(starts_at, ends_at, priority desc, rotation_weight desc, salon_id)
  where status in ('Scheduled', 'Active');

create index if not exists trending_campaigns_current_idx
  on public.trending_video_campaigns(starts_at, ends_at, priority desc, rotation_weight desc, salon_id)
  where status in ('Scheduled', 'Active') and moderation_status = 'Approved';

-- Recreate paid discovery RPCs against the canonical visibility predicate so
-- a campaign cannot keep an incomplete, lapsed, suspended, or hidden salon in
-- public discovery after its eligibility changes.
create or replace function public.discover_featured_salons(
  origin_latitude double precision, origin_longitude double precision,
  request_radius_miles double precision default 25, rotation_seed text default null,
  result_limit integer default 12, result_offset integer default 0
)
returns table(
  id uuid,name text,slug text,address_city text,address_state text,borough text,cover_photo_url text,
  verification_status text,rating_overall numeric,review_count integer,latitude double precision,longitude double precision,
  starting_price numeric,services jsonb,distance_miles double precision,total_count bigint
)
language sql stable security definer set search_path=public as $$
  with eligible as (
    select s.id,s.name,s.slug,s.address_city,s.address_state,s.borough,s.cover_photo_url,s.verification_status,
      coalesce(s.rating_overall,0)::numeric rating_overall,coalesce(s.review_count,0)::integer review_count,s.latitude,s.longitude,
      c.id campaign_id,c.priority,c.rotation_weight,c.radius_miles,
      public.distance_miles(origin_latitude,origin_longitude,s.latitude,s.longitude) distance_miles,
      (select min(st.price_display_min) from public.styles st where st.salon_id=s.id) starting_price,
      coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'name',st.name) order by st.name) from public.styles st where st.salon_id=s.id),'[]'::jsonb) services
    from public.featured_salon_campaigns c
    join public.marketing_entitlements e on e.id=c.entitlement_id and e.salon_id=c.salon_id
    join public.salons s on s.id=c.salon_id
    where origin_latitude between -90 and 90 and origin_longitude between -180 and 180
      and c.status in ('Active','Scheduled') and c.starts_at<=now() and c.ends_at>now()
      and e.placement_type='Featured Salon' and e.status in ('Paid','Credited')
      and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now())
      and public.is_marketplace_visible(s.id)
      and s.geocode_status='success' and s.address_needs_review=false
      and s.latitude is not null and s.longitude is not null
  ), local as (
    select *, (abs(hashtext(campaign_id::text||coalesce(rotation_seed,to_char(now(),'YYYY-MM-DD-HH24')))::bigint)/greatest(rotation_weight,0.1)) rotation_score
    from eligible where distance_miles<=least(greatest(1,least(250,request_radius_miles)),radius_miles)
  ), ordered as (
    select *,count(*) over() total_count from local
    order by floor(distance_miles/5.0),priority desc,rotation_score,distance_miles,id
  )
  select o.id,o.name,o.slug,o.address_city,o.address_state,o.borough,o.cover_photo_url,o.verification_status,o.rating_overall,o.review_count,
    o.latitude,o.longitude,o.starting_price,o.services,o.distance_miles,o.total_count
  from ordered o limit greatest(1,least(50,result_limit)) offset greatest(0,result_offset)
$$;
revoke all on function public.discover_featured_salons(double precision,double precision,double precision,text,integer,integer) from public;
grant execute on function public.discover_featured_salons(double precision,double precision,double precision,text,integer,integer) to anon,authenticated,service_role;

create or replace function public.discover_trending_videos(
  origin_latitude double precision,origin_longitude double precision,
  request_radius_miles double precision default 25,rotation_seed text default null,
  result_limit integer default 12,result_offset integer default 0
)
returns table(campaign_id uuid,video_url text,thumbnail_url text,description text,salon_id uuid,salon_name text,salon_slug text,address_city text,address_state text,borough text,distance_miles double precision,total_count bigint)
language sql stable security definer set search_path=public as $$
  with eligible as(
    select c.id campaign_id,c.video_url,c.thumbnail_url,c.description,s.id salon_id,s.name salon_name,s.slug salon_slug,s.address_city,s.address_state,s.borough,c.priority,c.rotation_weight,c.radius_miles,
      public.distance_miles(origin_latitude,origin_longitude,s.latitude,s.longitude) distance_miles
    from public.trending_video_campaigns c
    join public.marketing_entitlements e on e.id=c.entitlement_id and e.salon_id=c.salon_id
    join public.salons s on s.id=c.salon_id
    where origin_latitude between -90 and 90 and origin_longitude between -180 and 180
      and c.status in('Active','Scheduled') and c.moderation_status='Approved' and c.starts_at<=now() and c.ends_at>now()
      and e.placement_type='Trending Video' and e.status in('Paid','Credited')
      and e.valid_from<=now() and(e.valid_until is null or e.valid_until>now())
      and public.is_marketplace_visible(s.id)
      and s.geocode_status='success' and s.address_needs_review=false
      and s.latitude is not null and s.longitude is not null
  ),local as(
    select *,(abs(hashtext(campaign_id::text||coalesce(rotation_seed,to_char(now(),'YYYY-MM-DD-HH24')))::bigint)/greatest(rotation_weight,0.1)) rotation_score
    from eligible where distance_miles<=least(greatest(1,least(250,request_radius_miles)),radius_miles)
  ),ordered as(
    select *,count(*)over() total_count from local
    order by floor(distance_miles/5.0),priority desc,rotation_score,distance_miles,campaign_id
  )
  select o.campaign_id,o.video_url,o.thumbnail_url,o.description,o.salon_id,o.salon_name,o.salon_slug,o.address_city,o.address_state,o.borough,o.distance_miles,o.total_count
  from ordered o limit greatest(1,least(50,result_limit)) offset greatest(0,result_offset)
$$;
revoke all on function public.discover_trending_videos(double precision,double precision,double precision,text,integer,integer) from public;
grant execute on function public.discover_trending_videos(double precision,double precision,double precision,text,integer,integer) to anon,authenticated,service_role;

commit;
