begin;

alter table public.bookings
  add column if not exists cancelled_by text,
  add column if not exists cancellation_internal_reason text,
  add column if not exists cancellation_customer_reason text,
  add column if not exists cancellation_customer_message text,
  add column if not exists cancellation_grace_minutes_snapshot integer,
  add column if not exists refund_funding_state text not null default 'Platform-held funds',
  add column if not exists refund_initiated_by text,
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refund_provider_accepted_at timestamptz,
  add column if not exists refund_completed_at timestamptz,
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_transfer_reversal_id text;

update public.bookings
set
  cancelled_by=lower(cancellation_initiated_by),
  cancellation_internal_reason=coalesce(cancellation_internal_reason,cancellation_detail,cancellation_reason),
  cancellation_customer_reason=coalesce(
    cancellation_customer_reason,
    case
      when lower(coalesce(cancellation_initiated_by,''))='customer'
        then 'Customer requested cancellation'
      when lower(coalesce(cancellation_reason,'')) like '%stylist%'
        then 'Stylist is unavailable'
      when lower(coalesce(cancellation_reason,'')) like '%closed%'
        then 'Salon closure or schedule change'
      when lower(coalesce(cancellation_reason,'')) like '%payment%'
        then 'Payment could not be completed'
      else 'Appointment availability changed'
    end
  )
where cancellation_initiated_by is not null;

alter table public.bookings drop constraint if exists bookings_cancelled_by_check;
alter table public.bookings add constraint bookings_cancelled_by_check
  check(cancelled_by is null or cancelled_by in ('customer','salon','admin','system'));

alter table public.bookings drop constraint if exists bookings_cancellation_grace_snapshot_check;
alter table public.bookings add constraint bookings_cancellation_grace_snapshot_check
  check(cancellation_grace_minutes_snapshot is null or cancellation_grace_minutes_snapshot between 0 and 1440);

alter table public.bookings drop constraint if exists bookings_refund_status_check;
alter table public.bookings add constraint bookings_refund_status_check
  check(
    refund_status is null or refund_status in (
      'Not applicable','Pending','Succeeded','Partially refunded','Failed','Disputed'
    )
  );

alter table public.bookings drop constraint if exists bookings_refund_funding_state_check;
alter table public.bookings add constraint bookings_refund_funding_state_check
  check(
    refund_funding_state in (
      'Platform-held funds','Pending transfer','Transferred to salon',
      'Refunded','Partially refunded','Failed','Disputed'
    )
  );

alter table public.bookings drop constraint if exists bookings_refund_initiated_by_check;
alter table public.bookings add constraint bookings_refund_initiated_by_check
  check(refund_initiated_by is null or refund_initiated_by in ('salon','platform','customer','system'));

create or replace function public.sync_booking_cancellation_actor()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.cancelled_by is null and new.cancellation_initiated_by is not null then
    new.cancelled_by:=lower(new.cancellation_initiated_by);
  elsif new.cancelled_by is not null then
    new.cancellation_initiated_by:=initcap(new.cancelled_by);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_booking_cancellation_actor on public.bookings;
create trigger sync_booking_cancellation_actor
before insert or update of cancelled_by,cancellation_initiated_by on public.bookings
for each row execute function public.sync_booking_cancellation_actor();

