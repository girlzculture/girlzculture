-- Girlz Culture provider-backed preview acceptance data.
--
-- This is deliberately NOT a migration and is never run automatically by
-- Supabase. The execution wrapper opens the transaction and sets LOCAL guard
-- values only after externally validating the project reference and
-- authoritative Supabase branch metadata. The session guards below, the
-- known-production deny-list, and the empty/synthetic-only data check must all
-- pass before any write. The wrapper owns the transaction so the seed and its
-- assertions commit or roll back together.
-- Every identity and record is deterministic so the seed is repeatable.

\set ON_ERROR_STOP on

do $guard$
declare
  seed_authorized text := current_setting('girlzculture.preview_seed_authorized', true);
  seed_enabled text := current_setting('app.preview_seed_enabled', true);
  seed_environment text := current_setting('app.preview_seed_environment', true);
  seed_project_ref text := current_setting('app.preview_seed_project_ref', true);
  seed_confirmation text := current_setting('app.preview_seed_confirmation', true);
  seed_branch_attested text := current_setting('app.preview_seed_branch_attested', true);
  seed_attestation_source text := current_setting('app.preview_seed_attestation_source', true);
  seed_parent_project_ref text := current_setting('app.preview_seed_parent_project_ref', true);
  seed_branch_is_default text := current_setting('app.preview_seed_branch_is_default', true);
  seed_branch_persistent text := current_setting('app.preview_seed_branch_persistent', true);
  seed_branch_with_data text := current_setting('app.preview_seed_branch_with_data', true);
  -- Every public table is deliberately classified. Reference tables may hold
  -- migration-installed public/configuration rows. Seed-owned and side-effect
  -- tables are constrained below to exact synthetic relationships. Every
  -- remaining runtime/private table must be empty before any fixture write.
  preview_reference_tables constant text[] := array[
    'admin_settings',
    'ai_automation_features',
    'ai_prompt_versions',
    'blog_posts',
    'content_pages',
    'engine_publication_state',
    'engine_setting_versions',
    'engine_settings',
    'engine_system_components',
    'homepage_sections',
    'location_markets',
    'master_styles',
    'media_upload_profiles',
    'media_video_profiles',
    'navigation_items',
    'notification_templates',
    'platform_brand_assets',
    'platform_error_alert_rules',
    'salon_slug_reserved_words',
    'search_engine_settings',
    'search_language_rules',
    'service_addons',
    'service_categories',
    'service_groups',
    'supported_locales',
    'translation_entries'
  ];
  preview_seed_owned_tables constant text[] := array[
    'admin_users',
    'availability',
    'featured_salon_campaigns',
    'platform_identities',
    'salon_applications',
    'salons',
    'subscriptions',
    'styles',
    'stylists'
  ];
  preview_seed_side_effect_tables constant text[] := array[
    'notifications',
    'public_change_events',
    'salon_application_revisions',
    'salon_status_audit'
  ];
  preview_prohibited_private_tables constant text[] := array[
    'account_security_settings',
    'admin_security_events',
    'ai_generation_drafts',
    'ai_usage_events',
    'application_document_uploads',
    'auth_login_attempts',
    'auth_mfa_challenges',
    'billing_events',
    'booking_audit_log',
    'booking_checkout_intents',
    'booking_financial_events',
    'booking_guest_access_audit',
    'booking_guest_access_tokens',
    'booking_guest_recovery_challenges',
    'booking_integrity_conflicts',
    'booking_messages',
    'booking_refund_operations',
    'booking_reminder_claims',
    'booking_reschedule_options',
    'booking_reschedule_proposals',
    'booking_review_links',
    'bookings',
    'commerce_checkout_intents',
    'complaints_log',
    'customer_favorites',
    'customers',
    'featured_campaign_audit',
    'homepage_product_placement_audit',
    'homepage_product_placements',
    'identity_conflict_resolutions',
    'identity_deletion_jobs',
    'identity_security_events',
    'integration_health_checks',
    'localized_content',
    'marketing_entitlements',
    'media_assets',
    'media_upload_sessions',
    'newsletter_subscribers',
    'notification_delivery_log',
    'notification_template_versions',
    'password_reset_codes',
    'platform_brand_asset_versions',
    'platform_content',
    'platform_error_affected_businesses',
    'platform_error_events',
    'platform_error_occurrences',
    'platform_promotions',
    'product_inventory_reservations',
    'product_order_events',
    'product_order_items',
    'product_order_refunds',
    'product_orders',
    'product_promotion_redemptions',
    'promo_code_redemptions',
    'promo_codes',
    'push_subscriptions',
    'record_management_events',
    'review_content_moderation_queue',
    'review_dispute_events',
    'review_moderation_events',
    'review_reply_moderation_queue',
    'reviews',
    'salon_availability_override_audit',
    'salon_blockouts',
    'salon_booking_cancellations',
    'salon_closure_requests',
    'salon_payout_attempts',
    'salon_products',
    'salon_promotion_audit',
    'salon_promotion_redemptions',
    'salon_promotions',
    'salon_publication_override_audit',
    'salon_publication_overrides',
    'salon_reconciliation_items',
    'salon_reconciliation_runs',
    'salon_recovery_balances',
    'salon_slug_redirects',
    'salon_spreadsheet_imports',
    'salon_team_members',
    'salon_test_deletion_audit',
    'salon_vanity_audit',
    'salon_vanity_requests',
    'search_zero_result_aggregates',
    'stripe_webhook_events',
    'style_materials',
    'subscription_change_requests',
    'support_response_email_outbox',
    'support_tickets',
    'test_data_batches',
    'test_data_cleanup_runs',
    'test_data_registry',
    'translation_entry_versions',
    'trending_campaign_audit',
    'trending_video_campaigns',
    'trending_videos',
    'video_processing_jobs'
  ];
  prohibited_table_name text;
  prohibited_table_has_rows boolean;
  classified_table_names text[];
  preview_salon_ids uuid[] := array[
    '52000000-0000-4000-8000-000000000101'::uuid,
    '52000000-0000-4000-8000-000000000102'::uuid,
    '52000000-0000-4000-8000-000000000103'::uuid,
    '52000000-0000-4000-8000-000000000104'::uuid,
    '52000000-0000-4000-8000-000000000105'::uuid,
    '52000000-0000-4000-8000-000000000106'::uuid
  ];
  preview_user_ids uuid[] := array[
    '51000000-0000-4000-8000-000000000001'::uuid,
    '51000000-0000-4000-8000-000000000101'::uuid,
    '51000000-0000-4000-8000-000000000102'::uuid,
    '51000000-0000-4000-8000-000000000103'::uuid,
    '51000000-0000-4000-8000-000000000104'::uuid,
    '51000000-0000-4000-8000-000000000105'::uuid,
    '51000000-0000-4000-8000-000000000106'::uuid
  ];
