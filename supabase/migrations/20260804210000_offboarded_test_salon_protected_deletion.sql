-- Protected operational deletion for explicitly registered, offboarded test salons.
--
-- A salon with financial or booking history cannot be physically removed without
-- also destroying foreign-key-anchored evidence. This workflow therefore removes
-- it from every operational surface, anonymizes the parent into a hidden tombstone,
-- archives/revokes dependent content, and retains immutable financial/audit rows.

begin;

alter table public.salons
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deletion_reason text,
  add column if not exists deletion_evidence jsonb not null default '{}'::jsonb;

create index if not exists salons_not_deleted_idx
  on public.salons(status, name)
  where deleted_at is null;

create table if not exists public.salon_test_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  record_label text not null,
  test_registry_id uuid,
  test_batch_id uuid,
  dependency_summary jsonb not null default '{}'::jsonb,
  effects jsonb not null default '{}'::jsonb,
  before_values jsonb not null default '{}'::jsonb,
  reason text not null,
  confirmation_phrase text not null,
  acting_admin_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists salon_test_deletion_audit_salon_time_idx
  on public.salon_test_deletion_audit(salon_id, created_at desc);

alter table public.salon_test_deletion_audit enable row level security;
drop policy if exists salon_test_deletion_audit_admin_read
  on public.salon_test_deletion_audit;
create policy salon_test_deletion_audit_admin_read
  on public.salon_test_deletion_audit for select to authenticated
  using (public.admin_has_permission('salons'));
revoke all on public.salon_test_deletion_audit from public, anon, authenticated;
grant select on public.salon_test_deletion_audit to authenticated;
grant all on public.salon_test_deletion_audit to service_role;

create or replace function public.prevent_salon_test_deletion_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Test salon deletion audit records are immutable.';
end;
$$;
drop trigger if exists salon_test_deletion_audit_immutable
  on public.salon_test_deletion_audit;
create trigger salon_test_deletion_audit_immutable
before update or delete on public.salon_test_deletion_audit
for each row execute function public.prevent_salon_test_deletion_audit_mutation();

-- Deleted tombstones must never be re-geocoded. The earlier address trigger
-- normally derives a fingerprint and review state whenever structured address
-- fields change; for a deleted row it instead leaves no address identifier.
create or replace function public.prepare_salon_geocoding()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_fingerprint text;
  address_complete boolean;
begin
  new.address_country := 'US';
  if new.deleted_at is not null then
    new.address_fingerprint := null;
    new.latitude := null;
    new.longitude := null;
    new.formatted_address := null;
    new.geocoded_at := null;
    new.market_id := null;
    new.borough := null;
    new.address_needs_review := true;
    new.geocode_status := 'needs_review';
    new.geocode_failure_reason := null;
    return new;
  end if;

  next_fingerprint := public.normalized_salon_address_fingerprint(
    new.address_street, new.address_line2, new.address_city,
    new.address_state, new.address_zip, new.address_country
  );
  address_complete := nullif(trim(coalesce(new.address_street,'')), '') is not null
    and nullif(trim(coalesce(new.address_city,'')), '') is not null
    and nullif(trim(coalesce(new.address_state,'')), '') is not null
    and nullif(trim(coalesce(new.address_zip,'')), '') is not null;

  if tg_op = 'INSERT' or next_fingerprint is distinct from old.address_fingerprint then
    new.address_fingerprint := next_fingerprint;
    new.latitude := null;
    new.longitude := null;
    new.formatted_address := null;
    new.geocoded_at := null;
    new.market_id := null;
    new.borough := null;
    new.address_needs_review := not address_complete;
    new.geocode_status := case when address_complete then 'pending' else 'needs_review' end;
    new.geocode_failure_reason := case when address_complete then null else 'Structured address is incomplete.' end;
  end if;
  return new;
end;
$$;
drop trigger if exists salons_prepare_geocoding on public.salons;
create trigger salons_prepare_geocoding
before insert or update of address_street, address_line2, address_city,
  address_state, address_zip, address_country, deleted_at
on public.salons for each row execute function public.prepare_salon_geocoding();

