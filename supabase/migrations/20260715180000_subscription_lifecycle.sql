-- Subscription lifecycle state used to mirror Stripe without granting access
-- before payment or before a scheduled phase becomes effective.

begin;

alter table public.subscriptions add column if not exists current_period_start timestamptz;
alter table public.subscriptions add column if not exists stripe_schedule_id text;
alter table public.subscriptions add column if not exists scheduled_tier text;
alter table public.subscriptions add column if not exists scheduled_price_id text;
alter table public.subscriptions add column if not exists scheduled_change_effective_at timestamptz;
alter table public.subscriptions add column if not exists cancellation_requested_at timestamptz;
alter table public.subscriptions add column if not exists ended_at timestamptz;
alter table public.subscriptions add column if not exists last_invoice_id text;
alter table public.subscriptions add column if not exists last_payment_status text;
alter table public.subscriptions add column if not exists last_payment_failure text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscriptions_scheduled_tier_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_scheduled_tier_check
      check (scheduled_tier is null or scheduled_tier in ('Basic', 'Growth', 'Premium'));
  end if;
end $$;

create unique index if not exists subscriptions_stripe_schedule_unique_idx
  on public.subscriptions(stripe_schedule_id)
  where stripe_schedule_id is not null;

create index if not exists subscriptions_scheduled_changes_idx
  on public.subscriptions(scheduled_change_effective_at)
  where scheduled_tier is not null;

create index if not exists subscriptions_scheduled_cancellations_idx
  on public.subscriptions(current_period_end)
  where cancel_at_period_end;

commit;
