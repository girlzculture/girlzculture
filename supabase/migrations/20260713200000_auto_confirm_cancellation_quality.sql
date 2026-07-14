-- Section 3: mandatory booking alerts, salon cancellation audit, refunds, and quality signals.
begin;

alter table public.bookings
  add column if not exists cancellation_initiated_by text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_detail text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_notice_minutes integer,
  add column if not exists refund_status text,
  add column if not exists refund_amount numeric(10,2) not null default 0,
  add column if not exists stripe_refund_id text,
  add column if not exists service_started_at timestamptz;

alter table public.bookings drop constraint if exists bookings_cancellation_actor_check;
alter table public.bookings add constraint bookings_cancellation_actor_check
  check (cancellation_initiated_by is null or cancellation_initiated_by in ('Salon','Customer','Admin','System'));
alter table public.bookings drop constraint if exists bookings_refund_status_check;
alter table public.bookings add constraint bookings_refund_status_check
  check (refund_status is null or refund_status in ('Pending','Succeeded','Failed','Not applicable'));

alter table public.notifications add column if not exists action_url text;

create table if not exists public.salon_booking_cancellations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  reason text not null check (reason in ('Fully booked','Walk-in took the slot','Stylist unavailable','Salon closed','Other')),
  detail text,
  notice_minutes integer not null,
  refund_amount numeric(10,2) not null default 0,
  stripe_refund_id text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_delivery_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('salon','customer')),
  channel text not null check (channel in ('email','sms')),
  destination text,
  event_type text not null check (event_type in ('booking_confirmed','booking_cancelled')),
  delivery_status text not null check (delivery_status in ('delivered','failed','skipped')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists salon_booking_cancellations_salon_idx
  on public.salon_booking_cancellations(salon_id, created_at desc);
create index if not exists notification_delivery_booking_idx
  on public.notification_delivery_log(booking_id, created_at desc);

alter table public.salon_booking_cancellations enable row level security;
alter table public.notification_delivery_log enable row level security;

drop policy if exists salon_cancellations_owner_read on public.salon_booking_cancellations;
create policy salon_cancellations_owner_read on public.salon_booking_cancellations for select to authenticated
using (public.owns_salon(salon_id) or public.is_admin());
drop policy if exists notification_delivery_owner_read on public.notification_delivery_log;
create policy notification_delivery_owner_read on public.notification_delivery_log for select to authenticated
using (
  public.is_admin() or exists (
    select 1 from public.bookings booking
    where booking.id = notification_delivery_log.booking_id
      and public.owns_salon(booking.salon_id)
  )
);

insert into public.admin_settings(key,value)
values ('quality_thresholds','{"salon_cancellation_rate_percent":10,"on_time_grace_minutes":15}'::jsonb)
on conflict (key) do nothing;

create or replace function public.create_booking_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  salon_owner uuid;
  salon_zone text;
  service_name text;
  stylist_name text;
  local_time text;
begin
  select user_id, coalesce(time_zone,'America/New_York') into salon_owner, salon_zone
  from public.salons where id = new.salon_id;
  select name into service_name from public.styles where id = new.style_id;
  select name into stylist_name from public.stylists where id = new.stylist_id;
  local_time := to_char(new.appointment_datetime at time zone salon_zone, 'Mon DD, YYYY at HH12:MI AM');
  insert into public.notifications(user_id, salon_id, booking_id, title, body, action_url, delivery_status)
  values (
    salon_owner,
    new.salon_id,
    new.id,
    'New confirmed booking',
    coalesce(new.guest_name,'Customer') || ' booked ' || coalesce(service_name,'a service') || ' for ' || local_time || case when stylist_name is not null then ' with ' || stylist_name else '' end,
    '/salon/dashboard/bookings?booking=' || new.id::text,
    'delivered'
  );
  if new.customer_id is not null then
    insert into public.notifications(user_id, salon_id, booking_id, title, body, action_url, delivery_status)
    values (
      new.customer_id,
      new.salon_id,
      new.id,
      'Appointment confirmed',
      coalesce(service_name,'Your service') || ' is confirmed for ' || local_time,
      '/account?tab=upcoming',
      'delivered'
    );
  end if;
  return new;
end;
$$;

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
  where lower(coalesce(complaint.status,'')) not in ('closed','resolved')
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
