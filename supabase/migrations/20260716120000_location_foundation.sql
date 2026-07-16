-- Girlz Culture location foundation: normalized salon coordinates, address
-- change detection, expandable markets, and one shared distance primitive.
begin;

create table if not exists public.location_markets (
  id uuid primary key default gen_random_uuid(),
  state_code text not null,
  name text not null,
  slug text not null unique,
  market_type text not null default 'metro',
  parent_market_id uuid references public.location_markets(id) on delete set null,
  center_latitude double precision not null,
  center_longitude double precision not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_markets_state_check check (state_code ~ '^[A-Z]{2}$'),
  constraint location_markets_type_check check (market_type in ('metro','city','borough','service_area')),
  constraint location_markets_latitude_check check (center_latitude between -90 and 90),
  constraint location_markets_longitude_check check (center_longitude between -180 and 180)
);

create index if not exists location_markets_state_active_idx
  on public.location_markets(state_code, is_active, name);

alter table public.location_markets enable row level security;
drop policy if exists location_markets_public_read on public.location_markets;
create policy location_markets_public_read on public.location_markets
  for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists location_markets_admin_write on public.location_markets;
create policy location_markets_admin_write on public.location_markets
  for all to authenticated
  using (public.admin_has_permission('salons'))
  with check (public.admin_has_permission('salons'));

alter table public.salons
  add column if not exists address_country text not null default 'US',
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists formatted_address text,
  add column if not exists address_fingerprint text,
  add column if not exists geocode_status text not null default 'pending',
  add column if not exists geocode_failure_reason text,
  add column if not exists geocoded_at timestamptz,
  add column if not exists address_needs_review boolean not null default false,
  add column if not exists market_id uuid references public.location_markets(id) on delete set null,
  add column if not exists borough text;

alter table public.salons drop constraint if exists salons_address_country_check;
alter table public.salons add constraint salons_address_country_check check (address_country = 'US') not valid;
alter table public.salons validate constraint salons_address_country_check;
alter table public.salons drop constraint if exists salons_latitude_check;
alter table public.salons add constraint salons_latitude_check check (latitude is null or latitude between -90 and 90) not valid;
alter table public.salons validate constraint salons_latitude_check;
alter table public.salons drop constraint if exists salons_longitude_check;
alter table public.salons add constraint salons_longitude_check check (longitude is null or longitude between -180 and 180) not valid;
alter table public.salons validate constraint salons_longitude_check;
alter table public.salons drop constraint if exists salons_geocode_status_check;
alter table public.salons add constraint salons_geocode_status_check
  check (geocode_status in ('pending','success','needs_review')) not valid;
alter table public.salons validate constraint salons_geocode_status_check;
alter table public.salons drop constraint if exists salons_coordinate_pair_check;
alter table public.salons add constraint salons_coordinate_pair_check
  check ((latitude is null) = (longitude is null)) not valid;
alter table public.salons validate constraint salons_coordinate_pair_check;

create or replace function public.normalized_salon_address_fingerprint(
  line_1 text, line_2 text, city text, state_code text, postal_code text, country_code text
)
returns text
language sql
immutable
parallel safe
as $$
  select md5(lower(regexp_replace(concat_ws('|',
    trim(coalesce(line_1,'')), trim(coalesce(line_2,'')), trim(coalesce(city,'')),
    upper(trim(coalesce(state_code,''))), trim(coalesce(postal_code,'')),
    upper(trim(coalesce(country_code,'US')))
  ), '\\s+', ' ', 'g')));
$$;

create or replace function public.prepare_salon_geocoding()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_fingerprint text;
  address_complete boolean;
begin
  new.address_country := 'US';
  next_fingerprint := public.normalized_salon_address_fingerprint(
    new.address_street, new.address_line2, new.address_city,
    new.address_state, new.address_zip, new.address_country
  );
  address_complete := nullif(trim(coalesce(new.address_street,'')), '') is not null
    and nullif(trim(coalesce(new.address_city,'')), '') is not null
    and nullif(trim(coalesce(new.address_state,'')), '') is not null
    and nullif(trim(coalesce(new.address_zip,'')), '') is not null;

  if tg_op = 'INSERT' or next_fingerprint is distinct from old.address_fingerprint then
    new.address_fingerprint := next_fingerprint;
    new.latitude := null;
    new.longitude := null;
    new.formatted_address := null;
    new.geocoded_at := null;
    new.market_id := null;
    new.borough := null;
    new.address_needs_review := not address_complete;
    new.geocode_status := case when address_complete then 'pending' else 'needs_review' end;
    new.geocode_failure_reason := case when address_complete then null else 'Structured address is incomplete.' end;
  end if;
  return new;
