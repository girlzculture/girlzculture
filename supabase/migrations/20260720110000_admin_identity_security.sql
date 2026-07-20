-- Company-domain platform-admin security, challenge binding, and audit trail.

alter table public.admin_users add column if not exists last_invite_sent_at timestamptz;
alter table public.admin_users add column if not exists suspended_at timestamptz;
alter table public.admin_users add column if not exists revoked_at timestamptz;

alter table public.auth_mfa_challenges add column if not exists request_fingerprint text;
alter table public.auth_mfa_challenges add column if not exists policy_version text not null default 'v1';

create table if not exists public.admin_security_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  result text not null default 'Succeeded',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_security_events enable row level security;
revoke all on public.admin_security_events from anon, authenticated;
create index if not exists admin_security_events_created_idx on public.admin_security_events(created_at desc);
create index if not exists admin_security_events_target_idx on public.admin_security_events(target_user_id,created_at desc);

create or replace function public.protect_last_active_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare active_super_admins integer;
begin
  if old.is_super_admin and old.status='Active' then
    if tg_op<>'DELETE' and new.status='Active' and new.is_super_admin then
      return new;
    end if;
    select count(*) into active_super_admins
    from public.admin_users
    where is_super_admin and status='Active';
    if active_super_admins <= 1 then
      raise exception 'The last active Super Admin cannot be suspended, revoked, demoted, or removed.';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists protect_last_active_super_admin on public.admin_users;
create trigger protect_last_active_super_admin
before update or delete on public.admin_users
for each row execute function public.protect_last_active_super_admin();

comment on table public.admin_security_events is 'Server-only audit log for platform-admin invitations, status changes, MFA, and removal.';
comment on column public.auth_mfa_challenges.request_fingerprint is 'HMAC-bound client and request context; raw IP and user agent are never stored.';
