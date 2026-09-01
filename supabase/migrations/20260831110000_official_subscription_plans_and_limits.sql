-- Founder-approved subscription catalog and database-enforced allowances.
--
-- Production safety:
--   * historical Basic rows and Stripe identities are preserved;
--   * no subscription, application, salon, product, or promotion row is
--     rewritten;
--   * new application defaults use Starter;
--   * concurrent product/promotion writes are serialized per salon so the
--     published limits cannot be bypassed by racing requests;
--   * organic placement is never granted by subscription tier. A separately
--     paid or credited marketing entitlement is required.

begin;

alter table public.salon_applications
  alter column selected_plan set default 'Starter';

alter table public.subscriptions
  drop constraint if exists subscriptions_scheduled_tier_check;
alter table public.subscriptions
  add constraint subscriptions_scheduled_tier_check
  check (
    scheduled_tier is null
    or scheduled_tier in ('Starter', 'Growth', 'Premium', 'Basic')
  );

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
    when 'starter' then 1
    when 'basic' then 1
    else 0
  end;
$$;

-- Approval must carry the founder-selected plan forward exactly. The previous
-- implementation treated every unrecognized value (including the new Starter
-- tier) as legacy Basic. Keep historical Basic readable, normalize only the
-- documented aliases, and fail closed for malformed application data.
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

-- Resolve the effective billable plan once so every feature and allowance
-- follows the same authority. An active, unexpired subscriptions row wins.
-- The salons mirror is consulted only for a historical active salon that has
-- never had a subscriptions row (the documented pre-billing Basic fallback).
-- Any inactive, expired, unrecognized, or drifted subscription identity fails
-- closed instead of inheriting a more generous salons mirror value.
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
    when 'unlimited_stylist_profiles' then plan.plan_key is not null
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

-- Keep access on the paid plan through renewal, while making inventory limits
-- honor a scheduled downgrade as soon as it is persisted. This prevents a
-- Premium salon from scheduling Starter and then adding records that Starter
-- cannot hold before the renewal becomes effective.
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
      and public.plan_rank(scheduled.plan_key) < public.plan_rank(current.plan_key)
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
      when 'starter' then 1
      else 0
    end
    when 'product_listings' then case plan.plan_key
      when 'premium' then null
      when 'growth' then 30
      when 'starter' then 10
      else 0
    end
    else 0
  end
  from (
    select public.salon_limit_plan_key(target_salon_id) as plan_key
  ) plan;
$$;

-- Serialize downgrade scheduling with the same per-salon locks used by the
-- product and promotion creation triggers. The scheduled tier cannot be saved
-- if the salon is already over its hard limits; after it is saved,
-- salon_plan_limit applies that stricter tier to every subsequent write.
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
    when 'starter' then 'starter'
    when 'basic' then 'starter'
    when 'growth' then 'growth'
    when 'premium' then 'premium'
    else null
  end;
  v_scheduled_plan := case lower(trim(coalesce(new.scheduled_tier, '')))
    when 'starter' then 'starter'
    when 'basic' then 'starter'
    when 'growth' then 'growth'
    when 'premium' then 'premium'
    else null
  end;

  if v_current_plan is null
    or v_scheduled_plan is null
    or public.plan_rank(v_scheduled_plan) >= public.plan_rank(v_current_plan)
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
    when 'starter' then 10
    when 'growth' then 30
    else null
  end;
  v_promotion_limit := case v_scheduled_plan
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

drop trigger if exists subscriptions_enforce_scheduled_plan_limits
  on public.subscriptions;
create trigger subscriptions_enforce_scheduled_plan_limits
before insert or update on public.subscriptions
for each row execute function public.enforce_subscription_scheduled_plan_limits();

-- Salon-page content is included in every official plan. Preserve the word
-- limit and AI-assistance safety behavior from the original trigger while
-- removing the retired Growth-only replacement rule.
create or replace function public.enforce_salon_profile_assistance_controls()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_word_count integer := 0;
begin
  if trim(coalesce(new.description, '')) <> '' then
    v_word_count := coalesce(
      array_length(regexp_split_to_array(trim(new.description), E'\\s+'), 1),
      0
    );
  end if;
  if v_word_count > 200 then
    raise exception using
      errcode = '22023',
      message = 'SALON_DESCRIPTION_WORD_LIMIT';
  end if;
  if trim(coalesce(new.description, '')) = '' then
    new.description_ai_assisted := false;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_salon_product_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_limit integer;
  v_count integer;
  v_old_counted boolean := false;
  v_new_counted boolean := false;
begin
  v_new_counted := new.archived_at is null
    and coalesce(new.product_status, 'Draft') <> 'Archived';

  if tg_op = 'UPDATE' then
    v_old_counted := old.archived_at is null
      and coalesce(old.product_status, 'Draft') <> 'Archived';
    if v_old_counted and v_new_counted and old.salon_id = new.salon_id then
      return new;
    end if;
  end if;

  if not v_new_counted then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('girlz-culture:product-limit:' || new.salon_id::text, 0)
  );
  v_limit := public.salon_plan_limit(new.salon_id, 'product_listings');
  if v_limit is null then
    return new;
  end if;

  select count(*)::integer into v_count
  from public.salon_products product
  where product.salon_id = new.salon_id
    and product.archived_at is null
    and coalesce(product.product_status, 'Draft') <> 'Archived'
    and product.id is distinct from new.id;

  if v_count >= v_limit then
    raise exception using
      errcode = 'P0001',
      message = 'PLAN_PRODUCT_LIMIT_REACHED',
      detail = format('The salon plan allows %s product listings.', v_limit);
  end if;
  return new;
