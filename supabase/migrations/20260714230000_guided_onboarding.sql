-- Guided salon onboarding progress and public discoverability gate.

alter table public.salons
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_progress smallint not null default 0 check (onboarding_progress between 0 and 100),
  add column if not exists is_discoverable boolean not null default false;

create index if not exists salons_discoverable_status_idx
  on public.salons(is_discoverable, status, subscription_status);

comment on column public.salons.is_discoverable is
  'True only after an active, subscribed salon completes every required guided setup item.';

-- Only trusted server code evaluates and changes marketplace eligibility.
revoke update (onboarding_completed_at, onboarding_progress, is_discoverable)
  on public.salons from authenticated;
