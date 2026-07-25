do $$
declare
  missing_table text;
  core_table text;
  missing_function text;
begin
  foreach core_table in array array[
    'salons', 'stylists', 'styles', 'style_materials', 'customers', 'bookings',
    'reviews', 'subscriptions', 'availability', 'admin_users', 'complaints_log'
  ]
  loop
    if to_regclass('public.' || core_table) is null then
      raise exception 'Missing core table public.%', core_table;
    end if;

    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = core_table
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', core_table;
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = core_table
    ) then
      raise exception 'No final RLS policy exists on public.%', core_table;
    end if;
  end loop;

  foreach missing_table in array array[
    'content_pages', 'blog_posts', 'salon_team_members', 'service_categories',
    'master_styles', 'record_management_events', 'platform_error_events',
    'engine_settings', 'ai_automation_features'
  ]
  loop
    if to_regclass('public.' || missing_table) is null then
      raise exception 'Missing evolved table public.%', missing_table;
    end if;
  end loop;

  foreach missing_function in array array[
    'owns_salon', 'salon_has_permission', 'is_marketplace_visible',
    'reserve_booking_checkout', 'capture_platform_error',
    'save_salon_style_with_materials', 'normalize_marketplace_search'
  ]
  loop
    if not exists (
      select 1
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = missing_function
    ) then
      raise exception 'Missing evolved function public.%', missing_function;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'booking_integrity_conflicts'
      and relation.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.booking_integrity_conflicts';
  end if;

  if has_table_privilege('anon', 'public.booking_integrity_conflicts', 'SELECT')
     or has_table_privilege('anon', 'public.booking_integrity_conflicts', 'INSERT')
     or has_table_privilege('anon', 'public.booking_integrity_conflicts', 'UPDATE')
     or has_table_privilege('anon', 'public.booking_integrity_conflicts', 'DELETE')
     or has_table_privilege('authenticated', 'public.booking_integrity_conflicts', 'SELECT')
     or has_table_privilege('authenticated', 'public.booking_integrity_conflicts', 'INSERT')
     or has_table_privilege('authenticated', 'public.booking_integrity_conflicts', 'UPDATE')
     or has_table_privilege('authenticated', 'public.booking_integrity_conflicts', 'DELETE')
  then
    raise exception 'Browser roles retain direct privileges on public.booking_integrity_conflicts';
  end if;

  if not has_table_privilege('service_role', 'public.booking_integrity_conflicts', 'SELECT')
     or not has_table_privilege('service_role', 'public.booking_integrity_conflicts', 'INSERT')
  then
    raise exception 'Service role cannot operate public.booking_integrity_conflicts';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_resource_no_overlap'
      and contype = 'x'
  ) then
    raise exception 'Stylist/salon overlap exclusion constraint is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_customer_email_no_overlap'
      and contype = 'x'
  ) then
    raise exception 'Customer-email overlap exclusion constraint is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='bookings'
      and column_name='public_reference'
      and is_nullable='NO'
  ) then
    raise exception 'Required non-null bookings.public_reference is missing';
  end if;

  if public.booking_public_reference_from_number(1)<>'GC-A-01'
    or public.booking_public_reference_from_number(99)<>'GC-A-99'
    or public.booking_public_reference_from_number(100)<>'GC-B-01'
    or public.booking_public_reference_from_number(2575)<>'GC-AA-01'
  then
    raise exception 'Booking public reference sequence mapping is incorrect';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and tablename='bookings'
      and indexname='bookings_public_reference_unique'
  ) then
    raise exception 'Unique booking public reference index is missing';
  end if;

  if to_regclass('public.booking_refund_operations') is null then
    raise exception 'Booking refund operation audit table is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.bookings'::regclass
      and conname='bookings_refund_funding_state_check'
  ) then
    raise exception 'Booking refund funding-state constraint is missing';
  end if;

  if not exists (
    select 1 from public.engine_settings
    where setting_key='booking.customer_cancellation_grace_minutes'
      and status='Published'
  ) then
    raise exception 'Engine-controlled cancellation grace period is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='admin_users'
      and column_name='time_zone'
  ) then
    raise exception 'Admin timezone preference is missing';
  end if;

  if not exists (
    select 1
    from public.engine_settings
    where setting_key='localization.default_admin_time_zone'
      and status='Published'
  ) then
    raise exception 'Engine default admin timezone is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='video_processing_jobs'
      and column_name='source_cleanup_status'
  ) then
    raise exception 'Video processing cleanup lifecycle is missing';
  end if;

  if not exists (
    select 1
    from public.engine_settings
    where setting_key='media.video_failed_source_retention_hours'
      and status='Published'
  ) then
    raise exception 'Engine video source-retention policy is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='platform_brand_assets'
      and column_name='draft_reviewed_at'
  ) then
    raise exception 'Brand asset review lifecycle is missing';
  end if;

  if not exists (
    select 1
    from public.engine_settings
    where setting_key='branding.heading_font'
      and status='Published'
  ) then
    raise exception 'Founder-editable brand typography is missing';
  end if;
end
$$;

select
  'clean database assertions passed' as result,
  count(*) filter (where schemaname = 'public') as public_policy_count
from pg_policies;
