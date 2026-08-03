begin;

-- Production password recovery must not depend on an old migration having
-- populated PostgREST's schema cache. This repair is idempotent and keeps all
-- reset material server-only.
create table if not exists public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  phone text,
  channel text not null check (channel in ('email','sms')),
  code_hash text not null,
  ticket_hash text,
  attempts integer not null default 0 check (attempts between 0 and 20),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  verified_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_codes_user_expiry_idx
  on public.password_reset_codes(user_id, expires_at desc);
alter table public.password_reset_codes enable row level security;
revoke all on public.password_reset_codes from public, anon, authenticated;
grant select, insert, update, delete on public.password_reset_codes to service_role;

-- Historical override audit remains immutable even when the application it
-- references is deliberately removed. Keep its UUID as evidence, but remove
-- the foreign-key blockade. A revoked override may remain for inspection with
-- a null application link.
alter table public.salon_publication_override_audit
  drop constraint if exists salon_publication_override_audit_application_id_fkey;
alter table public.salon_publication_overrides
  drop constraint if exists salon_publication_overrides_application_id_fkey;
alter table public.salon_publication_overrides
  alter column application_id drop not null;
alter table public.salon_publication_overrides
  add constraint salon_publication_overrides_application_id_fkey
  foreign key (application_id) references public.salon_applications(id)
  on delete set null;

-- A platform administrator with the submissions permission may permanently
-- delete an application after the UI has shown its exact dependent records.
-- The salon itself is intentionally retained; removing the application can
-- make that salon ineligible for publication, which is reported in the result.
create or replace function public.admin_delete_salon_application(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_dependency_summary jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_application public.salon_applications%rowtype;
  v_label text;
  v_override_count integer := 0;
  v_override_audit_count integer := 0;
  v_allowed boolean := false;
begin
  select exists(
    select 1
    from public.admin_users admin_user
    where coalesce(admin_user.user_id, admin_user.id) = p_actor_user_id
      and admin_user.status = 'Active'
      and (
        coalesce(admin_user.is_super_admin, false)
        or coalesce((admin_user.permissions ->> 'submissions')::boolean, false)
      )
  ) into v_allowed;
  if not v_allowed then
    raise exception 'You do not have permission to delete salon applications.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Enter a reason of at least 5 characters.';
  end if;

  select * into v_application
  from public.salon_applications
  where id = p_application_id
  for update;
  if not found then raise exception 'Salon application not found.'; end if;

  v_label := concat_ws(' · ', v_application.business_name, v_application.business_email);
  select count(*) into v_override_count
  from public.salon_publication_overrides
  where application_id = p_application_id;

  -- Revoking an active override is itself an auditable action. Record that
  -- transition before the application row is removed; historical audit rows
  -- retain the original application UUID after the foreign key is dropped.
  insert into public.salon_publication_override_audit(
    override_id, salon_id, application_id, action, reason,
    overridden_gates, gate_snapshot, acting_admin_id
  )
  select
    override_row.id, override_row.salon_id, p_application_id, 'Revoked',
    p_reason, override_row.overridden_gates, override_row.gate_snapshot,
    p_actor_user_id
  from public.salon_publication_overrides override_row
  where override_row.application_id = p_application_id
    and override_row.is_active;

  select count(*) into v_override_audit_count
  from public.salon_publication_override_audit
  where application_id = p_application_id;

  insert into public.record_management_events(
    record_type, record_id, record_label, action, dependency_summary,
    before_values, after_values, reason, acting_user_id, acting_scope
  ) values (
    'salon_application', p_application_id::text, v_label, 'Deleted',
    coalesce(p_dependency_summary, '{}'::jsonb) || jsonb_build_object(
      'publication_overrides_revoked', v_override_count,
      'publication_override_audits_retained', v_override_audit_count,
      'salon_retained', true,
      'salon_id', v_application.salon_id
    ),
    to_jsonb(v_application), null, p_reason, p_actor_user_id, 'platform_admin'
  );

  update public.salon_publication_overrides
  set is_active = false,
      revoked_by = p_actor_user_id,
      revoked_at = coalesce(revoked_at, now()),
      updated_at = now()
  where application_id = p_application_id;
  delete from public.salon_applications
  where id = p_application_id;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete',
    'label', v_label,
    'salon_id', v_application.salon_id,
    'salon_retained', true,
    'publication_overrides_revoked', v_override_count,
    'publication_override_audits_retained', v_override_audit_count
  );
end
$$;
revoke all on function public.admin_delete_salon_application(uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_delete_salon_application(uuid,uuid,text,jsonb)
  to service_role;

-- Return the real geographic boundary for salon/campaign-backed homepage
-- promotions. Custom cards can carry a platform-managed market center in the
-- content JSON; associated cards inherit the salon/campaign coordinates.
drop function if exists public.resolve_homepage_promotion_target(text,uuid);
create function public.resolve_homepage_promotion_target(
  p_target_type text,
  p_target_id uuid
) returns table(
  target_type text,
  target_id uuid,
  salon_id uuid,
  campaign_id uuid,
  salon_name text,
  salon_slug text,
  cover_photo_url text,
  address_city text,
  address_state text,
  target_latitude double precision,
  target_longitude double precision,
  radius_miles numeric
)
language sql stable security definer set search_path=public as $$
  select
    'salon'::text, salon.id, salon.id, null::uuid, salon.name, salon.slug,
    salon.cover_photo_url, salon.address_city, salon.address_state,
    salon.latitude::double precision, salon.longitude::double precision,
    25::numeric
  from public.salons salon
  where lower(trim(p_target_type))='salon'
    and salon.id=p_target_id
    and salon.slug is not null
    and salon.latitude is not null
    and salon.longitude is not null
    and public.is_marketplace_visible(salon.id)
  union all
  select
    'campaign'::text, campaign.id, salon.id, campaign.id, salon.name,
    salon.slug, salon.cover_photo_url, salon.address_city, salon.address_state,
    salon.latitude::double precision, salon.longitude::double precision,
    campaign.radius_miles
  from public.featured_salon_campaigns campaign
  left join public.marketing_entitlements entitlement
    on entitlement.id=campaign.entitlement_id
    and entitlement.salon_id=campaign.salon_id
  join public.salons salon on salon.id=campaign.salon_id
  where lower(trim(p_target_type))='campaign'
    and campaign.id=p_target_id
    and campaign.status in('Active','Scheduled')
    and campaign.starts_at<=now()
    and campaign.ends_at>now()
    and (
      (campaign.placement_basis='complimentary_admin'
        and campaign.complimentary_approved_by is not null
        and char_length(trim(coalesce(campaign.complimentary_reason,'')))>=5)
      or
      (campaign.placement_basis='paid'
        and entitlement.placement_type='Featured Salon'
        and entitlement.status in('Paid','Credited')
        and entitlement.valid_from<=now()
        and (entitlement.valid_until is null or entitlement.valid_until>now()))
    )
    and salon.slug is not null
    and salon.latitude is not null
    and salon.longitude is not null
    and public.is_marketplace_visible(salon.id)
  limit 1
$$;
revoke all on function public.resolve_homepage_promotion_target(text,uuid)
  from public;
grant execute on function public.resolve_homepage_promotion_target(text,uuid)
  to anon, authenticated, service_role;

update public.engine_settings
set published_value='"20260803160000"'::jsonb,
    draft_value='"20260803160000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst, 'reload schema';
commit;