begin
  classified_table_names := preview_reference_tables
    || preview_seed_owned_tables
    || preview_seed_side_effect_tables
    || preview_prohibited_private_tables;

  if cardinality(classified_table_names) <> (
    select count(distinct classified.table_name)
    from unnest(classified_table_names) classified(table_name)
  ) then
    raise exception 'Preview seed refused: the public-table safety inventory contains duplicate classifications.';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_tables table_record
    where table_record.schemaname='public'
      and not (table_record.tablename=any(classified_table_names))
  ) or exists (
    select 1
    from unnest(classified_table_names) classified(table_name)
    where not exists (
      select 1
      from pg_catalog.pg_tables table_record
      where table_record.schemaname='public'
        and table_record.tablename=classified.table_name
    )
  ) then
    raise exception 'Preview seed refused: the public-table safety inventory does not exactly match the database schema.';
  end if;

  if seed_authorized is distinct from 'true' then
    raise exception 'Preview seed refused: transaction-local authorization is missing.';
  end if;
  if seed_enabled is distinct from 'true' then
    raise exception 'Preview seed refused: app.preview_seed_enabled must be true.';
  end if;
  if seed_environment not in ('preview', 'clean-test') then
    raise exception 'Preview seed refused: environment must be preview or clean-test.';
  end if;
  if seed_confirmation is distinct from 'girlz-culture-pr-preview-only' then
    raise exception 'Preview seed refused: explicit preview confirmation is missing.';
  end if;
  if seed_project_ref is null
     or seed_project_ref = 'cuzfockthsqwubupskui'
     or (
       seed_environment = 'clean-test'
       and seed_project_ref <> 'local-clean-database'
     )
     or (
       seed_environment = 'preview'
       and seed_project_ref !~ '^[a-z0-9]{20}$'
     ) then
    raise exception 'Preview seed refused: project reference is absent, production, or mismatched.';
  end if;
  if seed_environment = 'preview' and (
       seed_branch_attested is distinct from 'true'
       or seed_attestation_source not in (
         'supabase-management-api',
         'signed-management-attestation'
       )
       or seed_parent_project_ref is distinct from 'cuzfockthsqwubupskui'
       or seed_branch_is_default is distinct from 'false'
       or seed_branch_persistent is distinct from 'false'
       or seed_branch_with_data is distinct from 'false'
     ) then
    raise exception 'Preview seed refused: authoritative disposable-branch attestation is missing or unsafe.';
  end if;
  if seed_environment = 'clean-test' and (
       seed_branch_attested is distinct from 'true'
       or seed_attestation_source is distinct from 'clean-database-verification'
       or seed_parent_project_ref is distinct from 'cuzfockthsqwubupskui'
       or seed_branch_is_default is distinct from 'false'
       or seed_branch_persistent is distinct from 'false'
       or seed_branch_with_data is distinct from 'false'
     ) then
    raise exception 'Preview seed refused: clean-database attestation is missing.';
  end if;

  if exists (
    select 1
    from public.salons salon
    where not (salon.id=any(preview_salon_ids))
       or salon.slug is null
       or salon.slug not like 'preview-%'
  ) then
    raise exception 'Preview seed refused: the target contains a non-preview salon.';
  end if;
  if exists (
    select 1
    from auth.users auth_user
    where not (auth_user.id=any(preview_user_ids))
       or auth_user.email is null
       or auth_user.email not like '%@preview.girlzculture.invalid'
       or coalesce(auth_user.encrypted_password,'') <> ''
  ) then
    raise exception 'Preview seed refused: the target contains a non-preview authenticated identity.';
  end if;
  if (select count(*) from auth.users) not in (0,7) then
    raise exception 'Preview seed refused: the synthetic identity set is partial or has an unexpected cardinality.';
  end if;
  if exists (
    select 1
    from public.admin_users admin_user
    where admin_user.id is distinct from '51000000-0000-4000-8000-000000000001'
       or admin_user.user_id is distinct from '51000000-0000-4000-8000-000000000001'
       or admin_user.email is null
       or admin_user.email not like '%@preview.girlzculture.invalid'
  )
     or exists (
       select 1
       from public.platform_identities identity_record
       where identity_record.user_id is null
          or not (identity_record.user_id=any(preview_user_ids))
          or identity_record.email_normalized is null
          or identity_record.email_normalized not like '%@preview.girlzculture.invalid'
     )
     or exists (
       select 1
       from public.salon_applications application
       where application.salon_id is null
          or not (application.salon_id=any(preview_salon_ids))
          or application.business_email is null
          or application.business_email not like '%@preview.girlzculture.invalid'
     )
     or exists (
       select 1
       from public.subscriptions subscription
       where subscription.salon_id is null
          or not (subscription.salon_id=any(preview_salon_ids))
          or subscription.stripe_subscription_id is not null
          or subscription.stripe_customer_id is not null
          or subscription.price_id is not null
     )
     or exists (
       select 1
       from public.stylists stylist
       where stylist.salon_id is null
          or not (stylist.salon_id=any(preview_salon_ids))
     )
     or exists (
       select 1
       from public.styles style
       where style.salon_id is null
          or not (style.salon_id=any(preview_salon_ids))
     )
     or exists (
       select 1
       from public.availability availability_row
       where availability_row.salon_id is null
          or not (availability_row.salon_id=any(preview_salon_ids))
     )
     or exists (
       select 1
       from public.featured_salon_campaigns campaign
       where campaign.id is distinct from '57000000-0000-4000-8000-000000000101'
          or campaign.salon_id is distinct from '52000000-0000-4000-8000-000000000101'
     ) then
    raise exception 'Preview seed refused: the target contains non-preview platform, salon, team, service, availability, or campaign records.';
  end if;

  if (select count(*) from public.admin_users) not in (0,1)
     or (select count(*) from public.platform_identities) not in (0,7)
     or (select count(*) from public.salons) not in (0,6)
     or (select count(*) from public.salon_applications) not in (0,6)
     or (select count(*) from public.subscriptions) not in (0,6)
     or (select count(*) from public.stylists) not in (0,6)
     or (select count(*) from public.styles) not in (0,12)
     or (select count(*) from public.availability) not in (0,36)
     or (select count(*) from public.featured_salon_campaigns) not in (0,1) then
    raise exception 'Preview seed refused: a deterministic fixture table is partial or has an unexpected cardinality.';
  end if;

  if (select count(*) from public.salon_application_revisions) not in (0,6)
     or exists (
       select 1
       from public.salon_application_revisions revision
       where revision.revision_number<>1
          or revision.changed_by is not null
          or revision.change_source<>'service'
          or revision.reason is not null
          or not exists (
            select 1
            from public.salon_applications application
            where application.id=revision.application_id
              and application.salon_id=revision.salon_id
              and application.id::text=revision.snapshot->>'id'
              and application.salon_id::text=revision.snapshot->>'salon_id'
              and application.user_id::text=revision.snapshot->>'user_id'
              and application.business_email=revision.snapshot->>'business_email'
              and application.business_email like '%@preview.girlzculture.invalid'
          )
     ) then
    raise exception 'Preview seed refused: retained application revisions are not the exact synthetic trigger output.';
  end if;

  if (select count(*) from public.notifications) not in (0,12)
     or exists (
       select 1
       from public.notifications notification
       where notification.booking_id is not null
          or notification.category<>'lifecycle'
          or notification.channel<>'in_app'
          or notification.delivery_status<>'delivered'
          or notification.occurrence_count<>1
          or not (
            exists (
              select 1
              from public.salon_applications application
              where notification.user_id='51000000-0000-4000-8000-000000000001'
                and notification.salon_id is null
                and notification.recipient_role='admin'
                and notification.severity='info'
                and notification.dedupe_key='application:new:'||application.id::text
                and notification.action_url='/admin/submissions/'||application.id::text
                and notification.metadata->>'application_id'=application.id::text
                and notification.metadata->>'salon_id'=application.salon_id::text
                and notification.metadata->>'state'=application.state
            )
            or exists (
              select 1
              from public.salon_applications application
              where notification.user_id=application.user_id
                and notification.salon_id=application.salon_id
                and notification.recipient_role='salon'
                and notification.severity='success'
                and notification.dedupe_key='application:submitted:'||application.id::text
                and notification.action_url='/salon/application-submitted'
                and notification.metadata->>'application_id'=application.id::text
            )
          )
     ) then
    raise exception 'Preview seed refused: dashboard notifications are not the exact synthetic application output.';
  end if;

  if (select count(*) from public.salon_status_audit) not in (0,6)
     or exists (
       select 1
       from public.salon_status_audit status_audit
       where not (status_audit.salon_id=any(preview_salon_ids))
          or status_audit.previous_status<>'Approved'
          or status_audit.new_status<>'Active'
          or status_audit.acting_admin_id is not null
          or status_audit.future_booking_count<>0
          or status_audit.actor_type<>'engine'
          or status_audit.source<>'lifecycle_engine'
     ) then
    raise exception 'Preview seed refused: salon lifecycle audits are not the exact synthetic activation output.';
  end if;

  if (select count(*) from public.public_change_events) not in (1,4)
     or exists (
       select 1
       from public.public_change_events change_event
       where not coalesce(
         (change_event.scope,change_event.record_id,change_event.action,change_event.version)
           in (
             ('content:about-additional-content','about-additional-content','insert',1::bigint),
             ('content:home','home','update',1::bigint),
             ('featured-salons','57000000-0000-4000-8000-000000000101','insert',1::bigint),
             ('salons','preview-frederick-douglass-braids','update',96::bigint)
           ),
         false
       )
     )
     or not exists (
       select 1
       from public.public_change_events change_event
       where change_event.scope='content:about-additional-content'
         and change_event.record_id='about-additional-content'
         and change_event.action='insert'
         and change_event.version=1
     ) then
    raise exception 'Preview seed refused: public change events are not the exact migration and synthetic seed output.';
  end if;

  foreach prohibited_table_name in array preview_prohibited_private_tables loop
    execute format(
      'select exists(select 1 from public.%I)',
      prohibited_table_name
    ) into prohibited_table_has_rows;
    if prohibited_table_has_rows then
      raise exception 'Preview seed refused: prohibited private/runtime table % is not empty.',
        prohibited_table_name;
    end if;
  end loop;
