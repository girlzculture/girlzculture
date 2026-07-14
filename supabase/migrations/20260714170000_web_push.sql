-- Section 1: standards-based Web Push subscriptions and salon reachability.
-- Safe to rerun. Apply after 20260714160000_team_subscription_inheritance.sql.
begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  salon_id uuid references public.salons(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  device_label text,
  installed boolean not null default false,
  permission_status text not null default 'granted'
    check (permission_status in ('default','granted','denied')),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions(user_id, last_seen_at desc)
  where revoked_at is null;
create index if not exists push_subscriptions_salon_active_idx
  on public.push_subscriptions(salon_id, last_seen_at desc)
  where revoked_at is null;

alter table public.salons
  add column if not exists pwa_installed_at timestamptz,
  add column if not exists push_enabled_at timestamptz,
  add column if not exists push_last_seen_at timestamptz,
  add column if not exists push_reachable boolean not null default false;

alter table public.notification_delivery_log
  drop constraint if exists notification_delivery_log_channel_check;
alter table public.notification_delivery_log
  add constraint notification_delivery_log_channel_check
  check (channel in ('email','sms','push'));

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_owner_read on public.push_subscriptions;
create policy push_subscriptions_owner_read on public.push_subscriptions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (salon_id is not null and public.salon_has_permission(salon_id, 'settings'))
    or public.admin_has_permission('quality')
    or public.admin_has_permission('salons')
  );

drop policy if exists push_subscriptions_self_insert on public.push_subscriptions;
create policy push_subscriptions_self_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_self_update on public.push_subscriptions;
create policy push_subscriptions_self_update on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_self_delete on public.push_subscriptions;
create policy push_subscriptions_self_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

commit;
