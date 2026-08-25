-- Replace the initial Featured Salon save RPC with an unambiguous version.
-- The preceding migration changes schema/public discovery; this migration
-- prevents PL/pgSQL variable/column collisions in the protected Admin write.

begin;

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
#variable_conflict error
declare
  v_actor public.admin_users%rowtype;
  v_salon public.salons%rowtype;
  v_existing public.featured_salon_campaigns%rowtype;
  v_saved public.featured_salon_campaigns%rowtype;
  v_entitlement public.marketing_entitlements%rowtype;
  v_entitlement_id uuid;
  v_campaign_id uuid;
  v_status text;
  v_basis text;
  v_audit_reason text;
  v_before_values jsonb;
  v_generated_reference text;
begin
  select admin_user.* into v_actor
  from public.admin_users admin_user
  where coalesce(admin_user.user_id, admin_user.id) = p_actor_user_id
    and admin_user.status = 'Active';
  if not found or not (
    coalesce(v_actor.is_super_admin, false)
    or coalesce((v_actor.permissions ->> 'marketing')::boolean, false)
  ) then
    raise exception 'You do not have permission to manage Featured Salon campaigns.';
  end if;

  if p_salon_id is null then raise exception 'Choose an eligible salon.'; end if;
  select salon.* into v_salon from public.salons salon where salon.id = p_salon_id;
  if not found then raise exception 'Salon not found.'; end if;

  v_status := initcap(lower(trim(coalesce(p_requested_status, 'Draft'))));
  if v_status not in ('Draft','Scheduled','Active','Paused','Expired') then
    raise exception 'Choose a valid campaign status.';
  end if;
  v_basis := lower(trim(coalesce(p_placement_basis, 'paid')));
  if v_basis not in ('paid','platform_credit','complimentary_admin') then
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
    select campaign.* into v_existing
    from public.featured_salon_campaigns campaign
    where campaign.id = p_campaign_id
    for update;
    if not found then raise exception 'Campaign not found.'; end if;
    if v_existing.salon_id <> p_salon_id then raise exception 'A campaign salon cannot be replaced.'; end if;
    if v_existing.status = 'Archived' then raise exception 'Restore this campaign before editing it.'; end if;
    v_campaign_id := v_existing.id;
    v_entitlement_id := v_existing.entitlement_id;
    v_before_values := to_jsonb(v_existing);
  end if;

  if v_status in ('Scheduled','Active') then
    if not public.is_marketplace_visible(p_salon_id)
       or v_salon.latitude is null
       or v_salon.longitude is null
       or v_salon.geocode_status <> 'success'
       or coalesce(v_salon.address_needs_review, false) then
      raise exception 'Only active, public salons with a verified location can be featured.';
    end if;
  end if;

  if v_basis = 'complimentary_admin' then
    v_entitlement_id := null;
  elsif v_basis = 'platform_credit' then
    if v_entitlement_id is not null then
      select entitlement.* into v_entitlement
      from public.marketing_entitlements entitlement
      where entitlement.id = v_entitlement_id;
      if not found or v_entitlement.source <> 'platform_credit' then
        v_entitlement_id := null;
      end if;
    end if;
    if v_entitlement_id is null then
      v_generated_reference := 'pc_' || replace(gen_random_uuid()::text, '-', '');
      insert into public.marketing_entitlements(
        placement_type,salon_id,source,external_reference,status,amount_minor,
        currency,valid_from,valid_until,created_by
      ) values (
        'Featured Salon',p_salon_id,'platform_credit',v_generated_reference,
        'Credited',greatest(0,coalesce(p_entitlement_amount_minor,0)),'usd',
        p_starts_at,p_ends_at,p_actor_user_id
      ) returning id into v_entitlement_id;
    else
      update public.marketing_entitlements entitlement
      set status = 'Credited',
          amount_minor = greatest(0,coalesce(p_entitlement_amount_minor,entitlement.amount_minor,0)),
          valid_from = p_starts_at,
          valid_until = p_ends_at,
          updated_at = now()
      where entitlement.id = v_entitlement_id;
    end if;
  else
    if p_entitlement_source is not null or p_entitlement_reference is not null then
      if p_entitlement_source not in ('stripe_payment','verified_invoice')
         or length(trim(coalesce(p_entitlement_reference,''))) < 4 then
        raise exception 'Choose verified Stripe payment or invoice evidence.';
      end if;
      insert into public.marketing_entitlements(
        placement_type,salon_id,source,external_reference,status,amount_minor,
        currency,valid_from,valid_until,created_by
      ) values (
        'Featured Salon',p_salon_id,p_entitlement_source,
        trim(p_entitlement_reference),'Paid',p_entitlement_amount_minor,'usd',
        p_starts_at,p_ends_at,p_actor_user_id
      )
      on conflict (source,external_reference) do update
      set updated_at = now()
      returning id into v_entitlement_id;
    end if;
    if v_status in ('Scheduled','Active') and (
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

  if v_status in ('Scheduled','Active') then
    if p_starts_at > now() then v_status := 'Scheduled';
    elsif p_ends_at is not null and p_ends_at <= now() then v_status := 'Expired';
    else v_status := 'Active';
    end if;
  end if;

  if p_campaign_id is null then
    insert into public.featured_salon_campaigns(
      salon_id,entitlement_id,placement_basis,complimentary_reason,
      complimentary_approved_by,complimentary_approved_at,status,starts_at,
      ends_at,timezone,radius_miles,priority,rotation_weight,internal_note,
      archived_at,created_by,updated_by
    ) values (
      p_salon_id,v_entitlement_id,v_basis,null,
      case when v_basis='complimentary_admin' then p_actor_user_id else null end,
      case when v_basis='complimentary_admin' then now() else null end,
      v_status,p_starts_at,p_ends_at,
      coalesce(nullif(trim(p_timezone),''),'America/New_York'),p_radius_miles,
      p_priority,p_rotation_weight,nullif(trim(coalesce(p_internal_note,'')),''),
      null,p_actor_user_id,p_actor_user_id
    ) returning * into v_saved;
    v_campaign_id := v_saved.id;
  else
    update public.featured_salon_campaigns campaign
    set entitlement_id = v_entitlement_id,
        placement_basis = v_basis,
        complimentary_reason = null,
        complimentary_approved_by = case when v_basis='complimentary_admin' then p_actor_user_id else null end,
        complimentary_approved_at = case when v_basis='complimentary_admin' then now() else null end,
        status = v_status,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        timezone = coalesce(nullif(trim(p_timezone),''),'America/New_York'),
        radius_miles = p_radius_miles,
        priority = p_priority,
        rotation_weight = p_rotation_weight,
        internal_note = nullif(trim(coalesce(p_internal_note,'')),''),
        archived_at = null,
        updated_by = p_actor_user_id,
        updated_at = now()
    where campaign.id = v_campaign_id
    returning campaign.* into v_saved;
  end if;

  v_audit_reason := coalesce(
    nullif(trim(coalesce(p_optional_note,'')),''),
    case v_basis
      when 'platform_credit' then 'Platform credit selected by Platform Admin.'
      when 'complimentary_admin' then 'Complimentary placement authorized by Platform Admin.'
      else 'Verified paid placement saved by Platform Admin.'
    end
  );
  insert into public.featured_campaign_audit(
    campaign_id,campaign_id_snapshot,salon_id_snapshot,salon_name_snapshot,
    placement_basis_snapshot,action,previous_values,new_values,reason,acting_admin_id
  ) values (
    v_campaign_id,v_campaign_id,p_salon_id,v_salon.name,v_basis,
    case
      when p_campaign_id is null then 'Created'
      when v_existing.status <> v_saved.status then v_existing.status || ' → ' || v_saved.status
      else 'Edited'
    end,
    v_before_values,to_jsonb(v_saved),v_audit_reason,p_actor_user_id
  );
  return v_campaign_id;
end
$$;

revoke all on function public.admin_save_featured_campaign_v2(
  uuid,uuid,uuid,text,timestamptz,timestamptz,text,numeric,integer,numeric,text,text,text,text,integer,text
) from public,anon,authenticated;
grant execute on function public.admin_save_featured_campaign_v2(
  uuid,uuid,uuid,text,timestamptz,timestamptz,text,numeric,integer,numeric,text,text,text,text,integer,text
) to service_role;

update public.engine_settings
set published_value='"20260825141000"'::jsonb,
    draft_value='"20260825141000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';

commit;