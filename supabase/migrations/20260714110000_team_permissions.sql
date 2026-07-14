-- Granular platform-admin and salon-team authorization.
create extension if not exists pgcrypto;

alter table public.admin_users add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.admin_users add column if not exists name text;
alter table public.admin_users add column if not exists is_super_admin boolean not null default true;
alter table public.admin_users add column if not exists invited_at timestamptz;
alter table public.admin_users add column if not exists activated_at timestamptz;
alter table public.admin_users add column if not exists invited_by uuid references auth.users(id) on delete set null;
create unique index if not exists admin_users_user_id_unique_idx on public.admin_users(user_id) where user_id is not null;
update public.admin_users set user_id = id where user_id is null and exists (select 1 from auth.users where auth.users.id = admin_users.id);

alter table public.stylists add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists stylists_user_id_unique_idx on public.stylists(user_id) where user_id is not null;

create table if not exists public.salon_team_members (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stylist_id uuid references public.stylists(id) on delete set null,
  email text not null,
  name text not null,
  role text not null default 'Staff' check (role in ('Manager', 'Front Desk', 'Stylist', 'Staff')),
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'Invited' check (status in ('Invited', 'Active', 'Inactive')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (salon_id, user_id),
  unique (salon_id, email)
);
create index if not exists salon_team_members_user_idx on public.salon_team_members(user_id, status);
create index if not exists salon_team_members_salon_idx on public.salon_team_members(salon_id, status);
alter table public.salon_team_members enable row level security;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.admin_users a
    left join auth.users u on u.id = auth.uid()
    where coalesce(a.status, 'Active') = 'Active'
      and (a.user_id = auth.uid() or a.id = auth.uid() or lower(trim(a.email)) = lower(trim(u.email)))
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.admin_users a
    left join auth.users u on u.id = auth.uid()
    where coalesce(a.status, 'Active') = 'Active' and a.is_super_admin
      and (a.user_id = auth.uid() or a.id = auth.uid() or lower(trim(a.email)) = lower(trim(u.email)))
  );
$$;

create or replace function public.admin_has_permission(permission_key text)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.admin_users a
    left join auth.users u on u.id = auth.uid()
    where coalesce(a.status, 'Active') = 'Active'
      and (a.user_id = auth.uid() or a.id = auth.uid() or lower(trim(a.email)) = lower(trim(u.email)))
      and (a.is_super_admin or coalesce((a.permissions ->> permission_key)::boolean, false))
  );
$$;

create or replace function public.salon_has_permission(target_salon_id uuid, permission_key text)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.salons s where s.id = target_salon_id and s.user_id = auth.uid())
  or exists (
    select 1 from public.salon_team_members m
    where m.salon_id = target_salon_id and m.user_id = auth.uid() and m.status in ('Invited','Active')
      and coalesce((m.permissions ->> permission_key)::boolean, false)
  );
$$;

create or replace function public.salon_team_stylist_id(target_salon_id uuid)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select m.stylist_id from public.salon_team_members m
  where m.salon_id = target_salon_id and m.user_id = auth.uid() and m.status in ('Invited','Active') limit 1;
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.admin_has_permission(text) from public;
revoke all on function public.salon_has_permission(uuid,text) from public;
revoke all on function public.salon_team_stylist_id(uuid) from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_has_permission(text) to authenticated;
grant execute on function public.salon_has_permission(uuid,text) to authenticated;
grant execute on function public.salon_team_stylist_id(uuid) to authenticated;

drop policy if exists salon_team_members_read on public.salon_team_members;
create policy salon_team_members_read on public.salon_team_members for select to authenticated
using (public.salon_has_permission(salon_id, 'settings') or user_id = auth.uid() or public.admin_has_permission('settings'));
drop policy if exists salon_team_members_owner_write on public.salon_team_members;
create policy salon_team_members_owner_write on public.salon_team_members for all to authenticated
using (exists (select 1 from public.salons s where s.id = salon_id and s.user_id = auth.uid()) or public.admin_has_permission('settings'))
with check (exists (select 1 from public.salons s where s.id = salon_id and s.user_id = auth.uid()) or public.admin_has_permission('settings'));