end;
$$;

drop trigger if exists salon_products_enforce_plan_limit
  on public.salon_products;
create trigger salon_products_enforce_plan_limit
before insert or update of salon_id, archived_at, product_status
on public.salon_products
for each row execute function public.enforce_salon_product_plan_limit();

create or replace function public.enforce_salon_promotion_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_limit integer;
  v_count integer;
  v_old_counted boolean := false;
  v_new_counted boolean := false;
begin
  v_new_counted := new.archived_at is null
    and new.is_active is true
    and new.status = 'Active';

  if tg_op = 'UPDATE' then
    v_old_counted := old.archived_at is null
      and old.is_active is true
      and old.status = 'Active';
    if v_old_counted and v_new_counted and old.salon_id = new.salon_id then
      return new;
    end if;
  end if;

  if not v_new_counted then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('girlz-culture:promotion-limit:' || new.salon_id::text, 0)
  );
  v_limit := public.salon_plan_limit(new.salon_id, 'customer_promotions');
  if v_limit is null then
    return new;
  end if;

  select count(*)::integer into v_count
  from public.salon_promotions promotion
  where promotion.salon_id = new.salon_id
    and promotion.archived_at is null
    and promotion.is_active is true
    and promotion.status = 'Active'
    and promotion.id is distinct from new.id;

  if v_count >= v_limit then
    raise exception using
      errcode = 'P0001',
      message = 'PLAN_PROMOTION_LIMIT_REACHED',
      detail = format('The salon plan allows %s active promotions.', v_limit);
  end if;
  return new;
end;
$$;

drop trigger if exists salon_promotions_enforce_plan_limit
  on public.salon_promotions;
create trigger salon_promotions_enforce_plan_limit
before insert or update of salon_id, archived_at, is_active, status
on public.salon_promotions
for each row execute function public.enforce_salon_promotion_plan_limit();

create or replace function public.require_homepage_product_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_product_salon_id uuid;
  v_entitlement public.marketing_entitlements%rowtype;
begin
  if new.status in ('Scheduled', 'Active') then
    if new.entitlement_id is null then
      raise exception using
        errcode = '22023',
        message = 'FEATURED_PRODUCT_ENTITLEMENT_REQUIRED';
    end if;

    select product.salon_id
    into v_product_salon_id
    from public.salon_products product
    where product.id = new.product_id;
    if not found then
      raise exception using
        errcode = '22023',
        message = 'FEATURED_PRODUCT_ENTITLEMENT_INVALID';
    end if;

    select entitlement.*
    into v_entitlement
    from public.marketing_entitlements entitlement
    where entitlement.id = new.entitlement_id;
    if not found
      or v_entitlement.salon_id <> v_product_salon_id
      or v_entitlement.placement_type <> 'Featured Product'
      or v_entitlement.status not in ('Paid', 'Credited')
      or v_entitlement.valid_from > new.starts_at
      or (
        new.ends_at is null
        and v_entitlement.valid_until is not null
      )
      or (
        new.ends_at is not null
        and v_entitlement.valid_until is not null
        and v_entitlement.valid_until < new.ends_at
      )
    then
      raise exception using
        errcode = '22023',
        message = 'FEATURED_PRODUCT_ENTITLEMENT_INVALID';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists homepage_product_placements_require_entitlement
  on public.homepage_product_placements;
create trigger homepage_product_placements_require_entitlement
before insert or update of product_id, status, entitlement_id, starts_at, ends_at
on public.homepage_product_placements
for each row execute function public.require_homepage_product_entitlement();

revoke all on function public.plan_rank(text) from public;
revoke all on function public.approve_salon_application(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.salon_has_feature(uuid, text) from public;
revoke all on function public.salon_plan_limit(uuid, text) from public;
revoke all on function public.salon_effective_plan_key(uuid) from public;
revoke all on function public.salon_limit_plan_key(uuid) from public;
revoke all on function public.enforce_subscription_scheduled_plan_limits() from public;
revoke all on function public.enforce_salon_profile_assistance_controls() from public;
revoke all on function public.enforce_salon_product_plan_limit() from public;
revoke all on function public.enforce_salon_promotion_plan_limit() from public;
revoke all on function public.require_homepage_product_entitlement() from public;

grant execute on function public.plan_rank(text) to anon, authenticated, service_role;
grant execute on function public.approve_salon_application(uuid, uuid)
  to service_role;
grant execute on function public.salon_has_feature(uuid, text) to anon, authenticated, service_role;
grant execute on function public.salon_plan_limit(uuid, text) to authenticated, service_role;
grant execute on function public.salon_effective_plan_key(uuid) to service_role;
grant execute on function public.salon_limit_plan_key(uuid) to service_role;

update public.engine_settings
set published_value = '"20260831110000"'::jsonb,
    draft_value = '"20260831110000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

notify pgrst, 'reload schema';

commit;
