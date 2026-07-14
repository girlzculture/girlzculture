-- Section 2: auditable rapid availability overrides.
begin;

alter table public.salon_blockouts
  add column if not exists block_type text not null default 'manual',
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

alter table public.salon_blockouts drop constraint if exists salon_blockouts_type_check;
alter table public.salon_blockouts add constraint salon_blockouts_type_check
  check (block_type in ('stylist_three_hours','stylist_today','stylist_until','salon_today','salon_until','manual'));

create index if not exists salon_blockouts_active_range_idx
  on public.salon_blockouts(salon_id, starts_at, ends_at);

with conflicts as (
  select newer.id booking_id, min(older.id::text)::uuid conflicting_booking_id
  from public.bookings newer
  join public.bookings older
    on older.id <> newer.id
   and older.salon_id = newer.salon_id
   and (older.stylist_id is null or newer.stylist_id is null)
   and tstzrange(older.appointment_datetime, older.blocked_until, '[)')
       && tstzrange(newer.appointment_datetime, newer.blocked_until, '[)')
   and (older.created_at, older.id) < (newer.created_at, newer.id)
  where lower(coalesce(newer.status, '')) not in ('cancelled','canceled')
    and lower(coalesce(older.status, '')) not in ('cancelled','canceled')
  group by newer.id
), logged as (
  insert into public.booking_integrity_conflicts(booking_id, conflicting_booking_id, conflict_type, original_status)
  select conflicts.booking_id, conflicts.conflicting_booking_id, 'salon_wide_overlap', bookings.status
  from conflicts join public.bookings bookings on bookings.id = conflicts.booking_id
  on conflict do nothing returning booking_id
)
update public.bookings set status = 'Cancelled'
where id in (select booking_id from logged);

-- A booking without a stylist represents the owner/whole salon. It must
-- conflict with every other resource at that salon, including future stylists.
create or replace function public.enforce_salon_wide_booking_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.status, '')) in ('cancelled','canceled') then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('salon-booking:' || new.salon_id::text, 0));
  if exists (
    select 1 from public.bookings existing
    where existing.salon_id = new.salon_id
      and existing.id <> new.id
      and lower(coalesce(existing.status, '')) not in ('cancelled','canceled')
      and (new.stylist_id is null or existing.stylist_id is null)
      and tstzrange(existing.appointment_datetime, existing.blocked_until, '[)')
          && tstzrange(new.appointment_datetime, new.blocked_until, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'SALON_WIDE_BOOKING_CONFLICT';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_salon_wide_overlap on public.bookings;
create trigger bookings_salon_wide_overlap
before insert or update of salon_id, stylist_id, appointment_datetime, duration_hours, buffer_minutes, status
on public.bookings for each row execute function public.enforce_salon_wide_booking_overlap();

create or replace function public.enforce_salon_wide_intent_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'Pending' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('salon-booking:' || new.salon_id::text, 0));
  if exists (
    select 1 from public.bookings booking
    where booking.salon_id = new.salon_id
      and lower(coalesce(booking.status, '')) not in ('cancelled','canceled')
      and (new.stylist_id is null or booking.stylist_id is null)
      and tstzrange(booking.appointment_datetime, booking.blocked_until, '[)')
          && tstzrange(new.appointment_datetime, new.blocked_until, '[)')
  ) or exists (
    select 1 from public.booking_checkout_intents intent
    where intent.salon_id = new.salon_id
      and intent.id <> new.id
      and intent.status = 'Pending'
      and intent.expires_at > now()
      and (new.stylist_id is null or intent.stylist_id is null)
      and tstzrange(intent.appointment_datetime, intent.blocked_until, '[)')
          && tstzrange(new.appointment_datetime, new.blocked_until, '[)')
  ) then
    raise exception using errcode = '23P01', message = 'SALON_WIDE_BOOKING_CONFLICT';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_intents_salon_wide_overlap on public.booking_checkout_intents;
create trigger booking_intents_salon_wide_overlap
before insert or update of salon_id, stylist_id, appointment_datetime, blocked_until, status
on public.booking_checkout_intents for each row execute function public.enforce_salon_wide_intent_overlap();

commit;