-- Team profile permissions. Public active-profile reads remain unchanged.
drop policy if exists salons_owner_update on public.salons;
create policy salons_owner_update on public.salons for update to authenticated
using (public.salon_has_permission(id, 'my_page') or public.admin_has_permission('salons'))
with check (public.salon_has_permission(id, 'my_page') or public.admin_has_permission('salons'));

drop policy if exists styles_owner_insert on public.styles;
create policy styles_owner_insert on public.styles for insert to authenticated with check (public.salon_has_permission(salon_id, 'styles') or public.admin_has_permission('salons'));
drop policy if exists styles_owner_update on public.styles;
create policy styles_owner_update on public.styles for update to authenticated using (public.salon_has_permission(salon_id, 'styles') or public.admin_has_permission('salons')) with check (public.salon_has_permission(salon_id, 'styles') or public.admin_has_permission('salons'));
drop policy if exists styles_owner_delete on public.styles;
create policy styles_owner_delete on public.styles for delete to authenticated using (public.salon_has_permission(salon_id, 'styles') or public.admin_has_permission('salons'));

drop policy if exists stylists_owner_insert on public.stylists;
create policy stylists_owner_insert on public.stylists for insert to authenticated with check (public.salon_has_permission(salon_id, 'stylists') or public.admin_has_permission('salons'));
drop policy if exists stylists_owner_update on public.stylists;
create policy stylists_owner_update on public.stylists for update to authenticated
using ((public.salon_has_permission(salon_id, 'stylists') or user_id = auth.uid()) or public.admin_has_permission('salons'))
with check ((public.salon_has_permission(salon_id, 'stylists') or user_id = auth.uid()) or public.admin_has_permission('salons'));
drop policy if exists stylists_owner_delete on public.stylists;
create policy stylists_owner_delete on public.stylists for delete to authenticated using (public.salon_has_permission(salon_id, 'stylists') or public.admin_has_permission('salons'));

drop policy if exists availability_owner_insert on public.availability;
create policy availability_owner_insert on public.availability for insert to authenticated
with check ((public.salon_has_permission(salon_id, 'availability') and (public.salon_team_stylist_id(salon_id) is null or stylist_id = public.salon_team_stylist_id(salon_id))) or public.admin_has_permission('bookings'));
drop policy if exists availability_owner_update on public.availability;
create policy availability_owner_update on public.availability for update to authenticated
using ((public.salon_has_permission(salon_id, 'availability') and (public.salon_team_stylist_id(salon_id) is null or stylist_id = public.salon_team_stylist_id(salon_id))) or public.admin_has_permission('bookings'))
with check ((public.salon_has_permission(salon_id, 'availability') and (public.salon_team_stylist_id(salon_id) is null or stylist_id = public.salon_team_stylist_id(salon_id))) or public.admin_has_permission('bookings'));
drop policy if exists availability_owner_delete on public.availability;
create policy availability_owner_delete on public.availability for delete to authenticated
using ((public.salon_has_permission(salon_id, 'availability') and (public.salon_team_stylist_id(salon_id) is null or stylist_id = public.salon_team_stylist_id(salon_id))) or public.admin_has_permission('bookings'));

drop policy if exists bookings_participant_read on public.bookings;
create policy bookings_participant_read on public.bookings for select to authenticated using (
  customer_id = auth.uid()
  or (public.salon_has_permission(salon_id, 'bookings') and (public.salon_team_stylist_id(salon_id) is null or stylist_id = public.salon_team_stylist_id(salon_id)))
  or public.admin_has_permission('bookings')
);
drop policy if exists bookings_admin_update on public.bookings;
create policy bookings_admin_update on public.bookings for update to authenticated
using ((public.salon_has_permission(salon_id, 'bookings') and (public.salon_team_stylist_id(salon_id) is null or stylist_id = public.salon_team_stylist_id(salon_id))) or public.admin_has_permission('bookings'))
with check ((public.salon_has_permission(salon_id, 'bookings') and (public.salon_team_stylist_id(salon_id) is null or stylist_id = public.salon_team_stylist_id(salon_id))) or public.admin_has_permission('bookings'));

comment on table public.salon_team_members is 'Invited salon users with server and RLS enforced section permissions; stylist_id limits appointment access.';
