-- One authoritative salon setup, lifecycle, and marketplace-visibility engine.
begin;

alter table public.salons
  add column if not exists lifecycle_reason text,
  add column if not exists eligibility_lost_at timestamptz,
  add column if not exists eligibility_grace_until timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists offboarded_at timestamptz;

alter table public.salon_status_audit alter column acting_admin_id drop not null;
alter table public.salon_status_audit
  add column if not exists actor_type text not null default 'admin',
  add column if not exists source text not null default 'admin_salons';

insert into public.admin_settings(key, value)
values (
  'salon_lifecycle',
  jsonb_build_object(
    'version', 1,
    'auto_activation', true,
    'loss_behavior', 'needs_attention',
    'grace_period_days', 7,
    'required', jsonb_build_object(
      'application_approved', true,
      'business_name', true,
      'structured_address', true,
      'precise_geocoding', true,
      'logo', true,
      'cover_photo', true,
      'gallery_photos', 3,
      'business_details', true,
      'priced_service', true,
      'active_stylist', true,
      'business_hours', true,
      'active_subscription', true,
      'payout_account', false,
      'agreements', true
    )
  )
)
on conflict (key) do nothing;

create or replace function public.salon_lifecycle_diagnostic(p_salon_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_salon public.salons%rowtype;
  v_application public.salon_applications%rowtype;
  v_config jsonb;
  v_required jsonb;
  v_checks jsonb;
  v_required_count integer;
  v_passed_count integer;
  v_progress integer;
  v_complete boolean;
  v_gallery_count integer;
  v_gallery_required integer;
  v_has_hours boolean;
  v_has_service boolean;
  v_has_stylist boolean;
  v_subscription_active boolean;
begin
  select * into v_salon from public.salons where id = p_salon_id;
  if not found then raise exception 'Salon not found.'; end if;

  select * into v_application
  from public.salon_applications
  where salon_id = p_salon_id
  order by submitted_at desc
  limit 1;

  select value into v_config from public.admin_settings where key = 'salon_lifecycle';
  v_config := coalesce(v_config, '{}'::jsonb);
  v_required := coalesce(v_config -> 'required', '{}'::jsonb);
  v_gallery_required := greatest(0, coalesce((v_required ->> 'gallery_photos')::integer, 3));
  v_gallery_count := jsonb_array_length(
    case
      when jsonb_typeof(coalesce(to_jsonb(v_salon.gallery_photos), '[]'::jsonb)) = 'array'
      then coalesce(to_jsonb(v_salon.gallery_photos), '[]'::jsonb)
      else '[]'::jsonb
    end
  );

  select exists (
    select 1
    from jsonb_each(coalesce(to_jsonb(v_salon.hours), '{}'::jsonb)) day
    where jsonb_typeof(day.value) = 'object'
      and coalesce((day.value ->> 'closed')::boolean, false) = false
      and nullif(day.value ->> 'open', '') is not null
      and nullif(day.value ->> 'close', '') is not null
  ) into v_has_hours;

  select exists (
    select 1 from public.styles service
    where service.salon_id = p_salon_id
      and coalesce(service.base_price, service.price_display_min) is not null
      and coalesce(service.base_price, service.price_display_min) >= 0
      and coalesce(service.duration_min_hours, 0) > 0
      and coalesce(service.duration_max_hours, service.duration_min_hours, 0) >= service.duration_min_hours
  ) into v_has_service;

  select v_salon.owner_is_sole_stylist or exists (
    select 1 from public.stylists stylist
    where stylist.salon_id = p_salon_id
      and stylist.is_active is distinct from false
  ) into v_has_stylist;

  v_subscription_active := lower(coalesce(v_salon.subscription_status, '')) in ('active', 'trialing');

  v_checks := jsonb_build_object(
    'application_approved', jsonb_build_object(
      'label', 'Application and identity approved',
      'required', coalesce((v_required ->> 'application_approved')::boolean, true),
      'passed', coalesce(v_application.status in ('Approved', 'Active'), false) or v_salon.approved_at is not null,
      'action', '/salon/application-submitted'
    ),
    'business_name', jsonb_build_object(
      'label', 'Business name',
      'required', coalesce((v_required ->> 'business_name')::boolean, true),
      'passed', nullif(trim(coalesce(v_salon.name, '')), '') is not null and v_salon.name <> 'Pending salon application',
      'action', '/salon/dashboard/my-page'
    ),
    'structured_address', jsonb_build_object(
      'label', 'Complete US street address',
      'required', coalesce((v_required ->> 'structured_address')::boolean, true),
      'passed', nullif(trim(coalesce(v_salon.address_street, '')), '') is not null
        and nullif(trim(coalesce(v_salon.address_city, '')), '') is not null
        and coalesce(v_salon.address_state, '') ~ '^[A-Z]{2}$'
        and coalesce(v_salon.address_zip, '') ~ '^[0-9]{5}(-[0-9]{4})?$',
      'action', '/salon/dashboard/my-page'
    ),
    'precise_geocoding', jsonb_build_object(
      'label', 'Verified map location',
      'required', coalesce((v_required ->> 'precise_geocoding')::boolean, true),
      'passed', v_salon.geocode_status = 'success' and not v_salon.address_needs_review
        and v_salon.latitude is not null and v_salon.longitude is not null,
      'action', '/salon/dashboard/my-page'
    ),
    'logo', jsonb_build_object(
      'label', 'Salon logo',
      'required', coalesce((v_required ->> 'logo')::boolean, true),
      'passed', nullif(trim(coalesce(v_salon.logo_url, '')), '') is not null,
      'action', '/salon/dashboard/my-page'
    ),
    'cover_photo', jsonb_build_object(
      'label', 'Cover image',
      'required', coalesce((v_required ->> 'cover_photo')::boolean, true),
      'passed', nullif(trim(coalesce(v_salon.cover_photo_url, '')), '') is not null,
      'action', '/salon/dashboard/photos'
    ),
    'gallery_photos', jsonb_build_object(
      'label', format('At least %s gallery photos', v_gallery_required),
      'required', v_gallery_required > 0,
      'passed', v_gallery_count >= v_gallery_required,
      'current', v_gallery_count,
      'target', v_gallery_required,
      'action', '/salon/dashboard/photos'
    ),
    'business_details', jsonb_build_object(
      'label', 'Description and contact information',
      'required', coalesce((v_required ->> 'business_details')::boolean, true),
      'passed', length(trim(coalesce(v_salon.description, ''))) >= 40
        and nullif(trim(coalesce(v_salon.email, '')), '') is not null
        and nullif(trim(coalesce(v_salon.phone, '')), '') is not null,
      'action', '/salon/dashboard/my-page'
    ),
    'priced_service', jsonb_build_object(
      'label', 'Bookable service with price and duration',
      'required', coalesce((v_required ->> 'priced_service')::boolean, true),
      'passed', v_has_service,
      'action', '/salon/dashboard/styles'
    ),
    'active_stylist', jsonb_build_object(
      'label', 'Active stylist or confirmed owner-stylist',
      'required', coalesce((v_required ->> 'active_stylist')::boolean, true),
      'passed', v_has_stylist,
      'action', '/salon/dashboard/stylists'
    ),
    'business_hours', jsonb_build_object(
      'label', 'Business hours and availability',
      'required', coalesce((v_required ->> 'business_hours')::boolean, true),
      'passed', v_has_hours,
      'action', '/salon/dashboard/availability'
    ),
    'active_subscription', jsonb_build_object(
      'label', 'Active subscription',
      'required', coalesce((v_required ->> 'active_subscription')::boolean, true),
      'passed', v_subscription_active,
      'action', '/salon/dashboard/subscription'
    ),
    'payout_account', jsonb_build_object(
      'label', 'Payout account connected',
      'required', coalesce((v_required ->> 'payout_account')::boolean, false),
      'passed', nullif(trim(coalesce(v_salon.stripe_account_id, '')), '') is not null,
      'action', '/salon/dashboard/earnings'
    ),
    'agreements', jsonb_build_object(
      'label', 'Required agreements and media permissions',
      'required', coalesce((v_required ->> 'agreements')::boolean, true),
      'passed', coalesce(v_application.consent_authorized, false)
        and coalesce(v_application.consent_terms, false)
        and coalesce(v_application.consent_photos, false)
        and v_salon.media_consent,
      'action', '/salon/dashboard/my-page'
    )
  );

  select
    count(*) filter (where coalesce((item.value ->> 'required')::boolean, false)),
    count(*) filter (
      where coalesce((item.value ->> 'required')::boolean, false)
        and coalesce((item.value ->> 'passed')::boolean, false)
    )
  into v_required_count, v_passed_count
  from jsonb_each(v_checks) item;

  v_complete := v_required_count = v_passed_count;
  v_progress := case when v_required_count = 0 then 100 else round((v_passed_count::numeric / v_required_count) * 100)::integer end;

  return jsonb_build_object(
    'salon_id', v_salon.id,
    'salon_name', v_salon.name,
    'slug', v_salon.slug,
    'status', v_salon.status,
    'subscription_status', v_salon.subscription_status,
    'is_discoverable', v_salon.is_discoverable,
    'progress', v_progress,
    'required_count', v_required_count,
    'passed_count', v_passed_count,
    'all_required_complete', v_complete,
    'checks', v_checks,
    'auto_activation', coalesce((v_config ->> 'auto_activation')::boolean, true),
    'loss_behavior', coalesce(v_config ->> 'loss_behavior', 'needs_attention'),
    'grace_period_days', greatest(0, coalesce((v_config ->> 'grace_period_days')::integer, 7)),
    'public_eligible', v_complete and v_salon.status not in ('Suspended', 'Offboarded'),
    'eligibility_lost_at', v_salon.eligibility_lost_at,
    'eligibility_grace_until', v_salon.eligibility_grace_until
  );
end;
$$;

revoke all on function public.salon_lifecycle_diagnostic(uuid) from public, anon, authenticated;
grant execute on function public.salon_lifecycle_diagnostic(uuid) to service_role;

create or replace function public.reconcile_salon_lifecycle(
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
  v_diagnostic jsonb;
  v_salon public.salons%rowtype;
  v_old_status text;
  v_new_status text;
  v_complete boolean;
  v_auto boolean;
  v_loss_behavior text;
  v_grace_days integer;
  v_discoverable boolean;
  v_lost_at timestamptz;
  v_grace_until timestamptz;
begin
  select * into v_salon from public.salons where id = p_salon_id for update;
  if not found then raise exception 'Salon not found.'; end if;
  v_diagnostic := public.salon_lifecycle_diagnostic(p_salon_id);
  v_old_status := v_salon.status;
  v_new_status := v_old_status;
  v_complete := coalesce((v_diagnostic ->> 'all_required_complete')::boolean, false);
  v_auto := coalesce((v_diagnostic ->> 'auto_activation')::boolean, true);
  v_loss_behavior := coalesce(v_diagnostic ->> 'loss_behavior', 'needs_attention');
  v_grace_days := greatest(0, coalesce((v_diagnostic ->> 'grace_period_days')::integer, 7));
  v_discoverable := false;
  v_lost_at := v_salon.eligibility_lost_at;
  v_grace_until := v_salon.eligibility_grace_until;

  if v_old_status in ('Suspended', 'Offboarded', 'New', 'Pending') then
    v_discoverable := false;
  elsif v_complete then
    v_lost_at := null;
    v_grace_until := null;
    if v_old_status in ('Approved', 'Ready for Activation', 'Needs Attention') then
      v_new_status := case when v_auto then 'Active' else 'Ready for Activation' end;
    end if;
    v_discoverable := v_new_status = 'Active';
  else
    if v_old_status = 'Active' and v_loss_behavior = 'grace_period' then
      v_lost_at := coalesce(v_lost_at, now());
      v_grace_until := coalesce(v_grace_until, v_lost_at + make_interval(days => v_grace_days));
      if now() < v_grace_until then
        v_discoverable := true;
      else
        v_new_status := 'Needs Attention';
      end if;
    elsif v_old_status = 'Active' then
      v_lost_at := coalesce(v_lost_at, now());
      v_new_status := case when v_loss_behavior = 'hide_immediately' then 'Active' else 'Needs Attention' end;
    end if;
  end if;

  update public.salons
  set status = v_new_status,
      onboarding_progress = greatest(0, least(100, (v_diagnostic ->> 'progress')::integer)),
      onboarding_completed_at = case when v_complete then coalesce(onboarding_completed_at, now()) else null end,
      is_discoverable = v_discoverable,
      eligibility_lost_at = v_lost_at,
      eligibility_grace_until = v_grace_until,
      activated_at = case when v_new_status = 'Active' then coalesce(activated_at, now()) else activated_at end,
      lifecycle_reason = case when v_complete then null else p_reason end
  where id = p_salon_id;

  if v_old_status is distinct from v_new_status then
    insert into public.salon_status_audit(
      salon_id, previous_status, new_status, reason, acting_admin_id,
      future_booking_count, actor_type, source
    )
    select p_salon_id, v_old_status, v_new_status, p_reason, p_actor_id,
      count(*)::integer,
      case when p_actor_id is null then 'engine' else 'admin' end,
      case when p_actor_id is null then 'lifecycle_engine' else 'admin_salons' end
    from public.bookings booking
    where booking.salon_id = p_salon_id
      and booking.appointment_datetime >= now()
      and lower(coalesce(booking.status, '')) not in ('cancelled', 'canceled', 'completed');
  end if;

  return public.salon_lifecycle_diagnostic(p_salon_id);
end;
$$;

revoke all on function public.reconcile_salon_lifecycle(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reconcile_salon_lifecycle(uuid,uuid,text) to service_role;

create or replace function public.refresh_salon_lifecycle_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_salon_id uuid;
begin
  v_salon_id := case when tg_table_name = 'salons' then coalesce(new.id, old.id) else coalesce(new.salon_id, old.salon_id) end;
  perform public.reconcile_salon_lifecycle(v_salon_id, null, 'A required marketplace record changed');
  return coalesce(new, old);
end;
$$;

drop trigger if exists salons_refresh_lifecycle on public.salons;
create trigger salons_refresh_lifecycle
after insert or update of name, description, email, phone, address_street, address_city,
  address_state, address_zip, geocode_status, address_needs_review, latitude, longitude,
  logo_url, cover_photo_url, gallery_photos, hours, subscription_status,
  stripe_account_id, media_consent, owner_is_sole_stylist
on public.salons for each row
when (pg_trigger_depth() = 0)
execute function public.refresh_salon_lifecycle_trigger();

drop trigger if exists styles_refresh_salon_lifecycle on public.styles;
create trigger styles_refresh_salon_lifecycle after insert or update or delete on public.styles
for each row execute function public.refresh_salon_lifecycle_trigger();

drop trigger if exists stylists_refresh_salon_lifecycle on public.stylists;
create trigger stylists_refresh_salon_lifecycle after insert or update or delete on public.stylists
for each row execute function public.refresh_salon_lifecycle_trigger();

drop trigger if exists applications_refresh_salon_lifecycle on public.salon_applications;
create trigger applications_refresh_salon_lifecycle after insert or update or delete on public.salon_applications
for each row execute function public.refresh_salon_lifecycle_trigger();

drop trigger if exists subscriptions_refresh_salon_lifecycle on public.subscriptions;
create trigger subscriptions_refresh_salon_lifecycle after insert or update or delete on public.subscriptions
for each row execute function public.refresh_salon_lifecycle_trigger();

create or replace function public.admin_change_salon_status(
  acting_admin_id uuid,
  target_salon_id uuid,
  requested_status text,
  internal_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin_allowed boolean;
  v_salon public.salons%rowtype;
  v_status text;
  v_future integer;
  v_diagnostic jsonb;
begin
  select exists (
    select 1 from public.admin_users admin_user
    where admin_user.user_id = acting_admin_id
      and admin_user.status = 'Active'
      and (
        coalesce(admin_user.is_super_admin, false)
        or coalesce((admin_user.permissions ->> 'salons')::boolean, false)
      )
  ) into v_admin_allowed;
  if not v_admin_allowed then raise exception 'Forbidden'; end if;

  v_status := initcap(lower(trim(requested_status)));
  if lower(trim(requested_status)) = 'ready for activation' then v_status := 'Ready for Activation'; end if;
  if lower(trim(requested_status)) = 'needs attention' then v_status := 'Needs Attention'; end if;
  if v_status not in ('New','Pending','Approved','Ready for Activation','Active','Needs Attention','Suspended','Offboarded') then
    raise exception 'Choose a valid salon status.';
  end if;
  if v_status in ('Suspended','Offboarded','Needs Attention') and length(trim(coalesce(internal_reason,''))) < 5 then
    raise exception 'Enter an internal reason of at least 5 characters.';
  end if;

  select * into v_salon from public.salons where id = target_salon_id for update;
  if not found then raise exception 'Salon not found.'; end if;
  v_diagnostic := public.salon_lifecycle_diagnostic(target_salon_id);
  if v_status = 'Active' and not coalesce((v_diagnostic ->> 'all_required_complete')::boolean, false) then
    raise exception 'This salon cannot be activated until every required marketplace gate is complete.';
  end if;

  select count(*)::integer into v_future from public.bookings
  where salon_id = target_salon_id
    and appointment_datetime >= now()
    and lower(coalesce(status,'')) not in ('cancelled','canceled','completed');

  if v_salon.status = v_status then
    return jsonb_build_object('changed', false, 'status', v_salon.status, 'future_booking_count', v_future, 'diagnostic', v_diagnostic);
  end if;

  update public.salons
  set status = v_status,
      is_discoverable = v_status = 'Active',
      approved_at = case when v_status in ('Approved','Ready for Activation','Active') then coalesce(approved_at, now()) else approved_at end,
      activated_at = case when v_status = 'Active' then coalesce(activated_at, now()) else activated_at end,
      suspended_at = case when v_status = 'Suspended' then now() else suspended_at end,
      offboarded_at = case when v_status = 'Offboarded' then now() else offboarded_at end,
      lifecycle_reason = nullif(trim(internal_reason),'')
  where id = target_salon_id;

  insert into public.salon_status_audit(
    salon_id, previous_status, new_status, reason, acting_admin_id,
    future_booking_count, actor_type, source
  ) values (
    target_salon_id, v_salon.status, v_status, nullif(trim(internal_reason),''),
    acting_admin_id, v_future, 'admin', 'admin_salons'
  );

  return jsonb_build_object(
    'changed', true,
    'previous_status', v_salon.status,
    'status', v_status,
    'future_booking_count', v_future,
    'diagnostic', public.salon_lifecycle_diagnostic(target_salon_id)
  );
end;
$$;

revoke all on function public.admin_change_salon_status(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_change_salon_status(uuid,uuid,text,text) to service_role;

commit;
