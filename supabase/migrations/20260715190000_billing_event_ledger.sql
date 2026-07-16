-- Immutable financial event snapshots sourced from Stripe webhooks.

begin;

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references public.salons(id) on delete set null,
  salon_name text,
  state text,
  market_snapshot text,
  event_date timestamptz not null,
  event_type text not null,
  previous_plan text,
  new_plan text,
  change_timing text check (change_timing is null or change_timing in ('immediate', 'scheduled')),
  effective_at timestamptz,
  amount_collected bigint not null default 0 check (amount_collected >= 0),
  amount_refunded bigint not null default 0 check (amount_refunded >= 0),
  amount_credited bigint not null default 0 check (amount_credited >= 0),
  currency text not null default 'usd',
  payment_status text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  stripe_event_id text not null unique,
  failure_reason text,
  cancellation_date timestamptz,
  paid_through_date timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;

drop policy if exists billing_events_admin_read on public.billing_events;
create policy billing_events_admin_read on public.billing_events
for select to authenticated
using (public.is_admin());

revoke all on table public.billing_events from anon, authenticated;
grant select on table public.billing_events to authenticated;

create index if not exists billing_events_date_idx on public.billing_events(event_date desc);
create index if not exists billing_events_state_date_idx on public.billing_events(state, event_date desc);
create index if not exists billing_events_salon_date_idx on public.billing_events(salon_id, event_date desc);
create index if not exists billing_events_type_status_idx on public.billing_events(event_type, payment_status);
create index if not exists billing_events_subscription_idx on public.billing_events(stripe_subscription_id);
create index if not exists billing_events_invoice_idx on public.billing_events(stripe_invoice_id);

commit;
