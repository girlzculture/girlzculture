-- Role-aware MFA, durable login throttling, and per-account security settings.
create extension if not exists pgcrypto;

create table if not exists public.account_security_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mfa_enabled boolean not null default false,
  preferred_channel text not null default 'email' check (preferred_channel in ('email', 'sms')),
  verified_phone text,
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_login_attempts (
  id bigint generated always as identity primary key,
  role_scope text not null check (role_scope in ('customer', 'salon', 'admin')),
  email_normalized text not null,
  ip_hash text not null,
  succeeded boolean not null default false,
  occurred_at timestamptz not null default now()
);

create table if not exists public.auth_mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_scope text not null check (role_scope in ('customer', 'salon', 'admin')),
  email_normalized text not null,
  channel text not null check (channel in ('email', 'sms')),
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_login_attempts_lookup_idx
  on public.auth_login_attempts(role_scope, email_normalized, occurred_at desc);
create index if not exists auth_login_attempts_ip_idx
  on public.auth_login_attempts(ip_hash, occurred_at desc);
create index if not exists auth_mfa_challenges_active_idx
  on public.auth_mfa_challenges(email_normalized, role_scope, expires_at desc)
  where used_at is null;

alter table public.account_security_settings enable row level security;
alter table public.auth_login_attempts enable row level security;
alter table public.auth_mfa_challenges enable row level security;

drop policy if exists account_security_settings_self_read on public.account_security_settings;
create policy account_security_settings_self_read on public.account_security_settings
  for select to authenticated using (user_id = auth.uid());
drop policy if exists account_security_settings_self_update on public.account_security_settings;
create policy account_security_settings_self_update on public.account_security_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists account_security_settings_self_insert on public.account_security_settings;
create policy account_security_settings_self_insert on public.account_security_settings
  for insert to authenticated with check (user_id = auth.uid());

-- Login attempts and challenge hashes are deliberately service-role only.
-- RLS is enabled with no browser policies.

create or replace function public.remove_expired_auth_security_rows()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.auth_mfa_challenges where expires_at < now() - interval '1 day';
  delete from public.auth_login_attempts where occurred_at < now() - interval '30 days';
end;
$$;
revoke all on function public.remove_expired_auth_security_rows() from public, anon, authenticated;

comment on table public.auth_login_attempts is 'Server-only durable login throttle audit; contains no raw IP address.';
comment on table public.auth_mfa_challenges is 'Server-only one-time challenge hashes; plaintext codes are never stored.';