end
$guard$;

-- Non-login, synthetic identities.  The reserved .invalid domain cannot
-- receive mail and no password, token, private customer, or payment data is
-- created.
insert into auth.users(
  id,email,encrypted_password,email_confirmed_at,
  raw_user_meta_data,raw_app_meta_data,created_at,updated_at
)
values
  ('51000000-0000-4000-8000-000000000001','admin@preview.girlzculture.invalid','',timestamptz '2026-01-01 12:00:00+00','{"role":"admin","name":"Preview Admin"}'::jsonb,'{}'::jsonb,timestamptz '2026-01-01 12:00:00+00',timestamptz '2026-01-01 12:00:00+00'),
  ('51000000-0000-4000-8000-000000000101','owner+lenox@preview.girlzculture.invalid','',timestamptz '2026-01-01 12:00:00+00','{"role":"salon_owner","name":"Preview Owner 1"}'::jsonb,'{}'::jsonb,timestamptz '2026-01-01 12:00:00+00',timestamptz '2026-01-01 12:00:00+00'),
  ('51000000-0000-4000-8000-000000000102','owner+strivers@preview.girlzculture.invalid','',timestamptz '2026-01-01 12:00:00+00','{"role":"salon_owner","name":"Preview Owner 2"}'::jsonb,'{}'::jsonb,timestamptz '2026-01-01 12:00:00+00',timestamptz '2026-01-01 12:00:00+00'),
  ('51000000-0000-4000-8000-000000000103','owner+sugarhill@preview.girlzculture.invalid','',timestamptz '2026-01-01 12:00:00+00','{"role":"salon_owner","name":"Preview Owner 3"}'::jsonb,'{}'::jsonb,timestamptz '2026-01-01 12:00:00+00',timestamptz '2026-01-01 12:00:00+00'),
  ('51000000-0000-4000-8000-000000000104','owner+crown@preview.girlzculture.invalid','',timestamptz '2026-01-01 12:00:00+00','{"role":"salon_owner","name":"Preview Owner 4"}'::jsonb,'{}'::jsonb,timestamptz '2026-01-01 12:00:00+00',timestamptz '2026-01-01 12:00:00+00'),
  ('51000000-0000-4000-8000-000000000105','owner+morningside@preview.girlzculture.invalid','',timestamptz '2026-01-01 12:00:00+00','{"role":"salon_owner","name":"Preview Owner 5"}'::jsonb,'{}'::jsonb,timestamptz '2026-01-01 12:00:00+00',timestamptz '2026-01-01 12:00:00+00'),
  ('51000000-0000-4000-8000-000000000106','owner+douglass@preview.girlzculture.invalid','',timestamptz '2026-01-01 12:00:00+00','{"role":"salon_owner","name":"Preview Owner 6"}'::jsonb,'{}'::jsonb,timestamptz '2026-01-01 12:00:00+00',timestamptz '2026-01-01 12:00:00+00')
