-- Canonical one-email / one-auth-user / one-primary-role identity foundation.
-- Existing conflicts are inventoried and are not merged or deleted automatically.

create or replace function public.normalize_identity_email(raw_email text)
returns text
language sql
immutable
strict
set search_path = ''
as $$ select lower(btrim(raw_email)) $$;

create table if not exists public.platform_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_normalized text not null unique,
  primary_role text not null check (primary_role in ('customer','salon_owner','salon_team','admin')),
  status text not null default 'Active' check (status in ('Active','Disabled')),
  source text not null default 'auth',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table if not exists public.identity_security_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  attempted_role text,
  source text,
  email_hash text,
  actor_user_id uuid references auth.users(id) on delete set null,
  request_fingerprint text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.identity_conflict_resolutions (
  email_normalized text primary key,
  status text not null default 'Open' check (status in ('Open','Resolved','Deferred')),
  canonical_user_id uuid references auth.users(id) on delete set null,
  resolution_action text,
  reason text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.platform_identities enable row level security;
alter table public.identity_security_events enable row level security;
alter table public.identity_conflict_resolutions enable row level security;
revoke all on public.platform_identities from anon, authenticated;
revoke all on public.identity_security_events from anon, authenticated;
revoke all on public.identity_conflict_resolutions from anon, authenticated;

-- One-time legacy reconciliation: old admin rows were authorized by matching
-- email and may predate admin_users.user_id. Establish the durable Auth link
-- before building the conflict inventory; runtime authorization never uses
-- this email fallback.
update public.admin_users admin_record
set user_id=auth_user.id
from auth.users auth_user
where admin_record.user_id is null
  and admin_record.email is not null
  and auth_user.email is not null
  and public.normalize_identity_email(admin_record.email)=public.normalize_identity_email(auth_user.email)
  and not exists (
    select 1 from public.admin_users other
    where other.user_id=auth_user.id and other.id<>admin_record.id
  );

create or replace view public.identity_conflict_queue
with (security_invoker = false)
as
with role_records as (
  select u.id as user_id, public.normalize_identity_email(u.email) as email_normalized,
    case u.raw_user_meta_data->>'role'
      when 'salon_owner' then 'salon_owner'
      when 'salon_staff' then 'salon_team'
      when 'admin' then 'admin'
      when 'customer' then 'customer'
      else null
    end as primary_role,
    'auth.users'::text as record_type, u.id::text as record_id
  from auth.users u where u.email is not null
  union all
  select c.id, public.normalize_identity_email(c.email), 'customer', 'customers', c.id::text
  from public.customers c where c.email is not null
  union all
  select s.user_id, public.normalize_identity_email(s.email), 'salon_owner', 'salons', s.id::text
  from public.salons s where s.user_id is not null and s.email is not null
  union all
  select coalesce(a.user_id,a.id), public.normalize_identity_email(a.email), 'admin', 'admin_users', a.id::text
  from public.admin_users a where a.email is not null
  union all
  select m.user_id, public.normalize_identity_email(m.email), 'salon_team', 'salon_team_members', m.id::text
  from public.salon_team_members m where m.user_id is not null and m.email is not null
), conflicts as (
  select email_normalized,
    array_agg(distinct user_id) filter (where user_id is not null) as user_ids,
    array_agg(distinct primary_role order by primary_role) filter (where primary_role is not null) as roles,
    jsonb_agg(jsonb_build_object('record_type',record_type,'record_id',record_id,'user_id',user_id,'role',primary_role)
      order by record_type,record_id) as records
  from role_records
  where email_normalized <> ''
  group by email_normalized
  having count(distinct user_id) > 1 or count(distinct primary_role) filter (where primary_role is not null) > 1
)
select c.email_normalized, c.user_ids, c.roles, c.records,
  coalesce(r.status,'Open') as resolution_status, r.canonical_user_id,
  r.resolution_action, r.reason, r.resolved_by, r.resolved_at
from conflicts c
left join public.identity_conflict_resolutions r using (email_normalized);

revoke all on public.identity_conflict_queue from anon, authenticated;

-- Backfill only identities that do not have a cross-user or cross-role conflict.
with linked_roles as (
  select role_rows.user_id, array_agg(distinct role_rows.primary_role order by role_rows.primary_role) as roles
  from (
    select c.id as user_id, 'customer'::text as primary_role from public.customers c
    union all select s.user_id, 'salon_owner' from public.salons s where s.user_id is not null
    union all select coalesce(a.user_id,a.id), 'admin' from public.admin_users a
    union all select m.user_id, 'salon_team' from public.salon_team_members m where m.user_id is not null
  ) role_rows
  group by role_rows.user_id
), candidates as (
  select u.id as user_id, public.normalize_identity_email(u.email) as email_normalized,
    case
      when cardinality(coalesce(l.roles,'{}'::text[])) = 1 then l.roles[1]
      when cardinality(coalesce(l.roles,'{}'::text[])) > 1 then null
      when u.raw_user_meta_data->>'role' = 'salon_owner' then 'salon_owner'
      when u.raw_user_meta_data->>'role' = 'salon_staff' then 'salon_team'
      when u.raw_user_meta_data->>'role' = 'admin' then 'admin'
      else 'customer'
    end as primary_role
  from auth.users u
  left join linked_roles l on l.user_id=u.id
  where u.email is not null
)
insert into public.platform_identities(user_id,email_normalized,primary_role,source)
select candidate.user_id,candidate.email_normalized,candidate.primary_role,'migration_backfill'
from candidates candidate
where candidate.primary_role is not null
  and not exists (
    select 1 from public.identity_conflict_queue q
    where q.email_normalized = candidate.email_normalized
  )
on conflict (user_id) do nothing;

create or replace function public.sync_platform_identity_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text;
  mapped_role text;
begin
  if new.email is null then return new; end if;
  normalized := public.normalize_identity_email(new.email);
  mapped_role := case coalesce(new.raw_user_meta_data->>'role','customer')
    when 'salon_owner' then 'salon_owner'
    when 'salon_staff' then 'salon_team'
    when 'admin' then 'admin'
    else 'customer'
  end;
  begin
    insert into public.platform_identities(user_id,email_normalized,primary_role,source,updated_at)
    values(new.id,normalized,mapped_role,'auth_trigger',now())
    on conflict (user_id) do update set
      email_normalized=excluded.email_normalized,
      updated_at=now();
  exception when unique_violation then
    raise exception using
      errcode='23505',
      message='This email cannot be used for a new account. Sign in or recover your account.';
  end;
  return new;
end $$;

drop trigger if exists sync_platform_identity_after_auth_change on auth.users;
create trigger sync_platform_identity_after_auth_change
after insert or update of email on auth.users
for each row execute function public.sync_platform_identity_from_auth();

create or replace function public.assert_primary_identity(target_user_id uuid, raw_email text, required_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare identity_row public.platform_identities%rowtype;
begin
  if target_user_id is null or raw_email is null then
    raise exception 'A canonical user and email are required.';
  end if;
  select * into identity_row from public.platform_identities where user_id=target_user_id;
  if not found then raise exception 'This identity requires administrator review.'; end if;
  if identity_row.status <> 'Active'
    or identity_row.primary_role <> required_role
    or identity_row.email_normalized <> public.normalize_identity_email(raw_email) then
    raise exception 'This email cannot be used for this account role.';
  end if;
end $$;

create or replace function public.enforce_customer_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.assert_primary_identity(new.id,new.email,'customer'); return new; end $$;
create or replace function public.enforce_salon_owner_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.assert_primary_identity(new.user_id,new.email,'salon_owner'); return new; end $$;
create or replace function public.enforce_admin_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.assert_primary_identity(coalesce(new.user_id,new.id),new.email,'admin'); return new; end $$;
create or replace function public.enforce_salon_team_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.assert_primary_identity(new.user_id,new.email,'salon_team'); return new; end $$;

do $$
begin
  if to_regclass('public.customers') is not null
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='customers' and column_name='email') then
    execute 'drop trigger if exists enforce_customer_identity on public.customers';
    execute 'create trigger enforce_customer_identity before insert or update of id,email on public.customers for each row execute function public.enforce_customer_identity()';
  end if;
  if to_regclass('public.salons') is not null
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='salons' and column_name='user_id') then
    execute 'drop trigger if exists enforce_salon_owner_identity on public.salons';
    execute 'create trigger enforce_salon_owner_identity before insert or update of user_id,email on public.salons for each row when (new.user_id is not null) execute function public.enforce_salon_owner_identity()';
  end if;
  if to_regclass('public.admin_users') is not null
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='admin_users' and column_name='user_id') then
    execute 'drop trigger if exists enforce_admin_identity on public.admin_users';
    execute 'create trigger enforce_admin_identity before insert or update of user_id,email on public.admin_users for each row execute function public.enforce_admin_identity()';
  end if;
  if to_regclass('public.salon_team_members') is not null
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='salon_team_members' and column_name='user_id') then
    execute 'drop trigger if exists enforce_salon_team_identity on public.salon_team_members';
    execute 'create trigger enforce_salon_team_identity before insert or update of user_id,email on public.salon_team_members for each row execute function public.enforce_salon_team_identity()';
  end if;
end $$;

create index if not exists identity_security_events_created_idx on public.identity_security_events(created_at desc);
create index if not exists identity_security_events_email_hash_idx on public.identity_security_events(email_hash,created_at desc);

comment on table public.platform_identities is 'One canonical auth user and primary platform role per normalized email.';
comment on view public.identity_conflict_queue is 'Read-only remediation inventory; conflicts are never merged or deleted automatically.';
