do $$
declare
  missing_table text;
  core_table text;
  missing_function text;
  relation_name text;
  overview_metrics record;
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

    -- reviews is intentionally service-only: RLS with zero browser policies is
    -- deny-by-default, and the detailed assertions below verify that anon and
    -- authenticated retain no table privileges while service_role does.
    if core_table <> 'reviews' and not exists (
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
    'engine_settings', 'ai_automation_features',
    'application_document_uploads'
  ]
  loop
    if to_regclass('public.' || missing_table) is null then
      raise exception 'Missing evolved table public.%', missing_table;
    end if;
  end loop;

  foreach missing_function in array array[
    'owns_salon', 'salon_has_permission', 'is_marketplace_visible',
    'reserve_booking_checkout', 'capture_platform_error',
    'save_salon_style_with_materials', 'normalize_marketplace_search',
    'platform_admin_overview_metrics', 'admin_assign_support_ticket',
    'admin_save_content_record', 'admin_save_content_catalog_record',
    'admin_respond_support_ticket',
    'admin_claim_support_response_email',
    'admin_complete_support_response_email',
    'admin_content_link_targets',
    'prepare_application_document_upload',
    'finalize_application_document_upload',
    'abandon_application_document_upload',
    'marketplace_visible_salon_ids'
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

  if to_regprocedure(
      'public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer)'
    ) is null
    or has_function_privilege(
      'anon',
      'public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.discover_nearby_salons_ranked(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.distance_miles(double precision,double precision,double precision,double precision)',
      'EXECUTE'
    )
  then
    raise exception 'Server-only authoritative discovery function grants are unsafe';
  end if;

  -- Search suggestions use the same canonical marketplace-visibility predicate
  -- as discovery. Verify the deployed catalog and execute the function against
  -- the post-migration database; migration-text checks alone are insufficient.
  if to_regprocedure('public.marketplace_visible_salon_ids(integer)') is null
    or has_function_privilege(
      'anon',
      'public.marketplace_visible_salon_ids(integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.marketplace_visible_salon_ids(integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.marketplace_visible_salon_ids(integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.resolve_search_service_query(text)',
      'EXECUTE'
    )
    or exists (
      select 1
      from pg_proc procedure
      where procedure.oid='public.marketplace_visible_salon_ids(integer)'::regprocedure
        and (
          not procedure.prosecdef
          or procedure.provolatile <> 's'
          or position(
            'search_path=pg_catalog, public'
            in array_to_string(coalesce(procedure.proconfig,array[]::text[]),',')
          )=0
        )
    )
  then
    raise exception 'Marketplace-visible suggestion function grants or definer hardening are unsafe';
  end if;

  if exists (
    with expected as (
      select salon.id as salon_id
      from public.salons salon
      where public.is_marketplace_visible(salon.id)
      order by salon.id
      limit 2000
    ), actual as (
      select visible.salon_id
      from public.marketplace_visible_salon_ids(2000) visible
    )
    (select salon_id from expected except select salon_id from actual)
    union all
    (select salon_id from actual except select salon_id from expected)
  )
    or (select count(*) from public.marketplace_visible_salon_ids(0)) > 1
    or (select count(*) from public.marketplace_visible_salon_ids(999999)) > 2000
  then
    raise exception 'Marketplace-visible suggestion function diverges from canonical eligibility or its bounds';
  end if;

  foreach relation_name in array array[
    'booking_review_links',
    'review_moderation_events',
    'review_dispute_events',
    'review_content_moderation_queue',
    'review_reply_moderation_queue',
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

  if exists (
      select 1 from pg_policies
      where schemaname='public'
        and tablename='reviews'
        and policyname='reviews_customer_insert'
    )
    or has_table_privilege('anon','public.reviews','INSERT')
    or has_table_privilege('authenticated','public.reviews','INSERT')
    or has_function_privilege('anon','public.reply_to_review(uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','public.reply_to_review(uuid,text)','EXECUTE')
  then
    raise exception 'Direct review insert or legacy unmoderated reply access remains exposed';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='reviews'
      and cmd='SELECT'
      and roles && array['public'::name,'anon'::name,'authenticated'::name]
  ) then
    raise exception 'Browser roles retain direct review SELECT access';
  end if;

  if exists (
      select 1
      from pg_policies
      where schemaname='public'
        and tablename='reviews'
        and (
          policyname in ('reviews_admin_update','reviews_admin_delete')
          or (
            cmd in ('UPDATE','DELETE')
            and roles && array['public'::name,'anon'::name,'authenticated'::name]
          )
        )
    )
    or has_table_privilege('anon','public.reviews','UPDATE')
    or has_table_privilege('anon','public.reviews','DELETE')
    or has_table_privilege('authenticated','public.reviews','UPDATE')
    or has_table_privilege('authenticated','public.reviews','DELETE')
    or has_table_privilege('anon','public.reviews','SELECT')
    or has_table_privilege('authenticated','public.reviews','SELECT')
    or not has_table_privilege('service_role','public.reviews','SELECT')
    or not has_table_privilege('service_role','public.reviews','INSERT')
    or not has_table_privilege('service_role','public.reviews','UPDATE')
    or not has_table_privilege('service_role','public.reviews','DELETE')
  then
    raise exception 'Review table privileges or direct browser moderation policies are unsafe';
  end if;

  if exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='reviews'
    )
    or not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='salons'
    )
  then
    raise exception 'Private review rows are published or salon-summary realtime is missing';
  end if;

  if to_regprocedure(
      'public.submit_verified_guest_review(text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.submit_verified_guest_review(text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb)'
    ) is not null
    or to_regprocedure(
      'public.submit_verified_guest_review(text,text,integer,integer,integer,integer,integer,boolean,text,jsonb)'
    ) is not null
    or has_function_privilege(
      'anon',
      'public.submit_verified_guest_review(text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.submit_verified_guest_review(text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb,text,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.submit_verified_guest_review(text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb,text,text,text)',
      'EXECUTE'
    )
  then
    raise exception 'Verified guest-review function or grants are unsafe';
  end if;

  if to_regprocedure('public.admin_moderate_review_content(uuid,text,text,uuid)') is null
    or to_regprocedure('public.submit_salon_review_reply(uuid,text,text,text,text,uuid)') is null
    or to_regprocedure('public.admin_moderate_review_reply(uuid,text,text,uuid)') is null
    or has_function_privilege('authenticated','public.admin_moderate_review_content(uuid,text,text,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.submit_salon_review_reply(uuid,text,text,text,text,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.admin_moderate_review_reply(uuid,text,text,uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.admin_moderate_review_content(uuid,text,text,uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.submit_salon_review_reply(uuid,text,text,text,text,uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.admin_moderate_review_reply(uuid,text,text,uuid)','EXECUTE')
  then
    raise exception 'Review content/reply moderation function grants are unsafe';
  end if;

  if exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='review_reply_moderation_queue'
        and column_name='submitted_by'
        and is_nullable<>'YES'
    )
    or not exists (
      select 1
      from pg_constraint constraint_row
      join pg_class relation on relation.oid=constraint_row.conrelid
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname='review_reply_moderation_queue'
        and constraint_row.contype='f'
        and constraint_row.conname='review_reply_moderation_queue_submitted_by_fkey'
        and constraint_row.confdeltype='n'
    )
  then
    raise exception 'Review reply moderation actor retention is not identity-deletion safe';
  end if;

  if to_regprocedure('public.claim_notification_delivery(uuid,text,text,text,text,text)') is null
    or has_function_privilege('anon','public.claim_notification_delivery(uuid,text,text,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_notification_delivery(uuid,text,text,text,text,text)','EXECUTE')
    or not has_function_privilege('service_role','public.claim_notification_delivery(uuid,text,text,text,text,text)','EXECUTE')
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='notification_delivery_log'
        and column_name='deduplication_key'
    )
    or not exists (
      select 1 from pg_indexes
      where schemaname='public'
        and tablename='notification_delivery_log'
        and indexname='notification_delivery_deduplication_idx'
        and indexdef like '%UNIQUE%'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='notification_delivery_log'
        and column_name='attempt_count'
        and is_nullable='NO'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='notification_delivery_log'
        and column_name='lease_expires_at'
    )
  then
    raise exception 'Notification delivery reservation or grants are unsafe';
  end if;

  if to_regprocedure('public.claim_booking_reminder(uuid,integer)') is null
    or to_regprocedure('public.fail_booking_reminder_claim(uuid,integer,text)') is null
    or has_function_privilege('anon','public.claim_booking_reminder(uuid,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_booking_reminder(uuid,integer)','EXECUTE')
    or has_function_privilege('anon','public.fail_booking_reminder_claim(uuid,integer,text)','EXECUTE')
    or has_function_privilege('authenticated','public.fail_booking_reminder_claim(uuid,integer,text)','EXECUTE')
    or not has_function_privilege('service_role','public.claim_booking_reminder(uuid,integer)','EXECUTE')
    or not has_function_privilege('service_role','public.fail_booking_reminder_claim(uuid,integer,text)','EXECUTE')
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='booking_reminder_claims'
        and column_name='attempt_count'
        and is_nullable='NO'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='booking_reminder_claims'
        and column_name='lease_expires_at'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='booking_reminder_claims'
        and column_name='next_attempt_at'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='booking_reminder_claims'
        and column_name='terminal_at'
    )
    or not exists (
      select 1
      from pg_constraint constraint_row
      join pg_class relation on relation.oid=constraint_row.conrelid
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname='booking_reminder_claims'
        and constraint_row.conname='booking_reminder_claims_attempt_count_check'
        and constraint_row.contype='c'
    )
    or pg_get_functiondef(
      'public.claim_booking_reminder(uuid,integer)'::regprocedure
    ) !~ 'claim[.]attempt_count[[:space:]]*<[[:space:]]*3'
    or position(
      'REMINDER_PERMANENT_FAILURE_REFERENCE:'
      in pg_get_functiondef(
        'public.fail_booking_reminder_claim(uuid,integer,text)'::regprocedure
      )
    )=0
  then
    raise exception 'Booking reminder retry lease, attempt bound, terminal state, or grants are unsafe';
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
  )
    or not has_function_privilege(
      'anon',
      'public.resolve_homepage_promotion_targets(jsonb)',
      'EXECUTE'
  ) then
    raise exception 'Public homepage promotion target resolvers are unavailable';
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

  if to_regprocedure('public.get_public_navigation_surface(text)') is null
    or not has_function_privilege(
      'anon',
      'public.get_public_navigation_surface(text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'public.get_public_navigation_surface(text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.get_public_navigation_surface(text)',
      'EXECUTE'
    )
    or position(
      '''configured'', count(*) > 0'
      in lower(pg_get_functiondef(
        'public.get_public_navigation_surface(text)'::regprocedure
      ))
    ) = 0
    or position(
      'item.is_enabled'
      in lower(pg_get_functiondef(
        'public.get_public_navigation_surface(text)'::regprocedure
      ))
    ) = 0
    or position(
      'item.archived_at is null'
      in lower(pg_get_functiondef(
        'public.get_public_navigation_surface(text)'::regprocedure
      ))
    ) = 0
  then
    raise exception 'Public navigation projection is missing or exposes disabled records';
  end if;

  if to_regprocedure('public.get_public_content_page(text)') is null
    or to_regprocedure('public.get_public_content_pages()') is null
    or to_regprocedure('public.get_public_blog_post(text)') is null
    or to_regprocedure('public.get_public_blog_posts()') is null
    or not has_function_privilege('anon','public.get_public_content_page(text)','EXECUTE')
    or not has_function_privilege('authenticated','public.get_public_content_pages()','EXECUTE')
    or not has_function_privilege('anon','public.get_public_blog_post(text)','EXECUTE')
    or not has_function_privilege('authenticated','public.get_public_blog_posts()','EXECUTE')
    or not has_function_privilege('anon','public.get_public_content_pages()','EXECUTE')
    or not has_function_privilege('authenticated','public.get_public_content_page(text)','EXECUTE')
    or not has_function_privilege('anon','public.get_public_blog_posts()','EXECUTE')
    or not has_function_privilege('authenticated','public.get_public_blog_post(text)','EXECUTE')
    or not has_function_privilege('service_role','public.get_public_content_page(text)','EXECUTE')
    or not has_function_privilege('service_role','public.get_public_content_pages()','EXECUTE')
    or not has_function_privilege('service_role','public.get_public_blog_post(text)','EXECUTE')
    or not has_function_privilege('service_role','public.get_public_blog_posts()','EXECUTE')
    or not exists (
      select 1 from pg_proc procedure
      where procedure.oid='public.get_public_content_page(text)'::regprocedure
        and procedure.prosecdef and procedure.provolatile='s'
        and position('search_path=public, pg_temp' in array_to_string(procedure.proconfig, ','))>0
    )
    or not exists (
      select 1 from pg_proc procedure
      where procedure.oid='public.get_public_content_pages()'::regprocedure
        and procedure.prosecdef and procedure.provolatile='s'
        and position('search_path=public, pg_temp' in array_to_string(procedure.proconfig, ','))>0
    )
    or not exists (
      select 1 from pg_proc procedure
      where procedure.oid='public.get_public_blog_post(text)'::regprocedure
        and procedure.prosecdef and procedure.provolatile='s'
        and position('search_path=public, pg_temp' in array_to_string(procedure.proconfig, ','))>0
    )
    or not exists (
      select 1 from pg_proc procedure
      where procedure.oid='public.get_public_blog_posts()'::regprocedure
        and procedure.prosecdef and procedure.provolatile='s'
        and position('search_path=public, pg_temp' in array_to_string(procedure.proconfig, ','))>0
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='content_pages'
        and column_name='published_payload' and data_type='jsonb'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='blog_posts'
        and column_name='scheduled_payload' and data_type='jsonb'
    )
    or not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='content_pages'
        and policyname='content_pages_public_read'
        and qual like '%is_admin%'
        and qual not like '%status%Published%'
    )
    or not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='blog_posts'
        and policyname='blog_posts_public_read'
        and qual like '%is_admin%'
        and qual not like '%status%Published%'
    )
  then
    raise exception 'Recoverable content publication snapshots or safe public projections are incomplete';
  end if;

  if to_regprocedure(
      'public.admin_save_content_record(text,uuid,jsonb,text,timestamptz)'
    ) is null
    or not exists (
      select 1 from pg_proc procedure
      where procedure.oid=
        'public.admin_save_content_record(text,uuid,jsonb,text,timestamptz)'::regprocedure
        and procedure.prosecdef
        and position(
          'search_path=pg_catalog, public'
          in array_to_string(procedure.proconfig, ',')
        )>0
    )
    or has_function_privilege(
      'anon',
      'public.admin_save_content_record(text,uuid,jsonb,text,timestamptz)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.admin_save_content_record(text,uuid,jsonb,text,timestamptz)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.admin_save_content_record(text,uuid,jsonb,text,timestamptz)',
      'EXECUTE'
    )
    or position(
      'insert into public.record_management_events'
      in lower(pg_get_functiondef(
        'public.admin_save_content_record(text,uuid,jsonb,text,timestamptz)'::regprocedure
      ))
    )=0
  then
    raise exception 'Atomic content save function or grants are unsafe';
  end if;

  if to_regprocedure(
      'public.admin_save_content_catalog_record(text,uuid,jsonb)'
    ) is null
    or not exists (
      select 1 from pg_proc procedure
      where procedure.oid=
        'public.admin_save_content_catalog_record(text,uuid,jsonb)'::regprocedure
        and procedure.prosecdef
        and position(
          'search_path=pg_catalog, public'
          in array_to_string(procedure.proconfig, ',')
        )>0
    )
    or has_function_privilege(
      'anon','public.admin_save_content_catalog_record(text,uuid,jsonb)','EXECUTE'
    )
    or has_function_privilege(
      'authenticated','public.admin_save_content_catalog_record(text,uuid,jsonb)','EXECUTE'
    )
    or not has_function_privilege(
      'service_role','public.admin_save_content_catalog_record(text,uuid,jsonb)','EXECUTE'
    )
    or position(
      'insert into public.record_management_events'
      in lower(pg_get_functiondef(
        'public.admin_save_content_catalog_record(text,uuid,jsonb)'::regprocedure
      ))
    )=0
  then
    raise exception 'Atomic content catalog save function or grants are unsafe';
  end if;

  if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='support_tickets'
        and column_name='assigned_to' and data_type='uuid'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='support_tickets'
        and column_name='assigned_at' and data_type='timestamp with time zone'
    )
    or to_regclass('public.support_tickets_assignment_queue_idx') is null
  then
    raise exception 'Support assignment ownership columns or queue index are incomplete';
  end if;

  if to_regprocedure('public.admin_assign_support_ticket(uuid,uuid,uuid,text)') is null
    or not exists (
      select 1 from pg_proc procedure
      where procedure.oid=
        'public.admin_assign_support_ticket(uuid,uuid,uuid,text)'::regprocedure
        and procedure.prosecdef
        and position(
          'search_path=pg_catalog, public'
          in array_to_string(procedure.proconfig, ',')
        )>0
    )
    or has_function_privilege(
      'anon',
      'public.admin_assign_support_ticket(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.admin_assign_support_ticket(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.admin_assign_support_ticket(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    or position(
      'insert into public.record_management_events'
      in lower(pg_get_functiondef(
        'public.admin_assign_support_ticket(uuid,uuid,uuid,text)'::regprocedure
      ))
    )=0
    or position(
      'when v_assignee_user_id is null then null'
      in lower(pg_get_functiondef(
        'public.admin_assign_support_ticket(uuid,uuid,uuid,text)'::regprocedure
      ))
    )=0
  then
    raise exception 'Atomic support assignment function or grants are unsafe';
  end if;

  if to_regclass('public.support_response_email_outbox') is null
    or to_regclass('public.support_response_email_outbox_delivery_idx') is null
    or not exists (
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='public'
        and relation.relname='support_response_email_outbox'
        and relation.relrowsecurity
    )
    or has_table_privilege('anon','public.support_response_email_outbox','SELECT')
    or has_table_privilege('authenticated','public.support_response_email_outbox','SELECT')
    or has_table_privilege('authenticated','public.support_response_email_outbox','INSERT')
    or has_table_privilege('authenticated','public.support_response_email_outbox','UPDATE')
    or not has_table_privilege('service_role','public.support_response_email_outbox','SELECT')
    or not has_table_privilege('service_role','public.support_response_email_outbox','INSERT')
    or not has_table_privilege('service_role','public.support_response_email_outbox','UPDATE')
    or to_regprocedure(
      'public.admin_respond_support_ticket(uuid,uuid,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.admin_claim_support_response_email(uuid,uuid)'
    ) is null
    or to_regprocedure(
      'public.admin_complete_support_response_email(uuid,uuid,text,text,text)'
    ) is null
    or has_function_privilege(
      'anon','public.admin_respond_support_ticket(uuid,uuid,text,text,text)','EXECUTE'
    )
    or has_function_privilege(
      'authenticated','public.admin_respond_support_ticket(uuid,uuid,text,text,text)','EXECUTE'
    )
    or not has_function_privilege(
      'service_role','public.admin_respond_support_ticket(uuid,uuid,text,text,text)','EXECUTE'
    )
    or has_function_privilege(
      'anon','public.admin_claim_support_response_email(uuid,uuid)','EXECUTE'
    )
    or has_function_privilege(
      'authenticated','public.admin_claim_support_response_email(uuid,uuid)','EXECUTE'
    )
    or not has_function_privilege(
      'service_role','public.admin_claim_support_response_email(uuid,uuid)','EXECUTE'
    )
    or has_function_privilege(
      'anon','public.admin_complete_support_response_email(uuid,uuid,text,text,text)','EXECUTE'
    )
    or has_function_privilege(
      'authenticated','public.admin_complete_support_response_email(uuid,uuid,text,text,text)','EXECUTE'
    )
    or not has_function_privilege(
      'service_role','public.admin_complete_support_response_email(uuid,uuid,text,text,text)','EXECUTE'
    )
    or not exists (
      select 1 from pg_proc procedure
      where procedure.oid=
        'public.admin_respond_support_ticket(uuid,uuid,text,text,text)'::regprocedure
        and procedure.prosecdef
        and position(
          'search_path=pg_catalog, public'
          in array_to_string(procedure.proconfig, ',')
        )>0
    )
    or position(
      'update public.complaints_log'
      in lower(pg_get_functiondef(
        'public.admin_respond_support_ticket(uuid,uuid,text,text,text)'::regprocedure
      ))
    )=0
    or position(
      'insert into public.support_response_email_outbox'
      in lower(pg_get_functiondef(
        'public.admin_respond_support_ticket(uuid,uuid,text,text,text)'::regprocedure
      ))
    )=0
  then
    raise exception 'Atomic support response or durable email outbox is unsafe';
  end if;

  if to_regprocedure('public.platform_admin_overview_metrics()') is null
    or not exists (
      select 1
      from pg_proc procedure
      where procedure.oid =
        'public.platform_admin_overview_metrics()'::regprocedure
        and procedure.prosecdef
        and procedure.provolatile = 's'
        and position(
          'search_path=pg_catalog, public'
          in array_to_string(procedure.proconfig, ',')
        ) > 0
    )
    or has_function_privilege(
      'anon',
      'public.platform_admin_overview_metrics()',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.platform_admin_overview_metrics()',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.platform_admin_overview_metrics()',
      'EXECUTE'
    )
  then
    raise exception 'Platform Admin Overview metrics function grants are unsafe';
  end if;

  select *
  into overview_metrics
  from public.platform_admin_overview_metrics();

  if overview_metrics.total_salons is distinct from (
      select count(*) from public.salons where deleted_at is null
    )
    or overview_metrics.active_salons is distinct from (
      select count(*) from public.salons
      where deleted_at is null and status='Active'
    )
    or overview_metrics.pending_submissions is distinct from (
      select count(*) from public.salon_applications
      where status='Pending' and archived_at is null
    )
    or overview_metrics.total_customers is distinct from (
      select count(*) from public.customers
    )
    or overview_metrics.total_bookings is distinct from (
      select count(*) from public.bookings
    )
    or overview_metrics.completed_booking_value is distinct from (
      select coalesce(sum(estimated_total),0)::numeric
      from public.bookings
      where lower(coalesce(status,''))='completed'
    )
    or overview_metrics.deposits_collected is distinct from (
      select coalesce(sum(deposit_amount),0)::numeric
      from public.bookings
      where lower(coalesce(deposit_status,''))
        in ('paid','succeeded','complete','completed')
        and payment_verified_at is not null
    )
  then
    raise exception 'Platform Admin Overview metrics do not match authoritative records';
  end if;
end
$$;

-- Exercise support assignment as a real transaction, including the failure
-- path that originally left the ticket changed after its audit write failed.
do $$
declare
  actor_id constant uuid := '10000000-0000-4000-8000-000000000091';
  ticket_id constant uuid := '10000000-0000-4000-8000-000000000092';
begin
  insert into auth.users(id,email,raw_user_meta_data)
  values (
    actor_id,
    'clean-support-assignment@example.test',
    '{"role":"admin"}'::jsonb
  );
  insert into public.admin_users(
    id,user_id,name,email,role,permissions,status,is_super_admin
  ) values (
    actor_id,
    actor_id,
    'Clean database support admin',
    'clean-support-assignment@example.test',
    'Admin',
    '{"support":true,"complaints":true}'::jsonb,
    'Active',
    true
  );

  perform public.admin_save_content_record(
    'page',
    actor_id,
    jsonb_build_object(
      'slug','clean-atomic-content',
      'title','Clean atomic content',
      'sections','[]'::jsonb,
      'status','Draft',
      'publication_state','Hidden',
      'is_enabled',false,
      'page_group','Test'
    ),
    'save_draft',
    null
  );
  if not exists (
    select 1 from public.content_pages
    where slug='clean-atomic-content' and title='Clean atomic content'
  ) or (
    select count(*) from public.record_management_events
    where record_type='content_page' and record_id='clean-atomic-content'
  ) <> 1 then
    raise exception 'Content save did not atomically persist its audit event';
  end if;

  perform public.admin_save_content_catalog_record(
    'service_category',
    actor_id,
    jsonb_build_object(
      'name','Clean Atomic Category',
      'slug','clean-atomic-category',
      'description','Disposable clean-database catalog record.',
      'sort_order',99999,
      'is_active',true
    )
  );
  if not exists (
    select 1 from public.service_categories
    where slug='clean-atomic-category' and name='Clean Atomic Category'
  ) or (
    select count(*) from public.record_management_events event
    join public.service_categories category
      on category.id::text=event.record_id
    where event.record_type='service_category'
      and category.slug='clean-atomic-category'
  ) <> 1 then
    raise exception 'Catalog save did not atomically persist its audit event';
  end if;

  insert into public.support_tickets(
    id,subject,message,status,priority,requester_name,requester_email
  )
  values (
    ticket_id,
    'Clean database atomic assignment',
    'Disposable migration verification ticket.',
    'Open',
    'Normal',
    'Clean Requester',
    'clean-requester@example.test'
  );

  perform public.admin_assign_support_ticket(
    ticket_id,actor_id,actor_id,'High'
  );
  if not exists (
    select 1 from public.support_tickets
    where id=ticket_id
      and assigned_to=actor_id
      and assigned_at is not null
      and priority='High'
  ) or (
    select count(*) from public.record_management_events
    where record_type='support_ticket' and record_id=ticket_id::text
  ) <> 1 then
    raise exception 'Support assignment did not atomically persist its audit event';
  end if;

  perform public.admin_assign_support_ticket(
    ticket_id,actor_id,null,'Normal'
  );
  if not exists (
    select 1 from public.support_tickets
    where id=ticket_id
      and assigned_to is null
      and assigned_at is null
      and priority='Normal'
  ) or (
    select count(*) from public.record_management_events
    where record_type='support_ticket' and record_id=ticket_id::text
  ) <> 2 then
    raise exception 'Support unassignment did not clear ownership or retain its audit event';
  end if;

  perform public.admin_respond_support_ticket(
    ticket_id,actor_id,'Clean response','Resolved','clean-response-request-1'
  );
  if not exists (
    select 1 from public.support_tickets
    where id=ticket_id and status='Resolved'
      and admin_response='Clean response'
  ) or not exists (
    select 1 from public.support_response_email_outbox
    where support_response_email_outbox.ticket_id=ticket_id
      and support_response_email_outbox.idempotency_key='clean-response-request-1'
      and support_response_email_outbox.delivery_status='Pending'
  ) or (
    select count(*) from public.record_management_events
    where record_type='support_ticket' and record_id=ticket_id::text
  ) <> 3 then
    raise exception 'Support response, audit, or email outbox did not commit together';
  end if;

  perform public.admin_respond_support_ticket(
    ticket_id,actor_id,'Clean response','Resolved','clean-response-request-1'
  );
  if (
    select count(*) from public.support_response_email_outbox
    where idempotency_key='clean-response-request-1'
  ) <> 1 or (
    select count(*) from public.record_management_events
    where record_type='support_ticket' and record_id=ticket_id::text
  ) <> 3 then
    raise exception 'Support response idempotency replay duplicated durable records';
  end if;

  perform public.admin_claim_support_response_email(
    (select id from public.support_response_email_outbox
      where idempotency_key='clean-response-request-1'),
    actor_id
  );
  perform public.admin_complete_support_response_email(
    (select id from public.support_response_email_outbox
      where idempotency_key='clean-response-request-1'),
    actor_id,'Failed',null,'TEST_PROVIDER_FAILURE'
  );
  perform public.admin_claim_support_response_email(
    (select id from public.support_response_email_outbox
      where idempotency_key='clean-response-request-1'),
    actor_id
  );
  perform public.admin_complete_support_response_email(
    (select id from public.support_response_email_outbox
      where idempotency_key='clean-response-request-1'),
    actor_id,'Sent','clean-provider-message',null
  );
  if not exists (
    select 1 from public.support_response_email_outbox
    where idempotency_key='clean-response-request-1'
      and delivery_status='Sent'
      and attempt_count=2
      and provider_message_id='clean-provider-message'
  ) then
    raise exception 'Support response email outbox could not be claimed and retried safely';
  end if;
end
$$;

create function public.clean_database_reject_management_audit()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Clean database forced management audit failure';
end
$$;
create trigger clean_database_reject_management_audit
before insert on public.record_management_events
for each row execute function public.clean_database_reject_management_audit();

do $$
declare
  actor_id constant uuid := '10000000-0000-4000-8000-000000000091';
  ticket_id constant uuid := '10000000-0000-4000-8000-000000000092';
  content_save_failed boolean := false;
  catalog_save_failed boolean := false;
  assignment_failed boolean := false;
  response_failed boolean := false;
begin
  begin
    perform public.admin_save_content_record(
      'page',
      actor_id,
      jsonb_build_object(
        'slug','clean-atomic-content',
        'title','This title must roll back'
      ),
      'save_draft',
      (select updated_at from public.content_pages
        where slug='clean-atomic-content')
    );
  exception when others then
    content_save_failed := true;
  end;
  if not content_save_failed then
    raise exception 'Forced content audit failure did not abort the save';
  end if;
  if not exists (
    select 1 from public.content_pages
    where slug='clean-atomic-content' and title='Clean atomic content'
  ) then
    raise exception 'Content mutation survived a failed audit transaction';
  end if;

  begin
    perform public.admin_save_content_catalog_record(
      'service_category',
      actor_id,
      jsonb_build_object(
        'id',(select id from public.service_categories
          where slug='clean-atomic-category'),
        'name','This catalog name must roll back',
        'slug','clean-atomic-category',
        'sort_order',99999,
        'is_active',true
      )
    );
  exception when others then
    catalog_save_failed := true;
  end;
  if not catalog_save_failed then
    raise exception 'Forced catalog audit failure did not abort the save';
  end if;
  if not exists (
    select 1 from public.service_categories
    where slug='clean-atomic-category' and name='Clean Atomic Category'
  ) then
    raise exception 'Catalog mutation survived a failed audit transaction';
  end if;

  begin
    perform public.admin_assign_support_ticket(
      ticket_id,actor_id,actor_id,'Urgent'
    );
  exception when others then
    assignment_failed := true;
  end;
  if not assignment_failed then
    raise exception 'Forced support audit failure did not abort assignment';
  end if;
  if not exists (
    select 1 from public.support_tickets
    where id=ticket_id
      and assigned_to is null
      and assigned_at is null
      and priority='Normal'
  ) then
    raise exception 'Support assignment survived a failed audit transaction';
  end if;

  begin
    perform public.admin_respond_support_ticket(
      ticket_id,actor_id,'This response must roll back','Closed',
      'clean-response-request-2'
    );
  exception when others then
    response_failed := true;
  end;
  if not response_failed then
    raise exception 'Forced support response audit failure did not abort the response';
  end if;
  if not exists (
    select 1 from public.support_tickets
    where id=ticket_id and status='Resolved'
      and admin_response='Clean response'
  ) or exists (
    select 1 from public.support_response_email_outbox
    where idempotency_key='clean-response-request-2'
  ) then
    raise exception 'Support response or email outbox survived a failed audit transaction';
  end if;
end
$$;

drop trigger clean_database_reject_management_audit
  on public.record_management_events;
drop function public.clean_database_reject_management_audit();

delete from public.record_management_events
where (record_type='support_ticket'
    and record_id='10000000-0000-4000-8000-000000000092')
  or (record_type='content_page' and record_id='clean-atomic-content')
  or (record_type='service_category' and record_id=(
    select id::text from public.service_categories
    where slug='clean-atomic-category'
  ));
delete from public.content_pages where slug='clean-atomic-content';
delete from public.service_categories where slug='clean-atomic-category';
delete from public.support_tickets
where id='10000000-0000-4000-8000-000000000092';
delete from public.admin_users
where id='10000000-0000-4000-8000-000000000091';
delete from auth.users
where id='10000000-0000-4000-8000-000000000091';

-- Application-document registry access is service-only, and its definer
-- functions must use a fixed hardened search path.  These checks run against
-- the real post-migration catalog rather than relying on migration text.
do $$
begin
  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname='application_document_uploads'
      and relation.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.application_document_uploads';
  end if;
  if has_table_privilege('anon','public.application_document_uploads','SELECT')
    or has_table_privilege('anon','public.application_document_uploads','INSERT')
    or has_table_privilege('anon','public.application_document_uploads','UPDATE')
    or has_table_privilege('anon','public.application_document_uploads','DELETE')
    or has_table_privilege('authenticated','public.application_document_uploads','SELECT')
    or has_table_privilege('authenticated','public.application_document_uploads','INSERT')
    or has_table_privilege('authenticated','public.application_document_uploads','UPDATE')
    or has_table_privilege('authenticated','public.application_document_uploads','DELETE')
    or not has_table_privilege('service_role','public.application_document_uploads','SELECT')
    or not has_table_privilege('service_role','public.application_document_uploads','INSERT')
    or not has_table_privilege('service_role','public.application_document_uploads','UPDATE')
    or not has_table_privilege('service_role','public.application_document_uploads','DELETE')
  then
    raise exception 'Application-document registry grants are unsafe';
  end if;
  if has_function_privilege('anon','public.prepare_application_document_upload(uuid,uuid,uuid,text,text,text,bigint)','EXECUTE')
    or has_function_privilege('authenticated','public.prepare_application_document_upload(uuid,uuid,uuid,text,text,text,bigint)','EXECUTE')
    or not has_function_privilege('service_role','public.prepare_application_document_upload(uuid,uuid,uuid,text,text,text,bigint)','EXECUTE')
    or has_function_privilege('anon','public.finalize_application_document_upload(uuid,uuid,uuid,text,text,bigint)','EXECUTE')
    or has_function_privilege('authenticated','public.finalize_application_document_upload(uuid,uuid,uuid,text,text,bigint)','EXECUTE')
    or not has_function_privilege('service_role','public.finalize_application_document_upload(uuid,uuid,uuid,text,text,bigint)','EXECUTE')
    or has_function_privilege('anon','public.abandon_application_document_upload(uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.abandon_application_document_upload(uuid,uuid,uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.abandon_application_document_upload(uuid,uuid,uuid)','EXECUTE')
  then
    raise exception 'Application-document function grants are unsafe';
  end if;
  if exists (
    select 1
    from unnest(array[
      'public.prepare_application_document_upload(uuid,uuid,uuid,text,text,text,bigint)'::regprocedure,
      'public.finalize_application_document_upload(uuid,uuid,uuid,text,text,bigint)'::regprocedure,
      'public.abandon_application_document_upload(uuid,uuid,uuid)'::regprocedure
    ]) as function_list(function_oid)
    join pg_proc procedure on procedure.oid=function_list.function_oid
    where not procedure.prosecdef
      or position(
        'search_path=pg_catalog, public'
        in array_to_string(coalesce(procedure.proconfig,array[]::text[]),',')
      )=0
  ) then
    raise exception 'Application-document definer functions are not hardened';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.salon_applications'::regclass
      and tgname='salon_applications_enforce_document_attachments'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid='public.salon_applications'::regclass
      and tgname='salon_applications_abandon_deleted_documents'
      and not tgisinternal
  ) then
    raise exception 'Application-document lifecycle triggers are missing';
  end if;
end
$$;

-- Supporting-document uploads must execute a durable prepare -> finalize ->
-- attach lifecycle.  Filename/prefix checks alone are not authoritative.
do $$
declare
  actor_id constant uuid := '10000000-0000-4000-8000-0000000000a1';
  v_salon_id constant uuid := '10000000-0000-4000-8000-0000000000a2';
  upload_id constant uuid := '10000000-0000-4000-8000-0000000000a3';
  quality_style_id constant uuid := '10000000-0000-4000-8000-0000000000a4';
  quality_booking_id constant uuid := '10000000-0000-4000-8000-0000000000a5';
  quality_recent_complaint_id constant uuid := '10000000-0000-4000-8000-0000000000a6';
  quality_historical_complaint_id constant uuid := '10000000-0000-4000-8000-0000000000a7';
  prepared_path constant text := '10000000-0000-4000-8000-0000000000a1/documents/10000000-0000-4000-8000-0000000000a3-license.pdf';
  rejected_unfinalized boolean := false;
  rejected_quota boolean := false;
  v_application_id uuid;
  ordinal integer;
  pending_id uuid;
  pending_path text;
begin
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)
  values (
    actor_id,'clean-application-docs@example.test','',now(),
    '{"role":"salon_owner"}'::jsonb
  );
  insert into public.salons(id,user_id,name,slug,email,status)
  values (
    v_salon_id,actor_id,'Clean Document Salon','clean-document-salon',
    'clean-application-docs@example.test','Pending'
  );

  if exists (
    select 1
    from public.marketplace_visible_salon_ids(2000) visible
    where visible.salon_id=v_salon_id
  ) then
    raise exception 'Pending salon leaked through the marketplace-visible suggestion boundary';
  end if;

  insert into public.styles(
    id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,
    base_price,price_display_min,price_display_max
  )
  select
    quality_style_id,v_salon_id,service_group.id,'Clean Quality Service',1,1,
    100,100,100
  from public.service_groups service_group
  where service_group.is_active and service_group.archived_at is null
  order by service_group.sort_order,service_group.name
  limit 1;
  if not found then
    raise exception 'No active service group was available for the quality-window verification';
  end if;

  insert into public.bookings(
    id,salon_id,style_id,appointment_datetime,duration_hours,
    estimated_total,deposit_amount,balance_due,deposit_status,status,
    guest_name,guest_email
  ) values (
    quality_booking_id,v_salon_id,quality_style_id,now()-interval '10 days',1,
    100,10,90,'Paid','Completed','Quality Window Customer',
    'quality-window@example.test'
  );

  insert into public.complaints_log(
    id,salon_id,booking_id,type,description,status,booking_verified,
    verification_method,created_at
  ) values
    (
      quality_recent_complaint_id,v_salon_id,quality_booking_id,
      'Quality verification','Recent unresolved verified complaint','Open',true,
      'admin_review',now()-interval '10 days'
    ),
    (
      quality_historical_complaint_id,v_salon_id,quality_booking_id,
      'Quality verification','Historical unresolved verified complaint','Open',true,
      'admin_review',now()-interval '366 days'
    );

  perform public.prepare_application_document_upload(
    upload_id,actor_id,v_salon_id,prepared_path,'license.pdf',
    'application/pdf',512
  );

  begin
    perform public.submit_salon_application_atomic(
      actor_id,
      jsonb_build_object(
        'name','Clean Document Salon','slug','clean-document-salon',
        'owner_name','Clean Owner','email','clean-application-docs@example.test',
        'phone','+12125550100','address_street','1 Clean Way',
        'address_city','Brooklyn','address_state','NY','address_zip','11201',
        'business_type','Braiding Studio','subscription_tier','Growth'
      ),
      jsonb_build_object(
        'business_name','Clean Document Salon','owner_name','Clean Owner',
        'business_email','clean-application-docs@example.test',
        'phone','+12125550100','street_address','1 Clean Way',
        'city','Brooklyn','state','NY','zip_code','11201',
        'business_type','Braiding Studio','selected_plan','Growth',
        'years_in_operation',2,'stylist_count',2,
        'photo_urls',jsonb_build_array(),
        'document_urls',jsonb_build_array(prepared_path)
      )
    );
  exception when sqlstate '22023' then
    rejected_unfinalized := true;
  end;
  if not rejected_unfinalized then
    raise exception 'Application accepted a document that was only prepared';
  end if;

  perform public.finalize_application_document_upload(
    upload_id,actor_id,v_salon_id,prepared_path,'application/pdf',512
  );
  perform public.submit_salon_application_atomic(
    actor_id,
    jsonb_build_object(
      'name','Clean Document Salon','slug','clean-document-salon',
      'owner_name','Clean Owner','email','clean-application-docs@example.test',
      'phone','+12125550100','address_street','1 Clean Way',
      'address_city','Brooklyn','address_state','NY','address_zip','11201',
      'business_type','Braiding Studio','subscription_tier','Growth'
    ),
    jsonb_build_object(
      'business_name','Clean Document Salon','owner_name','Clean Owner',
      'business_email','clean-application-docs@example.test',
      'phone','+12125550100','street_address','1 Clean Way',
      'city','Brooklyn','state','NY','zip_code','11201',
      'business_type','Braiding Studio','selected_plan','Growth',
      'years_in_operation',2,'stylist_count',2,
      'photo_urls',jsonb_build_array(),
      'document_urls',jsonb_build_array(prepared_path)
    )
  );
  select application.id into v_application_id
  from public.salon_applications application
  where application.salon_id=v_salon_id;
  if not exists (
    select 1 from public.application_document_uploads
    where id=upload_id and status='Attached'
      and application_id=v_application_id and expires_at is null
  ) then
    raise exception 'Finalized application document was not atomically attached';
  end if;

  for ordinal in 1..5 loop
    pending_id := ('10000000-0000-4000-8000-' || lpad((200+ordinal)::text,12,'0'))::uuid;
    pending_path := actor_id::text || '/documents/' || pending_id::text || '-pending.pdf';
    perform public.prepare_application_document_upload(
      pending_id,actor_id,v_salon_id,pending_path,'pending.pdf',
      'application/pdf',512
    );
  end loop;

  if to_regclass('public.salon_quality_metrics') is null then
    raise exception 'Exact salon quality metrics view is missing';
  end if;
  if has_table_privilege('anon', 'public.salon_quality_metrics', 'SELECT')
    or has_table_privilege('authenticated', 'public.salon_quality_metrics', 'SELECT')
    or not has_table_privilege('service_role', 'public.salon_quality_metrics', 'SELECT')
  then
    raise exception 'Salon quality metrics view grants are unsafe';
  end if;
  if has_function_privilege('anon', 'public.admin_content_link_targets(text,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.admin_content_link_targets(text,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.admin_content_link_targets(text,integer)', 'EXECUTE')
  then
    raise exception 'Content link target function grants are unsafe';
  end if;
  if jsonb_typeof(public.admin_content_link_targets('', 1)) <> 'array'
    or jsonb_array_length(public.admin_content_link_targets('', 1)) > 1 then
    raise exception 'Content link target function did not return a bounded JSON array';
  end if;
  if not exists (
    select 1
    from public.salon_quality_metrics metric
    where metric.salon_id=v_salon_id
      and metric.measurement_window_end-metric.measurement_window_start=interval '365 days'
  ) then
    raise exception 'Salon quality metrics did not expose the authoritative 365-day window';
  end if;
  if not exists (
    select 1
    from public.salon_quality_metrics metric
    where metric.salon_id=v_salon_id
      and metric.active_complaints=1
  ) then
    raise exception 'Quality metrics did not limit unresolved verified complaints to the 365-day window';
  end if;
  begin
    pending_id := '10000000-0000-4000-8000-000000000299';
    pending_path := actor_id::text || '/documents/' || pending_id::text || '-over-quota.pdf';
    perform public.prepare_application_document_upload(
      pending_id,actor_id,v_salon_id,pending_path,'over-quota.pdf',
      'application/pdf',512
    );
  exception when sqlstate '22023' then
    rejected_quota := true;
  end;
  if not rejected_quota then
    raise exception 'Application-document pending quota was not enforced';
  end if;
  if not public.abandon_application_document_upload(
    '10000000-0000-4000-8000-000000000201',actor_id,v_salon_id
  ) then
    raise exception 'Pending application document could not be abandoned';
  end if;
  pending_id := '10000000-0000-4000-8000-000000000299';
  pending_path := actor_id::text || '/documents/' || pending_id::text || '-after-remove.pdf';
  perform public.prepare_application_document_upload(
    pending_id,actor_id,v_salon_id,pending_path,'after-remove.pdf',
    'application/pdf',512
  );

  delete from public.salon_applications where id=v_application_id;
  if not exists (
    select 1 from public.application_document_uploads
    where id=upload_id and status='Abandoned'
      and application_id is null and expires_at<=now()
  ) then
    raise exception 'Deleted application did not abandon its attached documents';
  end if;

  delete from public.complaints_log
  where id in (quality_recent_complaint_id,quality_historical_complaint_id);
  delete from public.bookings where id=quality_booking_id;
  delete from public.styles where id=quality_style_id;
  delete from public.salons where id=v_salon_id;
  delete from auth.users where id=actor_id;
  if not exists (
    select 1 from public.application_document_uploads
    where id=upload_id and status='Abandoned'
      and application_id is null and user_id is null and salon_id is null
      and storage_path=prepared_path and cleaned_at is null
  ) then
    raise exception 'Identity or salon deletion erased application-document cleanup evidence';
  end if;
end
$$;

select
  'clean database assertions passed' as result,
  count(*) filter (where schemaname = 'public') as public_policy_count
from pg_policies;