-- Publication reconciliation is also reachable through AFTER triggers and
-- authorized bulk reconciliation. A tombstone is an absolute stop: it cannot
-- receive a regenerated canonical slug even if historic approval state exists.
create or replace function public.reconcile_salon_publication(
  p_salon_id uuid,
  p_actor_id uuid default null,
  p_reason text default 'Eligibility recalculated'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_before public.salons%rowtype;
  v_after public.salons%rowtype;
  v_diagnostic jsonb;
  v_approved boolean;
  v_override_effective boolean;
  v_application_active boolean;
  v_future_count integer;
begin
  select *
  into v_before
  from public.salons
  where id = p_salon_id
  for update;
  if not found then
    raise exception 'Salon not found.';
  end if;

  if v_before.deleted_at is not null then
    update public.salons
    set slug = null,
        vanity_slug = null,
        instagram_url = null,
        tiktok_url = null,
        google_business_url = null,
        is_discoverable = false,
        accepting_bookings = false
    where id = p_salon_id;
    return public.salon_publication_diagnostic(p_salon_id);
  end if;

  select
    v_before.approved_at is not null
    or exists (
      select 1
      from public.salon_applications application
      where application.salon_id = p_salon_id
        and application.status in ('Approved', 'Active')
    )
  into v_approved;

  if v_approved
     and nullif(trim(coalesce(v_before.name, '')), '') is not null
     and v_before.name <> 'Pending salon application'
     and (
       v_before.slug is null
       or v_before.slug ~ '^pending-'
     ) then
    update public.salons
    set slug = public.generate_unique_salon_slug(id, name)
    where id = p_salon_id;
  end if;

  v_diagnostic := public.salon_publication_diagnostic(p_salon_id);
  v_override_effective :=
    coalesce((v_diagnostic ->> 'override_active')::boolean, false)
    and coalesce(
      (v_diagnostic ->> 'all_required_complete')::boolean,
      false
    );

  if not (
    v_before.status = 'Active'
    and v_override_effective
  ) then
    perform public.reconcile_salon_lifecycle(
      p_salon_id,
      p_actor_id,
      p_reason
    );
  end if;

  v_diagnostic := public.salon_publication_diagnostic(p_salon_id);
  select exists (
    select 1
    from public.salon_applications application
    where application.salon_id = p_salon_id
      and application.status = 'Active'
  )
  into v_application_active;

  select *
  into v_after
  from public.salons
  where id = p_salon_id
  for update;

  if coalesce((v_diagnostic ->> 'all_required_complete')::boolean, false)
     and coalesce((v_diagnostic ->> 'override_active')::boolean, false)
     and (v_before.status = 'Active' or v_application_active)
     and v_after.status not in ('Suspended', 'Offboarded')
     and v_after.owner_unpublished_at is null then
    if v_after.status is distinct from 'Active' then
      select count(*)::integer
      into v_future_count
      from public.bookings booking
      where booking.salon_id = p_salon_id
        and booking.appointment_datetime >= now()
        and lower(coalesce(booking.status, ''))
          not in ('cancelled', 'canceled', 'completed');

      insert into public.salon_status_audit(
        salon_id,
        previous_status,
        new_status,
        reason,
        acting_admin_id,
        future_booking_count,
        actor_type,
        source
      ) values (
        p_salon_id,
        v_after.status,
        'Active',
        'Authorized pilot publication override remains effective',
        p_actor_id,
        v_future_count,
        case when p_actor_id is null then 'engine' else 'admin' end,
        'pilot_publication_override'
      );
    end if;

    update public.salons
    set status = 'Active',
        is_discoverable = true,
        activated_at = coalesce(activated_at, now()),
        lifecycle_reason = 'Authorized pilot publication override'
    where id = p_salon_id;
  elsif not coalesce(
    (v_diagnostic ->> 'all_required_complete')::boolean,
    false
  ) then
    update public.salons
    set is_discoverable = false
    where id = p_salon_id;
  else
    update public.salons
    set is_discoverable =
      is_discoverable
      and owner_unpublished_at is null
      and status = 'Active'
      and slug is not null
      and slug !~ '^pending-'
    where id = p_salon_id;
  end if;

  return public.salon_publication_diagnostic(p_salon_id);
end;
$$;

create or replace function public.admin_delete_offboarded_test_salon(
  p_salon_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_confirmation text,
  p_environment text,
  p_dependency_summary jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_salon public.salons%rowtype;
  v_registry public.test_data_registry%rowtype;
  v_batch public.test_data_batches%rowtype;
  v_expected_confirmation text;
  v_authoritative_summary jsonb;
  v_effects jsonb;
  v_application_count integer := 0;
  v_audit_id uuid;
  v_enabled boolean := false;
begin
  if not exists (
    select 1
    from public.admin_users admin_user
    where coalesce(admin_user.user_id, admin_user.id) = p_actor_user_id
      and admin_user.status = 'Active'
      and coalesce(admin_user.is_super_admin, false)
  ) then
    raise exception 'Only a Super Admin can permanently delete an offboarded test salon.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'Enter a reason of at least 8 characters.';
  end if;
  if p_environment not in ('development', 'preview', 'production') then
    raise exception 'The current deployment environment could not be verified. Permanent test deletion is disabled.';
  end if;
  select coalesce((published_value #>> '{}')::boolean, false)
  into v_enabled
  from public.engine_settings
  where setting_key = 'maintenance.test_data_enabled'
    and status = 'Published';
  if not coalesce(v_enabled, false) then
    raise exception 'Publish maintenance.test_data_enabled in The Engine before permanent test deletion.';
  end if;

  select * into v_salon
  from public.salons
  where id = p_salon_id
  for update;
  if not found then raise exception 'Salon not found.'; end if;
  if v_salon.deleted_at is not null then
    raise exception 'This test salon was already permanently removed from operational records.';
  end if;
  if lower(trim(coalesce(v_salon.status, ''))) <> 'offboarded' then
    raise exception 'Only an Offboarded salon can use permanent test deletion.';
  end if;

  select registry.* into v_registry
  from public.test_data_registry registry
  join public.test_data_batches batch on batch.id = registry.batch_id
  where registry.record_type = 'salon'
    and registry.record_id = p_salon_id::text
  order by registry.registered_at desc
  limit 1
  for update of registry;
  if not found then
    raise exception 'This salon is not explicitly registered as test data. Register the exact salon in Test-data maintenance first.';
  end if;
  select * into v_batch from public.test_data_batches where id = v_registry.batch_id;
  if v_batch.status = 'Cleared' then
    raise exception 'The registered test-data batch is already cleared.';
  end if;
  if v_batch.environment is distinct from p_environment then
    raise exception 'The test-data batch environment does not match the trusted current deployment environment.';
  end if;

  v_expected_confirmation := 'DELETE TEST SALON ' || v_salon.name;
  if p_confirmation is distinct from v_expected_confirmation then
    raise exception 'Type the destructive confirmation phrase exactly.';
  end if;

  select jsonb_build_object(
    'bookings_retained', (select count(*) from public.bookings where salon_id = p_salon_id),
    'subscriptions_retained', (select count(*) from public.subscriptions where salon_id = p_salon_id),
    'billing_events_retained', (select count(*) from public.billing_events where salon_id = p_salon_id),
    'booking_financial_events_retained', (select count(*) from public.booking_financial_events where salon_id = p_salon_id),
    'booking_refunds_retained', (select count(*) from public.booking_refund_operations where salon_id = p_salon_id),
    'recovery_balances_retained', (select count(*) from public.salon_recovery_balances where salon_id = p_salon_id),
    'subscription_changes_retained', (select count(*) from public.subscription_change_requests where salon_id = p_salon_id),
    'product_orders_retained', (select count(*) from public.product_orders where salon_id = p_salon_id),
    'services_archived', (select count(*) from public.styles where salon_id = p_salon_id),
    'stylists_archived', (select count(*) from public.stylists where salon_id = p_salon_id),
    'products_archived', (select count(*) from public.salon_products where salon_id = p_salon_id),
    'promotions_archived', (select count(*) from public.salon_promotions where salon_id = p_salon_id),
    'team_access_disabled', (select count(*) from public.salon_team_members where salon_id = p_salon_id),
    'reviews_archived', (select count(*) from public.reviews where salon_id = p_salon_id),
    'applications_deleted', (select count(*) from public.salon_applications where salon_id = p_salon_id),
    'featured_campaigns_paused', (select count(*) from public.featured_salon_campaigns where salon_id = p_salon_id),
    'trending_campaigns_drafted', (select count(*) from public.trending_video_campaigns where salon_id = p_salon_id),
    'publication_overrides_revoked', (select count(*) from public.salon_publication_overrides where salon_id = p_salon_id and is_active),
    'availability_rows_removed', (select count(*) from public.availability where salon_id = p_salon_id),
    'blockouts_removed', (select count(*) from public.salon_blockouts where salon_id = p_salon_id)
  ) into v_authoritative_summary;

  v_effects := jsonb_build_object(
    'operational_salon_removed', true,
    'salon_tombstone_retained_for_foreign_keys', true,
    'customer_contact_anonymized_on_bookings', true,
    'financial_history_deleted', false,
    'booking_history_deleted', false,
    'refund_history_deleted', false,
    'subscription_history_deleted', false,
    'audit_history_deleted', false,
    'owner_auth_identity_deleted', false,
    'stripe_account_id_retained_for_reconciliation', true,
    'vanity_slug_released_for_reuse', v_salon.vanity_slug is not null
  );

  -- Remove access and public/operational content without deleting immutable
  -- booking, payment, refund, payout, subscription, dispute, or audit rows.
  update public.salon_team_members
  set status = 'Inactive'
  where salon_id = p_salon_id and status <> 'Inactive';
  update public.stylists
  set is_active = false, archived_at = coalesce(archived_at, now()), user_id = null
  where salon_id = p_salon_id;
  update public.styles
  set archived_at = coalesce(archived_at, now())
  where salon_id = p_salon_id;
  update public.salon_products
  set is_visible = false, archived_at = coalesce(archived_at, now()), updated_at = now()
  where salon_id = p_salon_id;
  update public.salon_promotions
  set is_active = false, status = 'Archived', archived_at = coalesce(archived_at, now()),
      paused_at = coalesce(paused_at, now()), updated_at = now()
  where salon_id = p_salon_id;
  update public.featured_salon_campaigns
  set status = 'Paused', updated_at = now(), updated_by = p_actor_user_id
  where salon_id = p_salon_id and status in ('Scheduled', 'Active');
  update public.trending_video_campaigns
  set status = 'Draft', updated_at = now(), updated_by = p_actor_user_id
  where salon_id = p_salon_id and status <> 'Expired';
  update public.reviews
  set archived_at = coalesce(archived_at, now())
  where salon_id = p_salon_id;
  update public.salon_slug_redirects
  set retired_at = coalesce(retired_at, now())
  where salon_id = p_salon_id;
  delete from public.availability where salon_id = p_salon_id;
  delete from public.salon_blockouts where salon_id = p_salon_id;

  -- Preserve bookings and all financial fields; remove only contact data that
  -- no longer belongs on an operational test record.
  update public.bookings
  set guest_name = case when guest_name is null then null else 'Deleted test customer' end,
      guest_email = null,
      guest_phone = null
  where salon_id = p_salon_id;

  -- Revocation is recorded in the existing immutable override audit before the
  -- applications are removed. The application UUID remains historical evidence.
  insert into public.salon_publication_override_audit(
    override_id, salon_id, application_id, action, reason,
    overridden_gates, gate_snapshot, acting_admin_id
  )
  select override_row.id, p_salon_id, override_row.application_id, 'Revoked', p_reason,
         override_row.overridden_gates, override_row.gate_snapshot, p_actor_user_id
  from public.salon_publication_overrides override_row
  where override_row.salon_id = p_salon_id and override_row.is_active;

  update public.salon_publication_overrides
  set is_active = false, revoked_by = p_actor_user_id,
      revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where salon_id = p_salon_id and is_active;

  select count(*) into v_application_count
  from public.salon_applications where salon_id = p_salon_id;
  delete from public.salon_applications where salon_id = p_salon_id;

  -- The hidden tombstone is deliberately non-operational and no longer owned.
  -- It remains solely because retained financial rows use the salon UUID as an
  -- immutable reconciliation key.
  update public.salons
  set name = 'Deleted test salon ' || left(p_salon_id::text, 8),
      slug = null,
      vanity_slug = null,
      instagram_url = null,
      tiktok_url = null,
      google_business_url = null,
      description = null,
      phone = null,
      email = null,
      owner_name = null,
      user_id = null,
      address_street = null,
      address_line2 = null,
      address_city = null,
      address_state = null,
      address_zip = null,
      neighborhood = null,
      borough = null,
      market_id = null,
      formatted_address = null,
      address_fingerprint = null,
      latitude = null,
      longitude = null,
      geocode_status = 'pending',
      geocode_failure_reason = null,
      geocoded_at = null,
      address_needs_review = false,
      hours = '{}'::jsonb,
      cover_photo_url = null,
      logo_url = null,
      gallery_photos = '[]'::jsonb,
      is_discoverable = false,
      accepting_bookings = false,
      subscription_status = 'inactive',
      status = 'Offboarded',
      approved_at = null,
      offboarded_at = coalesce(offboarded_at, now()),
      lifecycle_reason = 'Permanently removed test salon',
      deleted_at = now(),
      deleted_by = p_actor_user_id,
      deletion_reason = p_reason,
      deletion_evidence = jsonb_build_object(
        'test_registry_id', v_registry.id,
        'test_batch_id', v_registry.batch_id,
        'test_batch_environment', v_batch.environment,
        'dependency_summary', v_authoritative_summary,
        'effects', v_effects
      )
  where id = p_salon_id;

  -- Public vanity/social identity is released, including every active redirect.
  -- The connected Stripe account identifier deliberately remains unchanged: it
  -- is a reconciliation key for retained bookings and financial ledger rows.
  if v_salon.vanity_slug is not null
     and not public.salon_vanity_slug_available(v_salon.vanity_slug, null) then
    raise exception 'The removed test salon vanity URL was not released for reuse.';
  end if;
  if exists (
    select 1 from public.salons retained_salon
    where retained_salon.id = p_salon_id
      and retained_salon.stripe_account_id is distinct from v_salon.stripe_account_id
  ) then
    raise exception 'The retained Stripe reconciliation identifier was unexpectedly changed.';
  end if;
  if exists (
    select 1 from public.salons final_salon
    where final_salon.id = p_salon_id
      and (
        final_salon.slug is not null
        or final_salon.vanity_slug is not null
        or final_salon.instagram_url is not null
        or final_salon.tiktok_url is not null
        or final_salon.google_business_url is not null
        or final_salon.formatted_address is not null
        or final_salon.address_fingerprint is not null
        or final_salon.latitude is not null
        or final_salon.longitude is not null
        or final_salon.is_discoverable
        or final_salon.accepting_bookings
        or final_salon.approved_at is not null
        or final_salon.geocode_status <> 'needs_review'
        or final_salon.address_needs_review is distinct from true
      )
  ) then
    raise exception 'The removed test salon retained or regenerated a public identifier after lifecycle and address triggers.';
  end if;

  insert into public.salon_test_deletion_audit(
    salon_id, record_label, test_registry_id, test_batch_id,
    dependency_summary, effects, before_values, reason,
    confirmation_phrase, acting_admin_id
  ) values (
    p_salon_id, v_salon.name, v_registry.id, v_registry.batch_id,
    coalesce(p_dependency_summary, '{}'::jsonb) || v_authoritative_summary,
    v_effects,
    jsonb_build_object(
      'id', v_salon.id,
      'name', v_salon.name,
      'slug', v_salon.slug,
      'status', v_salon.status,
      'approved_at', v_salon.approved_at,
      'vanity_slug', v_salon.vanity_slug,
      'user_id', v_salon.user_id,
      'subscription_tier', v_salon.subscription_tier,
      'subscription_status', v_salon.subscription_status
    ),
    p_reason, p_confirmation, p_actor_user_id
  ) returning id into v_audit_id;

  insert into public.record_management_events(
    record_type, record_id, record_label, action, dependency_summary,
    before_values, after_values, reason, acting_user_id, acting_scope
  ) values (
    'salon', p_salon_id::text, v_salon.name, 'Deleted',
    coalesce(p_dependency_summary, '{}'::jsonb) || v_authoritative_summary,
    jsonb_build_object('id', v_salon.id, 'name', v_salon.name, 'status', v_salon.status),
    jsonb_build_object('deleted_at', now(), 'audit_id', v_audit_id, 'tombstone_retained', true),
    p_reason, p_actor_user_id, 'platform_admin'
  );

  delete from public.test_data_registry where id = v_registry.id;

  return jsonb_build_object(
    'ok', true,
    'action', 'delete_test',
    'label', v_salon.name,
    'audit_id', v_audit_id,
    'applications_deleted', v_application_count,
    'dependencies', v_authoritative_summary,
    'effects', v_effects,
    'message', 'The test salon was removed from operational records. Immutable financial and audit history was retained.'
  );
end;
$$;

revoke all on function public.admin_delete_offboarded_test_salon(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_delete_offboarded_test_salon(uuid,uuid,text,text,text,jsonb)
  to service_role;

update public.engine_settings
set draft_value = '"20260804210000"'::jsonb,
    published_value = '"20260804210000"'::jsonb,
    version = version + 1,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

commit;
