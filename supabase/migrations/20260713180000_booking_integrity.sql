-- Section 1: hard booking integrity, timezone discipline, and checkout reservations.
-- Run after 20260713130000_truthfulness_content_slots.sql.
begin;

create extension if not exists btree_gist;

alter table public.salons
  add column if not exists time_zone text not null default 'America/New_York';

alter table public.styles
  add column if not exists buffer_minutes integer not null default 15
  check (buffer_minutes between 0 and 180);

-- The original schema stored UTC ISO values in a timestamp-without-time-zone
-- column. Convert those UTC clock values to real instants before constructing
-- any booking ranges. The type check keeps this safe to rerun.
do $$
declare
  appointment_type text;
begin
  select data_type into appointment_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'bookings'
    and column_name = 'appointment_datetime';

  if appointment_type = 'timestamp without time zone' then
    execute $ddl$
      alter table public.bookings
      alter column appointment_datetime type timestamptz
      using appointment_datetime at time zone 'UTC'
    $ddl$;
  elsif appointment_type is distinct from 'timestamp with time zone' then
    raise exception 'Unsupported bookings.appointment_datetime type: %', appointment_type;
  end if;
end;
$$;

alter table public.bookings
  add column if not exists buffer_minutes integer not null default 15,
  add column if not exists appointment_ends_at timestamptz,
  add column if not exists blocked_until timestamptz,
  add column if not exists booking_resource_id uuid,
  add column if not exists normalized_guest_email text,
  add column if not exists booking_window tstzrange,
  add column if not exists is_active_booking boolean not null default true;

-- Backfill durable range fields before enforcing constraints. Trigger below keeps them current.
update public.bookings
set duration_hours = greatest(coalesce(duration_hours, 0.25), 0.25),
    buffer_minutes = greatest(coalesce(buffer_minutes, 15), 0),
    appointment_ends_at = appointment_datetime + make_interval(secs => (greatest(coalesce(duration_hours, 0.25), 0.25) * 3600)::double precision),
    blocked_until = appointment_datetime + make_interval(secs => (greatest(coalesce(duration_hours, 0.25), 0.25) * 3600 + greatest(coalesce(buffer_minutes, 15), 0) * 60)::double precision),
    booking_resource_id = coalesce(stylist_id, salon_id),
    normalized_guest_email = nullif(lower(trim(guest_email)), '');

-- Materialize the overlap window and active-state predicate. PostgreSQL requires
-- every expression used by an exclusion index (including its predicate) to be
-- immutable. Keeping these values as ordinary stored columns also avoids an
-- implicit timestamp -> timestamptz cast inside the GiST index expression.
update public.bookings
set booking_window = tstzrange(appointment_datetime, blocked_until, '[)'),
    is_active_booking = lower(coalesce(status, '')) not in ('cancelled','canceled');

alter table public.bookings
  alter column duration_hours set not null,
  alter column appointment_ends_at set not null,
  alter column blocked_until set not null,
  alter column booking_resource_id set not null,
  alter column booking_window set not null;

alter table public.bookings drop constraint if exists bookings_duration_positive;
alter table public.bookings add constraint bookings_duration_positive check (duration_hours >= 0.25 and duration_hours <= 24);

create or replace function public.set_booking_integrity_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.buffer_minutes := greatest(coalesce(new.buffer_minutes, 15), 0);
  new.duration_hours := greatest(coalesce(new.duration_hours, 0.25), 0.25);
  new.appointment_ends_at := new.appointment_datetime
    + make_interval(secs => (new.duration_hours * 3600)::double precision);
  new.blocked_until := new.appointment_ends_at
    + make_interval(mins => new.buffer_minutes);
  new.booking_resource_id := coalesce(new.stylist_id, new.salon_id);
  new.normalized_guest_email := nullif(lower(trim(new.guest_email)), '');
  new.booking_window := tstzrange(new.appointment_datetime, new.blocked_until, '[)');
  new.is_active_booking := lower(coalesce(new.status, '')) not in ('cancelled','canceled');
  return new;
end;
$$;

drop trigger if exists bookings_integrity_fields on public.bookings;
create trigger bookings_integrity_fields
before insert or update
on public.bookings for each row execute function public.set_booking_integrity_fields();

create table if not exists public.booking_integrity_conflicts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  conflicting_booking_id uuid references public.bookings(id) on delete set null,
  conflict_type text not null,
  original_status text,
  resolved_at timestamptz not null default now(),
  unique (booking_id, conflict_type)
);

