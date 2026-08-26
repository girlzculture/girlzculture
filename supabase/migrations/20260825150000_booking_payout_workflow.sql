-- Auditable Platform Admin release of eligible booking funds to a salon's
-- connected Stripe account. A transfer and a bank payout remain separate,
-- truthfully reported states.

begin;

alter table public.bookings
  add column if not exists payout_processing_key text,
  add column if not exists payout_requested_at timestamptz,
  add column if not exists payout_completed_at timestamptz,
  add column if not exists payout_failed_at timestamptz,
  add column if not exists payout_failure_code text,
  add column if not exists payout_failure_message text,
  add column if not exists payout_initiated_by uuid references auth.users(id) on delete set null,
  add column if not exists payout_connected_account_id text;

create unique index if not exists bookings_payout_processing_key_unique
  on public.bookings(payout_processing_key)
  where payout_processing_key is not null;

create table if not exists public.salon_payout_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  salon_id uuid not null references public.salons(id) on delete restrict,
  event_type text not null check (event_type in (
    'Requested',
    'Already transferred',
    'Transferred to salon',
    'Transfer failed',
    'Reconciled',
    'Transfer reversed'
  )),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  stripe_connected_account_id text,
  stripe_transfer_id text,
  stripe_source_transaction_id text,
  idempotency_key text not null,
  provider_status text,
  failure_code text,
  failure_message text,
  evidence jsonb not null default '{}'::jsonb,
  acting_admin_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  unique(idempotency_key, event_type)
);

create index if not exists salon_payout_events_booking_time_idx
  on public.salon_payout_events(booking_id, occurred_at desc);
create index if not exists salon_payout_events_salon_time_idx
  on public.salon_payout_events(salon_id, occurred_at desc);
create index if not exists salon_payout_events_transfer_idx
  on public.salon_payout_events(stripe_transfer_id)
  where stripe_transfer_id is not null;

alter table public.salon_payout_events enable row level security;

drop policy if exists salon_payout_events_admin_read on public.salon_payout_events;
create policy salon_payout_events_admin_read
  on public.salon_payout_events
  for select to authenticated
  using (public.is_admin());

drop policy if exists salon_payout_events_salon_read on public.salon_payout_events;
create policy salon_payout_events_salon_read
  on public.salon_payout_events
  for select to authenticated
  using (public.salon_has_permission(salon_id, 'earnings'));

revoke all on table public.salon_payout_events from anon, authenticated;
grant select on table public.salon_payout_events to authenticated;

create or replace function public.prevent_salon_payout_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Salon payout audit events are immutable.';
end
$$;

drop trigger if exists salon_payout_events_immutable
  on public.salon_payout_events;
create trigger salon_payout_events_immutable
before update or delete on public.salon_payout_events
for each row execute function public.prevent_salon_payout_event_mutation();

update public.engine_settings
set published_value = '"20260825150000"'::jsonb,
    draft_value = '"20260825150000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

notify pgrst, 'reload schema';

commit;
