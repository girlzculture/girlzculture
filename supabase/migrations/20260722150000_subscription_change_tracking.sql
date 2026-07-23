-- Provider-linked plan-change requests remain visible before and after webhook reconciliation.

begin;

create table if not exists public.subscription_change_requests (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  stripe_subscription_id text not null,
  previous_plan text not null,
  new_plan text not null,
  change_timing text not null check (change_timing in ('immediate','scheduled')),
  status text not null check (status in ('Awaiting confirmation','Processing','Requires action','Paid','Failed','Scheduled','Canceled')),
  requested_at timestamptz not null default now(),
  effective_at timestamptz,
  currency text not null default 'usd',
  proration_credit bigint not null default 0,
  proration_charge bigint not null default 0,
  amount_due bigint not null default 0,
  amount_collected bigint not null default 0,
  amount_pending bigint not null default 0,
  amount_failed bigint not null default 0,
  stripe_invoice_id text,
  stripe_payment_reference text,
  hosted_payment_url text,
  event_source text not null default 'owner_request',
  failure_reason text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.subscription_change_requests enable row level security;
drop policy if exists subscription_change_requests_owner_read on public.subscription_change_requests;
create policy subscription_change_requests_owner_read on public.subscription_change_requests for select to authenticated
using (public.salon_has_permission(salon_id,'subscription') or public.admin_has_permission('finance') or public.admin_has_permission('subscriptions'));
revoke all on table public.subscription_change_requests from anon, authenticated;
grant select on table public.subscription_change_requests to authenticated;

create index if not exists subscription_change_requests_salon_idx on public.subscription_change_requests(salon_id,requested_at desc);
create index if not exists subscription_change_requests_status_idx on public.subscription_change_requests(status,requested_at desc);
create index if not exists subscription_change_requests_invoice_idx on public.subscription_change_requests(stripe_invoice_id);

commit;