on conflict (id) do nothing;

insert into public.admin_users(
  id,user_id,name,email,role,permissions,status,is_super_admin,
  activated_at,created_at
)
values (
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'Preview Admin',
  'admin@preview.girlzculture.invalid',
  'Super Admin',
  '{"marketing":true,"content":true,"salons":true,"submissions":true}'::jsonb,
  'Active',true,timestamptz '2026-01-01 12:00:00+00',timestamptz '2026-01-01 12:00:00+00'
)
on conflict (id) do nothing;

insert into public.salons(
  id,user_id,name,slug,owner_name,business_type,description,phone,email,
  address_street,address_city,address_state,address_zip,address_country,
  neighborhood,hours,cover_photo_url,gallery_photos,logo_url,status,
  verification_status,subscription_tier,subscription_status,featured_weight,
  badges,rating_overall,review_count,capacity,languages,trust_info,
  media_consent,owner_is_sole_stylist,is_discoverable,accepting_bookings,
  approved_at,time_zone
)
select
  fixture.salon_id,fixture.owner_id,fixture.name,fixture.slug,
  fixture.owner_name,'Braiding salon',fixture.description,fixture.phone,
  fixture.email,fixture.street,'New York','NY',fixture.zip,'US','Harlem',
  '{"Mon":{"open":"09:00","close":"18:00","closed":false},"Tue":{"open":"09:00","close":"18:00","closed":false},"Wed":{"open":"09:00","close":"18:00","closed":false},"Thu":{"open":"09:00","close":"18:00","closed":false},"Fri":{"open":"09:00","close":"19:00","closed":false},"Sat":{"open":"09:00","close":"17:00","closed":false},"Sun":{"closed":true}}'::jsonb,
  fixture.cover,
  jsonb_build_array(fixture.cover,'/images/braids-knotless.jpg','/images/braids-box.jpg','/images/braids-cornrows.jpg'),
  '/pwa-icon-512.png','Approved','Verified',fixture.tier,'active',fixture.weight,
  case when fixture.tier='Premium' then '["Verified","Premium"]'::jsonb else '["Verified"]'::jsonb end,
  fixture.rating,fixture.reviews,4,array['English'],
  '{"licensed_professionals":true,"clean_safe_studio":true,"by_appointment_only":true}'::jsonb,
  true,false,false,true,timestamptz '2026-01-01 12:00:00+00','America/New_York'
