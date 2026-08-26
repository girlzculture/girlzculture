-- Focused Featured Salon campaign controls for the final launch pass.
-- Campaign presentation, funding evidence, lifecycle, deletion evidence, and
-- indefinite placement are managed atomically without fabricating payments.

begin;

alter table public.featured_salon_campaigns
  alter column ends_at drop not null,
  add column if not exists archived_at timestamptz;

alter table public.featured_salon_campaigns
  drop constraint if exists featured_salon_campaigns_status_check,
  drop constraint if exists featured_salon_campaigns_check,
  drop constraint if exists featured_campaign_window_check,
  drop constraint if exists featured_campaign_placement_basis_check,
  drop constraint if exists featured_campaign_complimentary_evidence_check,
  drop constraint if exists featured_campaigns_no_overlap;

alter table public.featured_salon_campaigns
  add constraint featured_salon_campaigns_status_check
    check (status in ('Draft','Scheduled','Active','Paused','Expired','Archived')),
  add constraint featured_campaign_window_check
    check (ends_at is null or ends_at > starts_at),
  add constraint featured_campaign_placement_basis_check
    check (placement_basis in ('paid','platform_credit','complimentary_admin')),
  add constraint featured_campaign_complimentary_evidence_check
    check (
      placement_basis <> 'complimentary_admin'
      or (complimentary_approved_by is not null and complimentary_approved_at is not null)
    );

alter table public.featured_salon_campaigns
  add constraint featured_campaigns_no_overlap
    exclude using gist (
      salon_id with =,
      tstzrange(starts_at, coalesce(ends_at, 'infinity'::timestamptz), '[)') with &&
    )
    where (status in ('Scheduled','Active','Paused'));

alter table public.featured_campaign_audit
  add column if not exists campaign_id_snapshot uuid,
  add column if not exists salon_id_snapshot uuid,
  add column if not exists salon_name_snapshot text,
  add column if not exists placement_basis_snapshot text,
  add column if not exists deleted_at timestamptz;

update public.featured_campaign_audit audit
set campaign_id_snapshot = coalesce(audit.campaign_id_snapshot, audit.campaign_id),
    salon_id_snapshot = coalesce(
      audit.salon_id_snapshot,
      campaign.salon_id,
      nullif(audit.new_values ->> 'salon_id', '')::uuid,
      nullif(audit.previous_values ->> 'salon_id', '')::uuid
    ),
    placement_basis_snapshot = coalesce(
      audit.placement_basis_snapshot,
      campaign.placement_basis,
      audit.new_values ->> 'placement_basis',
      audit.previous_values ->> 'placement_basis'
    )
from public.featured_salon_campaigns campaign
where campaign.id = audit.campaign_id;

-- The audit keeps the campaign UUID as evidence after a Super Admin deletes the
-- operational campaign. A restrictive foreign key would prevent that cleanup.
alter table public.featured_campaign_audit
  drop constraint if exists featured_campaign_audit_campaign_id_fkey;

