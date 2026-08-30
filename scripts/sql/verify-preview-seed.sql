\set ON_ERROR_STOP on

do $verify_preview_seed$
declare
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
  preview_prohibited_private_tables constant text[] := array[
    'account_security_settings','admin_security_events','ai_generation_drafts',
    'ai_usage_events','application_document_uploads','auth_login_attempts',
    'auth_mfa_challenges','billing_events','booking_audit_log',
    'booking_checkout_intents','booking_financial_events',
    'booking_guest_access_audit','booking_guest_access_tokens',
    'booking_guest_recovery_challenges','booking_integrity_conflicts',
    'booking_messages','booking_refund_operations','booking_reminder_claims',
    'booking_reschedule_options','booking_reschedule_proposals',
    'booking_review_links','bookings','commerce_checkout_intents',
    'complaints_log','customer_favorites','customers','featured_campaign_audit',
    'homepage_product_placement_audit','homepage_product_placements',
    'identity_conflict_resolutions','identity_deletion_jobs',
    'identity_security_events','integration_health_checks','localized_content',
    'marketing_entitlements','media_assets','media_upload_sessions',
    'newsletter_subscribers','notification_delivery_log',
    'notification_template_versions','password_reset_codes',
    'platform_brand_asset_versions','platform_content',
    'platform_error_affected_businesses','platform_error_events',
    'platform_error_occurrences','platform_promotions',
    'product_inventory_reservations','product_order_events','product_order_items',
    'product_order_refunds','product_orders','product_promotion_redemptions',
    'promo_code_redemptions','promo_codes','push_subscriptions',
    'record_management_events','review_content_moderation_queue',
    'review_dispute_events','review_moderation_events',
    'review_reply_moderation_queue','reviews',
    'salon_availability_override_audit','salon_blockouts',
    'salon_booking_cancellations','salon_closure_requests',
    'salon_payout_attempts','salon_products','salon_promotion_audit',
    'salon_promotion_redemptions','salon_promotions',
    'salon_publication_override_audit','salon_publication_overrides',
    'salon_reconciliation_items','salon_reconciliation_runs',
    'salon_recovery_balances','salon_slug_redirects',
    'salon_spreadsheet_imports','salon_team_members',
    'salon_test_deletion_audit','salon_vanity_audit','salon_vanity_requests',
    'search_zero_result_aggregates','stripe_webhook_events','style_materials',
    'subscription_change_requests','support_response_email_outbox',
    'support_tickets','test_data_batches','test_data_cleanup_runs',
    'test_data_registry','translation_entry_versions','trending_campaign_audit',
    'trending_video_campaigns','trending_videos','video_processing_jobs'
  ];
  prohibited_table_name text;
  prohibited_table_has_rows boolean;
  public_home jsonb;
