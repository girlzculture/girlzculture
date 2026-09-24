begin;
alter table public.salons add column location_settings_revision bigint not null default 1;
create table public.business_location_settings_events (
 id uuid primary key default gen_random_uuid(),salon_id uuid not null references public.salons(id),
 actor_id uuid not null references auth.users(id),before_settings jsonb not null,after_settings jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.business_location_settings_events enable row level security;
revoke all on public.business_location_settings_events from public,anon,authenticated;
grant all on public.business_location_settings_events to service_role;

create function public.business_location_settings(p_salon uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('service_location_type',s.service_location_type,'home_address_public',s.home_address_public,
 'public_neighborhood',s.public_neighborhood,'offers_mobile',s.offers_mobile,'travel_radius_miles',s.travel_radius_miles,
 'travel_fee_cents',s.travel_fee_cents,'revision',s.location_settings_revision)
 from public.salons s where id=p_salon
$$;
revoke all on function public.business_location_settings(uuid) from public,anon,authenticated;
grant execute on function public.business_location_settings(uuid) to service_role;

create function public.update_business_location_settings(p_salon uuid,p_actor uuid,p_revision bigint,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare business public.salons%rowtype;location public.business_verification_locations%rowtype;before_value jsonb;after_value jsonb;mobile boolean;
begin
 select * into business from public.salons where id=p_salon for update;
 if not found or business.user_id is distinct from p_actor or not exists(
  select 1 from public.platform_identities i join auth.users u on u.id=i.user_id
  where i.user_id=p_actor and i.status='Active' and i.primary_role='salon_owner' and i.email_normalized=lower(trim(u.email))
 ) then raise insufficient_privilege using message='LOCATION_OWNER_REQUIRED';end if;
 if business.location_settings_revision is distinct from p_revision then raise exception 'LOCATION_SETTINGS_STALE';end if;
 select * into location from public.business_verification_locations where salon_id=p_salon;
 if not found or business.service_location_type is null then raise check_violation using message='LOCATION_REVIEW_REQUIRED';end if;
 if jsonb_typeof(p_settings) is distinct from 'object' or p_settings - array['home_address_public','public_neighborhood','offers_mobile','travel_radius_miles','travel_fee_cents'] <> '{}'::jsonb
  or not p_settings ?& array['home_address_public','public_neighborhood','offers_mobile','travel_radius_miles','travel_fee_cents']
  or jsonb_typeof(p_settings->'home_address_public') is distinct from 'boolean' or jsonb_typeof(p_settings->'offers_mobile') is distinct from 'boolean'
  or jsonb_typeof(p_settings->'public_neighborhood') is distinct from 'string' or length(p_settings->>'public_neighborhood')>120
 then raise check_violation using message='LOCATION_SETTINGS_INVALID';end if;
 mobile:=business.service_location_type='mobile' or (p_settings->>'offers_mobile')::boolean;
 if mobile and (jsonb_typeof(p_settings->'travel_radius_miles') is distinct from 'number' or (p_settings->>'travel_radius_miles')::numeric not between 1 and 100
  or jsonb_typeof(p_settings->'travel_fee_cents') is distinct from 'number' or (p_settings->>'travel_fee_cents')::numeric not between 0 and 100000
  or trunc((p_settings->>'travel_fee_cents')::numeric)<>(p_settings->>'travel_fee_cents')::numeric)
 then raise check_violation using message='LOCATION_TRAVEL_INVALID';end if;
 if business.service_location_type='home' and not (p_settings->>'home_address_public')::boolean and length(trim(p_settings->>'public_neighborhood'))<2 then raise check_violation using message='LOCATION_NEIGHBORHOOD_REQUIRED';end if;
 before_value:=public.business_location_settings(p_salon);
 update public.salons set home_address_public=case when service_location_type='home' then (p_settings->>'home_address_public')::boolean else false end,
 public_neighborhood=nullif(trim(p_settings->>'public_neighborhood'),''),offers_mobile=mobile,
 travel_radius_miles=case when mobile then (p_settings->>'travel_radius_miles')::numeric else null end,
 travel_fee_cents=case when mobile then (p_settings->>'travel_fee_cents')::integer else 0 end,
 -- The projection trigger redacts private home/mobile fields atomically.
 address_street=location.address_street,address_line2=location.address_line2,address_zip=location.address_zip,
 latitude=location.latitude,longitude=location.longitude,formatted_address=location.formatted_address,address_fingerprint=location.address_fingerprint,
 location_settings_revision=location_settings_revision+1
 where id=p_salon;
 after_value:=public.business_location_settings(p_salon);
 insert into public.business_location_settings_events(salon_id,actor_id,before_settings,after_settings) values(p_salon,p_actor,before_value,after_value);
 return after_value;
end $$;
revoke all on function public.update_business_location_settings(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.update_business_location_settings(uuid,uuid,bigint,jsonb) to service_role;
create or replace function public.salon_lifecycle_diagnostic(p_salon_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_salon public.salons%rowtype;
  v_application public.salon_applications%rowtype;
  v_location public.business_verification_locations%rowtype;
  v_config jsonb;
  v_required jsonb;
  v_checks jsonb;
  v_required_count integer;
  v_passed_count integer;
  v_progress integer;
  v_complete boolean;
  v_gallery_count integer;
  v_gallery_required integer;
  v_has_hours boolean;
  v_has_service boolean;
  v_has_stylist boolean;
  v_subscription_active boolean;
begin
  select * into v_salon from public.salons where id = p_salon_id;
  if not found then raise exception 'Salon not found.'; end if;
  if v_salon.service_location_type is not null then
    select * into v_location from public.business_verification_locations where salon_id=p_salon_id;
    if found then
      v_salon.address_street:=v_location.address_street;v_salon.address_city:=v_location.address_city;v_salon.address_state:=v_location.address_state;v_salon.address_zip:=v_location.address_zip;
      v_salon.latitude:=v_location.latitude;v_salon.longitude:=v_location.longitude;v_salon.geocode_status:=v_location.geocode_status;v_salon.address_needs_review:=v_location.geocode_status<>'success';
    end if;
  end if;


  select * into v_application
  from public.salon_applications
  where salon_id = p_salon_id
  order by submitted_at desc
  limit 1;

  select value into v_config from public.admin_settings where key = 'salon_lifecycle';
  v_config := coalesce(v_config, '{}'::jsonb);
  v_required := coalesce(v_config -> 'required', '{}'::jsonb);
  v_gallery_required := greatest(0, coalesce((v_required ->> 'gallery_photos')::integer, 3));
  v_gallery_count := jsonb_array_length(
    case
      when jsonb_typeof(coalesce(to_jsonb(v_salon.gallery_photos), '[]'::jsonb)) = 'array'
      then coalesce(to_jsonb(v_salon.gallery_photos), '[]'::jsonb)
      else '[]'::jsonb
    end
  );

  select exists (
    select 1
    from jsonb_each(coalesce(to_jsonb(v_salon.hours), '{}'::jsonb)) day
    where jsonb_typeof(day.value) = 'object'
      and coalesce((day.value ->> 'closed')::boolean, false) = false
      and nullif(day.value ->> 'open', '') is not null
      and nullif(day.value ->> 'close', '') is not null
  ) into v_has_hours;

  select exists (
    select 1 from public.styles service
    where service.salon_id = p_salon_id
      and coalesce(service.base_price, service.price_display_min) is not null
      and coalesce(service.base_price, service.price_display_min) >= 0
      and coalesce(service.duration_min_hours, 0) > 0
      and coalesce(service.duration_max_hours, service.duration_min_hours, 0) >= service.duration_min_hours
  ) into v_has_service;

  select v_salon.owner_is_sole_stylist or exists (
    select 1 from public.stylists stylist
    where stylist.salon_id = p_salon_id
      and stylist.is_active is distinct from false
  ) into v_has_stylist;

  v_subscription_active := lower(coalesce(v_salon.subscription_status, '')) in ('active', 'trialing');

  v_checks := jsonb_build_object(
    'application_approved', jsonb_build_object(
      'label', 'Application and identity approved',
      'required', coalesce((v_required ->> 'application_approved')::boolean, true),
      'passed', coalesce(v_application.status in ('Approved', 'Active'), false) or v_salon.approved_at is not null,
      'action', '/salon/application-submitted'
    ),
    'business_name', jsonb_build_object(
      'label', 'Business name',
      'required', coalesce((v_required ->> 'business_name')::boolean, true),
      'passed', nullif(trim(coalesce(v_salon.name, '')), '') is not null and v_salon.name <> 'Pending salon application',
      'action', '/salon/dashboard/my-page'
    ),
    'structured_address', jsonb_build_object(
      'label', 'Complete US street address',
      'required', coalesce((v_required ->> 'structured_address')::boolean, true),
      'passed', nullif(trim(coalesce(v_salon.address_street, '')), '') is not null
        and nullif(trim(coalesce(v_salon.address_city, '')), '') is not null
        and coalesce(v_salon.address_state, '') ~ '^[A-Z]{2}$'
        and coalesce(v_salon.address_zip, '') ~ '^[0-9]{5}(-[0-9]{4})?$',
      'action', '/salon/dashboard/my-page'
    ),
    'precise_geocoding', jsonb_build_object(
      'label', 'Verified map location',
      'required', coalesce((v_required ->> 'precise_geocoding')::boolean, true),
      'passed', v_salon.geocode_status = 'success' and not v_salon.address_needs_review
        and v_salon.latitude is not null and v_salon.longitude is not null,
      'action', '/salon/dashboard/my-page'
    ),
    'logo', jsonb_build_object(
      'label', 'Salon logo',
      'required', coalesce((v_required ->> 'logo')::boolean, true),
      'passed', nullif(trim(coalesce(v_salon.logo_url, '')), '') is not null,
      'action', '/salon/dashboard/my-page'
    ),
    'cover_photo', jsonb_build_object(
      'label', 'Cover image',
      'required', coalesce((v_required ->> 'cover_photo')::boolean, true),
      'passed', nullif(trim(coalesce(v_salon.cover_photo_url, '')), '') is not null,
      'action', '/salon/dashboard/photos'
    ),
    'gallery_photos', jsonb_build_object(
      'label', format('At least %s gallery photos', v_gallery_required),
      'required', v_gallery_required > 0,
      'passed', v_gallery_count >= v_gallery_required,
      'current', v_gallery_count,
      'target', v_gallery_required,
      'action', '/salon/dashboard/photos'
    ),
    'business_details', jsonb_build_object(
      'label', 'Description and contact information',
      'required', coalesce((v_required ->> 'business_details')::boolean, true),
      'passed', length(trim(coalesce(v_salon.description, ''))) >= 40
        and nullif(trim(coalesce(v_salon.email, '')), '') is not null
        and nullif(trim(coalesce(v_salon.phone, '')), '') is not null,
      'action', '/salon/dashboard/my-page'
    ),
    'priced_service', jsonb_build_object(
      'label', 'Bookable service with price and duration',
      'required', coalesce((v_required ->> 'priced_service')::boolean, true),
      'passed', v_has_service,
      'action', '/salon/dashboard/styles'
    ),
    'active_stylist', jsonb_build_object(
      'label', 'Active stylist or confirmed owner-stylist',
      'required', coalesce((v_required ->> 'active_stylist')::boolean, true),
      'passed', v_has_stylist,
      'action', '/salon/dashboard/stylists'
    ),
    'business_hours', jsonb_build_object(
      'label', 'Business hours and availability',
      'required', coalesce((v_required ->> 'business_hours')::boolean, true),
      'passed', v_has_hours,
      'action', '/salon/dashboard/availability'
    ),
    'active_subscription', jsonb_build_object(
      'label', 'Active subscription',
      'required', coalesce((v_required ->> 'active_subscription')::boolean, true),
      'passed', v_subscription_active,
      'action', '/salon/dashboard/subscription'
    ),
    'payout_account', jsonb_build_object(
      'label', 'Payout account connected',
      'required', coalesce((v_required ->> 'payout_account')::boolean, false),
      'passed', nullif(trim(coalesce(v_salon.stripe_account_id, '')), '') is not null,
      'action', '/salon/dashboard/earnings'
    ),
    'agreements', jsonb_build_object(
      'label', 'Required agreements and media permissions',
      'required', coalesce((v_required ->> 'agreements')::boolean, true),
      'passed', coalesce(v_application.consent_authorized, false)
        and coalesce(v_application.consent_terms, false)
        and coalesce(v_application.consent_photos, false)
        and v_salon.media_consent,
      'action', '/salon/dashboard/my-page'
    )
  );

  select
    count(*) filter (where coalesce((item.value ->> 'required')::boolean, false)),
    count(*) filter (
      where coalesce((item.value ->> 'required')::boolean, false)
        and coalesce((item.value ->> 'passed')::boolean, false)
    )
  into v_required_count, v_passed_count
  from jsonb_each(v_checks) item;

  v_complete := v_required_count = v_passed_count;
  v_progress := case when v_required_count = 0 then 100 else round((v_passed_count::numeric / v_required_count) * 100)::integer end;

  return jsonb_build_object(
    'salon_id', v_salon.id,
    'salon_name', v_salon.name,
    'slug', v_salon.slug,
    'status', v_salon.status,
    'subscription_status', v_salon.subscription_status,
    'is_discoverable', v_salon.is_discoverable,
    'progress', v_progress,
    'required_count', v_required_count,
    'passed_count', v_passed_count,
    'all_required_complete', v_complete,
    'checks', v_checks,
    'auto_activation', coalesce((v_config ->> 'auto_activation')::boolean, true),
    'loss_behavior', coalesce(v_config ->> 'loss_behavior', 'needs_attention'),
    'grace_period_days', greatest(0, coalesce((v_config ->> 'grace_period_days')::integer, 7)),
    'public_eligible', v_complete and v_salon.status not in ('Suspended', 'Offboarded'),
    'eligibility_lost_at', v_salon.eligibility_lost_at,
    'eligibility_grace_until', v_salon.eligibility_grace_until
  );
end;
$$;



-- Add business-type selection without changing the established distance/ranking.
-- Filter the complete ranked set before pagination; never expose private addresses.
create function public.discover_nearby_salons_ranked_for_businesses(
 origin_latitude double precision,origin_longitude double precision,radius_miles double precision default 50,
 style_query text default null,master_style_filter uuid default null,minimum_rating numeric default null,
 minimum_price numeric default null,maximum_price numeric default null,sort_mode text default 'distance',
 result_limit integer default 20,result_offset integer default 0,independent_only boolean default false,travels_only boolean default false)
returns table(id uuid,name text,slug text,address_city text,address_state text,borough text,cover_photo_url text,
 verification_status text,rating_overall numeric,review_count integer,latitude double precision,longitude double precision,
 starting_price numeric,services jsonb,distance_miles double precision,total_count bigint,
 independent_professional boolean,travels_to_you boolean,travel_radius_miles numeric)
language sql stable security definer set search_path=pg_catalog,public as $$
 with eligible as (
 select r.*,s.operator_type='solo' independent_professional,
   (s.service_location_type='mobile' or s.offers_mobile) travels_to_you,s.travel_radius_miles
 from public.discover_nearby_salons_ranked(origin_latitude,origin_longitude,radius_miles,style_query,master_style_filter,
  minimum_rating,minimum_price,maximum_price,sort_mode,0,0) with ordinality r
 join public.salons s on s.id=r.id
 where (not independent_only or s.operator_type='solo')
  and (not travels_only or ((s.service_location_type='mobile' or s.offers_mobile) and r.distance_miles<=s.travel_radius_miles))
 )
 select e.id,e.name,e.slug,e.address_city,e.address_state,e.borough,e.cover_photo_url,e.verification_status,
 e.rating_overall,e.review_count,e.latitude,e.longitude,e.starting_price,e.services,e.distance_miles,count(*)over(),
 e.independent_professional,e.travels_to_you,e.travel_radius_miles
 from eligible e order by e.ordinality
 limit case when result_limit=0 then null else greatest(1,least(result_limit,50)) end offset greatest(0,result_offset);
$$;
revoke all on function public.discover_nearby_salons_ranked_for_businesses(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer,boolean,boolean) from public,anon,authenticated;
grant execute on function public.discover_nearby_salons_ranked_for_businesses(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer,boolean,boolean) to service_role;
commit;