from (values
  ('52000000-0000-4000-8000-000000000101'::uuid,'51000000-0000-4000-8000-000000000101'::uuid,'Preview Lenox Braid Studio','preview-lenox-braid-studio','Preview Owner 1','A synthetic preview salon offering protective styles with clear prices and carefully scheduled appointments.','+12125550101','owner+lenox@preview.girlzculture.invalid','101 Preview Avenue','10027','Premium',30,4.9::numeric,128,'/images/salon-warm.jpg'),
  ('52000000-0000-4000-8000-000000000102'::uuid,'51000000-0000-4000-8000-000000000102'::uuid,'Preview Strivers Row Braids','preview-strivers-row-braids','Preview Owner 2','A synthetic preview salon specializing in polished braids, comfortable service, and transparent booking details.','+12125550102','owner+strivers@preview.girlzculture.invalid','102 Preview Avenue','10030','Growth',20,4.8::numeric,94,'/images/salon-modern.jpg'),
  ('52000000-0000-4000-8000-000000000103'::uuid,'51000000-0000-4000-8000-000000000103'::uuid,'Preview Sugar Hill Styles','preview-sugar-hill-styles','Preview Owner 3','A synthetic preview salon with modern protective styling, reliable appointment times, and upfront service choices.','+12125550103','owner+sugarhill@preview.girlzculture.invalid','103 Preview Avenue','10031','Premium',30,4.9::numeric,116,'/images/salon-blush.jpg'),
  ('52000000-0000-4000-8000-000000000104'::uuid,'51000000-0000-4000-8000-000000000104'::uuid,'Preview Harlem Crown Studio','preview-harlem-crown-studio','Preview Owner 4','A synthetic preview salon focused on healthy-hair braiding, detailed consultations, and predictable pricing.','+12125550104','owner+crown@preview.girlzculture.invalid','104 Preview Avenue','10026','Growth',20,4.7::numeric,83,'/images/salon-dark.jpg'),
  ('52000000-0000-4000-8000-000000000105'::uuid,'51000000-0000-4000-8000-000000000105'::uuid,'Preview Morningside Braid Room','preview-morningside-braid-room','Preview Owner 5','A synthetic preview salon providing tidy protective styles, welcoming care, and clearly described booking options.','+12125550105','owner+morningside@preview.girlzculture.invalid','105 Preview Avenue','10025','Basic',10,4.8::numeric,72,'/images/salon-modern.jpg'),
  ('52000000-0000-4000-8000-000000000106'::uuid,'51000000-0000-4000-8000-000000000106'::uuid,'Preview Frederick Douglass Braids','preview-frederick-douglass-braids','Preview Owner 6','A synthetic preview salon for classic and contemporary braids with honest timing and complete price information.','+12125550106','owner+douglass@preview.girlzculture.invalid','106 Preview Avenue','10039','Basic',10,4.7::numeric,61,'/images/salon-warm.jpg')
) as fixture(salon_id,owner_id,name,slug,owner_name,description,phone,email,street,zip,tier,weight,rating,reviews,cover)
on conflict (id) do nothing;

insert into public.salon_applications(
  id,salon_id,user_id,business_name,owner_name,business_email,phone,
  street_address,city,state,zip_code,neighborhood,business_type,
  consent_authorized,consent_terms,consent_photos,status,reviewed_by,
  reviewed_at,selected_plan,logo_url,photo_urls,document_urls,submitted_at
)
select
  fixture.application_id,fixture.salon_id,fixture.owner_id,fixture.business_name,
  fixture.owner_name,fixture.email,fixture.phone,fixture.street,'New York','NY',
  fixture.zip,'Harlem','Braiding salon',true,true,true,'Active',
  '51000000-0000-4000-8000-000000000001',timestamptz '2026-01-01 12:00:00+00',fixture.tier,
  '/pwa-icon-512.png',array['/images/braids-knotless.jpg','/images/braids-box.jpg'],
  '{}'::text[],timestamptz '2026-01-01 12:00:00+00'
from (values
  ('53000000-0000-4000-8000-000000000101'::uuid,'52000000-0000-4000-8000-000000000101'::uuid,'51000000-0000-4000-8000-000000000101'::uuid,'Preview Lenox Braid Studio','Preview Owner 1','owner+lenox@preview.girlzculture.invalid','+12125550101','101 Preview Avenue','10027','Premium'),
  ('53000000-0000-4000-8000-000000000102'::uuid,'52000000-0000-4000-8000-000000000102'::uuid,'51000000-0000-4000-8000-000000000102'::uuid,'Preview Strivers Row Braids','Preview Owner 2','owner+strivers@preview.girlzculture.invalid','+12125550102','102 Preview Avenue','10030','Growth'),
  ('53000000-0000-4000-8000-000000000103'::uuid,'52000000-0000-4000-8000-000000000103'::uuid,'51000000-0000-4000-8000-000000000103'::uuid,'Preview Sugar Hill Styles','Preview Owner 3','owner+sugarhill@preview.girlzculture.invalid','+12125550103','103 Preview Avenue','10031','Premium'),
  ('53000000-0000-4000-8000-000000000104'::uuid,'52000000-0000-4000-8000-000000000104'::uuid,'51000000-0000-4000-8000-000000000104'::uuid,'Preview Harlem Crown Studio','Preview Owner 4','owner+crown@preview.girlzculture.invalid','+12125550104','104 Preview Avenue','10026','Growth'),
  ('53000000-0000-4000-8000-000000000105'::uuid,'52000000-0000-4000-8000-000000000105'::uuid,'51000000-0000-4000-8000-000000000105'::uuid,'Preview Morningside Braid Room','Preview Owner 5','owner+morningside@preview.girlzculture.invalid','+12125550105','105 Preview Avenue','10025','Basic'),
  ('53000000-0000-4000-8000-000000000106'::uuid,'52000000-0000-4000-8000-000000000106'::uuid,'51000000-0000-4000-8000-000000000106'::uuid,'Preview Frederick Douglass Braids','Preview Owner 6','owner+douglass@preview.girlzculture.invalid','+12125550106','106 Preview Avenue','10039','Basic')
) as fixture(application_id,salon_id,owner_id,business_name,owner_name,email,phone,street,zip,tier)
on conflict (id) do nothing;

