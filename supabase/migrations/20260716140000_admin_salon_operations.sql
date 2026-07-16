-- Operational Admin Salons API support: immutable lifecycle audit and
-- database-side search/filter/radius pagination.
begin;

create table if not exists public.salon_status_audit (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  previous_status text not null,
  new_status text not null,
  reason text,
  acting_admin_id uuid not null references auth.users(id) on delete restrict,
  future_booking_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists salon_status_audit_salon_created_idx on public.salon_status_audit(salon_id, created_at desc);
alter table public.salon_status_audit enable row level security;
drop policy if exists salon_status_audit_admin_read on public.salon_status_audit;
create policy salon_status_audit_admin_read on public.salon_status_audit for select to authenticated using (public.admin_has_permission('salons'));

create or replace function public.prevent_salon_status_audit_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Salon status audit records are immutable.';
end;
$$;
drop trigger if exists salon_status_audit_immutable on public.salon_status_audit;
create trigger salon_status_audit_immutable before update or delete on public.salon_status_audit
for each row execute function public.prevent_salon_status_audit_mutation();

create or replace function public.admin_change_salon_status(
  acting_admin_id uuid,
  target_salon_id uuid,
  requested_status text,
  internal_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  admin_allowed boolean;
  salon_row public.salons%rowtype;
  normalized_status text;
  future_count integer;
begin
  select exists (
    select 1 from public.admin_users au
    where coalesce(au.user_id, au.id) = acting_admin_id
      and au.status = 'Active'
      and (coalesce(au.is_super_admin, false) or coalesce((au.permissions->>'salons')::boolean, false))
  ) into admin_allowed;
  if not admin_allowed then raise exception 'Forbidden'; end if;

  normalized_status := initcap(lower(trim(requested_status)));
  if normalized_status not in ('New','Pending','Active','Suspended','Offboarded') then raise exception 'Choose a valid salon status.'; end if;
  if normalized_status in ('Suspended','Offboarded') and length(trim(coalesce(internal_reason,''))) < 5 then raise exception 'Enter an internal reason of at least 5 characters.'; end if;

  select * into salon_row from public.salons where id = target_salon_id for update;
  if not found then raise exception 'Salon not found.'; end if;
  select count(*)::integer into future_count from public.bookings
    where salon_id = target_salon_id
      and appointment_datetime >= now()
      and lower(coalesce(status,'')) not in ('cancelled','canceled','completed');

  if salon_row.status = normalized_status then
    return jsonb_build_object('changed', false, 'status', salon_row.status, 'future_booking_count', future_count);
  end if;

  update public.salons set
    status = normalized_status,
    is_discoverable = case when normalized_status = 'Active' then is_discoverable else false end
  where id = target_salon_id;
  insert into public.salon_status_audit(salon_id,previous_status,new_status,reason,acting_admin_id,future_booking_count)
  values(target_salon_id,salon_row.status,normalized_status,nullif(trim(internal_reason),''),acting_admin_id,future_count);
  return jsonb_build_object('changed', true, 'previous_status', salon_row.status, 'status', normalized_status, 'future_booking_count', future_count);
end;
$$;
revoke all on function public.admin_change_salon_status(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_change_salon_status(uuid,uuid,text,text) to service_role;

create or replace function public.admin_list_salons(
  acting_admin_id uuid,
  search_text text default null,
  state_filter text default null,
  market_filter uuid default null,
  status_filter text default null,
  plan_filter text default null,
  minimum_rating numeric default null,
  address_review_filter boolean default null,
  center_latitude double precision default null,
  center_longitude double precision default null,
  radius_miles double precision default null,
  sort_field text default 'name',
  sort_direction text default 'asc',
  result_limit integer default 25,
  result_offset integer default 0
)
returns table (
  id uuid, name text, slug text, owner_name text, email text, phone text,
  logo_url text, cover_photo_url text, address_city text, address_state text,
  address_zip text, borough text, market_id uuid, market_name text,
  status text, subscription_tier text, subscription_status text,
  rating_overall numeric, review_count integer, address_needs_review boolean,
  geocode_status text, latitude double precision, longitude double precision,
  distance_miles double precision, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare admin_allowed boolean;
begin
  select exists (
    select 1 from public.admin_users au
    where coalesce(au.user_id, au.id) = acting_admin_id and au.status = 'Active'
      and (coalesce(au.is_super_admin,false) or coalesce((au.permissions->>'salons')::boolean,false))
  ) into admin_allowed;
  if not admin_allowed then raise exception 'Forbidden'; end if;
  if radius_miles is not null and (center_latitude is null or center_longitude is null) then raise exception 'Choose a center before applying a radius.'; end if;

  return query
  with filtered as (
    select s.*, m.name as resolved_market_name,
      case when center_latitude is not null and center_longitude is not null and s.latitude is not null and s.longitude is not null
        then public.distance_miles(center_latitude,center_longitude,s.latitude,s.longitude) else null end as resolved_distance
    from public.salons s left join public.location_markets m on m.id=s.market_id
    where (nullif(trim(search_text),'') is null or s.name ilike '%'||trim(search_text)||'%' or s.email ilike '%'||trim(search_text)||'%' or s.phone ilike '%'||trim(search_text)||'%' or s.id::text ilike trim(search_text)||'%')
      and (nullif(state_filter,'') is null or s.address_state=upper(state_filter))
      and (market_filter is null or s.market_id=market_filter)
      and (nullif(status_filter,'') is null or lower(s.status)=lower(status_filter))
      and (nullif(plan_filter,'') is null or lower(s.subscription_tier)=lower(plan_filter))
      and (minimum_rating is null or coalesce(s.rating_overall,0)>=minimum_rating)
      and (address_review_filter is null or s.address_needs_review=address_review_filter)
  ), radius_filtered as (
    select * from filtered where radius_miles is null or (resolved_distance is not null and resolved_distance<=greatest(1,least(250,radius_miles)))
  )
  select r.id,r.name,r.slug,r.owner_name,r.email,r.phone,r.logo_url,r.cover_photo_url,r.address_city,r.address_state,r.address_zip,r.borough,r.market_id,r.resolved_market_name,
    r.status,r.subscription_tier,r.subscription_status,coalesce(r.rating_overall,0)::numeric,coalesce(r.review_count,0)::integer,r.address_needs_review,r.geocode_status,r.latitude,r.longitude,r.resolved_distance,count(*) over()
  from radius_filtered r
  order by
    case when sort_field='rating' and sort_direction='desc' then r.rating_overall end desc nulls last,
    case when sort_field='rating' and sort_direction='asc' then r.rating_overall end asc nulls last,
    case when sort_field='reviews' and sort_direction='desc' then r.review_count end desc nulls last,
    case when sort_field='reviews' and sort_direction='asc' then r.review_count end asc nulls last,
    case when sort_field='status' and sort_direction='desc' then r.status end desc,
    case when sort_field='status' and sort_direction='asc' then r.status end asc,
    case when sort_field='distance' then r.resolved_distance end asc nulls last,
    case when sort_direction='desc' then r.name end desc,
    r.name asc,r.id asc
  limit greatest(1,least(100,coalesce(result_limit,25))) offset greatest(0,coalesce(result_offset,0));
end;
$$;
revoke all on function public.admin_list_salons(uuid,text,text,uuid,text,text,numeric,boolean,double precision,double precision,double precision,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.admin_list_salons(uuid,text,text,uuid,text,text,numeric,boolean,double precision,double precision,double precision,text,text,integer,integer) to service_role;

commit;