create or replace function public.admin_save_featured_campaign_v2(
  p_actor_user_id uuid,
  p_campaign_id uuid,
  p_salon_id uuid,
  p_requested_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_radius_miles numeric,
  p_priority integer,
  p_rotation_weight numeric,
  p_internal_note text,
  p_placement_basis text,
  p_entitlement_source text,
  p_entitlement_reference text,
  p_entitlement_amount_minor integer,
  p_optional_note text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor public.admin_users%rowtype;
  salon_row public.salons%rowtype;
  existing public.featured_salon_campaigns%rowtype;
  saved public.featured_salon_campaigns%rowtype;
  entitlement_row public.marketing_entitlements%rowtype;
  v_entitlement_id uuid;
  campaign_id uuid;
  normalized_status text;
  normalized_basis text;
  audit_reason text;
  before_values jsonb;
  generated_reference text;
begin
  select * into actor
  from public.admin_users admin_user
  where coalesce(admin_user.user_id, admin_user.id) = p_actor_user_id
    and admin_user.status = 'Active';
  if not found or not (
    coalesce(actor.is_super_admin, false)
    or coalesce((actor.permissions ->> 'marketing')::boolean, false)
  ) then
    raise exception 'You do not have permission to manage Featured Salon campaigns.';
  end if;

  if p_salon_id is null then raise exception 'Choose an eligible salon.'; end if;
  select * into salon_row from public.salons where id = p_salon_id;
  if not found then raise exception 'Salon not found.'; end if;

  normalized_status := initcap(lower(trim(coalesce(p_requested_status, 'Draft'))));
  if normalized_status not in ('Draft','Scheduled','Active','Paused','Expired') then
    raise exception 'Choose a valid campaign status.';
  end if;
  normalized_basis := lower(trim(coalesce(p_placement_basis, 'paid')));
  if normalized_basis not in ('paid','platform_credit','complimentary_admin') then
    raise exception 'Choose Stripe payment, verified invoice, platform credit, or complimentary Admin placement.';
  end if;
  if p_starts_at is null then raise exception 'Choose the campaign start time.'; end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Campaign end time must be after its start time.';
  end if;
  if p_radius_miles not between 1 and 250 then raise exception 'Choose a radius between 1 and 250 miles.'; end if;
  if p_priority not between 0 and 100 then raise exception 'Choose a priority between 0 and 100.'; end if;
  if p_rotation_weight not between 0.1 and 100 then raise exception 'Choose a rotation weight between 0.1 and 100.'; end if;

  if p_campaign_id is not null then
    select * into existing
    from public.featured_salon_campaigns
    where id = p_campaign_id
    for update;
    if not found then raise exception 'Campaign not found.'; end if;
    if existing.salon_id <> p_salon_id then raise exception 'A campaign salon cannot be replaced.'; end if;
    if existing.status = 'Archived' then raise exception 'Restore this campaign before editing it.'; end if;
    campaign_id := existing.id;
    v_entitlement_id := existing.entitlement_id;
    before_values := to_jsonb(existing);
  end if;

  if normalized_status in ('Scheduled','Active') then
    if not public.is_marketplace_visible(p_salon_id)
       or salon_row.latitude is null
       or salon_row.longitude is null
       or salon_row.geocode_status <> 'success'
       or coalesce(salon_row.address_needs_review, false) then
      raise exception 'Only active, public salons with a verified location can be featured.';
    end if;
  end if;

  if normalized_basis = 'complimentary_admin' then
    v_entitlement_id := null;
  elsif normalized_basis = 'platform_credit' then
    if v_entitlement_id is not null then
      select * into entitlement_row
      from public.marketing_entitlements
      where id = v_entitlement_id;
      if not found or entitlement_row.source <> 'platform_credit' then v_entitlement_id := null; end if;
    end if;
    if v_entitlement_id is null then
      generated_reference := 'pc_' || replace(gen_random_uuid()::text, '-', '');
      insert into public.marketing_entitlements(
        placement_type,
        salon_id,
        source,
        external_reference,
        status,
        amount_minor,
        currency,
        valid_from,
        valid_until,
        created_by
      ) values (
        'Featured Salon',
        p_salon_id,
        'platform_credit',
        generated_reference,
        'Credited',
        greatest(0, coalesce(p_entitlement_amount_minor, 0)),
        'usd',
        p_starts_at,
        p_ends_at,
        p_actor_user_id
      ) returning id into v_entitlement_id;
    else
      update public.marketing_entitlements
      set status = 'Credited',
          amount_minor = greatest(0, coalesce(p_entitlement_amount_minor, amount_minor, 0)),
          valid_from = p_starts_at,
          valid_until = p_ends_at,
          updated_at = now()
      where id = v_entitlement_id;
    end if;
  else
    if p_entitlement_source is not null or p_entitlement_reference is not null then
      if p_entitlement_source not in ('stripe_payment','verified_invoice')
         or length(trim(coalesce(p_entitlement_reference, ''))) < 4 then
        raise exception 'Choose verified Stripe payment or invoice evidence.';
      end if;
      insert into public.marketing_entitlements(
        placement_type,
        salon_id,
        source,
        external_reference,
        status,
        amount_minor,
        currency,
        valid_from,
        valid_until,
        created_by
      ) values (
        'Featured Salon',
        p_salon_id,
        p_entitlement_source,
        trim(p_entitlement_reference),
        'Paid',
        p_entitlement_amount_minor,
        'usd',
        p_starts_at,
        p_ends_at,
        p_actor_user_id
      )
      on conflict (source, external_reference) do update
      set updated_at = now()
      returning id into v_entitlement_id;
    end if;
    if normalized_status in ('Scheduled','Active') and (
      v_entitlement_id is null
      or not exists (
        select 1
        from public.marketing_entitlements entitlement
        where entitlement.id = v_entitlement_id
          and entitlement.salon_id = p_salon_id
          and entitlement.placement_type = 'Featured Salon'
          and entitlement.source in ('stripe_payment','verified_invoice')
          and entitlement.status = 'Paid'
          and entitlement.valid_from <= p_starts_at
          and (
            p_ends_at is null and entitlement.valid_until is null
            or p_ends_at is not null and (entitlement.valid_until is null or entitlement.valid_until >= p_ends_at)
          )
      )
    ) then
      raise exception 'Verified Stripe payment or invoice evidence covering the campaign is required.';
    end if;
  end if;

  if normalized_status in ('Scheduled','Active') then
    if p_starts_at > now() then normalized_status := 'Scheduled';
    elsif p_ends_at is not null and p_ends_at <= now() then normalized_status := 'Expired';
    else normalized_status := 'Active';
    end if;
  end if;

  if p_campaign_id is null then
    insert into public.featured_salon_campaigns(
      salon_id,
      entitlement_id,
      placement_basis,
      complimentary_reason,
      complimentary_approved_by,
      complimentary_approved_at,
      status,
      starts_at,
      ends_at,
      timezone,
      radius_miles,
      priority,
      rotation_weight,
      internal_note,
      archived_at,
      created_by,
      updated_by
    ) values (
      p_salon_id,
      v_entitlement_id,
      normalized_basis,
      case when normalized_basis = 'complimentary_admin' then null else null end,
      case when normalized_basis = 'complimentary_admin' then p_actor_user_id else null end,
      case when normalized_basis = 'complimentary_admin' then now() else null end,
      normalized_status,
      p_starts_at,
      p_ends_at,
      coalesce(nullif(trim(p_timezone), ''), 'America/New_York'),
      p_radius_miles,
      p_priority,
      p_rotation_weight,
      nullif(trim(coalesce(p_internal_note, '')), ''),
      null,
      p_actor_user_id,
      p_actor_user_id
    ) returning * into saved;
    campaign_id := saved.id;
  else
    update public.featured_salon_campaigns
    set entitlement_id = v_entitlement_id,
        placement_basis = normalized_basis,
        complimentary_reason = null,
        complimentary_approved_by = case when normalized_basis = 'complimentary_admin' then p_actor_user_id else null end,
        complimentary_approved_at = case when normalized_basis = 'complimentary_admin' then now() else null end,
        status = normalized_status,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        timezone = coalesce(nullif(trim(p_timezone), ''), 'America/New_York'),
        radius_miles = p_radius_miles,
        priority = p_priority,
        rotation_weight = p_rotation_weight,
        internal_note = nullif(trim(coalesce(p_internal_note, '')), ''),
        archived_at = null,
        updated_by = p_actor_user_id,
        updated_at = now()
    where id = campaign_id
    returning * into saved;
  end if;

  audit_reason := coalesce(
    nullif(trim(coalesce(p_optional_note, '')), ''),
    case normalized_basis
      when 'platform_credit' then 'Platform credit selected by Platform Admin.'
      when 'complimentary_admin' then 'Complimentary placement authorized by Platform Admin.'
      else 'Verified paid placement saved by Platform Admin.'
    end
  );
  insert into public.featured_campaign_audit(
    campaign_id,
    campaign_id_snapshot,
    salon_id_snapshot,
    salon_name_snapshot,
    placement_basis_snapshot,
    action,
    previous_values,
    new_values,
    reason,
    acting_admin_id
  ) values (
    campaign_id,
    campaign_id,
    p_salon_id,
    salon_row.name,
    normalized_basis,
    case when p_campaign_id is null then 'Created' when existing.status <> saved.status then existing.status || ' → ' || saved.status else 'Edited' end,
    before_values,
    to_jsonb(saved),
    audit_reason,
    p_actor_user_id
  );
  return campaign_id;
end
$$;

revoke all on function public.admin_save_featured_campaign_v2(
  uuid,uuid,uuid,text,timestamptz,timestamptz,text,numeric,integer,numeric,text,text,text,text,integer,text
) from public, anon, authenticated;
grant execute on function public.admin_save_featured_campaign_v2(
  uuid,uuid,uuid,text,timestamptz,timestamptz,text,numeric,integer,numeric,text,text,text,text,integer,text
) to service_role;

create or replace function public.admin_manage_featured_campaign(
  p_actor_user_id uuid,
  p_campaign_id uuid,
  p_action text,
  p_optional_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor public.admin_users%rowtype;
  campaign public.featured_salon_campaigns%rowtype;
  salon_name text;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  result jsonb;
begin
  select * into actor
  from public.admin_users admin_user
  where coalesce(admin_user.user_id, admin_user.id) = p_actor_user_id
    and admin_user.status = 'Active';
  if not found or not (
    coalesce(actor.is_super_admin, false)
    or coalesce((actor.permissions ->> 'marketing')::boolean, false)
  ) then raise exception 'You do not have permission to manage this campaign.'; end if;

  select * into campaign
  from public.featured_salon_campaigns
  where id = p_campaign_id
  for update;
  if not found then raise exception 'Campaign not found.'; end if;
  select name into salon_name from public.salons where id = campaign.salon_id;

  if normalized_action = 'archive' then
    if campaign.status = 'Archived' then return to_jsonb(campaign); end if;
    update public.featured_salon_campaigns
    set status = 'Archived', archived_at = now(), updated_by = p_actor_user_id, updated_at = now()
    where id = campaign.id returning to_jsonb(featured_salon_campaigns.*) into result;
    insert into public.featured_campaign_audit(
      campaign_id,campaign_id_snapshot,salon_id_snapshot,salon_name_snapshot,placement_basis_snapshot,
      action,previous_values,new_values,reason,acting_admin_id
    ) values (
      campaign.id,campaign.id,campaign.salon_id,salon_name,campaign.placement_basis,
      'Archived',to_jsonb(campaign),result,
      coalesce(nullif(trim(coalesce(p_optional_note,'')),''),'Archived by Platform Admin.'),p_actor_user_id
    );
    return result;
  elsif normalized_action = 'restore' then
    if campaign.status <> 'Archived' then raise exception 'Only archived campaigns can be restored.'; end if;
    update public.featured_salon_campaigns
    set status = 'Draft', archived_at = null, updated_by = p_actor_user_id, updated_at = now()
    where id = campaign.id returning to_jsonb(featured_salon_campaigns.*) into result;
    insert into public.featured_campaign_audit(
      campaign_id,campaign_id_snapshot,salon_id_snapshot,salon_name_snapshot,placement_basis_snapshot,
      action,previous_values,new_values,reason,acting_admin_id
    ) values (
      campaign.id,campaign.id,campaign.salon_id,salon_name,campaign.placement_basis,
      'Restored',to_jsonb(campaign),result,
      coalesce(nullif(trim(coalesce(p_optional_note,'')),''),'Restored as draft by Platform Admin.'),p_actor_user_id
    );
    return result;
  elsif normalized_action = 'delete' then
    if not coalesce(actor.is_super_admin, false) then
      raise exception 'Only a Super Admin can permanently delete a campaign.';
    end if;
    insert into public.featured_campaign_audit(
      campaign_id,campaign_id_snapshot,salon_id_snapshot,salon_name_snapshot,placement_basis_snapshot,
      action,previous_values,new_values,reason,acting_admin_id,deleted_at
    ) values (
      campaign.id,campaign.id,campaign.salon_id,salon_name,campaign.placement_basis,
      'Deleted',to_jsonb(campaign),null,
      coalesce(nullif(trim(coalesce(p_optional_note,'')),''),'Permanently removed from operational campaign records by Super Admin.'),
      p_actor_user_id,now()
    );
    delete from public.featured_salon_campaigns where id = campaign.id;
    return jsonb_build_object('deleted', true, 'campaign_id', campaign.id);
  end if;
  raise exception 'Choose archive, restore, or delete.';
end
$$;

revoke all on function public.admin_manage_featured_campaign(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_manage_featured_campaign(uuid,uuid,text,text)
  to service_role;

create or replace function public.expire_featured_campaigns()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare changed integer;
begin
  with activated as (
    update public.featured_salon_campaigns
    set status = 'Active', updated_at = now()
    where status = 'Scheduled'
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
    returning id,updated_by
  ), activation_audit as (
    insert into public.featured_campaign_audit(
      campaign_id,campaign_id_snapshot,action,new_values,reason,acting_admin_id
    )
    select id,id,'Scheduled → Active',jsonb_build_object('status','Active','updated_at',now()),'Campaign start time reached.',updated_by
    from activated
  ), expired as (
    update public.featured_salon_campaigns
    set status = 'Expired', updated_at = now()
    where status in ('Scheduled','Active','Paused')
      and ends_at is not null
      and ends_at <= now()
    returning id,updated_by
  ), expiration_audit as (
    insert into public.featured_campaign_audit(
      campaign_id,campaign_id_snapshot,action,new_values,reason,acting_admin_id
    )
    select id,id,'Expired',jsonb_build_object('status','Expired','updated_at',now()),'Campaign end time reached.',updated_by
    from expired
  )
  select (select count(*) from activated) + (select count(*) from expired) into changed;
  return changed;
end
$$;

create or replace function public.discover_featured_salons(
  origin_latitude double precision,
  origin_longitude double precision,
  request_radius_miles double precision default 25,
  rotation_seed text default null,
  result_limit integer default 12,
  result_offset integer default 0
)
returns table(
  id uuid,name text,slug text,address_city text,address_state text,borough text,cover_photo_url text,
  verification_status text,rating_overall numeric,review_count integer,latitude double precision,longitude double precision,
  starting_price numeric,services jsonb,distance_miles double precision,total_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with eligible as (
    select s.id,s.name,s.slug,s.address_city,s.address_state,s.borough,s.cover_photo_url,s.verification_status,
      coalesce(s.rating_overall,0)::numeric rating_overall,coalesce(s.review_count,0)::integer review_count,s.latitude,s.longitude,
      campaign.id campaign_id,campaign.priority,campaign.rotation_weight,campaign.radius_miles,
      public.distance_miles(origin_latitude,origin_longitude,s.latitude,s.longitude) distance_miles,
      (select min(style.price_display_min) from public.styles style where style.salon_id=s.id and style.archived_at is null) starting_price,
      coalesce((select jsonb_agg(jsonb_build_object('id',style.id,'name',style.name) order by style.name) from public.styles style where style.salon_id=s.id and style.archived_at is null),'[]'::jsonb) services
    from public.featured_salon_campaigns campaign
    left join public.marketing_entitlements entitlement
      on entitlement.id=campaign.entitlement_id and entitlement.salon_id=campaign.salon_id
    join public.salons s on s.id=campaign.salon_id
    where origin_latitude between -90 and 90
      and origin_longitude between -180 and 180
      and campaign.status in ('Active','Scheduled')
      and campaign.starts_at<=now()
      and (campaign.ends_at is null or campaign.ends_at>now())
      and (
        campaign.placement_basis='complimentary_admin'
        and campaign.complimentary_approved_by is not null
        or campaign.placement_basis in ('paid','platform_credit')
        and entitlement.placement_type='Featured Salon'
        and entitlement.status in ('Paid','Credited')
        and entitlement.valid_from<=now()
        and (entitlement.valid_until is null or entitlement.valid_until>now())
      )
      and public.is_marketplace_visible(s.id)
      and s.geocode_status='success'
      and coalesce(s.address_needs_review,false)=false
      and s.latitude is not null
      and s.longitude is not null
  ), local as (
    select *,
      (abs(hashtext(campaign_id::text||coalesce(rotation_seed,to_char(now(),'YYYY-MM-DD-HH24')))::bigint)/greatest(rotation_weight,0.1)) rotation_score
    from eligible
    where distance_miles<=least(greatest(1,least(250,request_radius_miles)),radius_miles)
  ), ordered as (
    select *,count(*) over() total_count
    from local
    order by floor(distance_miles/5.0),priority desc,rotation_score,distance_miles,id
  )
  select ordered.id,ordered.name,ordered.slug,ordered.address_city,ordered.address_state,ordered.borough,ordered.cover_photo_url,
    ordered.verification_status,ordered.rating_overall,ordered.review_count,ordered.latitude,ordered.longitude,
    ordered.starting_price,ordered.services,ordered.distance_miles,ordered.total_count
  from ordered
  limit greatest(1,least(50,result_limit)) offset greatest(0,result_offset)
$$;

-- The earlier promotion migration defines this function with a different
-- RETURNS TABLE shape. PostgreSQL cannot replace an existing function when
-- only its OUT columns change, so drop that exact signature before recreating
-- it transactionally below.
drop function if exists public.resolve_homepage_promotion_target(text, uuid);

create or replace function public.resolve_homepage_promotion_target(
  p_target_type text,
  p_target_id uuid
)
returns table(
  target_type text,target_id uuid,salon_id uuid,campaign_id uuid,
  salon_name text,salon_slug text,cover_photo_url text,address_city text,address_state text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select 'salon'::text,salon.id,salon.id,null::uuid,salon.name,salon.slug,salon.cover_photo_url,salon.address_city,salon.address_state
  from public.salons salon
  where lower(trim(p_target_type))='salon'
    and salon.id=p_target_id
    and salon.slug is not null
    and public.is_marketplace_visible(salon.id)
  union all
  select 'campaign'::text,campaign.id,salon.id,campaign.id,salon.name,salon.slug,salon.cover_photo_url,salon.address_city,salon.address_state
  from public.featured_salon_campaigns campaign
  left join public.marketing_entitlements entitlement
    on entitlement.id=campaign.entitlement_id and entitlement.salon_id=campaign.salon_id
  join public.salons salon on salon.id=campaign.salon_id
  where lower(trim(p_target_type))='campaign'
    and campaign.id=p_target_id
    and campaign.status in ('Active','Scheduled')
    and campaign.starts_at<=now()
    and (campaign.ends_at is null or campaign.ends_at>now())
    and (
      campaign.placement_basis='complimentary_admin'
      and campaign.complimentary_approved_by is not null
      or campaign.placement_basis in ('paid','platform_credit')
      and entitlement.placement_type='Featured Salon'
      and entitlement.status in ('Paid','Credited')
      and entitlement.valid_from<=now()
      and (entitlement.valid_until is null or entitlement.valid_until>now())
    )
    and salon.slug is not null
    and public.is_marketplace_visible(salon.id)
  limit 1
$$;

revoke all on function public.discover_featured_salons(double precision,double precision,double precision,text,integer,integer) from public;
grant execute on function public.discover_featured_salons(double precision,double precision,double precision,text,integer,integer) to anon,authenticated,service_role;
revoke all on function public.resolve_homepage_promotion_target(text,uuid) from public;
grant execute on function public.resolve_homepage_promotion_target(text,uuid) to anon,authenticated,service_role;

update public.engine_settings
set published_value='"20260825140000"'::jsonb,
    draft_value='"20260825140000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst, 'reload schema';

commit;