insert into public.subscriptions(
  id,salon_id,tier,status,billing_start,current_period_start,
  current_period_end,cancel_at_period_end,created_at,updated_at
)
select fixture.subscription_id,fixture.salon_id,fixture.tier,'active',
  date '2026-01-01',timestamptz '2026-01-01 00:00:00+00',
  timestamptz '2099-12-31 23:59:59+00',false,timestamptz '2026-01-01 12:00:00+00',timestamptz '2026-01-01 12:00:00+00'
from (values
  ('54000000-0000-4000-8000-000000000101'::uuid,'52000000-0000-4000-8000-000000000101'::uuid,'Premium'),
  ('54000000-0000-4000-8000-000000000102'::uuid,'52000000-0000-4000-8000-000000000102'::uuid,'Growth'),
  ('54000000-0000-4000-8000-000000000103'::uuid,'52000000-0000-4000-8000-000000000103'::uuid,'Premium'),
  ('54000000-0000-4000-8000-000000000104'::uuid,'52000000-0000-4000-8000-000000000104'::uuid,'Growth'),
  ('54000000-0000-4000-8000-000000000105'::uuid,'52000000-0000-4000-8000-000000000105'::uuid,'Basic'),
  ('54000000-0000-4000-8000-000000000106'::uuid,'52000000-0000-4000-8000-000000000106'::uuid,'Basic')
) as fixture(subscription_id,salon_id,tier)
on conflict (salon_id) do nothing;

insert into public.stylists(
  id,salon_id,name,specialties,bio,photos,avatar_url,years_experience,
  availability,is_active,is_draft,archived_at,created_at
)
select
  fixture.stylist_id,fixture.salon_id,fixture.name,
  '["Knotless Braids","Box Braids"]'::jsonb,
  'Synthetic preview stylist specializing in comfortable protective styles and consistent appointment care.',
  '["/images/braids-knotless.jpg","/images/braids-box.jpg","/images/braids-cornrows.jpg"]'::jsonb,
  '/images/hero-braids.jpg',fixture.experience,
  '{"Mon":{"start":"09:00","end":"18:00"},"Tue":{"start":"09:00","end":"18:00"},"Wed":{"start":"09:00","end":"18:00"},"Thu":{"start":"09:00","end":"18:00"},"Fri":{"start":"09:00","end":"18:00"},"Sat":{"start":"09:00","end":"17:00"}}'::jsonb,
  true,false,null,timestamptz '2026-01-01 12:00:00+00'
from (values
  ('55000000-0000-4000-8000-000000000101'::uuid,'52000000-0000-4000-8000-000000000101'::uuid,'Ari Preview',8),
  ('55000000-0000-4000-8000-000000000102'::uuid,'52000000-0000-4000-8000-000000000102'::uuid,'Bri Preview',7),
  ('55000000-0000-4000-8000-000000000103'::uuid,'52000000-0000-4000-8000-000000000103'::uuid,'Cia Preview',9),
  ('55000000-0000-4000-8000-000000000104'::uuid,'52000000-0000-4000-8000-000000000104'::uuid,'Dee Preview',6),
  ('55000000-0000-4000-8000-000000000105'::uuid,'52000000-0000-4000-8000-000000000105'::uuid,'Eva Preview',5),
  ('55000000-0000-4000-8000-000000000106'::uuid,'52000000-0000-4000-8000-000000000106'::uuid,'Fay Preview',7)
) as fixture(stylist_id,salon_id,name,experience)
on conflict (id) do nothing;

insert into public.styles(
  id,salon_id,master_style_id,service_group_id,category_id,name,category,
  description,duration_min_hours,duration_max_hours,base_price,
  size_options,length_options,addons,option_groups,hair_included,photos,
  included_items,price_display_min,price_display_max,is_draft,archived_at,created_at
)
select
  (
    substr(md5(fixture.salon_id::text || ':' || master.name),1,8) || '-' ||
    substr(md5(fixture.salon_id::text || ':' || master.name),9,4) || '-4' ||
    substr(md5(fixture.salon_id::text || ':' || master.name),14,3) || '-8' ||
    substr(md5(fixture.salon_id::text || ':' || master.name),18,3) || '-' ||
    substr(md5(fixture.salon_id::text || ':' || master.name),21,12)
  )::uuid,
  fixture.salon_id,master.id,master.service_group_id,master.category_id,
  master.name,master.category,
  'Synthetic preview service with transparent starting price, duration, and salon-provided preparation details.',
  case when master.name='Knotless Braids' then 4 else 3 end,
  case when master.name='Knotless Braids' then 6 else 5 end,
  fixture.starting_price,
  '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,false,
  jsonb_build_array(case when master.name='Knotless Braids' then '/images/braids-knotless.jpg' else '/images/braids-box.jpg' end),
  array['Consultation','Style and finish','Aftercare tips'],
  fixture.starting_price,fixture.starting_price + 80,false,null,timestamptz '2026-01-01 12:00:00+00'
