-- Business onboarding: decisions must be supplied explicitly.
-- Forward-only schema change: no historical migration or business history is rewritten.
-- Application rows are created at final submission, so selected_plan stays NOT NULL.
begin;

alter table public.salon_applications alter column selected_plan drop default;
alter table public.salon_applications add column business_setup_type text;
alter table public.salon_applications add constraint salon_applications_business_setup_type_check
  check (business_setup_type is null or business_setup_type in (
    'solo_professional','shared_suite_booth','single_location_staffed','multi_location','mobile_on_location'
  ));
comment on column public.salon_applications.business_setup_type is
  'Explicit applicant-selected operating setup. Historical applications may remain null; new submissions require a choice.';
comment on column public.salon_applications.selected_plan is
  'Explicit application plan; no database default. Current new choices are Starter, Growth and Premium.';

-- Covers direct service-role inserts as well as the supported submission RPC.
-- Unrelated edits to historical rows preserve their original values.
create or replace function public.enforce_explicit_application_choices()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op='INSERT' or new.selected_plan is distinct from old.selected_plan then
    if coalesce(new.selected_plan,'') not in ('Starter','Growth','Premium') then
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
revoke all on function public.enforce_explicit_application_choices() from public, anon, authenticated;
create trigger salon_applications_explicit_choices
before insert or update of selected_plan,business_setup_type on public.salon_applications
for each row execute function public.enforce_explicit_application_choices();

-- The existing revision trigger snapshots to_jsonb(NEW), so this structured field
-- is retained automatically in every new revision, archival and deletion record.

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
  if coalesce(p_application_values->>'selected_plan','') not in ('Starter','Growth','Premium') then
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

create or replace function public.admin_update_salon_application_snapshot(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_patch jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_before public.salon_applications%rowtype;
  v_after public.salon_applications%rowtype;
begin
  if not public.active_super_admin(p_actor_user_id) then
    raise exception 'Only a Super Admin can correct a submitted application snapshot.';
  end if;
  if length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'Enter a reason of at least 5 characters.';
  end if;
  select * into v_before from public.salon_applications
  where id=p_application_id for update;
  if not found then raise exception 'Salon application not found.'; end if;
  perform set_config('app.application_change_source','super_admin_snapshot_correction',true);
  perform set_config('app.application_change_reason',trim(p_reason),true);
  update public.salon_applications set
    business_name=case when p_patch ? 'business_name' then coalesce(nullif(trim(p_patch->>'business_name'),''),business_name) else business_name end,
    owner_name=case when p_patch ? 'owner_name' then coalesce(nullif(trim(p_patch->>'owner_name'),''),owner_name) else owner_name end,
    business_email=case when p_patch ? 'business_email' then coalesce(nullif(lower(trim(p_patch->>'business_email')),''),business_email) else business_email end,
    phone=case when p_patch ? 'phone' then coalesce(nullif(trim(p_patch->>'phone'),''),phone) else phone end,
    street_address=case when p_patch ? 'street_address' then coalesce(nullif(trim(p_patch->>'street_address'),''),street_address) else street_address end,
    address_line2=case when p_patch ? 'address_line2' then nullif(trim(p_patch->>'address_line2'),'') else address_line2 end,
    city=case when p_patch ? 'city' then coalesce(nullif(trim(p_patch->>'city'),''),city) else city end,
    state=case when p_patch ? 'state' then coalesce(nullif(upper(trim(p_patch->>'state')),''),state) else state end,
    zip_code=case when p_patch ? 'zip_code' then coalesce(nullif(trim(p_patch->>'zip_code'),''),zip_code) else zip_code end,
    business_type=case when p_patch ? 'business_type' then coalesce(nullif(trim(p_patch->>'business_type'),''),business_type) else business_type end,
    business_setup_type=case when p_patch ? 'business_setup_type' then nullif(trim(p_patch->>'business_setup_type'),'') else business_setup_type end,
    referral_source=case when p_patch ? 'referral_source' then nullif(trim(p_patch->>'referral_source'),'') else referral_source end,
    website_url=case when p_patch ? 'website_url' then nullif(trim(p_patch->>'website_url'),'') else website_url end,
    instagram_url=case when p_patch ? 'instagram_url' then nullif(trim(p_patch->>'instagram_url'),'') else instagram_url end,
    business_license_number=case when p_patch ? 'business_license_number' then nullif(trim(p_patch->>'business_license_number'),'') else business_license_number end,
    cosmetology_license_number=case when p_patch ? 'cosmetology_license_number' then nullif(trim(p_patch->>'cosmetology_license_number'),'') else cosmetology_license_number end,
    years_in_operation=case when p_patch ? 'years_in_operation' then nullif(trim(p_patch->>'years_in_operation'),'')::integer else years_in_operation end,
    stylist_count=case when p_patch ? 'stylist_count' then nullif(trim(p_patch->>'stylist_count'),'')::integer else stylist_count end,
    updated_at=now()
  where id=p_application_id returning * into v_after;
  insert into public.record_management_events(
    record_type,record_id,record_label,action,dependency_summary,
    before_values,after_values,reason,acting_user_id,acting_scope
  ) values (
    'salon_application',p_application_id::text,v_before.business_name,'Updated',
    jsonb_build_object('historical_revision_retained',true),
    to_jsonb(v_before),to_jsonb(v_after),trim(p_reason),p_actor_user_id,'platform_admin'
  );
  return jsonb_build_object('ok',true,'application',to_jsonb(v_after));
end;
$$;

revoke all on function public.submit_salon_application_atomic(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_salon_application_atomic(uuid,jsonb,jsonb) to service_role;
revoke all on function public.admin_update_salon_application_snapshot(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_update_salon_application_snapshot(uuid,uuid,jsonb,text) to service_role;

update public.engine_settings
set published_value='"20260909185351"'::jsonb,
    draft_value='"20260909185351"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';
notify pgrst, 'reload schema';

commit;