-- Preserve the first active booking and quarantine later pre-existing overlaps so
-- the exclusion constraints can be installed. Review this audit table after migration.
with conflicts as (
  select newer.id booking_id, min(older.id::text)::uuid conflicting_booking_id, 'resource_overlap'::text conflict_type
  from public.bookings newer
  join public.bookings older
   on older.id <> newer.id
   and older.booking_resource_id = newer.booking_resource_id
   and older.booking_window && newer.booking_window
   and (older.created_at, older.id) < (newer.created_at, newer.id)
  where newer.is_active_booking
    and older.is_active_booking
  group by newer.id
), logged as (
  insert into public.booking_integrity_conflicts(booking_id, conflicting_booking_id, conflict_type, original_status)
  select conflicts.booking_id, conflicts.conflicting_booking_id, conflicts.conflict_type, bookings.status
  from conflicts join public.bookings bookings on bookings.id = conflicts.booking_id
  on conflict do nothing returning booking_id
)
update public.bookings set status = 'Cancelled'
where id in (select booking_id from logged);

with conflicts as (
  select newer.id booking_id, min(older.id::text)::uuid conflicting_booking_id, 'customer_email_overlap'::text conflict_type
  from public.bookings newer
  join public.bookings older
    on older.id <> newer.id
   and older.normalized_guest_email = newer.normalized_guest_email
   and newer.normalized_guest_email is not null
   and older.booking_window && newer.booking_window
   and (older.created_at, older.id) < (newer.created_at, newer.id)
  where newer.is_active_booking
    and older.is_active_booking
  group by newer.id
), logged as (
  insert into public.booking_integrity_conflicts(booking_id, conflicting_booking_id, conflict_type, original_status)
  select conflicts.booking_id, conflicts.conflicting_booking_id, conflicts.conflict_type, bookings.status
  from conflicts join public.bookings bookings on bookings.id = conflicts.booking_id
  on conflict do nothing returning booking_id
)
update public.bookings set status = 'Cancelled'
where id in (select booking_id from logged);

with conflicts as (
  select newer.id booking_id, min(older.id::text)::uuid conflicting_booking_id, 'customer_id_overlap'::text conflict_type
  from public.bookings newer
  join public.bookings older
    on older.id <> newer.id
   and older.customer_id = newer.customer_id
   and newer.customer_id is not null
   and older.booking_window && newer.booking_window
   and (older.created_at, older.id) < (newer.created_at, newer.id)
  where newer.is_active_booking
    and older.is_active_booking
  group by newer.id
), logged as (
  insert into public.booking_integrity_conflicts(booking_id, conflicting_booking_id, conflict_type, original_status)
  select conflicts.booking_id, conflicts.conflicting_booking_id, conflicts.conflict_type, bookings.status
  from conflicts join public.bookings bookings on bookings.id = conflicts.booking_id
  on conflict do nothing returning booking_id
)
update public.bookings set status = 'Cancelled'
where id in (select booking_id from logged);

alter table public.bookings drop constraint if exists bookings_resource_no_overlap;
alter table public.bookings add constraint bookings_resource_no_overlap
exclude using gist (
  booking_resource_id with =,
  booking_window with &&
) where (is_active_booking);

alter table public.bookings drop constraint if exists bookings_customer_email_no_overlap;
alter table public.bookings add constraint bookings_customer_email_no_overlap
exclude using gist (
  normalized_guest_email with =,
  booking_window with &&
) where (is_active_booking and normalized_guest_email is not null);

alter table public.bookings drop constraint if exists bookings_customer_id_no_overlap;
alter table public.bookings add constraint bookings_customer_id_no_overlap
exclude using gist (
  customer_id with =,
  booking_window with &&
) where (is_active_booking and customer_id is not null);

alter table public.booking_checkout_intents
  add column if not exists stylist_id uuid references public.stylists(id) on delete cascade,
  add column if not exists customer_id uuid references auth.users(id) on delete cascade,
  add column if not exists guest_email text,
  add column if not exists appointment_datetime timestamptz,
  add column if not exists duration_hours numeric(6,2),
  add column if not exists buffer_minutes integer not null default 15,
  add column if not exists booking_resource_id uuid,
  add column if not exists blocked_until timestamptz,
  add column if not exists normalized_guest_email text,
  add column if not exists checkout_window tstzrange,
  add column if not exists is_pending_intent boolean not null default true;

create or replace function public.set_booking_checkout_integrity_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.normalized_guest_email := nullif(lower(trim(new.guest_email)), '');
  new.checkout_window := case
    when new.appointment_datetime is not null and new.blocked_until is not null
      then tstzrange(new.appointment_datetime, new.blocked_until, '[)')
    else null
  end;
  new.is_pending_intent := coalesce(new.status, '') = 'Pending';
  return new;
end;
$$;

drop trigger if exists booking_checkout_integrity_fields on public.booking_checkout_intents;
create trigger booking_checkout_integrity_fields
before insert or update
on public.booking_checkout_intents for each row execute function public.set_booking_checkout_integrity_fields();

