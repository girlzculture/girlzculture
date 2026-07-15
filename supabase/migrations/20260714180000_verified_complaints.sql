-- Section 3: public complaints with booking verification and support-inbox linkage.
-- Only booking-verified complaints contribute to salon quality metrics.
begin;

alter table public.complaints_log
  add column if not exists category text not null default 'Customer complaint',
  add column if not exists description text,
  add column if not exists status text not null default 'Open',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists complainant_name text,
  add column if not exists complainant_email text,
  add column if not exists booked_through_platform boolean not null default false,
  add column if not exists booking_email_normalized text,
  add column if not exists issue_description text,
  add column if not exists booking_verified boolean not null default false,
  add column if not exists verification_method text,
  add column if not exists submitted_fingerprint text,
  add column if not exists support_ticket_id uuid references public.support_tickets(id) on delete set null;

alter table public.complaints_log alter column customer_id drop not null;
alter table public.complaints_log alter column booking_id drop not null;

alter table public.complaints_log drop constraint if exists complaints_verification_method_check;
alter table public.complaints_log add constraint complaints_verification_method_check
  check (verification_method is null or verification_method in ('booking_email','booking_id','admin_review'));

alter table public.support_tickets
  add column if not exists complaint_id uuid references public.complaints_log(id) on delete set null,
  add column if not exists booking_verified boolean not null default false;

create unique index if not exists support_ticket_complaint_unique_idx
  on public.support_tickets(complaint_id) where complaint_id is not null;
create index if not exists complaints_salon_active_idx
  on public.complaints_log(salon_id, created_at desc)
  where lower(status) not in ('closed','resolved');
create index if not exists complaints_verified_booking_idx
  on public.complaints_log(booking_id)
  where booking_verified and booking_id is not null;
create index if not exists complaints_fingerprint_rate_idx
  on public.complaints_log(submitted_fingerprint, created_at desc);

create or replace function public.enforce_complaint_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.booking_email_normalized := nullif(lower(trim(new.booking_email_normalized)), '');
  if new.booking_verified then
    if new.booking_id is null or new.salon_id is null then
      raise exception 'A verified complaint requires a booking and salon';
    end if;
    if not exists (
      select 1 from public.bookings booking
      where booking.id = new.booking_id
        and booking.salon_id = new.salon_id
        and (
          new.verification_method in ('booking_id','admin_review')
          or (
            new.verification_method = 'booking_email'
            and booking.normalized_guest_email = new.booking_email_normalized
          )
        )
    ) then
      raise exception 'Complaint verification does not match the selected salon booking';
    end if;
  else
    -- This is the anti-sabotage boundary: an unverified complaint can be read
    -- and handled by support, but it can never join booking-based quality data.
    new.booking_id := null;
    new.verification_method := null;
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_verify_booking on public.complaints_log;
create trigger complaints_verify_booking
before insert or update of booking_id, salon_id, booking_email_normalized, booking_verified, verification_method
on public.complaints_log
for each row execute function public.enforce_complaint_verification();

drop view if exists public.salon_quality_metrics;
create view public.salon_quality_metrics
with (security_invoker = true)
as
with booking_stats as (
  select
    salon_id,
    count(*)::integer total_bookings,
    count(*) filter (where cancellation_initiated_by = 'Salon')::integer salon_cancellations,
    count(*) filter (where service_started_at is not null)::integer on_time_measured,
    count(*) filter (where service_started_at is not null and service_started_at <= appointment_datetime + interval '15 minutes')::integer on_time_count
  from public.bookings
  group by salon_id
), complaint_stats as (
  select booking.salon_id, count(*)::integer complaint_count
  from public.complaints_log complaint
  join public.bookings booking on booking.id = complaint.booking_id
  where complaint.booking_verified
    and lower(coalesce(complaint.status,'')) not in ('closed','resolved')
  group by booking.salon_id
), metrics as (
  select
    salon.id salon_id,
    coalesce(stats.total_bookings,0) total_bookings,
    coalesce(stats.salon_cancellations,0) salon_cancellations,
    case when coalesce(stats.total_bookings,0) > 0 then round(stats.salon_cancellations::numeric / stats.total_bookings * 100, 2) else 0 end cancellation_rate_percent,
    stats.on_time_measured,
    case when coalesce(stats.on_time_measured,0) > 0 then round(stats.on_time_count::numeric / stats.on_time_measured * 100, 2) end on_time_rate_percent,
    coalesce(complaints.complaint_count,0) active_complaints,
    case when coalesce(stats.total_bookings,0) > 0 then greatest(0, round((1 - least(coalesce(complaints.complaint_count,0)::numeric / stats.total_bookings, 1)) * 100, 2)) end complaint_free_rate_percent,
    salon.rating_overall,
    salon.review_count
  from public.salons salon
  left join booking_stats stats on stats.salon_id = salon.id
  left join complaint_stats complaints on complaints.salon_id = salon.id
)
select
  metrics.*,
  round(
    (
      case when coalesce(review_count,0) > 0 then least(greatest(rating_overall * 20,0),100) * 0.40 else 0 end
      + case when total_bookings > 0 then (100 - cancellation_rate_percent) * 0.30 else 0 end
      + case when on_time_rate_percent is not null then on_time_rate_percent * 0.20 else 0 end
      + case when complaint_free_rate_percent is not null then complaint_free_rate_percent * 0.10 else 0 end
    ) / nullif(
      (case when coalesce(review_count,0) > 0 then 0.40 else 0 end)
      + (case when total_bookings > 0 then 0.30 else 0 end)
      + (case when on_time_rate_percent is not null then 0.20 else 0 end)
      + (case when complaint_free_rate_percent is not null then 0.10 else 0 end),
      0
    ),
    1
  ) composite_quality_score,
  cancellation_rate_percent > coalesce(
    (select (value->>'salon_cancellation_rate_percent')::numeric from public.admin_settings where key='quality_thresholds'),
    10
  ) cancellation_flagged
from metrics;

revoke all on public.salon_quality_metrics from anon, authenticated;

commit;