create table if not exists public.booking_refund_operations(
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  salon_id uuid not null references public.salons(id) on delete restrict,
  initiated_by_user_id uuid references auth.users(id) on delete set null,
  initiated_by_role text not null,
  amount numeric(10,2) not null check(amount>=0),
  currency text not null default 'usd',
  funding_state_before text not null,
  operation_status text not null default 'Initiating'
    check(operation_status in ('Initiating','Provider accepted','Pending','Succeeded','Failed','Disputed')),
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  stripe_transfer_reversal_id text,
  stripe_refund_id text,
  provider_status text,
  internal_reason text,
  safe_failure_code text,
  requested_at timestamptz not null default now(),
  provider_accepted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists booking_refund_operations_active_idx
  on public.booking_refund_operations(booking_id)
  where operation_status in ('Initiating','Provider accepted','Pending','Succeeded');
create index if not exists booking_refund_operations_salon_time_idx
  on public.booking_refund_operations(salon_id,requested_at desc);
create index if not exists booking_refund_operations_provider_idx
  on public.booking_refund_operations(stripe_refund_id)
  where stripe_refund_id is not null;

alter table public.booking_refund_operations enable row level security;

drop policy if exists booking_refund_operations_admin_read on public.booking_refund_operations;
create policy booking_refund_operations_admin_read
on public.booking_refund_operations for select to authenticated
using(public.is_admin());

drop policy if exists booking_refund_operations_salon_read on public.booking_refund_operations;
create policy booking_refund_operations_salon_read
on public.booking_refund_operations for select to authenticated
using(public.salon_has_permission(salon_id,'earnings'));

revoke all on table public.booking_refund_operations from anon,authenticated;
grant select on table public.booking_refund_operations to authenticated;

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,
  draft_value,published_value,status,impact_level,validation,help_text,
  impact_description,is_public,is_secret_status,sort_order,affected_surfaces
)
values
(
  'booking.customer_cancellation_grace_minutes',
  'booking_availability',
  'Customer cancellation grace period',
  'Minutes after payment during which an eligible customer cancellation may receive a deposit refund.',
  'number','30','30','Published','legal',
  '{"min":0,"max":1440}',
  'This is an operational default, not a substitute for jurisdiction-specific legal review.',
  'Affects future customer cancellations and the policy disclosed before checkout.',
  true,false,90,array['Booking checkout','Guest Manage Booking','Customer bookings']
),
(
  'booking.customer_cancellation_legal_exceptions',
  'booking_availability',
  'Customer cancellation legal exceptions',
  'Founder-approved exception codes that can override the default cancellation rule where law or policy requires.',
  'reorderable_list','[]','[]','Published','legal',
  '{"maxItems":50}',
  'Configure only after legal review. The application records the exception applied to each refund.',
  'Affects customer refund eligibility without changing historical bookings.',
  false,false,100,array['Guest Manage Booking','Customer bookings','Admin bookings']
),
(
  'quality.cancellation_customer_reasons',
  'quality_support',
  'Customer-safe cancellation reasons',
  'Public reasons that may be included in cancellation messages.',
  'reorderable_list',
  '["Appointment availability changed","Stylist is unavailable","Salon closure or schedule change","Service cannot be completed as scheduled","Customer requested cancellation","Payment could not be completed","Other scheduling issue"]',
  '["Appointment availability changed","Stylist is unavailable","Salon closure or schedule change","Service cannot be completed as scheduled","Customer requested cancellation","Payment could not be completed","Other scheduling issue"]',
  'Published','customer','{"maxItems":20}',
  'Internal operational notes are stored separately and are never sent to customers.',
  'Affects salon and admin cancellation forms and future customer notifications.',
  false,false,45,array['Salon bookings','Admin bookings','Cancellation email']
)
on conflict(setting_key) do update set
  description=excluded.description,
  help_text=excluded.help_text,
  impact_description=excluded.impact_description,
  affected_surfaces=excluded.affected_surfaces;

update public.engine_settings
set
  draft_value='["Customer requested cancellation","Stylist unavailable","Salon closure","Scheduling conflict","Service issue","Payment issue","Other"]'::jsonb,
  published_value='["Customer requested cancellation","Stylist unavailable","Salon closure","Scheduling conflict","Service issue","Payment issue","Other"]'::jsonb,
  description='Internal operational reasons available to authorized salon and platform staff. These values never appear in customer communications.',
  help_text='Choose a separate customer-safe reason for public communications.'
where setting_key='quality.cancellation_reasons';

update public.engine_settings
set
  draft_value='"Your appointment has been cancelled. The details and any refund status are below."'::jsonb,
  published_value='"Your appointment has been cancelled. The details and any refund status are below."'::jsonb
where setting_key='notifications.booking_cancellation_intro';

update public.engine_settings
set
  draft_value='"Thank you for booking with Girlz Culture. Your confirmed appointment details are below."'::jsonb,
  published_value='"Thank you for booking with Girlz Culture. Your confirmed appointment details are below."'::jsonb
where setting_key='notifications.booking_confirmation_intro';

commit;