begin
  if (
    select count(*)
    from public.salons salon
    where salon.id=any(preview_salon_ids)
      and salon.slug in (
        'preview-lenox-braid-studio',
        'preview-strivers-row-braids',
        'preview-sugar-hill-styles',
        'preview-harlem-crown-studio',
        'preview-morningside-braid-room',
        'preview-frederick-douglass-braids'
      )
      and salon.status='Active'
      and salon.is_discoverable=true
      and salon.accepting_bookings=true
      and salon.verification_status='Verified'
      and salon.geocode_status='success'
      and salon.address_needs_review=false
      and salon.latitude between 40.79 and 40.84
      and salon.longitude between -73.98 and -73.92
      and salon.market_id is not null
      and salon.borough='Manhattan'
      and salon.cover_photo_url is not null
      and salon.logo_url is not null
      and jsonb_array_length(salon.gallery_photos)>=3
      and jsonb_typeof(salon.hours)='object'
      and public.is_marketplace_visible(salon.id)
  ) <> 6 then
    raise exception 'The preview seed does not contain six complete, active, geocoded, discoverable salons.';
  end if;

  if (
    select count(*)
    from auth.users auth_user
    where auth_user.id=any(preview_user_ids)
      and auth_user.email like '%@preview.girlzculture.invalid'
      and coalesce(auth_user.encrypted_password,'')=''
  ) <> 7 then
    raise exception 'Preview identities are missing, non-synthetic, or login-capable.';
  end if;
  if (select count(*) from auth.users) <> 7 then
    raise exception 'The preview database contains an authenticated identity outside the synthetic fixture set.';
  end if;
  if (
    select count(*)
    from public.platform_identities identity_record
    where identity_record.user_id=any(preview_user_ids)
      and identity_record.email_normalized like '%@preview.girlzculture.invalid'
      and identity_record.status='Active'
  ) <> 7 then
    raise exception 'Canonical preview identities are incomplete.';
  end if;
  if (
    select count(*)
    from public.admin_users admin_user
    where admin_user.id='51000000-0000-4000-8000-000000000001'
      and admin_user.user_id='51000000-0000-4000-8000-000000000001'
      and admin_user.email='admin@preview.girlzculture.invalid'
      and admin_user.status='Active'
      and admin_user.is_super_admin=true
  ) <> 1 or (select count(*) from public.admin_users) <> 1 then
    raise exception 'The non-login synthetic preview administrator is incomplete.';
  end if;

  if (
    select count(*)
    from public.salon_applications application
    where application.salon_id=any(preview_salon_ids)
      and application.status='Active'
      and application.consent_authorized
      and application.consent_terms
      and application.consent_photos
      and application.business_email like '%@preview.girlzculture.invalid'
  ) <> 6 then
    raise exception 'Preview salon applications are incomplete or not active.';
  end if;

  if (
    select count(*)
    from public.subscriptions subscription
    where subscription.salon_id=any(preview_salon_ids)
      and lower(subscription.status)='active'
      and subscription.tier in ('Basic','Growth','Premium')
      and subscription.current_period_end>now()
      and subscription.stripe_subscription_id is null
      and subscription.stripe_customer_id is null
      and subscription.price_id is null
  ) <> 6 then
    raise exception 'Preview subscriptions are missing, inactive, or contain fabricated provider evidence.';
  end if;

  if (
    select count(*)
    from public.styles style
    where style.salon_id=any(preview_salon_ids)
      and style.archived_at is null
      and style.is_draft=false
      and style.master_style_id is not null
      and style.service_group_id is not null
      and style.category_id is not null
      and style.base_price>0
      and style.price_display_min=style.base_price
      and style.price_display_max>=style.price_display_min
      and style.duration_min_hours>0
      and style.duration_max_hours>=style.duration_min_hours
      and jsonb_array_length(style.photos)>=1
  ) <> 12 then
    raise exception 'Preview salons must expose exactly two complete, priced services each.';
  end if;
  if exists (
    select 1
    from unnest(preview_salon_ids) seeded(salon_id)
    where (
      select count(*)
      from public.styles style
      where style.salon_id=seeded.salon_id
        and style.archived_at is null
        and style.is_draft=false
    ) <> 2
  ) then
    raise exception 'A preview salon does not have exactly two public services.';
  end if;

  if (
    select count(*)
    from public.stylists stylist
    where stylist.salon_id=any(preview_salon_ids)
      and stylist.is_active=true
      and stylist.is_draft=false
      and stylist.archived_at is null
      and stylist.avatar_url is not null
      and jsonb_array_length(stylist.photos)>=3
  ) <> 6 then
    raise exception 'Preview stylist media or active state is incomplete.';
  end if;
  if (
    select count(*)
    from public.availability availability_row
    where availability_row.salon_id=any(preview_salon_ids)
      and availability_row.stylist_id is not null
      and availability_row.day_of_week in ('Mon','Tue','Wed','Thu','Fri','Sat')
      and availability_row.start_time<availability_row.end_time
      and availability_row.is_blocked=false
  ) <> 36 then
    raise exception 'Preview stylist availability must contain six open days per salon.';
  end if;

  if not exists (
    select 1
    from public.featured_salon_campaigns campaign
    where campaign.id='57000000-0000-4000-8000-000000000101'
      and campaign.salon_id='52000000-0000-4000-8000-000000000101'
      and campaign.status='Active'
      and campaign.placement_basis='complimentary_admin'
      and campaign.entitlement_id is null
      and campaign.complimentary_approved_by='51000000-0000-4000-8000-000000000001'
      and campaign.complimentary_approved_at is not null
      and campaign.starts_at<=now()
      and campaign.ends_at is null
      and campaign.archived_at is null
  ) then
    raise exception 'The eligible preview Featured Salon campaign is missing.';
  end if;
  if not exists (
    select 1
    from public.discover_featured_salons(
      40.8116,-73.9465,25,'preview-seed-verification',12,0
    ) featured
    where featured.id='52000000-0000-4000-8000-000000000101'
      and featured.slug='preview-lenox-braid-studio'
  ) then
    raise exception 'The preview Featured Salon campaign is not publicly discoverable.';
  end if;

  public_home := public.get_public_content_page('home');
  if public_home is null then
    raise exception 'The managed homepage has no published payload.';
  end if;
  if (
    select count(*)
    from jsonb_array_elements(coalesce(public_home->'sections','[]'::jsonb))
      as section_record(section_value)
    cross join lateral jsonb_array_elements(
      coalesce(section_record.section_value->'cards','[]'::jsonb)
    ) as card_record(card_value)
    where section_record.section_value->>'type'='promo_rail'
      and card_record.card_value->>'id'='preview-managed-harlem-feature'
      and card_record.card_value->>'association_type'='campaign'
      and card_record.card_value->>'campaign_id'='57000000-0000-4000-8000-000000000101'
      and card_record.card_value->>'salon_id'='52000000-0000-4000-8000-000000000101'
      and card_record.card_value->>'href'='/salon/preview-lenox-braid-studio'
      and card_record.card_value->>'status'='Active'
  ) <> 1 then
    raise exception 'The published homepage payload must contain exactly one managed preview campaign card.';
  end if;
  if not exists (
    select 1
    from public.resolve_homepage_promotion_target(
      'campaign','57000000-0000-4000-8000-000000000101'
    ) target
    where target.salon_id='52000000-0000-4000-8000-000000000101'
      and target.salon_slug='preview-lenox-braid-studio'
  ) then
    raise exception 'The managed homepage card does not resolve to its eligible campaign.';
  end if;

  if (select count(*) from public.salon_applications)<>6
     or (select count(*) from public.subscriptions)<>6
     or (select count(*) from public.stylists)<>6
     or (select count(*) from public.styles)<>12
     or (select count(*) from public.availability)<>36
     or (select count(*) from public.featured_salon_campaigns)<>1 then
    raise exception 'Preview seed verification found a partial or additional direct fixture set.';
  end if;

  if (select count(*) from public.salon_application_revisions)<>6
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
    raise exception 'Preview application revision history is not the exact synthetic trigger output.';
  end if;

  if (select count(*) from public.notifications)<>12
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
    raise exception 'Preview notifications are not the exact synthetic application output.';
  end if;

  if (select count(*) from public.salon_status_audit)<>6
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
    raise exception 'Preview salon lifecycle audit history is not the exact synthetic activation output.';
  end if;

  if (select count(*) from public.public_change_events)<>4
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
     ) then
    raise exception 'Preview public-change events are not the four expected deterministic rows.';
  end if;

  foreach prohibited_table_name in array preview_prohibited_private_tables loop
    execute format(
      'select exists(select 1 from public.%I)',
      prohibited_table_name
    ) into prohibited_table_has_rows;
    if prohibited_table_has_rows then
      raise exception 'Preview seed verification found data in prohibited private/runtime table %.',
        prohibited_table_name;
    end if;
  end loop;

  -- The clean-database workflow enables this transaction-local test hook only
  -- after every real assertion has passed. A non-zero result must roll the
  -- entire seed back, proving verification cannot leave partial fixtures.
  if current_setting('app.preview_seed_force_assertion_failure', true) = 'true' then
    raise exception 'PREVIEW_SEED_FORCED_ASSERTION_FAILURE';
  end if;
end
$verify_preview_seed$;

select 'preview seed assertions passed' as result;