from (values
  ('52000000-0000-4000-8000-000000000101'::uuid,180::numeric),
  ('52000000-0000-4000-8000-000000000102'::uuid,165::numeric),
  ('52000000-0000-4000-8000-000000000103'::uuid,190::numeric),
  ('52000000-0000-4000-8000-000000000104'::uuid,155::numeric),
  ('52000000-0000-4000-8000-000000000105'::uuid,145::numeric),
  ('52000000-0000-4000-8000-000000000106'::uuid,150::numeric)
) as fixture(salon_id,starting_price)
cross join lateral (
  select managed.*
  from public.master_styles managed
  where managed.name in ('Knotless Braids','Box Braids')
    and managed.is_active=true
    and managed.archived_at is null
) master
on conflict (id) do nothing;

insert into public.availability(
  id,salon_id,stylist_id,day_of_week,start_time,end_time,is_blocked,created_at
)
select
  md5(fixture.salon_id::text || ':' || day.name)::uuid,
  fixture.salon_id,fixture.stylist_id,day.name,
  time '09:00',case when day.name='Sat' then time '17:00' else time '18:00' end,
  false,timestamptz '2026-01-01 12:00:00+00'
from (values
  ('52000000-0000-4000-8000-000000000101'::uuid,'55000000-0000-4000-8000-000000000101'::uuid),
  ('52000000-0000-4000-8000-000000000102'::uuid,'55000000-0000-4000-8000-000000000102'::uuid),
  ('52000000-0000-4000-8000-000000000103'::uuid,'55000000-0000-4000-8000-000000000103'::uuid),
  ('52000000-0000-4000-8000-000000000104'::uuid,'55000000-0000-4000-8000-000000000104'::uuid),
  ('52000000-0000-4000-8000-000000000105'::uuid,'55000000-0000-4000-8000-000000000105'::uuid),
  ('52000000-0000-4000-8000-000000000106'::uuid,'55000000-0000-4000-8000-000000000106'::uuid)
) as fixture(salon_id,stylist_id)
cross join (values ('Mon'),('Tue'),('Wed'),('Thu'),('Fri'),('Sat')) as day(name)
on conflict (id) do nothing;

-- Address changes intentionally clear coordinates through the geocoding
-- trigger.  Only this second, narrowly scoped update marks the six synthetic
-- addresses as provider-verified preview coordinates.
update public.salons salon
set latitude=fixture.latitude,
    longitude=fixture.longitude,
    formatted_address=fixture.formatted_address,
    geocode_status='success',
    geocoded_at=timestamptz '2026-01-01 12:00:00+00',
    address_needs_review=false,
    market_id=(select market.id from public.location_markets market where market.slug='manhattan' limit 1),
    borough='Manhattan'
from (values
  ('52000000-0000-4000-8000-000000000101'::uuid,40.8116::numeric,-73.9465::numeric,'101 Preview Avenue, New York, NY 10027'),
  ('52000000-0000-4000-8000-000000000102'::uuid,40.8172::numeric,-73.9420::numeric,'102 Preview Avenue, New York, NY 10030'),
  ('52000000-0000-4000-8000-000000000103'::uuid,40.8265::numeric,-73.9475::numeric,'103 Preview Avenue, New York, NY 10031'),
  ('52000000-0000-4000-8000-000000000104'::uuid,40.8069::numeric,-73.9532::numeric,'104 Preview Avenue, New York, NY 10026'),
  ('52000000-0000-4000-8000-000000000105'::uuid,40.8085::numeric,-73.9626::numeric,'105 Preview Avenue, New York, NY 10025'),
  ('52000000-0000-4000-8000-000000000106'::uuid,40.8148::numeric,-73.9560::numeric,'106 Preview Avenue, New York, NY 10039')
) as fixture(salon_id,latitude,longitude,formatted_address)
where salon.id=fixture.salon_id
  and (
    salon.latitude is distinct from fixture.latitude
    or salon.longitude is distinct from fixture.longitude
    or salon.formatted_address is distinct from fixture.formatted_address
    or salon.geocode_status is distinct from 'success'
    or salon.address_needs_review is distinct from false
  );

do $reconcile$
declare
  preview_salon_id uuid;
  diagnostic jsonb;
begin
  for preview_salon_id in
    select salon.id
    from public.salons salon
    where salon.slug like 'preview-%'
      and not public.is_marketplace_visible(salon.id)
    order by salon.id
  loop
    diagnostic := public.reconcile_salon_publication(
      preview_salon_id,
      '51000000-0000-4000-8000-000000000001',
      'Synthetic preview seed eligibility reconciliation'
    );
    if not coalesce((diagnostic->>'discovery_eligible')::boolean,false) then
      raise exception 'Preview salon % failed publication gates: %',
        preview_salon_id,diagnostic->'effective_missing_gate_keys';
    end if;
  end loop;
end
$reconcile$;

insert into public.featured_salon_campaigns(
  id,salon_id,entitlement_id,placement_basis,complimentary_reason,
  complimentary_approved_by,complimentary_approved_at,status,starts_at,
  ends_at,timezone,radius_miles,priority,rotation_weight,internal_note,
  archived_at,created_by,updated_by,created_at,updated_at
)
values (
  '57000000-0000-4000-8000-000000000101',
  '52000000-0000-4000-8000-000000000101',null,'complimentary_admin',
  'Synthetic preview placement for PR acceptance only.',
  '51000000-0000-4000-8000-000000000001',
  timestamptz '2026-01-01 00:00:00+00','Active',
  timestamptz '2026-01-01 00:00:00+00',null,'America/New_York',25,95,12,
  'Deterministic preview-only acceptance fixture.',null,
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',timestamptz '2026-01-01 12:00:00+00',timestamptz '2026-01-01 12:00:00+00'
)
on conflict (id) do nothing;

