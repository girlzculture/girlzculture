-- New applicants keep verification addresses outside every public business row.
-- Existing businesses are unchanged: no backfill guesses their location model.
begin;
alter table public.salon_applications add column application_details jsonb not null default '{}'::jsonb;
alter table public.salons add column operator_type text check(operator_type in ('solo','team','multi'));
alter table public.salons add column service_location_type text check(service_location_type in ('storefront','chair_suite','home','mobile'));
alter table public.salons add column public_neighborhood text;
alter table public.salons add column offers_mobile boolean not null default false;
alter table public.salons add column travel_radius_miles numeric check(travel_radius_miles between 1 and 100);
alter table public.salons add column travel_fee_cents integer not null default 0 check(travel_fee_cents between 0 and 100000);
alter table public.salons add column home_address_public boolean not null default false;

create table public.business_verification_locations(
 salon_id uuid primary key references public.salons(id) on delete cascade,
 address_street text not null check(length(trim(address_street)) between 1 and 180),
 address_line2 text,
 address_city text not null,
 address_state text not null,
 address_zip text not null,
 latitude double precision check(latitude between -90 and 90),
 longitude double precision check(longitude between -180 and 180),
 formatted_address text,
 address_fingerprint text,
 geocode_status text not null default 'pending',
 geocode_failure_reason text,
 geocoded_at timestamptz,
 host_business_name text,
 visit_status text not null default 'pending' check(visit_status in ('pending','verified','rejected')),
 visited_at timestamptz,
 verified_by uuid references auth.users(id),
 visit_evidence text,
 updated_at timestamptz not null default now(),
 check(visit_status<>'verified' or (visited_at is not null and verified_by is not null and length(trim(visit_evidence))>=10))
);
alter table public.business_verification_locations enable row level security;
revoke all on public.business_verification_locations from public,anon,authenticated;
grant all on public.business_verification_locations to service_role;
comment on table public.business_verification_locations is 'Private verification address and precise coordinates. Only scoped server routes, approved staff review, and confirmed booking address access may read these records.';

create function public.master_business_location_projection() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare location public.business_verification_locations%rowtype;
begin
 if tg_op='UPDATE' and auth.role()='authenticated' and (new.operator_type,new.service_location_type,new.home_address_public,new.offers_mobile,new.travel_radius_miles,new.travel_fee_cents) is distinct from (old.operator_type,old.service_location_type,old.home_address_public,old.offers_mobile,old.travel_radius_miles,old.travel_fee_cents) then raise insufficient_privilege using message='LOCATION_REVIEW_ROUTE_REQUIRED';end if;
 -- The ordinary address-change trigger clears geocodes. Re-project an already
 -- reviewed private location after it, only when the owner explicitly permits
 -- its public display. Never reconstruct a private address from a public row.
 select * into location from public.business_verification_locations where salon_id=new.id;
 if found and new.service_location_type is not null and (new.service_location_type in ('storefront','chair_suite') or (new.service_location_type='home' and new.home_address_public)) then
  new.address_street:=location.address_street;new.address_line2:=location.address_line2;new.address_zip:=location.address_zip;
  new.address_city:=location.address_city;new.address_state:=location.address_state;
  new.latitude:=location.latitude;new.longitude:=location.longitude;new.formatted_address:=location.formatted_address;new.address_fingerprint:=location.address_fingerprint;
  new.geocode_status:=location.geocode_status;new.address_needs_review:=location.geocode_status<>'success';
 end if;
 if new.service_location_type in ('home','mobile') then
  if new.service_location_type='mobile' or not new.home_address_public then
   new.address_street:=null;new.address_line2:=null;new.address_zip:=null;
   new.latitude:=null;new.longitude:=null;new.formatted_address:=null;new.address_fingerprint:=null;
  end if;
 end if;
 if (new.operator_type='solo' or lower(coalesce(new.subscription_tier,'')) in ('solo','solo pro','solo-pro')) and (lower(coalesce(new.status,'')) in ('approved','active') or new.approved_at is not null or lower(coalesce(new.verification_status,''))='verified') then
  select * into location from public.business_verification_locations where salon_id=new.id;
  if location.visit_status is distinct from 'verified' then raise check_violation using message='IN_PERSON_VERIFICATION_REQUIRED';end if;
 end if;
 return new;
