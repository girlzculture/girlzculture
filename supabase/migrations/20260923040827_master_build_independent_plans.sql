-- Extend the application/entitlement catalog without rewriting existing billing
-- agreements or activating any payment provider. Forward-only, transaction safe.
begin;
alter table public.subscriptions drop constraint subscriptions_scheduled_tier_check;
alter table public.subscriptions add constraint subscriptions_scheduled_tier_check
 check(scheduled_tier is null or scheduled_tier in ('Solo','Solo Pro','Starter','Growth','Premium','Basic'));


create or replace function public.plan_rank(plan_name text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(trim(coalesce(plan_name, '')))
    when 'premium' then 3
    when 'growth' then 2
    when 'essentials' then 2
    when 'pro' then 2
    when 'solo' then 1
    when 'solo pro' then 2
    when 'solo-pro' then 2
    when 'starter' then 1
    when 'basic' then 1
    else 0
  end;
$$;

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
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN_APPLICATION_APPROVAL';
  end if;

  select *
  into v_application
  from public.salon_applications application
  where application.id = p_application_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'APPLICATION_NOT_FOUND';
  end if;

  select *
  into v_salon
  from public.salons salon
  where salon.id = v_application.salon_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'SALON_NOT_FOUND';
  end if;

  v_plan := case lower(trim(coalesce(v_application.selected_plan, '')))
    when 'solo' then 'Solo'
    when 'solo pro' then 'Solo Pro'
    when 'starter' then 'Starter'
    when 'basic' then 'Basic'
    when 'growth' then 'Growth'
    when 'essentials' then 'Growth'
    when 'pro' then 'Growth'
    when 'premium' then 'Premium'
    when 'platinum' then 'Premium'
    else null
  end;
  if v_plan is null then
    raise exception using
      errcode = '22023',
      message = 'UNRECOGNIZED_APPLICATION_PLAN';
  end if;

  v_changed :=
    v_application.status not in ('Approved', 'Active')
    or v_salon.approved_at is null
    or v_salon.subscription_tier is distinct from v_plan;

  update public.salons salon
  set status = case
        when salon.status in ('New', 'Pending') then 'Approved'
        else salon.status
      end,
      subscription_tier = v_plan,
      rejection_reason = null,
      approved_at = coalesce(salon.approved_at, now()),
      logo_url = coalesce(nullif(v_application.logo_url, ''), salon.logo_url)
  where salon.id = v_application.salon_id;

  update public.salon_applications application
  set status = case when application.status = 'Active' then application.status else 'Approved' end,
      rejection_reason = null,
      reviewed_by = p_actor_id,
      reviewed_at = coalesce(application.reviewed_at, now())
  where application.id = p_application_id;

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

create or replace function public.salon_effective_plan_key(
  target_salon_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with active_subscription as (
    select case lower(trim(coalesce(subscription.tier, '')))
      when 'solo' then 'solo'
    when 'solo pro' then 'solo-pro'
    when 'solo-pro' then 'solo-pro'
    when 'starter' then 'starter'
      when 'basic' then 'starter'
      when 'growth' then 'growth'
      when 'premium' then 'premium'
      else null
    end as plan_key
    from public.subscriptions subscription
    where subscription.salon_id = target_salon_id
      and lower(trim(coalesce(subscription.status, ''))) in ('active', 'trialing')
      and (
        subscription.current_period_end is null
        or subscription.current_period_end > now()
      )
    order by subscription.current_period_end desc nulls first,
             subscription.updated_at desc
    limit 1
  ), legacy_plan as (
    select case lower(trim(coalesce(salon.subscription_tier, '')))
      when 'solo' then 'solo'
    when 'solo pro' then 'solo-pro'
    when 'solo-pro' then 'solo-pro'
    when 'starter' then 'starter'
      when 'basic' then 'starter'
      when 'growth' then 'growth'
      when 'premium' then 'premium'
      else null
    end as plan_key
    from public.salons salon
    where salon.id = target_salon_id
      and lower(trim(coalesce(salon.subscription_status, ''))) in ('active', 'trialing')
      and not exists (
        select 1
        from public.subscriptions subscription
        where subscription.salon_id = target_salon_id
      )
  )
  select effective.plan_key
  from (
    select subscription.plan_key, 1 as authority_order
    from active_subscription subscription
    union all
    select legacy.plan_key, 2 as authority_order
    from legacy_plan legacy
    where not exists (select 1 from active_subscription)
  ) effective
  order by effective.authority_order
  limit 1;
$$;

create or replace function public.salon_has_feature(
  target_salon_id uuid,
  feature_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select case lower(trim(coalesce(feature_name, '')))
    when 'basic' then plan.plan_key is not null
    when 'professional_salon_profile' then plan.plan_key is not null
    when 'unlimited_stylist_profiles' then plan.plan_key in ('starter','growth','premium')
    when 'team_payouts' then plan.plan_key in ('starter','growth','premium')
    when 'gc_assistant' then plan.plan_key is not null
    when 'finances' then plan.plan_key is not null
    when 'client_cards' then plan.plan_key is not null
    when 'unlimited_appointment_bookings' then plan.plan_key is not null
    when 'customer_deposits' then plan.plan_key is not null
    when 'booking_specific_customer_chat' then plan.plan_key is not null
    when 'promotions' then plan.plan_key is not null
    when 'advanced_analytics' then public.plan_rank(plan.plan_key) >= 2
    -- These former tier perks are intentionally not subscription
    -- entitlements. Organic visibility is Standard for every plan and paid
    -- advertising is represented by a separate entitlement record.
    when 'featured_rotation' then false
    when 'premium_badge' then false
    when 'priority_support' then false
    else false
  end
  from (
    select public.salon_effective_plan_key(target_salon_id) as plan_key
  ) plan;
$$;

create or replace function public.salon_limit_plan_key(
  target_salon_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with current_plan as (
    select public.salon_effective_plan_key(target_salon_id) as plan_key
  ), scheduled_plan as (
    select case lower(trim(coalesce(subscription.scheduled_tier, '')))
      when 'solo' then 'solo'
    when 'solo pro' then 'solo-pro'
    when 'solo-pro' then 'solo-pro'
    when 'starter' then 'starter'
      when 'basic' then 'starter'
      when 'growth' then 'growth'
      when 'premium' then 'premium'
      else null
    end as plan_key
    from public.subscriptions subscription
    where subscription.salon_id = target_salon_id
      and lower(trim(coalesce(subscription.status, ''))) in ('active', 'trialing')
      and (
        subscription.current_period_end is null
        or subscription.current_period_end > now()
      )
      and subscription.scheduled_tier is not null
    order by subscription.current_period_end desc nulls first,
             subscription.updated_at desc
    limit 1
  )
  select case
    when current.plan_key is null then null
    when public.plan_rank(scheduled.plan_key) > 0
      and (public.plan_rank(scheduled.plan_key) < public.plan_rank(current.plan_key)
        or (scheduled.plan_key='solo-pro' and current.plan_key='growth'))
      then scheduled.plan_key
    else current.plan_key
  end
  from current_plan current
  left join scheduled_plan scheduled on true;
$$;

create or replace function public.salon_plan_limit(
  target_salon_id uuid,
  feature_name text
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case lower(trim(coalesce(feature_name, '')))
    when 'customer_promotions' then case plan.plan_key
      when 'premium' then null
      when 'growth' then 5
      when 'solo' then 1
      when 'solo-pro' then 3
      when 'starter' then 1
      else 0
    end
    when 'product_listings' then case plan.plan_key
      when 'premium' then null
      when 'growth' then 30
      when 'solo' then 10
      when 'solo-pro' then 30
      when 'starter' then 10
      else 0
    end
    else 0
  end
  from (
    select public.salon_limit_plan_key(target_salon_id) as plan_key
  ) plan;
$$;

create or replace function public.enforce_subscription_scheduled_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_current_plan text;
  v_scheduled_plan text;
  v_product_limit integer;
  v_promotion_limit integer;
  v_product_count integer;
  v_promotion_count integer;
begin
  v_current_plan := case lower(trim(coalesce(new.tier, '')))
    when 'solo' then 'solo'
    when 'solo pro' then 'solo-pro'
    when 'solo-pro' then 'solo-pro'
    when 'starter' then 'starter'
    when 'basic' then 'starter'
    when 'growth' then 'growth'
    when 'premium' then 'premium'
    else null
  end;
  v_scheduled_plan := case lower(trim(coalesce(new.scheduled_tier, '')))
    when 'solo' then 'solo'
    when 'solo pro' then 'solo-pro'
    when 'solo-pro' then 'solo-pro'
    when 'starter' then 'starter'
    when 'basic' then 'starter'
    when 'growth' then 'growth'
    when 'premium' then 'premium'
    else null
  end;

  if v_current_plan is null
    or v_scheduled_plan is null
    or (public.plan_rank(v_scheduled_plan) >= public.plan_rank(v_current_plan)
        and not (v_scheduled_plan='solo-pro' and v_current_plan='growth'))
    or lower(trim(coalesce(new.status, ''))) not in ('active', 'trialing')
    or (new.current_period_end is not null and new.current_period_end <= now())
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('girlz-culture:product-limit:' || new.salon_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('girlz-culture:promotion-limit:' || new.salon_id::text, 0)
  );

  v_product_limit := case v_scheduled_plan
    when 'solo' then 10
      when 'solo-pro' then 30
      when 'starter' then 10
    when 'growth' then 30
    else null
  end;
  v_promotion_limit := case v_scheduled_plan
    when 'solo' then 1
      when 'solo-pro' then 3
      when 'starter' then 1
    when 'growth' then 5
    else null
  end;

  if v_product_limit is not null then
    select count(*)::integer into v_product_count
    from public.salon_products product
    where product.salon_id = new.salon_id
      and product.archived_at is null
      and coalesce(product.product_status, 'Draft') <> 'Archived';
    if v_product_count > v_product_limit then
      raise exception using
        errcode = 'P0001',
        message = 'PLAN_DOWNGRADE_PRODUCT_LIMIT_EXCEEDED',
        detail = format(
          'Archive %s product listing(s) before scheduling this downgrade.',
          v_product_count - v_product_limit
        );
    end if;
  end if;

  if v_promotion_limit is not null then
    select count(*)::integer into v_promotion_count
    from public.salon_promotions promotion
    where promotion.salon_id = new.salon_id
      and promotion.archived_at is null
      and promotion.is_active is true
      and promotion.status = 'Active';
    if v_promotion_count > v_promotion_limit then
      raise exception using
        errcode = 'P0001',
        message = 'PLAN_DOWNGRADE_PROMOTION_LIMIT_EXCEEDED',
        detail = format(
          'End %s active promotion(s) before scheduling this downgrade.',
          v_promotion_count - v_promotion_limit
        );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_explicit_application_choices()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op='INSERT' or new.selected_plan is distinct from old.selected_plan then
    if coalesce(new.selected_plan,'') not in ('Solo','Solo Pro','Starter','Growth','Premium') then
      raise exception 'Please choose a plan before submitting your application.' using errcode='22023';
    end if;
  end if;
  if tg_op='INSERT' or new.business_setup_type is distinct from old.business_setup_type then
    if coalesce(new.business_setup_type,'') not in (
      'solo_professional','shared_suite_booth','single_location_staffed','multi_location','mobile_on_location'
    ) then
      raise exception 'Please choose your business setup before submitting your application.' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.submit_salon_application_atomic(
  p_user_id uuid,
  p_salon_values jsonb,
  p_application_values jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_salon public.salons%rowtype;
  v_application public.salon_applications%rowtype;
  v_created boolean := false;
  v_photo_urls text[];
  v_document_urls text[];
begin
  if not exists(
    select 1 from public.platform_identities identity
    where identity.user_id=p_user_id
      and identity.status='Active'
      and identity.primary_role='salon_owner'
  ) then
    raise exception 'This account is not an active salon-owner identity.' using errcode='42501';
  end if;
  if coalesce(p_application_values->>'selected_plan','') not in ('Solo','Solo Pro','Starter','Growth','Premium') then
    raise exception 'Please choose a plan before submitting your application.' using errcode='22023';
  end if;
  if coalesce(p_application_values->>'business_setup_type','') not in (
    'solo_professional','shared_suite_booth','single_location_staffed','multi_location','mobile_on_location'
  ) then
    raise exception 'Please choose your business setup before submitting your application.' using errcode='22023';
  end if;
  select * into v_salon from public.salons where user_id=p_user_id
  limit 1 for update;
  if not found then
    insert into public.salons(
      user_id,name,slug,owner_name,email,phone,address_street,address_line2,
      address_city,address_state,address_zip,business_type,application_state,
      status,verification_status,logo_url,subscription_tier,subscription_status
    ) values (
      p_user_id,p_salon_values->>'name',p_salon_values->>'slug',
      nullif(p_salon_values->>'owner_name',''),nullif(p_salon_values->>'email',''),
      nullif(p_salon_values->>'phone',''),nullif(p_salon_values->>'address_street',''),
      nullif(p_salon_values->>'address_line2',''),nullif(p_salon_values->>'address_city',''),
      nullif(upper(p_salon_values->>'address_state'),''),nullif(p_salon_values->>'address_zip',''),
      nullif(p_salon_values->>'business_type',''),nullif(p_salon_values->>'address_state',''),
      'Pending','Pending',nullif(p_salon_values->>'logo_url',''),
      p_application_values->>'selected_plan','inactive'
    ) returning * into v_salon;
    v_created := true;
  else
    update public.salons set
      name=coalesce(nullif(p_salon_values->>'name',''),name),
      owner_name=nullif(p_salon_values->>'owner_name',''),
      email=coalesce(nullif(p_salon_values->>'email',''),email),
      phone=nullif(p_salon_values->>'phone',''),
      address_street=nullif(p_salon_values->>'address_street',''),
      address_line2=nullif(p_salon_values->>'address_line2',''),
      address_city=nullif(p_salon_values->>'address_city',''),
      address_state=nullif(upper(p_salon_values->>'address_state'),''),
      address_zip=nullif(p_salon_values->>'address_zip',''),
      business_type=nullif(p_salon_values->>'business_type',''),
      application_state=nullif(p_salon_values->>'address_state',''),
      logo_url=nullif(p_salon_values->>'logo_url','')
    where id=v_salon.id returning * into v_salon;
  end if;

  select coalesce(array_agg(value),array[]::text[]) into v_photo_urls
  from jsonb_array_elements_text(coalesce(p_application_values->'photo_urls','[]'::jsonb)) value;
  select coalesce(array_agg(value),array[]::text[]) into v_document_urls
  from jsonb_array_elements_text(coalesce(p_application_values->'document_urls','[]'::jsonb)) value;
  perform set_config('app.application_change_source',case when v_created then 'salon_owner_initial_submission' else 'salon_owner_resubmission' end,true);
  perform set_config('app.application_change_reason',case when v_created then 'Initial salon application' else 'Salon application resubmitted' end,true);

  insert into public.salon_applications(
    salon_id,user_id,business_name,owner_name,business_email,phone,
    street_address,address_line2,city,state,zip_code,neighborhood,business_type,
    business_setup_type,referral_source,selected_plan,years_in_operation,stylist_count,website_url,
    instagram_url,business_license_number,cosmetology_license_number,logo_url,
    photo_urls,document_urls,consent_authorized,consent_terms,consent_photos,
    status,rejection_reason,reviewed_by,reviewed_at,submitted_at,
    archived_at,archived_by,archive_reason,updated_at
  ) values (
    v_salon.id,p_user_id,p_application_values->>'business_name',
    p_application_values->>'owner_name',p_application_values->>'business_email',
    p_application_values->>'phone',p_application_values->>'street_address',
    nullif(p_application_values->>'address_line2',''),p_application_values->>'city',
    upper(p_application_values->>'state'),p_application_values->>'zip_code',null,
    p_application_values->>'business_type',p_application_values->>'business_setup_type',
    nullif(p_application_values->>'referral_source',''),
    p_application_values->>'selected_plan',nullif(p_application_values->>'years_in_operation','')::integer,
    nullif(p_application_values->>'stylist_count','')::integer,
    nullif(p_application_values->>'website_url',''),nullif(p_application_values->>'instagram_url',''),
    nullif(p_application_values->>'business_license_number',''),
    nullif(p_application_values->>'cosmetology_license_number',''),
    nullif(p_application_values->>'logo_url',''),v_photo_urls,v_document_urls,
    true,true,true,'Pending',null,null,null,now(),null,null,null,now()
  )
  on conflict(salon_id) do update set
    user_id=excluded.user_id,business_name=excluded.business_name,
    owner_name=excluded.owner_name,business_email=excluded.business_email,
    phone=excluded.phone,street_address=excluded.street_address,
    address_line2=excluded.address_line2,city=excluded.city,state=excluded.state,
    zip_code=excluded.zip_code,business_type=excluded.business_type,
    business_setup_type=excluded.business_setup_type,
    referral_source=excluded.referral_source,selected_plan=excluded.selected_plan,
    years_in_operation=excluded.years_in_operation,stylist_count=excluded.stylist_count,
    website_url=excluded.website_url,instagram_url=excluded.instagram_url,
    business_license_number=excluded.business_license_number,
    cosmetology_license_number=excluded.cosmetology_license_number,
    logo_url=excluded.logo_url,photo_urls=excluded.photo_urls,
    document_urls=excluded.document_urls,consent_authorized=true,
    consent_terms=true,consent_photos=true,status='Pending',rejection_reason=null,
    reviewed_by=null,reviewed_at=null,submitted_at=now(),archived_at=null,
    archived_by=null,archive_reason=null,updated_at=now()
  returning * into v_application;

  return jsonb_build_object(
    'ok',true,'created_salon',v_created,
    'salon',to_jsonb(v_salon),'application',to_jsonb(v_application)
  );
end;
$$;

-- Single-calendar enforcement is conservative while an application is inactive.
-- Active subscription authority wins over the display mirror.
create function public.salon_is_solo(target_salon_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(public.salon_effective_plan_key(target_salon_id) in ('solo','solo-pro'),
   (select lower(subscription_tier) in ('solo','solo pro','solo-pro') from public.salons where id=target_salon_id),false);
$$;
revoke all on function public.salon_is_solo(uuid) from public,anon;
grant execute on function public.salon_is_solo(uuid) to authenticated,service_role;


create or replace function public.p0_calendar_occupancy_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_salon uuid; v_stylist uuid; v_start timestamptz; v_end timestamptz; v_session text; v_id uuid; v_solo boolean;
begin
  v_salon:=new.salon_id; v_id:=new.id;
  if tg_table_name='bookings' and to_jsonb(new)->>'origin_checkout_intent_id' is not null then
    if auth.role() is distinct from 'service_role' then raise exception 'CHECKOUT_ORIGIN_SERVER_ONLY'; end if;
    if not exists(select 1 from public.booking_checkout_intents i where i.id=(to_jsonb(new)->>'origin_checkout_intent_id')::uuid and i.salon_id=v_salon and i.customer_id is not distinct from new.customer_id and coalesce(i.appointment_datetime,(i.payload->>'appointment_datetime')::timestamptz)=new.appointment_datetime) then raise exception 'CHECKOUT_ORIGIN_INVALID'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p0-calendar:'||v_salon::text,0));
  if tg_table_name='salon_blockouts' then return new; end if;
  v_solo:=public.salon_is_solo(v_salon);
  v_stylist:=new.stylist_id; v_start:=new.appointment_datetime;
  v_end:=v_start+make_interval(secs=>(coalesce(new.duration_hours,0)*3600+coalesce(new.buffer_minutes,0)*60)::double precision);
  v_session:=new.stripe_checkout_session_id;
  if tg_table_name='bookings' and lower(coalesce(new.status,'')) in ('cancelled','canceled') then return new; end if;
  if tg_table_name='booking_checkout_intents' and (new.status<>'Pending' or (to_jsonb(new)->>'expires_at')::timestamptz<=now()) then return new; end if;
  if exists(select 1 from public.bookings b where b.salon_id=v_salon and b.id<>v_id and b.is_active_booking
    and (v_solo or v_stylist is null or b.stylist_id is null or b.stylist_id=v_stylist)
    and b.appointment_datetime<v_end and b.blocked_until>v_start)
    or exists(select 1 from public.booking_checkout_intents i where i.salon_id=v_salon and i.id<>v_id and i.status='Pending' and i.expires_at>now()
    and (v_solo or v_stylist is null or i.stylist_id is null or i.stylist_id=v_stylist)
    and i.appointment_datetime<v_end and i.blocked_until>v_start
    and (v_session is null or i.stripe_checkout_session_id is distinct from v_session)
    and (tg_table_name<>'bookings' or i.id is distinct from (to_jsonb(new)->>'origin_checkout_intent_id')::uuid)) then raise exception 'BOOKING_RESOURCE_CONFLICT'; end if;
  -- Ordinary updates to an existing appointment must remain possible when an
  -- owner subsequently blocks their calendar. New or moved appointments may not.
  if tg_op='INSERT' or (new.appointment_datetime,new.stylist_id,new.duration_hours,new.buffer_minutes) is distinct from (old.appointment_datetime,old.stylist_id,old.duration_hours,old.buffer_minutes) then
    if exists(select 1 from public.salon_blockouts b where b.salon_id=v_salon and b.released_at is null
      and (v_solo or b.stylist_id is null or v_stylist is null or b.stylist_id=v_stylist) and b.starts_at<v_end and b.ends_at>v_start) then raise exception 'BOOKING_RESOURCE_CONFLICT'; end if;
  end if;
  return new;
end $$;

-- A solo business cannot acquire team logins through direct writes/RPCs.
create function public.guard_independent_team_membership() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('p0-calendar:'||new.salon_id::text,0));
 if public.salon_is_solo(new.salon_id) and new.status in ('Invited','Active') then
   raise check_violation using message='SOLO_TEAM_PLAN_REQUIRED';
 end if;
 return new;
end $$;
revoke all on function public.guard_independent_team_membership() from public,anon,authenticated;
create trigger independent_team_membership before insert or update of salon_id,status on public.salon_team_members
 for each row execute function public.guard_independent_team_membership();


create or replace function public.p0_actor_has_permission(p_salon uuid,p_user uuid,p_permission text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select (not public.salon_is_solo(p_salon) or (p_permission not in ('stylists','team','team_payouts')
    and exists(select 1 from public.salons where id=p_salon and user_id=p_user)))
  and exists(select 1 from public.platform_identities i join auth.users u on u.id=i.user_id
    where i.user_id=p_user and i.status='Active' and i.email_normalized=lower(trim(u.email))
      and ((i.primary_role='salon_owner' and exists(select 1 from public.salons s where s.id=p_salon and s.user_id=p_user))
        or (i.primary_role='salon_team' and exists(select 1 from public.salon_team_members m where m.salon_id=p_salon and m.user_id=p_user
          and m.status='Active' and coalesce((m.permissions->>p_permission)::boolean,false)))));
$$;

create or replace function public.salon_has_permission(target_salon_id uuid, permission_key text)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select (not public.salon_is_solo(target_salon_id) or (permission_key not in ('stylists','team','team_payouts')
    and exists(select 1 from public.salons where id=target_salon_id and user_id=auth.uid()))) and (exists (
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
  ));
$$;

comment on column public.salon_applications.selected_plan is 'Explicit new application selection: Solo, Solo Pro, Starter, Growth, Premium. Historical values remain preserved.';
update public.engine_settings set published_value='"20260923040827"'::jsonb,draft_value='"20260923040827"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
create or replace function public.record_business_finance(p_salon uuid,p_user uuid,p_request uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; v_prior public.business_finance_operations%rowtype; v_sale public.business_finance_sales%rowtype;
  v_booking public.bookings%rowtype; v_order public.product_orders%rowtype; v_original public.business_finance_receipts%rowtype;
  v_agreement public.business_compensation_arrangements%rowtype; v_obligation public.business_compensation_obligations%rowtype;
  v_stylist uuid; v_at timestamptz; v_cents bigint; v_total bigint; v_paid bigint; v_result jsonb; v_full boolean; v_owner boolean;
  v_period_start date; v_period_end date; v_business_today date;
begin
 if p_action in ('arrangement','obligation','compensation_payment') and public.salon_is_solo(p_salon) then raise exception 'FINANCE_TEAM_PLAN_REQUIRED'; end if;
  if p_request is null or p_action is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then raise exception 'FINANCE_INVALID_RECORD'; end if;
  -- Serialize entries for this business (including retries/refunds/balances),
  -- then re-check identity/membership while their rows remain locked.
  perform 1 from public.salons where id=p_salon for update;
  perform 1 from public.platform_identities where user_id=p_user for share;
  perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_user for share;
  v_full:=public.p0_actor_has_permission(p_salon,p_user,'finance_manage');
  v_owner:=exists(select 1 from public.salons where id=p_salon and user_id=p_user) and v_full;
  if not v_full and not (p_action in ('sale','receipt') and public.p0_actor_has_permission(p_salon,p_user,'finance_log')) then raise exception 'FINANCE_ACCESS_DENIED'; end if;
  if not public.p0_business_plan_active(p_salon) then raise exception 'FINANCE_PLAN_REQUIRED'; end if;
  select (now() at time zone coalesce(nullif(time_zone,''),'America/New_York'))::date into v_business_today from public.salons where id=p_salon;
  if exists(select 1 from jsonb_each(p_payload) where (key like '%\_cents' escape '\' or key='quantity') and value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$')) then raise exception 'FINANCE_INVALID_AMOUNT'; end if;
  select * into v_prior from public.business_finance_operations where salon_id=p_salon and actor_id=p_user and request_id=p_request;
  if found then
    if v_prior.action<>p_action or v_prior.payload<>p_payload then raise exception 'FINANCE_REQUEST_CONFLICT'; end if;
    return v_prior.result;
  end if;
  v_at:=coalesce((p_payload->>'occurred_at')::timestamptz,now());
  if not isfinite(v_at) or v_at>now()+interval '5 minutes' then raise exception 'FINANCE_INVALID_DATE'; end if;
  v_stylist:=(p_payload->>'stylist_id')::uuid;
  if v_stylist is not null and not exists(select 1 from public.stylists where salon_id=p_salon and id=v_stylist and archived_at is null) then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
  v_cents:=(p_payload->>'amount_cents')::bigint;
  if p_action='sale' then
    if p_payload->>'kind'='service' and v_stylist is null then raise exception 'FINANCE_INVALID_RECORD'; end if;
    insert into public.business_finance_sales(salon_id,occurred_at,source,kind,name,product_id,stylist_id,client_name,list_cents,discount_cents,cost_cents,quantity,compensation,created_by)
      values(p_salon,v_at,p_payload->>'source',p_payload->>'kind',trim(p_payload->>'name'),(p_payload->>'product_id')::uuid,v_stylist,nullif(trim(p_payload->>'client_name'),''),
        (p_payload->>'list_cents')::bigint,coalesce((p_payload->>'discount_cents')::bigint,0),(p_payload->>'cost_cents')::bigint,
        coalesce((p_payload->>'quantity')::integer,1),public.business_compensation_snapshot(p_salon,v_stylist,v_at),p_user) returning * into v_sale;
    if v_sale.agreed_cents>0 then
      insert into public.business_finance_receipts(salon_id,sale_id,occurred_at,stage,method,amount_cents,created_by)
        values(p_salon,v_sale.id,v_at,'full',p_payload->>'method',v_sale.agreed_cents,p_user);
    end if;
    v_id:=v_sale.id;
  elsif p_action='receipt' then
    if num_nonnulls(p_payload->>'sale_id',p_payload->>'booking_id',p_payload->>'product_order_id')<>1 then raise exception 'FINANCE_INVALID_RECORD'; end if;
    if p_payload->>'sale_id' is not null then
      select * into v_sale from public.business_finance_sales where salon_id=p_salon and id=(p_payload->>'sale_id')::uuid and status<>'cancelled';
      if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
      v_total:=v_sale.agreed_cents;
      select coalesce(sum(amount_cents),0) into v_paid from public.business_finance_receipts where salon_id=p_salon and sale_id=v_sale.id and stage<>'refund';
    elsif p_payload->>'booking_id' is not null then
      select * into v_booking from public.bookings where salon_id=p_salon and id=(p_payload->>'booking_id')::uuid and regexp_replace(lower(status),'[ _-]','','g') not in ('cancelled','canceled','noshow');
      if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
      if v_booking.payment_mode='test' then raise exception 'FINANCE_TEST_PAYMENT'; end if;
      -- A paid-looking label alone is not proof of a provider receipt.
      if v_booking.booking_origin='marketplace' and v_booking.deposit_amount>0 and not coalesce(v_booking.payment_mode='live' and v_booking.payment_verified_at is not null and v_booking.stripe_charge_id like 'ch_%' and lower(replace(v_booking.deposit_status,' ','')) in ('paid','succeeded','refunded','partiallyrefunded','refundpending'),false) then raise exception 'FINANCE_DEPOSIT_UNVERIFIED'; end if;
      v_total:=round(v_booking.estimated_total*100);
      select coalesce(sum(amount_cents),0) into v_paid from public.business_finance_receipts where salon_id=p_salon and booking_id=v_booking.id and stage<>'refund';
      if v_booking.booking_origin='marketplace' then v_paid:=v_paid+round(v_booking.deposit_amount*100); end if;
    else
      select * into v_order from public.product_orders where salon_id=p_salon and id=(p_payload->>'product_order_id')::uuid and reservation_status in ('Reserved','Ready for pickup','Collected');
      if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
      if not coalesce(v_order.payment_mode='live' and v_order.paid_at is not null and v_order.stripe_charge_id like 'ch_%',false) then raise exception 'FINANCE_DEPOSIT_UNVERIFIED'; end if;
      v_total:=round(v_order.total_amount*100);
      select coalesce(sum(amount_cents),0)+round(v_order.deposit_amount*100) into v_paid from public.business_finance_receipts where salon_id=p_salon and product_order_id=v_order.id and stage<>'refund';
    end if;
    if v_cents is null or v_cents<=0 or v_total is null or v_cents>v_total-v_paid then raise exception 'FINANCE_RECEIPTS_EXCEED_SALE'; end if;
    insert into public.business_finance_receipts(salon_id,sale_id,booking_id,product_order_id,occurred_at,stage,method,amount_cents,note,created_by)
      values(p_salon,v_sale.id,v_booking.id,v_order.id,v_at,'balance',p_payload->>'method',v_cents,p_payload->>'note',p_user) returning id into v_id;
  elsif p_action='refund' then
    select * into v_original from public.business_finance_receipts where salon_id=p_salon and id=(p_payload->>'original_payment_id')::uuid and stage<>'refund';
    if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
    select coalesce(sum(amount_cents),0) into v_paid from public.business_finance_receipts where salon_id=p_salon and original_payment_id=v_original.id;
    if v_cents is null or v_cents<=0 or v_cents>v_original.amount_cents-v_paid or v_at<v_original.occurred_at or length(trim(coalesce(p_payload->>'note','')))=0 then raise exception 'FINANCE_INVALID_REFUND'; end if;
    insert into public.business_finance_receipts(salon_id,sale_id,booking_id,product_order_id,occurred_at,stage,method,amount_cents,original_payment_id,note,created_by)
      values(p_salon,v_original.sale_id,v_original.booking_id,v_original.product_order_id,v_at,'refund',v_original.method,v_cents,v_original.id,p_payload->>'note',p_user) returning id into v_id;
  elsif p_action='expense' then
    insert into public.business_finance_expenses(salon_id,occurred_at,category,amount_cents,treatment,note,created_by)
      values(p_salon,v_at,trim(p_payload->>'category'),v_cents,p_payload->>'treatment',p_payload->>'note',p_user) returning id into v_id;
  elsif p_action='arrangement' then
    if not v_owner then raise exception 'FINANCE_OWNER_REQUIRED'; end if;
    if (p_payload->>'effective_from')::date<v_business_today then raise exception 'FINANCE_HISTORICAL_ARRANGEMENT'; end if;
    insert into public.business_compensation_arrangements(salon_id,stylist_id,effective_from,kind,basis,percent,amount_cents,period,created_by)
      values(p_salon,v_stylist,(p_payload->>'effective_from')::date,p_payload->>'kind',p_payload->>'basis',(p_payload->>'percent')::numeric,v_cents,p_payload->>'period',p_user) returning id into v_id;
  elsif p_action='obligation' then
    select * into v_agreement from public.business_compensation_arrangements where salon_id=p_salon and id=(p_payload->>'arrangement_version')::uuid and kind in ('booth','employee');
    if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
    v_period_start:=(p_payload->>'period_start')::date;
    v_period_end:=(v_period_start+case v_agreement.period when 'week' then interval '7 days' else interval '1 month' end-interval '1 day')::date;
    if v_period_start<v_agreement.effective_from or exists(select 1 from public.business_compensation_arrangements a where a.salon_id=p_salon and a.stylist_id=v_agreement.stylist_id and a.effective_from>v_agreement.effective_from and a.effective_from<=v_period_start) then raise exception 'FINANCE_INVALID_PERIOD'; end if;
    if exists(select 1 from public.business_compensation_obligations o where o.salon_id=p_salon and o.stylist_id=v_agreement.stylist_id and o.period_start<=v_period_end and o.period_end>=v_period_start) then raise exception 'FINANCE_PERIOD_OVERLAP'; end if;
    insert into public.business_compensation_obligations(salon_id,stylist_id,due_at,kind,amount_cents,arrangement_version,period_start,period_end,created_by)
      values(p_salon,v_agreement.stylist_id,(p_payload->>'due_at')::timestamptz,case v_agreement.kind when 'booth' then 'booth_rent' else 'wage' end,
        v_agreement.amount_cents,v_agreement.id,(p_payload->>'period_start')::date,
        ((p_payload->>'period_start')::date+case v_agreement.period when 'week' then interval '7 days' else interval '1 month' end-interval '1 day')::date,p_user) returning id into v_id;
  elsif p_action='compensation_payment' then
    if p_payload->>'kind'<>'commission' then
      select * into v_obligation from public.business_compensation_obligations where salon_id=p_salon and id=(p_payload->>'obligation_id')::uuid and stylist_id=v_stylist and kind=p_payload->>'kind';
      if not found then raise exception 'FINANCE_RECORD_NOT_FOUND'; end if;
      select coalesce(sum(amount_cents),0) into v_paid from public.business_compensation_payments where salon_id=p_salon and obligation_id=v_obligation.id;
      if v_cents>v_obligation.amount_cents-v_paid then raise exception 'FINANCE_PAYMENT_EXCEEDS_DUE'; end if;
    end if;
    insert into public.business_compensation_payments(salon_id,stylist_id,occurred_at,obligation_id,kind,amount_cents,method,created_by)
      values(p_salon,v_stylist,v_at,v_obligation.id,p_payload->>'kind',v_cents,p_payload->>'method',p_user) returning id into v_id;
  else raise exception 'FINANCE_INVALID_ACTION'; end if;
  v_result:=jsonb_build_object('id',v_id,'verified',true);
  insert into public.business_finance_operations(salon_id,actor_id,request_id,action,payload,result) values(p_salon,p_user,p_request,p_action,p_payload,v_result);
  return v_result;
exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'FINANCE_INVALID_RECORD';
when unique_violation then raise exception 'FINANCE_RECORD_CONFLICT';
end $$;
commit;
