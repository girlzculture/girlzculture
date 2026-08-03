do $$
declare
  missing_table text;
  core_table text;
  missing_function text;
  relation_name text;
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

  if public.booking_public_reference_from_number(1)<>'GCA01'
    or public.booking_public_reference_from_number(99)<>'GCA99'
    or public.booking_public_reference_from_number(100)<>'GCB01'
    or public.booking_public_reference_from_number(2575)<>'GCAA01'
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

  if to_regclass('public.commerce_checkout_intents') is null
     or to_regclass('public.product_inventory_reservations') is null
     or to_regclass('public.product_orders') is null
     or to_regclass('public.product_order_items') is null
     or to_regclass('public.product_promotion_redemptions') is null
     or to_regclass('public.product_order_refunds') is null
     or to_regclass('public.product_order_events') is null
  then
    raise exception 'Product-commerce lifecycle tables are incomplete';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='salon_products'
      and column_name='inventory_quantity'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='salon_products'
      and column_name='product_status'
  ) then
    raise exception 'Salon product commerce controls are missing';
  end if;

  if public.product_order_reference_from_number(1)<>'GC-P-A-01'
    or public.product_order_reference_from_number(99)<>'GC-P-A-99'
    or public.product_order_reference_from_number(100)<>'GC-P-B-01'
    or public.product_order_reference_from_number(2575)<>'GC-P-AA-01'
  then
    raise exception 'Product order reference sequence mapping is incorrect';
  end if;

  if to_regprocedure(
    'public.reserve_combined_checkout(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,uuid,numeric,text)'
  ) is null
    or to_regprocedure(
      'public.apply_commerce_checkout_tax(uuid,numeric,text)'
    ) is null
    or to_regprocedure(
      'public.release_combined_checkout(uuid,text)'
    ) is null
    or to_regprocedure(
      'public.complete_combined_checkout(uuid,jsonb)'
    ) is null
  then
    raise exception 'Atomic combined-commerce functions are incomplete';
  end if;

  foreach relation_name in array array[
    'commerce_checkout_intents',
    'product_inventory_reservations',
    'product_orders',
    'product_order_items',
    'product_promotion_redemptions',
    'product_order_refunds',
    'product_order_events',
    'integration_health_checks'
  ]
  loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname=relation_name
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', relation_name;
    end if;
  end loop;

  if has_table_privilege(
      'anon',
      'public.commerce_checkout_intents',
      'SELECT'
    )
    or has_table_privilege(
      'authenticated',
      'public.commerce_checkout_intents',
      'SELECT'
    )
    or has_table_privilege(
      'anon',
      'public.product_inventory_reservations',
      'SELECT'
    )
    or has_table_privilege(
      'authenticated',
      'public.product_inventory_reservations',
      'SELECT'
    )
  then
    raise exception 'Browser roles can directly read server-only commerce reservations';
  end if;

  if has_function_privilege(
      'anon',
      'public.reserve_combined_checkout(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,uuid,numeric,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.reserve_combined_checkout(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,uuid,numeric,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.reserve_combined_checkout(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,uuid,numeric,text)',
      'EXECUTE'
    )
  then
    raise exception 'Atomic commerce reservation function grants are unsafe';
  end if;

  if to_regprocedure('public.list_public_style_catalog(integer)') is null
    or not has_function_privilege(
      'anon',
      'public.list_public_style_catalog(integer)',
      'EXECUTE'
    )
    or has_table_privilege('anon','public.salons','SELECT')
  then
    raise exception 'Authorized public style projection or salon privacy is incorrect';
  end if;

  foreach relation_name in array array[
    'booking_review_links',
    'review_moderation_events',
    'review_dispute_events',
    'salon_availability_override_audit',
    'salon_recovery_balances',
    'booking_financial_events',
    'homepage_product_placements',
    'homepage_product_placement_audit'
  ]
  loop
    if to_regclass('public.' || relation_name) is null then
      raise exception 'Final acceptance table public.% is missing', relation_name;
    end if;
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname=relation_name
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on final acceptance table public.%', relation_name;
    end if;
    if not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename=relation_name
    ) then
      raise exception 'Final acceptance table public.% has no RLS policy', relation_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and tablename='reviews'
      and indexname='reviews_one_per_booking_idx'
  ) then
    raise exception 'Exactly-one-review-per-booking constraint is missing';
  end if;

  if to_regprocedure(
      'public.submit_verified_guest_review(text,text,integer,integer,integer,integer,integer,boolean,text,jsonb)'
    ) is null
    or has_function_privilege(
      'anon',
      'public.submit_verified_guest_review(text,text,integer,integer,integer,integer,integer,boolean,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.submit_verified_guest_review(text,text,integer,integer,integer,integer,integer,boolean,text,jsonb)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.submit_verified_guest_review(text,text,integer,integer,integer,integer,integer,boolean,text,jsonb)',
      'EXECUTE'
    )
  then
    raise exception 'Verified guest-review function or grants are unsafe';
  end if;

  if to_regprocedure('public.dispute_review(uuid,text)') is null
    or not has_function_privilege(
      'authenticated',
      'public.dispute_review(uuid,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.dispute_review(uuid,text)',
      'EXECUTE'
    )
    or to_regprocedure(
      'public.admin_moderate_review(uuid,text,text,uuid)'
    ) is null
    or has_function_privilege(
      'authenticated',
      'public.admin_moderate_review(uuid,text,text,uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.admin_moderate_review(uuid,text,text,uuid)',
      'EXECUTE'
    )
  then
    raise exception 'Review dispute or moderation function grants are unsafe';
  end if;

  if to_regprocedure(
      'public.approve_salon_application(uuid,uuid)'
    ) is null
    or has_function_privilege(
      'authenticated',
      'public.approve_salon_application(uuid,uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.approve_salon_application(uuid,uuid)',
      'EXECUTE'
    )
    or to_regprocedure(
      'public.create_salon_availability_override(uuid,uuid,timestamp with time zone,timestamp with time zone,text,boolean,text,uuid)'
    ) is null
    or to_regprocedure(
      'public.release_salon_availability_override(uuid,uuid,uuid,text)'
    ) is null
  then
    raise exception 'Pilot lifecycle or availability RPC grants are unsafe';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='salon_blockouts'
      and column_name='released_at'
  )
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='reviews'
        and column_name='display_name'
    )
    or has_table_privilege(
      'authenticated',
      'public.review_dispute_events',
      'INSERT'
    )
    or has_table_privilege(
      'authenticated',
      'public.salon_availability_override_audit',
      'UPDATE'
    )
  then
    raise exception 'Pilot review or availability audit protections are incomplete';
  end if;

  if has_table_privilege('anon','public.booking_review_links','SELECT')
    or has_table_privilege('authenticated','public.booking_review_links','SELECT')
  then
    raise exception 'Browser roles can read hashed guest-review links';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and indexname='bookings_active_stylist_datetime_idx'
  )
    or not exists (
      select 1 from pg_indexes
      where schemaname='public'
        and indexname='booking_checkout_intents_pending_stylist_datetime_idx'
    )
  then
    raise exception 'Availability performance indexes are missing';
  end if;

  if to_regprocedure(
      'public.reserve_product_pickup_checkout(uuid,uuid,text,text,text,jsonb,uuid,numeric,numeric,integer,text,text)'
    ) is null
    or to_regprocedure(
      'public.complete_product_pickup_reservation(uuid,jsonb)'
    ) is null
    or to_regprocedure(
      'public.advance_product_pickup_reservation(uuid,text,uuid,text,text)'
    ) is null
    or to_regprocedure(
      'public.cancel_product_pickup_reservation(uuid,text,text,text,text,numeric)'
    ) is null
    or to_regprocedure(
      'public.expire_product_pickup_reservations()'
    ) is null
    or to_regprocedure(
      'public.admin_save_homepage_product_placement(uuid,uuid,uuid,text,integer,timestamp with time zone,timestamp with time zone,text,uuid,text)'
    ) is null
  then
    raise exception 'Pickup reservation or homepage-product functions are incomplete';
  end if;

  if has_function_privilege(
      'anon',
      'public.reserve_product_pickup_checkout(uuid,uuid,text,text,text,jsonb,uuid,numeric,numeric,integer,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.reserve_product_pickup_checkout(uuid,uuid,text,text,text,jsonb,uuid,numeric,numeric,integer,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.reserve_product_pickup_checkout(uuid,uuid,text,text,text,jsonb,uuid,numeric,numeric,integer,text,text)',
      'EXECUTE'
    )
  then
    raise exception 'Pickup reservation function grants are unsafe';
  end if;

  if not exists (
    select 1 from public.engine_settings
    where setting_key='commerce.pickup_deposit_percent'
      and published_value='10'::jsonb
  )
    or not exists (
      select 1 from public.engine_settings
      where setting_key='commerce.pickup_deposit_minimum'
        and published_value='5'::jsonb
    )
    or not exists (
      select 1 from public.engine_settings
      where setting_key='homepage.featured_product_card_count'
        and status='Published'
    )
  then
    raise exception 'Pickup or Featured Product Engine controls are missing';
  end if;

  if not exists (
    select 1
    from public.content_pages page,
      lateral jsonb_array_elements(page.sections) section
    where page.slug = 'home'
      and section->>'type' = 'promo_rail'
      and jsonb_array_length(coalesce(section->'cards', '[]'::jsonb)) between 1 and 20
  ) then
    raise exception 'Homepage promotion rail is missing or does not contain between 1 and 20 cards';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname='public'
      and indexname='homepage_sections_unique_position'
  )
    or (select count(*) from public.homepage_sections) <>
       (select count(distinct sort_order) from public.homepage_sections)
    or not exists (
      select 1
      from public.homepage_sections
      where section_key='promo_rail' and sort_order between 1 and 4
    )
  then
    raise exception 'Authoritative homepage section ordering is incomplete';
  end if;

  if not has_function_privilege(
    'anon',
    'public.resolve_homepage_promotion_target(text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Public homepage promotion target resolver is unavailable';
  end if;

  if not exists (
    select 1
    from public.media_upload_profiles
    where profile_key='content'
      and 'image/gif'=any(accepted_mime_types)
  ) then
    raise exception 'Editorial animated GIF support is not configured';
  end if;

  if to_regclass('public.media_upload_sessions') is null
    or not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname='media_upload_sessions'
        and relation.relrowsecurity
    )
    or not exists (
      select 1
      from pg_policies
      where schemaname='public'
        and tablename='media_upload_sessions'
        and policyname='media_upload_sessions_owner_read'
    )
    or not exists (
      select 1
      from storage.buckets
      where id='media-originals'
        and public=false
        and file_size_limit=12582912
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='media_assets'
        and column_name='source_object_path'
    )
  then
    raise exception 'Direct image-upload sessions or private source retention are incomplete';
  end if;

  if to_regprocedure(
      'public.finalize_media_upload_session(uuid,jsonb)'
    ) is null
    or has_function_privilege(
      'anon',
      'public.finalize_media_upload_session(uuid,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.finalize_media_upload_session(uuid,jsonb)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.finalize_media_upload_session(uuid,jsonb)',
      'EXECUTE'
    )
  then
    raise exception 'Direct image finalization function grants are unsafe';
  end if;

  if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='blog_posts'
        and column_name='updated_by'
    )
    or to_regprocedure('public.attach_registered_media()') is null
    or position(
      'media.salon_id = v_salon_id'
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or position(
      'media.owner_user_id = v_owner_id'
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or position(
      'saving_administrator.permissions ->> v_admin_permission'
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or position(
      'coalesce(saving_administrator.status, ''Active'') = ''Active'''
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or position(
      'media.bucket_id = ''content-media'''
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or position(
      'media.salon_id is null'
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or position(
      'asset_owner_administrator.permissions'
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or position(
      'asset_owner_administrator.status'
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or position(
      ') = media.owner_user_id'
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or position(
      'saving_administrator.permissions ->> ''settings'''
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or position(
      'asset_owner_administrator.permissions ->> ''settings'''
      in pg_get_functiondef(
        'public.attach_registered_media()'::regprocedure
      )
    ) = 0
    or has_function_privilege(
      'authenticated',
      'public.attach_registered_media()',
      'EXECUTE'
    )
  then
    raise exception 'Automatic media attachment is not owner- and administrator-scoped';
  end if;

  if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='stylists'
        and column_name='slug'
        and is_nullable='NO'
    )
    or not exists (
      select 1
      from pg_constraint constraint_record
      join pg_class relation on relation.oid=constraint_record.conrelid
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname='stylists'
        and constraint_record.conname='stylists_slug_format_check'
        and constraint_record.convalidated
    )
    or not exists (
      select 1
      from pg_indexes
      where schemaname='public'
        and indexname='stylists_salon_slug_unique_idx'
    )
    or not exists (
      select 1
      from pg_trigger trigger_record
      join pg_class relation on relation.oid=trigger_record.tgrelid
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname='stylists'
        and trigger_record.tgname='stylists_assign_stable_slug'
        and not trigger_record.tgisinternal
        and trigger_record.tgenabled <> 'D'
    )
  then
    raise exception 'Stable stylist slug schema is incomplete';
  end if;

  if to_regclass('public.salon_publication_overrides') is null
    or to_regclass('public.salon_publication_override_audit') is null
    or not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname in (
          'salon_publication_overrides',
          'salon_publication_override_audit'
        )
        and relation.relrowsecurity
      group by namespace.nspname
      having count(*)=2
    )
    or has_table_privilege(
      'anon',
      'public.salon_publication_overrides',
      'SELECT'
    )
    or has_table_privilege(
      'authenticated',
      'public.salon_publication_overrides',
      'SELECT'
    )
    or has_table_privilege(
      'authenticated',
      'public.salon_publication_override_audit',
      'SELECT'
    )
    or not has_table_privilege(
      'service_role',
      'public.salon_publication_override_audit',
      'SELECT'
    )
    or not exists (
      select 1
      from pg_trigger trigger_record
      join pg_class relation on relation.oid=trigger_record.tgrelid
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname='salon_publication_override_audit'
        and trigger_record.tgname='salon_publication_override_audit_immutable'
        and not trigger_record.tgisinternal
        and trigger_record.tgenabled <> 'D'
    )
  then
    raise exception 'Publication override RLS or immutable audit protection is incomplete';
  end if;

  if to_regprocedure('public.salon_publication_diagnostic(uuid)') is null
    or to_regprocedure('public.is_salon_profile_public(uuid)') is null
    or to_regprocedure('public.is_marketplace_visible(uuid)') is null
    or to_regprocedure(
      'public.admin_activate_salon_application(uuid,uuid,boolean,text)'
    ) is null
    or has_function_privilege(
      'anon',
      'public.salon_publication_diagnostic(uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'anon',
      'public.is_salon_profile_public(uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'anon',
      'public.is_marketplace_visible(uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.admin_activate_salon_application(uuid,uuid,boolean,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.admin_activate_salon_application(uuid,uuid,boolean,text)',
      'EXECUTE'
    )
  then
    raise exception 'Publication activation function grants are unsafe';
  end if;

  if not exists (
      select 1
      from pg_policies
      where schemaname='public'
        and tablename='salons'
        and policyname='salons_public_read'
        and qual like '%is_salon_profile_public%'
        and qual like '%salon_has_permission%'
    )
    or not exists (
      select 1
      from pg_policies
      where schemaname='public'
        and tablename='styles'
        and policyname='styles_public_read'
        and qual like '%is_salon_profile_public%'
        and qual like '%is_draft%'
        and qual like '%archived_at%'
    )
    or not exists (
      select 1
      from pg_policies
      where schemaname='public'
        and tablename='stylists'
        and policyname='stylists_public_read'
        and qual like '%is_salon_profile_public%'
        and qual like '%is_draft%'
        and qual like '%archived_at%'
    )
  then
    raise exception 'Publication profile RLS policies are incomplete';
  end if;

  if to_regclass('public.salon_spreadsheet_imports') is null
    or not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname='salon_spreadsheet_imports'
        and relation.relrowsecurity
    )
    or not exists (
      select 1
      from pg_policies
      where schemaname='public'
        and tablename='salon_spreadsheet_imports'
        and policyname='salon_spreadsheet_imports_owner_read'
        and qual like '%owns_salon%'
        and qual like '%is_admin%'
    )
  then
    raise exception 'Salon spreadsheet import audit RLS is incomplete';
  end if;

  if to_regprocedure(
      'public.import_salon_services_spreadsheet(uuid,uuid,text,jsonb)'
    ) is null
    or to_regprocedure(
      'public.import_salon_products_spreadsheet(uuid,uuid,text,jsonb)'
    ) is null
    or has_function_privilege(
      'anon',
      'public.import_salon_services_spreadsheet(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.import_salon_services_spreadsheet(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.import_salon_products_spreadsheet(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.import_salon_products_spreadsheet(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.import_salon_services_spreadsheet(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.import_salon_products_spreadsheet(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or position(
      'pg_advisory_xact_lock'
      in pg_get_functiondef(
        'public.import_salon_services_spreadsheet(uuid,uuid,text,jsonb)'::regprocedure
      )
    ) = 0
    or position(
      'product.salon_id = p_salon_id'
      in pg_get_functiondef(
        'public.import_salon_products_spreadsheet(uuid,uuid,text,jsonb)'::regprocedure
      )
    ) = 0
    or position(
      'style.salon_id = p_salon_id'
      in pg_get_functiondef(
        'public.import_salon_services_spreadsheet(uuid,uuid,text,jsonb)'::regprocedure
      )
    ) = 0
  then
    raise exception 'Salon spreadsheet import function isolation or grants are unsafe';
  end if;
end
$$;

select
  'clean database assertions passed' as result,
  count(*) filter (where schemaname = 'public') as public_policy_count
from pg_policies;