end $$;
revoke all on function public.master_business_location_projection() from public,anon,authenticated;
create trigger zz_master_business_location_projection before insert or update on public.salons for each row execute function public.master_business_location_projection();

create function public.master_application_visit_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.application_details->>'operator_type'='solo' and lower(new.status) in ('approved','active') and not exists(select 1 from public.business_verification_locations where salon_id=new.salon_id and visit_status='verified') then raise check_violation using message='IN_PERSON_VERIFICATION_REQUIRED';end if;
 return new;
end $$;
revoke all on function public.master_application_visit_guard() from public,anon,authenticated;
create trigger master_application_visit_guard before insert or update on public.salon_applications for each row execute function public.master_application_visit_guard();

create function public.submit_master_business_application(p_actor uuid,p_revision bigint,p_salon_values jsonb,p_application_values jsonb,p_details jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare draft public.business_application_progress%rowtype; result jsonb; business_id uuid;application_id uuid;published_values jsonb;private_address boolean;
begin
 -- The same lock as autosave makes final review/revision and submission atomic.
 perform pg_advisory_xact_lock(hashtextextended('application-progress:'||p_actor::text,0));
 select * into draft from public.business_application_progress where user_id=p_actor for update;
 if not found or draft.revision is distinct from p_revision then raise exception 'APPLICATION_DRAFT_STALE';end if;
 if draft.payload->>'plan' is distinct from p_application_values->>'selected_plan'
   or draft.payload->'fields' is distinct from p_application_values->'reviewed_fields'
   or draft.payload->'documents' is distinct from p_application_values->'document_urls'
   then raise exception 'APPLICATION_REVIEW_CHANGED';end if;
 if coalesce(p_details->>'operator_type','') not in ('solo','team','multi') or coalesce(p_details->>'location_type','') not in ('storefront','chair_suite','home','mobile') or
   ((p_details->>'operator_type'='solo') is distinct from (p_application_values->>'selected_plan' in ('Solo','Solo Pro'))) then raise check_violation using message='APPLICATION_SETUP_INVALID';end if;
 if exists(select 1 from public.salons where user_id=p_actor and (approved_at is not null or lower(status) in ('approved','active'))) then raise exception 'APPLICATION_ALREADY_APPROVED';end if;
 private_address:=p_details->>'location_type'='mobile' or (p_details->>'location_type'='home' and not coalesce((p_details->>'home_address_public')::boolean,false));
 published_values:=case when private_address then p_salon_values||jsonb_build_object('address_street',null,'address_line2',null,'address_zip',null) else p_salon_values end;
 result:=public.submit_salon_application_atomic(p_actor,published_values,p_application_values);
 business_id:=(result#>>'{salon,id}')::uuid;application_id:=(result#>>'{application,id}')::uuid;
 insert into public.business_verification_locations(salon_id,address_street,address_line2,address_city,address_state,address_zip,host_business_name)
 values(business_id,p_application_values->>'street_address',nullif(p_application_values->>'address_line2',''),p_application_values->>'city',p_application_values->>'state',p_application_values->>'zip_code',p_details->>'host_business_name')
 on conflict(salon_id) do update set address_street=excluded.address_street,address_line2=excluded.address_line2,address_city=excluded.address_city,address_state=excluded.address_state,address_zip=excluded.address_zip,host_business_name=excluded.host_business_name,
   visit_status='pending',visited_at=null,verified_by=null,visit_evidence=null,latitude=null,longitude=null,formatted_address=null,address_fingerprint=null,geocode_status='pending',geocoded_at=null,updated_at=now();
 update public.salons set operator_type=p_details->>'operator_type',service_location_type=p_details->>'location_type',home_address_public=coalesce((p_details->>'home_address_public')::boolean,false),
 public_neighborhood=nullif(p_details->>'public_neighborhood',''),offers_mobile=coalesce((p_details->>'offers_mobile')::boolean,false),travel_radius_miles=(p_details->>'travel_radius_miles')::numeric,travel_fee_cents=coalesce((p_details->>'travel_fee_cents')::integer,0),
 geocode_status='pending',address_needs_review=true,latitude=null,longitude=null,formatted_address=null where id=business_id;
 update public.salon_applications set application_details=p_details where id=application_id;
 update public.business_application_progress set submitted_application_id=application_id where user_id=p_actor;
 return jsonb_build_object('ok',true,'created_salon',result->'created_salon','salon',(select to_jsonb(s) from public.salons s where id=business_id),'application',(select to_jsonb(a) from public.salon_applications a where id=application_id));
end $$;
revoke all on function public.submit_master_business_application(uuid,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_master_business_application(uuid,bigint,jsonb,jsonb,jsonb) to service_role;

create table public.business_location_verification_events(
 id uuid primary key default gen_random_uuid(),salon_id uuid not null references public.salons(id),actor_id uuid not null references auth.users(id),
 status text not null,visited_at timestamptz,evidence text not null,created_at timestamptz not null default now()
);
alter table public.business_location_verification_events enable row level security;
revoke all on public.business_location_verification_events from public,anon,authenticated;
grant all on public.business_location_verification_events to service_role;
create function public.record_business_location_visit(p_salon uuid,p_actor uuid,p_status text,p_visited_at timestamptz,p_evidence text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare location public.business_verification_locations%rowtype;
begin
 if not exists(select 1 from public.admin_users a join public.platform_identities i on i.user_id=a.user_id where a.user_id=p_actor and a.status='Active' and i.status='Active' and (a.is_super_admin or coalesce((a.permissions->>'submissions')::boolean,false))) then raise insufficient_privilege using message='APPLICATION_REVIEW_FORBIDDEN';end if;
 if p_status not in ('verified','rejected') or p_visited_at is null or p_visited_at>now() or p_visited_at<now()-interval '1 year' or length(trim(p_evidence)) not between 10 and 2000 then raise check_violation using message='VERIFICATION_VISIT_EVIDENCE_REQUIRED';end if;
 select * into location from public.business_verification_locations where salon_id=p_salon for update;
 if not found then raise exception 'VERIFICATION_LOCATION_NOT_FOUND';end if;
 update public.business_verification_locations set visit_status=p_status,visited_at=p_visited_at,verified_by=p_actor,visit_evidence=trim(p_evidence),updated_at=now() where salon_id=p_salon returning * into location;
 insert into public.business_location_verification_events(salon_id,actor_id,status,visited_at,evidence) values(p_salon,p_actor,p_status,p_visited_at,trim(p_evidence));
 return jsonb_build_object('salon_id',p_salon,'visit_status',location.visit_status,'visited_at',location.visited_at,'verified_by',location.verified_by);
end $$;
revoke all on function public.record_business_location_visit(uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.record_business_location_visit(uuid,uuid,text,timestamptz,text) to service_role;
update public.engine_settings set published_value='"20260923044755"'::jsonb,draft_value='"20260923044755"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';

-- Private geocoding and public projection commit together; an old provider reply
-- cannot overwrite an address changed while the request was in flight.
create function public.commit_business_location_geocode(p_salon uuid,p_address jsonb,p_result jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare current_address jsonb; loc public.business_verification_locations%rowtype;
begin
 select * into loc from public.business_verification_locations where salon_id=p_salon for update;
 if not found then raise exception 'VERIFICATION_LOCATION_NOT_FOUND';end if;
 current_address:=jsonb_build_object('address_street',loc.address_street,'address_line2',loc.address_line2,'address_city',loc.address_city,'address_state',loc.address_state,'address_zip',loc.address_zip);
 if current_address is distinct from p_address then raise exception 'VERIFICATION_ADDRESS_CHANGED';end if;
 update public.business_verification_locations set latitude=(p_result->>'latitude')::double precision,longitude=(p_result->>'longitude')::double precision,
 formatted_address=p_result->>'formatted_address',address_fingerprint=p_result->>'address_fingerprint',geocode_status=p_result->>'geocode_status',geocode_failure_reason=p_result->>'geocode_failure_reason',geocoded_at=now(),updated_at=now() where salon_id=p_salon;
 update public.salons set latitude=(p_result->>'latitude')::double precision,longitude=(p_result->>'longitude')::double precision,
 formatted_address=p_result->>'formatted_address',address_fingerprint=p_result->>'address_fingerprint',geocode_status=p_result->>'geocode_status',geocode_failure_reason=p_result->>'geocode_failure_reason',address_needs_review=(p_result->>'geocode_status')<>'success',geocoded_at=now(),market_id=(p_result->>'market_id')::uuid,borough=p_result->>'borough' where id=p_salon;
end $$;
revoke all on function public.commit_business_location_geocode(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_business_location_geocode(uuid,jsonb,jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.discover_nearby_salons_ranked(origin_latitude double precision, origin_longitude double precision, radius_miles double precision DEFAULT 50, style_query text DEFAULT NULL::text, master_style_filter uuid DEFAULT NULL::uuid, minimum_rating numeric DEFAULT NULL::numeric, minimum_price numeric DEFAULT NULL::numeric, maximum_price numeric DEFAULT NULL::numeric, sort_mode text DEFAULT 'distance'::text, result_limit integer DEFAULT 20, result_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, slug text, address_city text, address_state text, borough text, cover_photo_url text, verification_status text, rating_overall numeric, review_count integer, latitude double precision, longitude double precision, starting_price numeric, services jsonb, distance_miles double precision, total_count bigint)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

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

      public.distance_miles(origin_latitude,origin_longitude,actual.lat,actual.lng) distance_miles

    from public.salons s cross join validated v
    left join public.business_verification_locations private_location on private_location.salon_id=s.id
    cross join lateral(select coalesce(private_location.latitude,s.latitude) lat,coalesce(private_location.longitude,s.longitude) lng) actual

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
      and (s.service_location_type is distinct from 'mobile' or public.distance_miles(origin_latitude,origin_longitude,actual.lat,actual.lng)<=s.travel_radius_miles)

      and lower(coalesce(s.status,''))='active'

      and coalesce(s.is_discoverable,false)

      and lower(coalesce(s.geocode_status,''))='success'

      and coalesce(s.address_needs_review,false)=false

      and actual.lat is not null and actual.lng is not null

      and actual.lat between origin_latitude-(v.radius/69.0) and origin_latitude+(v.radius/69.0)

      -- Longitude values wrap at +/-180. LEAST gives the shortest angular

      -- separation so salons on opposite sides of the antimeridian remain

      -- eligible for the exact great-circle radius check below.

      and least(

        abs(actual.lng-origin_longitude),

        360.0-abs(actual.lng-origin_longitude)

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

$function$;


create function public.confirmed_business_booking_location(p_booking uuid,p_customer uuid,p_guest_token uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype;s public.salons%rowtype;l public.business_verification_locations%rowtype;confirmed boolean;
begin
 select * into b from public.bookings where id=p_booking;
 if not found then raise insufficient_privilege using message='BOOKING_LOCATION_FORBIDDEN';end if;
 if p_guest_token is not null then
  if not exists(select 1 from public.booking_guest_access_tokens where id=p_guest_token and booking_id=b.id and purpose='manage' and revoked_at is null and expires_at>now()) then raise insufficient_privilege using message='BOOKING_LOCATION_FORBIDDEN';end if;
 elsif p_customer is null or b.customer_id is distinct from p_customer or not exists(select 1 from public.platform_identities i join auth.users u on u.id=i.user_id where i.user_id=p_customer and i.primary_role='customer' and i.status='Active' and i.email_normalized=lower(trim(u.email))) then raise insufficient_privilege using message='BOOKING_LOCATION_FORBIDDEN';end if;
 select * into s from public.salons where id=b.salon_id;
 confirmed:=lower(regexp_replace(b.status,'[ _-]','','g')) in ('confirmed','arrivingsoon','arrived','inprogress','completed');
 if s.service_location_type='home' and not s.home_address_public and confirmed then
  select * into l from public.business_verification_locations where salon_id=b.salon_id;
  return jsonb_build_object('location_type','home','address_street',l.address_street,'address_line2',l.address_line2,'address_city',l.address_city,'address_state',l.address_state,'address_zip',l.address_zip,'revealed_after_confirmation',true);
 end if;
 return jsonb_build_object('location_type',coalesce(s.service_location_type,'storefront'),'address_street',s.address_street,'address_line2',s.address_line2,'address_city',s.address_city,'address_state',s.address_state,'address_zip',s.address_zip,'public_neighborhood',s.public_neighborhood,'travel_radius_miles',s.travel_radius_miles,'revealed_after_confirmation',false);
end $$;
revoke all on function public.confirmed_business_booking_location(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirmed_business_booking_location(uuid,uuid,uuid) to service_role;

commit;
