-- Salon subscriptions belong to the parent salon, never to invited users.
-- Team members inherit the salon's active/inactive state in the application,
-- but billing records and payment actions remain owner-only.

alter table public.salon_team_members
  drop constraint if exists salon_team_members_role_check;

alter table public.salon_team_members
  add constraint salon_team_members_role_check
  check (role in ('Manager', 'Front Desk', 'Stylist', 'Customer Service', 'Staff'));

-- Remove any legacy billing grant that may have been saved before billing was
-- made owner-only.
update public.salon_team_members
set permissions = coalesce(permissions, '{}'::jsonb) - 'subscription'
where coalesce(permissions, '{}'::jsonb) ? 'subscription';

create or replace function public.salon_has_permission(target_salon_id uuid, permission_key text)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.salons s
    where s.id = target_salon_id and s.user_id = auth.uid()
  )
  or (
    permission_key <> 'subscription'
    and exists (
      select 1 from public.salon_team_members m
      where m.salon_id = target_salon_id
        and m.user_id = auth.uid()
        and m.status = 'Active'
        and coalesce((m.permissions ->> permission_key)::boolean, false)
    )
  );
$$;

grant execute on function public.salon_has_permission(uuid,text) to anon, authenticated;

comment on function public.salon_has_permission(uuid,text) is
  'Salon section authorization. Subscription permission is owner-only; team members receive operational permissions only.';