update public.booking_checkout_intents
set normalized_guest_email = nullif(lower(trim(guest_email)), ''),
    checkout_window = case
      when appointment_datetime is not null and blocked_until is not null
        then tstzrange(appointment_datetime, blocked_until, '[)')
      else null
    end,
    is_pending_intent = coalesce(status, '') = 'Pending';

drop index if exists public.booking_checkout_intents_resource_idx;
drop index if exists public.booking_checkout_intents_email_idx;
drop index if exists public.booking_checkout_intents_customer_idx;

create index booking_checkout_intents_resource_idx
  on public.booking_checkout_intents(booking_resource_id, appointment_datetime)
  where is_pending_intent;
create index booking_checkout_intents_email_idx
  on public.booking_checkout_intents(normalized_guest_email, appointment_datetime)
  where is_pending_intent and normalized_guest_email is not null;
create index booking_checkout_intents_customer_idx
  on public.booking_checkout_intents(customer_id, appointment_datetime)
  where is_pending_intent and customer_id is not null;

create or replace function public.reserve_booking_checkout(
  p_salon_id uuid,
  p_style_id uuid,
  p_stylist_id uuid,
  p_customer_id uuid,
  p_guest_email text,
  p_appointment_datetime timestamptz,
  p_duration_hours numeric,
  p_buffer_minutes integer,
  p_payload jsonb,
  p_total_amount numeric,
  p_deposit_amount numeric
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_resource_id uuid := coalesce(p_stylist_id, p_salon_id);
  v_blocked_until timestamptz := p_appointment_datetime
    + make_interval(secs => (greatest(coalesce(p_duration_hours, 0.25), 0.25) * 3600)::double precision)
    + make_interval(mins => greatest(coalesce(p_buffer_minutes, 15), 0));
  v_email text := nullif(lower(trim(p_guest_email)), '');
  v_intent_id uuid;
begin
  if p_appointment_datetime is null or p_appointment_datetime <= now() then
    raise exception using errcode = '22007', message = 'Appointment must be in the future.';
  end if;

  -- Serialize competing requests for the same chair and customer.
  perform pg_advisory_xact_lock(hashtextextended('resource:' || v_resource_id::text, 0));
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended('customer:' || v_email, 0));
  end if;
  if p_customer_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('customer-id:' || p_customer_id::text, 0));
  end if;

  update public.booking_checkout_intents
  set status = 'Expired'
  where status = 'Pending' and expires_at <= now();

  if exists (
    select 1 from public.bookings b
    where b.booking_resource_id = v_resource_id
      and b.is_active_booking
      and b.booking_window && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
  ) or exists (
    select 1 from public.booking_checkout_intents i
    where i.is_pending_intent and i.expires_at > now()
      and i.booking_resource_id = v_resource_id
      and i.checkout_window && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'BOOKING_RESOURCE_CONFLICT';
  end if;

  if v_email is not null and (
    exists (
      select 1 from public.bookings b
      where b.normalized_guest_email = v_email
        and b.is_active_booking
        and b.booking_window && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
    ) or exists (
      select 1 from public.booking_checkout_intents i
      where i.is_pending_intent and i.expires_at > now()
        and i.normalized_guest_email = v_email
        and i.checkout_window && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
    )
  ) then
    raise exception using errcode = '23P01', message = 'CUSTOMER_BOOKING_CONFLICT';
  end if;

  if p_customer_id is not null and (
    exists (
      select 1 from public.bookings b
      where b.customer_id = p_customer_id
        and b.is_active_booking
        and b.booking_window && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
    ) or exists (
      select 1 from public.booking_checkout_intents i
      where i.is_pending_intent and i.expires_at > now()
        and i.customer_id = p_customer_id
        and i.checkout_window && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
    )
  ) then
    raise exception using errcode = '23P01', message = 'CUSTOMER_BOOKING_CONFLICT';
  end if;

  insert into public.booking_checkout_intents(
    salon_id, style_id, stylist_id, customer_id, guest_email,
    appointment_datetime, duration_hours, buffer_minutes,
    booking_resource_id, blocked_until, payload, total_amount, deposit_amount
  ) values (
    p_salon_id, p_style_id, p_stylist_id, p_customer_id, v_email,
    p_appointment_datetime, p_duration_hours, greatest(coalesce(p_buffer_minutes, 15), 0),
    v_resource_id, v_blocked_until, p_payload, p_total_amount, p_deposit_amount
  ) returning id into v_intent_id;

  return v_intent_id;
end;
$$;

revoke all on function public.reserve_booking_checkout(uuid,uuid,uuid,uuid,text,timestamptz,numeric,integer,jsonb,numeric,numeric) from public, anon, authenticated;
grant execute on function public.reserve_booking_checkout(uuid,uuid,uuid,uuid,text,timestamptz,numeric,integer,jsonb,numeric,numeric) to service_role;

commit;