end;
$$;

drop trigger if exists salons_prepare_geocoding on public.salons;
create trigger salons_prepare_geocoding
before insert or update of address_street, address_line2, address_city, address_state, address_zip, address_country
on public.salons for each row execute function public.prepare_salon_geocoding();

update public.salons
set address_fingerprint = public.normalized_salon_address_fingerprint(
      address_street, address_line2, address_city, address_state, address_zip, address_country
    ),
    geocode_status = case
      when latitude is not null and longitude is not null then 'success'
      when nullif(trim(coalesce(address_street,'')), '') is null
        or nullif(trim(coalesce(address_city,'')), '') is null
        or nullif(trim(coalesce(address_state,'')), '') is null
        or nullif(trim(coalesce(address_zip,'')), '') is null then 'needs_review'
      else 'pending'
    end,
    address_needs_review = case
      when latitude is not null and longitude is not null then false
      when nullif(trim(coalesce(address_street,'')), '') is null
        or nullif(trim(coalesce(address_city,'')), '') is null
        or nullif(trim(coalesce(address_state,'')), '') is null
        or nullif(trim(coalesce(address_zip,'')), '') is null then true
      else false
    end
where address_fingerprint is null;

create index if not exists salons_geocode_status_idx
  on public.salons(geocode_status, address_needs_review);
create index if not exists salons_coordinates_idx
  on public.salons(latitude, longitude)
  where geocode_status = 'success' and latitude is not null and longitude is not null;
create index if not exists salons_market_status_idx
  on public.salons(market_id, status, is_discoverable);

create or replace function public.distance_miles(
  latitude_1 double precision,
  longitude_1 double precision,
  latitude_2 double precision,
  longitude_2 double precision
)
returns double precision
language sql
immutable
parallel safe
strict
as $$
  select 2 * 3958.7613 * asin(sqrt(least(1.0,
    power(sin(radians(latitude_2 - latitude_1) / 2), 2)
    + cos(radians(latitude_1)) * cos(radians(latitude_2))
      * power(sin(radians(longitude_2 - longitude_1) / 2), 2)
  )));
$$;
revoke all on function public.distance_miles(double precision,double precision,double precision,double precision) from public;
grant execute on function public.distance_miles(double precision,double precision,double precision,double precision) to anon, authenticated;

insert into public.location_markets(state_code,name,slug,market_type,center_latitude,center_longitude)
values
  ('NY','New York City','new-york-city','metro',40.7128,-74.0060),
  ('NY','Manhattan','manhattan','borough',40.7831,-73.9712),
  ('NY','Brooklyn','brooklyn','borough',40.6782,-73.9442),
  ('NY','Queens','queens','borough',40.7282,-73.7949),
  ('NY','Bronx','bronx','borough',40.8448,-73.8648),
  ('NY','Staten Island','staten-island','borough',40.5795,-74.1502),
  ('NY','Buffalo','buffalo','city',42.8864,-78.8784),
  ('NY','Syracuse','syracuse','city',43.0481,-76.1474),
  ('NY','Rochester','rochester','city',43.1566,-77.6088),
  ('NY','Albany','albany','city',42.6526,-73.7562)
on conflict (slug) do update set
  state_code = excluded.state_code,
  name = excluded.name,
  market_type = excluded.market_type,
  center_latitude = excluded.center_latitude,
  center_longitude = excluded.center_longitude,
  is_active = true,
  updated_at = now();

comment on column public.salons.geocode_failure_reason is 'Internal correction guidance; never expose through public discovery APIs.';
comment on function public.distance_miles(double precision,double precision,double precision,double precision) is 'Canonical Girlz Culture great-circle distance in miles.';

commit;
