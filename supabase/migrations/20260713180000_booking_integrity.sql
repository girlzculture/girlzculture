-- Section 1: hard booking integrity, timezone discipline, and checkout reservations.
-- Run after 20260713130000_truthfulness_content_slots.sql.
begin;

create extension if not exists btree_gist;

alter table public.salons
  add column if not exists time_zone text not null default 'America/New_York';

alter table public.styles
  add column if not exists buffer_minutes integer not null default 15
  check (buffer_minutes between 0 and 180);

alter table public.bookings
  add column if not exists buffer_minutes integer not null default 15,
  add column if not exists appointment_ends_at timestamptz,
  add column if not exists blocked_until timestamptz,
  add column if not exists booking_resource_id uuid,
  add column if not exists normalized_guest_email text;

-- Backfill durable range fields before enforcing constraints. Trigger below keeps them current.
update public.bookings
set duration_hours = greatest(coalesce(duration_hours, 0.25), 0.25),
    buffer_minutes = greatest(coalesce(buffer_minutes, 15), 0),
    appointment_ends_at = appointment_datetime + make_interval(secs => (greatest(coalesce(duration_hours, 0.25), 0.25) * 3600)::double precision),
    blocked_until = appointment_datetime + make_interval(secs => (greatest(coalesce(duration_hours, 0.25), 0.25) * 3600 + greatest(coalesce(buffer_minutes, 15), 0) * 60)::double precision),
    booking_resource_id = coalesce(stylist_id, salon_id),
    normalized_guest_email = nullif(lower(trim(guest_email)), '');

alter table public.bookings
  alter column duration_hours set not null,
  alter column appointment_ends_at set not null,
  alter column blocked_until set not null,
  alter column booking_resource_id set not null;

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
  return new;
end;
$$;

drop trigger if exists bookings_integrity_fields on public.bookings;
create trigger bookings_integrity_fields
before insert or update of salon_id, stylist_id, appointment_datetime, duration_hours, buffer_minutes, guest_email
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
   and tstzrange(older.appointment_datetime, older.blocked_until, '[)')
       && tstzrange(newer.appointment_datetime, newer.blocked_until, '[)')
   and (older.created_at, older.id) < (newer.created_at, newer.id)
  where lower(coalesce(newer.status, '')) not in ('cancelled','canceled')
    and lower(coalesce(older.status, '')) not in ('cancelled','canceled')
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
   and tstzrange(older.appointment_datetime, older.blocked_until, '[)')
       && tstzrange(newer.appointment_datetime, newer.blocked_until, '[)')
   and (older.created_at, older.id) < (newer.created_at, newer.id)
  where lower(coalesce(newer.status, '')) not in ('cancelled','canceled')
    and lower(coalesce(older.status, '')) not in ('cancelled','canceled')
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
   and tstzrange(older.appointment_datetime, older.blocked_until, '[)')
       && tstzrange(newer.appointment_datetime, newer.blocked_until, '[)')
   and (older.created_at, older.id) < (newer.created_at, newer.id)
  where lower(coalesce(newer.status, '')) not in ('cancelled','canceled')
    and lower(coalesce(older.status, '')) not in ('cancelled','canceled')
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
  tstzrange(appointment_datetime, blocked_until, '[)') with &&
) where (lower(coalesce(status, '')) not in ('cancelled','canceled'));

alter table public.bookings drop constraint if exists bookings_customer_email_no_overlap;
alter table public.bookings add constraint bookings_customer_email_no_overlap
exclude using gist (
  normalized_guest_email with =,
  tstzrange(appointment_datetime, blocked_until, '[)') with &&
) where (normalized_guest_email is not null and lower(coalesce(status, '')) not in ('cancelled','canceled'));

alter table public.bookings drop constraint if exists bookings_customer_id_no_overlap;
alter table public.bookings add constraint bookings_customer_id_no_overlap
exclude using gist (
  customer_id with =,
  tstzrange(appointment_datetime, blocked_until, '[)') with &&
) where (customer_id is not null and lower(coalesce(status, '')) not in ('cancelled','canceled'));

alter table public.booking_checkout_intents
  add column if not exists stylist_id uuid references public.stylists(id) on delete cascade,
  add column if not exists customer_id uuid references auth.users(id) on delete cascade,
  add column if not exists guest_email text,
  add column if not exists appointment_datetime timestamptz,
  add column if not exists duration_hours numeric(6,2),
  add column if not exists buffer_minutes integer not null default 15,
  add column if not exists booking_resource_id uuid,
  add column if not exists blocked_until timestamptz;

create index if not exists booking_checkout_intents_resource_idx
  on public.booking_checkout_intents(booking_resource_id, appointment_datetime)
  where status = 'Pending';
create index if not exists booking_checkout_intents_email_idx
  on public.booking_checkout_intents(lower(guest_email), appointment_datetime)
  where status = 'Pending';
create index if not exists booking_checkout_intents_customer_idx
  on public.booking_checkout_intents(customer_id, appointment_datetime)
  where status = 'Pending' and customer_id is not null;

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
      and lower(coalesce(b.status, '')) not in ('cancelled','canceled')
      and tstzrange(b.appointment_datetime, b.blocked_until, '[)')
          && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
  ) or exists (
    select 1 from public.booking_checkout_intents i
    where i.status = 'Pending' and i.expires_at > now()
      and i.booking_resource_id = v_resource_id
      and tstzrange(i.appointment_datetime, i.blocked_until, '[)')
          && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'BOOKING_RESOURCE_CONFLICT';
  end if;

  if v_email is not null and (
    exists (
      select 1 from public.bookings b
      where b.normalized_guest_email = v_email
        and lower(coalesce(b.status, '')) not in ('cancelled','canceled')
        and tstzrange(b.appointment_datetime, b.blocked_until, '[)')
            && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
    ) or exists (
      select 1 from public.booking_checkout_intents i
      where i.status = 'Pending' and i.expires_at > now()
        and lower(i.guest_email) = v_email
        and tstzrange(i.appointment_datetime, i.blocked_until, '[)')
            && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
    )
  ) then
    raise exception using errcode = '23P01', message = 'CUSTOMER_BOOKING_CONFLICT';
  end if;

  if p_customer_id is not null and (
    exists (
      select 1 from public.bookings b
      where b.customer_id = p_customer_id
        and lower(coalesce(b.status, '')) not in ('cancelled','canceled')
        and tstzrange(b.appointment_datetime, b.blocked_until, '[)')
            && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
    ) or exists (
      select 1 from public.booking_checkout_intents i
      where i.status = 'Pending' and i.expires_at > now()
        and i.customer_id = p_customer_id
        and tstzrange(i.appointment_datetime, i.blocked_until, '[)')
            && tstzrange(p_appointment_datetime, v_blocked_until, '[)')
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
