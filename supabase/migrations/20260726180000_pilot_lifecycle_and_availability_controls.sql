-- Founding-salon pilot: separate application approval from paid subscription
-- and public publication, and preserve availability override history.
begin;

create or replace function public.approve_salon_application(
  p_application_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_application public.salon_applications%rowtype;
  v_salon public.salons%rowtype;
  v_changed boolean := false;
  v_plan text;
  v_diagnostic jsonb;
begin
  if not exists (
    select 1
    from public.admin_users admin_user
    where admin_user.user_id = p_actor_id
      and admin_user.status = 'Active'
      and (
        coalesce(admin_user.is_super_admin, false)
        or coalesce((admin_user.permissions ->> 'submissions')::boolean, false)
      )
  ) then
    raise exception 'Forbidden';
  end if;

  select *
  into v_application
  from public.salon_applications
  where id = p_application_id
  for update;
  if not found then raise exception 'Application not found.'; end if;

  select *
  into v_salon
  from public.salons
  where id = v_application.salon_id
  for update;
  if not found then raise exception 'Salon not found.'; end if;

  v_plan := case lower(trim(coalesce(v_application.selected_plan, 'Basic')))
    when 'premium' then 'Premium'
    when 'platinum' then 'Premium'
    when 'growth' then 'Growth'
    when 'essentials' then 'Growth'
    when 'pro' then 'Growth'
    else 'Basic'
  end;
  v_changed :=
    v_application.status not in ('Approved', 'Active')
    or v_salon.approved_at is null;

  update public.salons
  set status = case
        when status in ('New', 'Pending') then 'Approved'
        else status
      end,
      subscription_tier = v_plan,
      rejection_reason = null,
      approved_at = coalesce(approved_at, now()),
      logo_url = coalesce(nullif(v_application.logo_url, ''), logo_url)
  where id = v_application.salon_id;

  update public.salon_applications
  set status = case when status = 'Active' then status else 'Approved' end,
      rejection_reason = null,
      reviewed_by = p_actor_id,
      reviewed_at = coalesce(reviewed_at, now())
  where id = p_application_id;

  v_diagnostic := public.reconcile_salon_publication(
    v_application.salon_id,
    p_actor_id,
    'Salon application approved'
  );

  return jsonb_build_object(
    'changed', v_changed,
    'application_id', p_application_id,
    'salon_id', v_application.salon_id,
    'application_status', case
      when v_application.status = 'Active' then 'Active'
      else 'Approved'
    end,
    'plan', v_plan,
    'lifecycle', v_diagnostic
  );
end;
$$;

revoke all on function public.approve_salon_application(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_salon_application(uuid, uuid)
  to service_role;

alter table public.salon_blockouts
  add column if not exists released_at timestamptz,
  add column if not exists released_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists release_reason text;

create table if not exists public.salon_availability_override_audit (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  blockout_id uuid references public.salon_blockouts(id) on delete set null,
  stylist_id uuid references public.stylists(id) on delete set null,
  action text not null check (action in ('Blocked', 'Released', 'Expired')),
  block_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  acting_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists salon_availability_override_audit_salon_idx
  on public.salon_availability_override_audit(salon_id, created_at desc);
alter table public.salon_availability_override_audit enable row level security;
revoke all on public.salon_availability_override_audit
  from public, anon, authenticated;
grant all on public.salon_availability_override_audit to service_role;
drop policy if exists salon_availability_override_audit_service_access
  on public.salon_availability_override_audit;
create policy salon_availability_override_audit_service_access
  on public.salon_availability_override_audit for all to service_role
  using(true) with check(true);

create or replace function public.prevent_availability_override_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Availability override audit records are immutable.';
end;
$$;
drop trigger if exists salon_availability_override_audit_immutable
  on public.salon_availability_override_audit;
create trigger salon_availability_override_audit_immutable
before update or delete on public.salon_availability_override_audit
for each row execute function public.prevent_availability_override_audit_mutation();

create or replace function public.create_salon_availability_override(
  p_salon_id uuid,
  p_stylist_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text,
  p_all_day boolean,
  p_block_type text,
  p_actor_id uuid
)
returns public.salon_blockouts
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_saved public.salon_blockouts%rowtype;
begin
  if p_ends_at <= p_starts_at then
    raise exception 'Availability override end must be after its start.';
  end if;
  if p_block_type not in (
    'stylist_three_hours','stylist_today','stylist_until',
    'salon_today','salon_until','manual'
  ) then
    raise exception 'Choose a valid availability override.';
  end if;
  if p_stylist_id is not null and not exists (
    select 1 from public.stylists
    where id = p_stylist_id and salon_id = p_salon_id
  ) then
    raise exception 'That stylist does not belong to this salon.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'availability-override:' || p_salon_id::text || ':' ||
      coalesce(p_stylist_id::text, 'salon'),
      0
    )
  );

  select *
  into v_saved
  from public.salon_blockouts
  where salon_id = p_salon_id
    and stylist_id is not distinct from p_stylist_id
    and released_at is null
    and ends_at > now()
    and starts_at < p_ends_at
    and ends_at > p_starts_at
  order by ends_at desc
  limit 1
  for update;

  if found then
    if v_saved.ends_at < p_ends_at then
      update public.salon_blockouts
      set ends_at = p_ends_at,
          reason = p_reason,
          all_day = p_all_day,
          block_type = p_block_type
      where id = v_saved.id
      returning * into v_saved;
    end if;
    return v_saved;
  end if;

  insert into public.salon_blockouts(
    salon_id, stylist_id, starts_at, ends_at, reason, all_day,
    block_type, created_by_user_id
  ) values (
    p_salon_id, p_stylist_id, p_starts_at, p_ends_at, p_reason, p_all_day,
    p_block_type, p_actor_id
  )
  returning * into v_saved;

  insert into public.salon_availability_override_audit(
    salon_id, blockout_id, stylist_id, action, block_type,
    starts_at, ends_at, reason, acting_user_id
  ) values (
    p_salon_id, v_saved.id, p_stylist_id, 'Blocked', p_block_type,
    p_starts_at, p_ends_at, p_reason, p_actor_id
  );
  return v_saved;
end;
$$;

create or replace function public.release_salon_availability_override(
  p_salon_id uuid,
  p_blockout_id uuid,
  p_actor_id uuid,
  p_reason text default 'Bookings resumed'
)
returns public.salon_blockouts
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_saved public.salon_blockouts%rowtype;
begin
  select *
  into v_saved
  from public.salon_blockouts
  where id = p_blockout_id and salon_id = p_salon_id
  for update;
  if not found then raise exception 'Availability override not found.'; end if;

  if v_saved.released_at is null then
    update public.salon_blockouts
    set released_at = now(),
        released_by_user_id = p_actor_id,
        release_reason = nullif(trim(coalesce(p_reason, '')), '')
    where id = p_blockout_id
    returning * into v_saved;

    insert into public.salon_availability_override_audit(
      salon_id, blockout_id, stylist_id, action, block_type,
      starts_at, ends_at, reason, acting_user_id
    ) values (
      p_salon_id, v_saved.id, v_saved.stylist_id, 'Released',
      v_saved.block_type, v_saved.starts_at, v_saved.ends_at,
      v_saved.release_reason, p_actor_id
    );
  end if;
  return v_saved;
end;
$$;

revoke all on function public.create_salon_availability_override(
  uuid, uuid, timestamptz, timestamptz, text, boolean, text, uuid
) from public, anon, authenticated;
revoke all on function public.release_salon_availability_override(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_salon_availability_override(
  uuid, uuid, timestamptz, timestamptz, text, boolean, text, uuid
) to service_role;
grant execute on function public.release_salon_availability_override(
  uuid, uuid, uuid, text
) to service_role;

-- One eligibility predicate must govern organic results, paid placements and
-- public RLS. Pausing bookings or marking the salon full for its local day
-- removes it from discovery without changing its durable approval or billing
-- lifecycle state. Owners/admins retain preview access.
create or replace function public.is_marketplace_visible(target_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.salons s
    where s.id = target_salon_id
      and (
        (
          s.status = 'Active'
          and s.is_discoverable = true
          and coalesce(s.accepting_bookings, true) = true
          and not (
            coalesce(s.is_closed_override, false) = true
            and s.closed_override_date = (
              now() at time zone coalesce(nullif(s.time_zone, ''), 'America/New_York')
            )::date
          )
          and public.has_active_subscription(s.id)
          and public.salon_setup_complete(s.id)
        )
        or s.user_id = auth.uid()
        or public.is_admin()
      )
  );
$$;

revoke all on function public.is_marketplace_visible(uuid) from public;
grant execute on function public.is_marketplace_visible(uuid) to anon, authenticated;

commit;
