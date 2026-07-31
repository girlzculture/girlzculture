-- Authorized platform administrators may schedule a complimentary placement
-- without fabricating payment evidence. The public eligibility gates remain
-- unchanged and every complimentary decision retains its actor and reason.
begin;

alter table public.featured_salon_campaigns
  add column if not exists placement_basis text not null default 'paid',
  add column if not exists complimentary_reason text,
  add column if not exists complimentary_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists complimentary_approved_at timestamptz;

alter table public.trending_video_campaigns
  add column if not exists placement_basis text not null default 'paid',
  add column if not exists complimentary_reason text,
  add column if not exists complimentary_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists complimentary_approved_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='featured_campaign_placement_basis_check') then
    alter table public.featured_salon_campaigns add constraint featured_campaign_placement_basis_check
      check (placement_basis in ('paid','complimentary_admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname='featured_campaign_complimentary_evidence_check') then
    alter table public.featured_salon_campaigns add constraint featured_campaign_complimentary_evidence_check
      check (placement_basis <> 'complimentary_admin' or
        (char_length(trim(coalesce(complimentary_reason,''))) >= 5 and complimentary_approved_by is not null and complimentary_approved_at is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname='trending_campaign_placement_basis_check') then
    alter table public.trending_video_campaigns add constraint trending_campaign_placement_basis_check
      check (placement_basis in ('paid','complimentary_admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname='trending_campaign_complimentary_evidence_check') then
    alter table public.trending_video_campaigns add constraint trending_campaign_complimentary_evidence_check
      check (placement_basis <> 'complimentary_admin' or
        (char_length(trim(coalesce(complimentary_reason,''))) >= 5 and complimentary_approved_by is not null and complimentary_approved_at is not null));
  end if;
end $$;

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
    left join public.marketing_entitlements e on e.id=c.entitlement_id and e.salon_id=c.salon_id
    join public.salons s on s.id=c.salon_id
    where origin_latitude between -90 and 90 and origin_longitude between -180 and 180
      and c.status in ('Active','Scheduled') and c.starts_at<=now() and c.ends_at>now()
      and (
        (c.placement_basis='complimentary_admin' and c.complimentary_approved_by is not null and char_length(trim(coalesce(c.complimentary_reason,'')))>=5)
        or
        (c.placement_basis='paid' and e.placement_type='Featured Salon' and e.status in ('Paid','Credited')
          and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now()))
      )
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
    left join public.marketing_entitlements e on e.id=c.entitlement_id and e.salon_id=c.salon_id
    join public.salons s on s.id=c.salon_id
    where origin_latitude between -90 and 90 and origin_longitude between -180 and 180
      and c.status in('Active','Scheduled') and c.moderation_status='Approved' and c.starts_at<=now() and c.ends_at>now()
      and (
        (c.placement_basis='complimentary_admin' and c.complimentary_approved_by is not null and char_length(trim(coalesce(c.complimentary_reason,'')))>=5)
        or
        (c.placement_basis='paid' and e.placement_type='Trending Video' and e.status in('Paid','Credited')
          and e.valid_from<=now() and(e.valid_until is null or e.valid_until>now()))
      )
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

create or replace function public.resolve_homepage_promotion_target(p_target_type text,p_target_id uuid)
returns table(target_type text,target_id uuid,salon_id uuid,campaign_id uuid,salon_name text,salon_slug text,cover_photo_url text,address_city text,address_state text)
language sql stable security definer set search_path=public as $$
  select 'salon'::text,salon.id,salon.id,null::uuid,salon.name,salon.slug,salon.cover_photo_url,salon.address_city,salon.address_state
  from public.salons salon
  where lower(trim(p_target_type))='salon' and salon.id=p_target_id and salon.slug is not null and public.is_marketplace_visible(salon.id)
  union all
  select 'campaign'::text,campaign.id,salon.id,campaign.id,salon.name,salon.slug,salon.cover_photo_url,salon.address_city,salon.address_state
  from public.featured_salon_campaigns campaign
  left join public.marketing_entitlements entitlement on entitlement.id=campaign.entitlement_id and entitlement.salon_id=campaign.salon_id
  join public.salons salon on salon.id=campaign.salon_id
  where lower(trim(p_target_type))='campaign' and campaign.id=p_target_id
    and campaign.status in('Active','Scheduled') and campaign.starts_at<=now() and campaign.ends_at>now()
    and (
      (campaign.placement_basis='complimentary_admin' and campaign.complimentary_approved_by is not null and char_length(trim(coalesce(campaign.complimentary_reason,'')))>=5)
      or
      (campaign.placement_basis='paid' and entitlement.placement_type='Featured Salon' and entitlement.status in('Paid','Credited')
        and entitlement.valid_from<=now() and(entitlement.valid_until is null or entitlement.valid_until>now()))
    )
    and salon.slug is not null and public.is_marketplace_visible(salon.id)
  limit 1
$$;
revoke all on function public.resolve_homepage_promotion_target(text,uuid) from public;
grant execute on function public.resolve_homepage_promotion_target(text,uuid) to anon,authenticated,service_role;

update public.engine_settings
set published_value='"20260731160000"'::jsonb,draft_value='"20260731160000"'::jsonb,updated_at=now()
where setting_key='integrations.expected_migration';

commit;