-- Publish exactly one managed campaign card into both the editable document
-- and the immutable public snapshot. Existing administrator-authored cards
-- remain in their original order after this deterministic first card.
do $homepage$
declare
  home_page public.content_pages%rowtype;
  managed_card jsonb := jsonb_build_object(
    'id','preview-managed-harlem-feature',
    'content_type','image',
    'title','Preview Lenox Braid Studio',
    'body','Explore a synthetic Harlem preview salon with transparent services and available hours.',
    'media_url','/images/salon-warm.jpg',
    'href','/salon/preview-lenox-braid-studio',
    'cta_label','View salon',
    'alt_text','Synthetic preview of a warm braiding salon interior',
    'status','Active',
    'source_kind','campaign',
    'association_type','campaign',
    'campaign_id','57000000-0000-4000-8000-000000000101',
    'salon_id','52000000-0000-4000-8000-000000000101',
    'editorial_fallback',false,
    'priority',95
  );
  editable_sections jsonb;
  public_payload jsonb;
  public_sections jsonb;
  rail_index integer;
  rail jsonb;
  retained_cards jsonb;
begin
  select * into home_page
  from public.content_pages page
  where page.slug='home'
  for update;
  if not found then
    raise exception 'Preview seed requires the managed home content record.';
  end if;

  editable_sections := public.normalize_home_hero_sections(home_page.sections);
  select item.ordinality::integer,item.section
  into rail_index,rail
  from jsonb_array_elements(editable_sections) with ordinality as item(section,ordinality)
  where item.section->>'type'='promo_rail'
  order by item.ordinality
  limit 1;
  if rail_index is null then
    rail := jsonb_build_object(
      'id','home-hero-promotion-carousel','type','promo_rail',
      'presentation_layout','promo_rail','title','Featured','is_visible',true,
      'display_limit',8,'cards',jsonb_build_array(managed_card)
    );
    editable_sections := jsonb_build_array(rail) || editable_sections;
  else
    select coalesce(jsonb_agg(card.value order by card.ordinality),'[]'::jsonb)
    into retained_cards
    from jsonb_array_elements(coalesce(rail->'cards','[]'::jsonb))
      with ordinality as card(value,ordinality)
    where card.value->>'id' is distinct from 'preview-managed-harlem-feature';
    rail := rail || jsonb_build_object(
      'id','home-hero-promotion-carousel','type','promo_rail',
      'presentation_layout',coalesce(rail->>'presentation_layout','promo_rail'),
      'is_visible',true,'cards',jsonb_build_array(managed_card) || retained_cards
    );
    editable_sections := jsonb_set(
      editable_sections,array[(rail_index-1)::text],rail,true
    );
  end if;

  public_payload := coalesce(
    home_page.published_payload,
    jsonb_build_object(
      'slug',home_page.slug,'title',home_page.title,
      'hero_title',home_page.hero_title,
      'hero_subtitle',home_page.hero_subtitle,
      'sections',home_page.sections
    )
  );
  public_sections := public.normalize_home_hero_sections(
    coalesce(public_payload->'sections',home_page.sections)
  );
  rail_index := null;
  rail := null;
  select item.ordinality::integer,item.section
  into rail_index,rail
  from jsonb_array_elements(public_sections) with ordinality as item(section,ordinality)
  where item.section->>'type'='promo_rail'
  order by item.ordinality
  limit 1;
  if rail_index is null then
    rail := jsonb_build_object(
      'id','home-hero-promotion-carousel','type','promo_rail',
      'presentation_layout','promo_rail','title','Featured','is_visible',true,
      'display_limit',8,'cards',jsonb_build_array(managed_card)
    );
    public_sections := jsonb_build_array(rail) || public_sections;
  else
    select coalesce(jsonb_agg(card.value order by card.ordinality),'[]'::jsonb)
    into retained_cards
    from jsonb_array_elements(coalesce(rail->'cards','[]'::jsonb))
      with ordinality as card(value,ordinality)
    where card.value->>'id' is distinct from 'preview-managed-harlem-feature';
    rail := rail || jsonb_build_object(
      'id','home-hero-promotion-carousel','type','promo_rail',
      'presentation_layout',coalesce(rail->>'presentation_layout','promo_rail'),
      'is_visible',true,'cards',jsonb_build_array(managed_card) || retained_cards
    );
    public_sections := jsonb_set(
      public_sections,array[(rail_index-1)::text],rail,true
    );
  end if;
  public_payload := jsonb_set(public_payload,'{sections}',public_sections,true)
    || jsonb_build_object(
      'slug','home','status','Published','is_enabled',true,
      'scheduled_publish_at',null,'archived_at',null
    );

  if home_page.sections is distinct from editable_sections
     or home_page.published_payload is distinct from public_payload
     or home_page.status is distinct from 'Published'
     or home_page.publication_state is distinct from 'Published'
     or home_page.is_enabled is distinct from true
     or home_page.archived_at is not null then
    update public.content_pages page
    set sections=editable_sections,
        published_payload=public_payload,
        status='Published',
        publication_state='Published',
        is_enabled=true,
        archived_at=null,
        scheduled_publish_at=null,
        scheduled_payload=null,
        published_at=coalesce(page.published_at,timestamptz '2026-01-01 12:00:00+00'),
        updated_by='51000000-0000-4000-8000-000000000001',
        updated_at=timestamptz '2026-01-01 12:00:00+00'
    where page.slug='home';
  end if;
end
$homepage$;
