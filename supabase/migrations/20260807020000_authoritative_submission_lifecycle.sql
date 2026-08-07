-- Authoritative salon-application lifecycle, Super Admin record authority,
-- tab-safe follow-up foundations, description limits, and actionable badges.

begin;

alter table public.salon_applications
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists salon_applications_active_submitted_idx
  on public.salon_applications(submitted_at desc, id)
  where archived_at is null;
create index if not exists salon_applications_archived_submitted_idx
  on public.salon_applications(archived_at desc, submitted_at desc, id)
  where archived_at is not null;
create index if not exists salon_applications_salon_idx
  on public.salon_applications(salon_id, submitted_at desc);

-- Every version is retained independently of the mutable current row. The
-- application UUID intentionally has no foreign key so Super Admin deletion can
-- remove the operational record without erasing the historical evidence.
create table if not exists public.salon_application_revisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  salon_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  snapshot jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  change_source text not null default 'system',
  reason text,
  created_at timestamptz not null default now(),
  unique(application_id, revision_number)
);
create index if not exists salon_application_revisions_application_idx
  on public.salon_application_revisions(application_id, revision_number desc);
create index if not exists salon_application_revisions_salon_idx
  on public.salon_application_revisions(salon_id, created_at desc);

alter table public.salon_application_revisions enable row level security;
drop policy if exists salon_application_revisions_admin_read
  on public.salon_application_revisions;
create policy salon_application_revisions_admin_read
  on public.salon_application_revisions for select to authenticated
  using (public.admin_has_permission('submissions'));
revoke all on public.salon_application_revisions from public, anon, authenticated;
grant select on public.salon_application_revisions to authenticated;
grant all on public.salon_application_revisions to service_role;

create or replace function public.prevent_salon_application_revision_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Salon application revisions are immutable.' using errcode='42501';
end;
$$;
drop trigger if exists salon_application_revisions_immutable
  on public.salon_application_revisions;
create trigger salon_application_revisions_immutable
before update or delete on public.salon_application_revisions
for each row execute function public.prevent_salon_application_revision_mutation();

insert into public.salon_application_revisions(
  application_id, salon_id, revision_number, snapshot,
  changed_by, change_source, reason, created_at
)
select application.id, application.salon_id, 1, to_jsonb(application),
       application.reviewed_by, 'migration', 'Initial retained application snapshot',
       application.submitted_at
from public.salon_applications application
on conflict(application_id, revision_number) do nothing;

create or replace function public.capture_salon_application_revision()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_revision integer;
  v_source text;
  v_reason text;
begin
  select coalesce(max(revision.revision_number), 0) + 1
  into v_revision
  from public.salon_application_revisions revision
  where revision.application_id = new.id;
  v_source := coalesce(nullif(current_setting('app.application_change_source', true), ''),
                       case when auth.uid() is null then 'service' else 'authenticated' end);
  v_reason := nullif(current_setting('app.application_change_reason', true), '');
  insert into public.salon_application_revisions(
    application_id, salon_id, revision_number, snapshot,
    changed_by, change_source, reason
  ) values (
    new.id, new.salon_id, v_revision, to_jsonb(new),
    auth.uid(), v_source, v_reason
  );
  return new;
end;
$$;
drop trigger if exists salon_applications_capture_revision
  on public.salon_applications;
create trigger salon_applications_capture_revision
after insert or update on public.salon_applications
for each row execute function public.capture_salon_application_revision();

-- Record-management events distinguish Restore from a generic update.
alter table public.record_management_events
  drop constraint if exists record_management_events_action_check;
alter table public.record_management_events
  add constraint record_management_events_action_check
  check (action in (
    'Created','Updated','Archived','Restored','Reassigned','Deleted',
    'Cancelled','Offboarded','Anonymized'
  ));

create or replace function public.active_admin_can_manage_submissions(p_actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.admin_users admin_user
    where coalesce(admin_user.user_id, admin_user.id) = p_actor_user_id
      and admin_user.status = 'Active'
      and (
        coalesce(admin_user.is_super_admin, false)
        or coalesce((admin_user.permissions ->> 'submissions')::boolean, false)
      )
  )
$$;
revoke all on function public.active_admin_can_manage_submissions(uuid)
  from public, anon, authenticated;
grant execute on function public.active_admin_can_manage_submissions(uuid)
  to service_role;

create or replace function public.active_super_admin(p_actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.admin_users admin_user
    where coalesce(admin_user.user_id, admin_user.id) = p_actor_user_id
      and admin_user.status = 'Active'
      and coalesce(admin_user.is_super_admin, false)
  )
$$;
revoke all on function public.active_super_admin(uuid)
  from public, anon, authenticated;
grant execute on function public.active_super_admin(uuid)
  to service_role;

create or replace function public.admin_archive_salon_application(
  p_application_id uuid,
  p_actor_user_id uuid,
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
  if not public.active_admin_can_manage_submissions(p_actor_user_id) then
    raise exception 'You do not have permission to archive salon applications.';
  end if;
  if length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'Enter a reason of at least 5 characters.';
  end if;
  select * into v_before from public.salon_applications
  where id=p_application_id for update;
  if not found then raise exception 'Salon application not found.'; end if;
  if v_before.archived_at is not null then
    return jsonb_build_object('ok',true,'changed',false,'action','archive');
  end if;
  perform set_config('app.application_change_source','platform_admin_archive',true);
  perform set_config('app.application_change_reason',trim(p_reason),true);
  update public.salon_applications
  set archived_at=now(), archived_by=p_actor_user_id,
      archive_reason=trim(p_reason), updated_at=now()
  where id=p_application_id returning * into v_after;
  insert into public.record_management_events(
    record_type,record_id,record_label,action,dependency_summary,
    before_values,after_values,reason,acting_user_id,acting_scope
  ) values (
    'salon_application',p_application_id::text,v_before.business_name,'Archived',
    jsonb_build_object('salon_id',v_before.salon_id,'salon_lifecycle_changed',false),
    to_jsonb(v_before),to_jsonb(v_after),trim(p_reason),p_actor_user_id,'platform_admin'
  );
  return jsonb_build_object('ok',true,'changed',true,'action','archive','application',to_jsonb(v_after));
end;
$$;

create or replace function public.admin_restore_salon_application(
  p_application_id uuid,
  p_actor_user_id uuid,
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
  if not public.active_admin_can_manage_submissions(p_actor_user_id) then
    raise exception 'You do not have permission to restore salon applications.';
  end if;
  if length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'Enter a reason of at least 5 characters.';
  end if;
  select * into v_before from public.salon_applications
  where id=p_application_id for update;
  if not found then raise exception 'Salon application not found.'; end if;
  if v_before.archived_at is null then
    return jsonb_build_object('ok',true,'changed',false,'action','restore');
  end if;
  perform set_config('app.application_change_source','platform_admin_restore',true);
  perform set_config('app.application_change_reason',trim(p_reason),true);
  update public.salon_applications
  set archived_at=null, archived_by=null, archive_reason=null,
      updated_at=now()
  where id=p_application_id returning * into v_after;
  insert into public.record_management_events(
    record_type,record_id,record_label,action,dependency_summary,
    before_values,after_values,reason,acting_user_id,acting_scope
  ) values (
    'salon_application',p_application_id::text,v_before.business_name,'Restored',
    jsonb_build_object('salon_id',v_before.salon_id,'salon_lifecycle_changed',false),
    to_jsonb(v_before),to_jsonb(v_after),trim(p_reason),p_actor_user_id,'platform_admin'
  );
  return jsonb_build_object('ok',true,'changed',true,'action','restore','application',to_jsonb(v_after));
end;
$$;

-- Operational salon data is the present-day source of truth. Updating it from
-- Submissions never resets status, publication, subscription, billing, or plan.
create or replace function public.admin_update_submission_current_salon(
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
  v_application public.salon_applications%rowtype;
  v_before public.salons%rowtype;
  v_after public.salons%rowtype;
begin
  if not public.active_admin_can_manage_submissions(p_actor_user_id) then
    raise exception 'You do not have permission to edit this salon record.';
  end if;
  if length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'Enter a reason of at least 5 characters.';
  end if;
  select * into v_application from public.salon_applications
  where id=p_application_id;
  if not found then raise exception 'Salon application not found.'; end if;
  select * into v_before from public.salons
  where id=v_application.salon_id for update;
  if not found then raise exception 'Current salon record not found.'; end if;

  update public.salons set
    name=case when p_patch ? 'name' then coalesce(nullif(trim(p_patch->>'name'),''),name) else name end,
    owner_name=case when p_patch ? 'owner_name' then nullif(trim(p_patch->>'owner_name'),'') else owner_name end,
    email=case when p_patch ? 'email' then nullif(lower(trim(p_patch->>'email')),'') else email end,
    phone=case when p_patch ? 'phone' then nullif(trim(p_patch->>'phone'),'') else phone end,
    address_street=case when p_patch ? 'address_street' then nullif(trim(p_patch->>'address_street'),'') else address_street end,
    address_line2=case when p_patch ? 'address_line2' then nullif(trim(p_patch->>'address_line2'),'') else address_line2 end,
    address_city=case when p_patch ? 'address_city' then nullif(trim(p_patch->>'address_city'),'') else address_city end,
    address_state=case when p_patch ? 'address_state' then nullif(upper(trim(p_patch->>'address_state')),'') else address_state end,
    address_zip=case when p_patch ? 'address_zip' then nullif(trim(p_patch->>'address_zip'),'') else address_zip end,
    business_type=case when p_patch ? 'business_type' then nullif(trim(p_patch->>'business_type'),'') else business_type end
  where id=v_application.salon_id returning * into v_after;

  insert into public.record_management_events(
    record_type,record_id,record_label,action,dependency_summary,
    before_values,after_values,reason,acting_user_id,acting_scope
  ) values (
    'salon',v_before.id::text,v_before.name,'Updated',
    jsonb_build_object('source_application_id',p_application_id,'subscription_preserved',true,'lifecycle_preserved',true),
    to_jsonb(v_before),to_jsonb(v_after),trim(p_reason),p_actor_user_id,'platform_admin'
  );
  return jsonb_build_object('ok',true,'salon',to_jsonb(v_after));
end;
$$;

-- Super Admin may correct the retained snapshot. The previous snapshot remains
-- immutable in salon_application_revisions, so a correction never erases history.
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

create or replace function public.admin_reject_salon_application_atomic(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_application public.salon_applications%rowtype;
  v_after public.salon_applications%rowtype;
begin
  if not public.active_admin_can_manage_submissions(p_actor_user_id) then
    raise exception 'You do not have permission to reject salon applications.';
  end if;
  if length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'Enter a rejection reason of at least 5 characters.';
  end if;
  select * into v_application from public.salon_applications
  where id=p_application_id for update;
  if not found then raise exception 'Salon application not found.'; end if;
  if v_application.archived_at is not null then
    raise exception 'Restore this application before making a decision.';
  end if;
  if v_application.status='Rejected' and v_application.rejection_reason=trim(p_reason) then
    return jsonb_build_object('ok',true,'changed',false,'status','Rejected');
  end if;
  perform public.admin_change_salon_status(
    p_actor_user_id, v_application.salon_id, 'Offboarded', trim(p_reason)
  );
  perform set_config('app.application_change_source','platform_admin_rejection',true);
  perform set_config('app.application_change_reason',trim(p_reason),true);
  update public.salon_applications
  set status='Rejected', rejection_reason=trim(p_reason),
      reviewed_by=p_actor_user_id, reviewed_at=now(), updated_at=now()
  where id=p_application_id returning * into v_after;
  insert into public.record_management_events(
    record_type,record_id,record_label,action,dependency_summary,
    before_values,after_values,reason,acting_user_id,acting_scope
  ) values (
    'salon_application',p_application_id::text,v_application.business_name,'Updated',
    jsonb_build_object('salon_id',v_application.salon_id,'salon_status','Offboarded','atomic',true),
    to_jsonb(v_application),to_jsonb(v_after),trim(p_reason),p_actor_user_id,'platform_admin'
  );
  return jsonb_build_object('ok',true,'changed',true,'status','Rejected','application',to_jsonb(v_after));
end;
$$;

-- Replace the older permission-only deletion with a Super Admin-authoritative
-- action. The exact phrase and immutable revision/audit history guard against an
-- accidental click without denying the platform owner the final decision.
drop function if exists public.admin_delete_salon_application(uuid,uuid,text,jsonb);
create or replace function public.admin_delete_salon_application(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_confirmation text,
  p_dependency_summary jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_application public.salon_applications%rowtype;
  v_label text;
  v_expected text;
  v_override_count integer := 0;
begin
  if not public.active_super_admin(p_actor_user_id) then
    raise exception 'Only a Super Admin can permanently delete a salon application.';
  end if;
  if length(trim(coalesce(p_reason,''))) < 8 then
    raise exception 'Enter a reason of at least 8 characters.';
  end if;
  select * into v_application from public.salon_applications
  where id=p_application_id for update;
  if not found then raise exception 'Salon application not found.'; end if;
  v_label := concat_ws(' · ',v_application.business_name,v_application.business_email);
  v_expected := 'DELETE APPLICATION ' || v_application.business_name;
  if p_confirmation is distinct from v_expected then
    raise exception 'Type the destructive confirmation phrase exactly.';
  end if;
  select count(*) into v_override_count from public.salon_publication_overrides
  where application_id=p_application_id;
  insert into public.salon_publication_override_audit(
    override_id,salon_id,application_id,action,reason,
    overridden_gates,gate_snapshot,acting_admin_id
  )
  select override_row.id,override_row.salon_id,p_application_id,'Revoked',trim(p_reason),
         override_row.overridden_gates,override_row.gate_snapshot,p_actor_user_id
  from public.salon_publication_overrides override_row
  where override_row.application_id=p_application_id and override_row.is_active;
  update public.salon_publication_overrides
  set is_active=false,revoked_by=p_actor_user_id,
      revoked_at=coalesce(revoked_at,now()),updated_at=now()
  where application_id=p_application_id;
  insert into public.record_management_events(
    record_type,record_id,record_label,action,dependency_summary,
    before_values,after_values,reason,acting_user_id,acting_scope
  ) values (
    'salon_application',p_application_id::text,v_label,'Deleted',
    coalesce(p_dependency_summary,'{}'::jsonb) || jsonb_build_object(
      'salon_id',v_application.salon_id,
      'salon_retained',true,
      'immutable_revisions_retained',true,
      'publication_overrides_revoked',v_override_count
    ),to_jsonb(v_application),null,trim(p_reason),p_actor_user_id,'platform_admin'
  );
  delete from public.salon_applications where id=p_application_id;
  return jsonb_build_object(
    'ok',true,'action','delete','label',v_label,
    'salon_id',v_application.salon_id,'salon_retained',true,
    'immutable_revisions_retained',true,
    'publication_overrides_revoked',v_override_count
  );
end;
$$;

-- Super Admin may remove any salon from operational surfaces. Financial,
-- booking, refund, subscription, dispute, and audit rows remain anchored to a
-- non-public tombstone so authority does not require destroying legal evidence.
create or replace function public.admin_operationally_delete_salon(
  p_salon_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_confirmation text,
  p_dependency_summary jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_salon public.salons%rowtype;
  v_expected text;
  v_application_count integer := 0;
begin
  if not public.active_super_admin(p_actor_user_id) then
    raise exception 'Only a Super Admin can permanently remove a salon from operational records.';
  end if;
  if length(trim(coalesce(p_reason,''))) < 8 then
    raise exception 'Enter a reason of at least 8 characters.';
  end if;
  select * into v_salon from public.salons where id=p_salon_id for update;
  if not found then raise exception 'Salon not found.'; end if;
  if v_salon.deleted_at is not null then
    return jsonb_build_object('ok',true,'changed',false,'action','delete_salon');
  end if;
  v_expected := 'DELETE SALON ' || v_salon.name;
  if p_confirmation is distinct from v_expected then
    raise exception 'Type the destructive confirmation phrase exactly.';
  end if;

  update public.salon_team_members set status='Inactive'
  where salon_id=p_salon_id and status<>'Inactive';
  update public.stylists set is_active=false,
    archived_at=coalesce(archived_at,now()),user_id=null
  where salon_id=p_salon_id;
  update public.styles set archived_at=coalesce(archived_at,now())
  where salon_id=p_salon_id;
  update public.salon_products set is_visible=false,
    archived_at=coalesce(archived_at,now()),updated_at=now()
  where salon_id=p_salon_id;
  update public.salon_promotions set is_active=false,status='Archived',
    archived_at=coalesce(archived_at,now()),paused_at=coalesce(paused_at,now()),updated_at=now()
  where salon_id=p_salon_id;
  update public.featured_salon_campaigns set status='Paused',updated_at=now(),updated_by=p_actor_user_id
  where salon_id=p_salon_id and status in('Scheduled','Active');
  update public.trending_video_campaigns set status='Draft',updated_at=now(),updated_by=p_actor_user_id
  where salon_id=p_salon_id and status<>'Expired';
  update public.reviews set archived_at=coalesce(archived_at,now())
  where salon_id=p_salon_id;
  update public.salon_slug_redirects set retired_at=coalesce(retired_at,now())
  where salon_id=p_salon_id;
  delete from public.availability where salon_id=p_salon_id;
  delete from public.salon_blockouts where salon_id=p_salon_id;

  insert into public.salon_publication_override_audit(
    override_id,salon_id,application_id,action,reason,
    overridden_gates,gate_snapshot,acting_admin_id
  )
  select override_row.id,p_salon_id,override_row.application_id,'Revoked',trim(p_reason),
         override_row.overridden_gates,override_row.gate_snapshot,p_actor_user_id
  from public.salon_publication_overrides override_row
  where override_row.salon_id=p_salon_id and override_row.is_active;
  update public.salon_publication_overrides
  set is_active=false,revoked_by=p_actor_user_id,
      revoked_at=coalesce(revoked_at,now()),updated_at=now()
  where salon_id=p_salon_id and is_active;

  select count(*) into v_application_count from public.salon_applications
  where salon_id=p_salon_id;
  delete from public.salon_applications where salon_id=p_salon_id;

  update public.salons set
    name='Deleted salon ' || left(p_salon_id::text,8),
    slug=null,vanity_slug=null,instagram_url=null,tiktok_url=null,
    google_business_url=null,description=null,phone=null,email=null,
    owner_name=null,user_id=null,address_street=null,address_line2=null,
    address_city=null,address_state=null,address_zip=null,neighborhood=null,
    borough=null,market_id=null,formatted_address=null,address_fingerprint=null,
    latitude=null,longitude=null,geocoded_at=null,cover_photo_url=null,
    logo_url=null,gallery_photos='[]'::jsonb,is_discoverable=false,
    accepting_bookings=false,subscription_status='inactive',status='Offboarded',
    approved_at=null,offboarded_at=coalesce(offboarded_at,now()),
    lifecycle_reason='Permanently removed by Super Admin',deleted_at=now(),
    deleted_by=p_actor_user_id,deletion_reason=trim(p_reason),
    deletion_evidence=jsonb_build_object(
      'dependency_summary',coalesce(p_dependency_summary,'{}'::jsonb),
      'applications_deleted',v_application_count,
      'financial_history_retained',true,
      'booking_history_retained',true,
      'audit_history_retained',true
    )
  where id=p_salon_id;

  insert into public.record_management_events(
    record_type,record_id,record_label,action,dependency_summary,
    before_values,after_values,reason,acting_user_id,acting_scope
  ) values (
    'salon',p_salon_id::text,v_salon.name,'Deleted',
    coalesce(p_dependency_summary,'{}'::jsonb) || jsonb_build_object(
      'applications_deleted',v_application_count,
      'tombstone_retained',true,
      'financial_history_retained',true,
      'booking_history_retained',true
    ),to_jsonb(v_salon),jsonb_build_object('deleted_at',now(),'tombstone_retained',true),
    trim(p_reason),p_actor_user_id,'platform_admin'
  );
  return jsonb_build_object(
    'ok',true,'changed',true,'action','delete_salon','label',v_salon.name,
    'applications_deleted',v_application_count,'tombstone_retained',true,
    'message','The salon was removed from operational records. Financial, booking, and audit history was retained.'
  );
end;
$$;

-- One database transaction owns new submissions and resubmissions. It verifies
-- the active salon-owner identity and never resets an existing salon's plan,
-- subscription, payment, publication, suspension, or offboarding state.
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
      coalesce(nullif(p_salon_values->>'subscription_tier',''),'Basic'),'inactive'
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
    referral_source,selected_plan,years_in_operation,stylist_count,website_url,
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
    p_application_values->>'business_type',nullif(p_application_values->>'referral_source',''),
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

-- Completed/cancelled/resolved appointments remain in history but no longer
-- count as actionable unread booking work.
create or replace function public.resolve_terminal_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce(new.status,''))) in (
    'completed','cancelled','canceled','no-show','no show','resolved',
    'declined','refunded','closed'
  ) then
    update public.notifications
    set read_at=coalesce(read_at,now()),last_seen_at=now()
    where booking_id=new.id
      and recipient_role='salon'
      and category='bookings'
      and read_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_resolve_terminal_notifications on public.bookings;
create trigger bookings_resolve_terminal_notifications
after insert or update of status on public.bookings
for each row execute function public.resolve_terminal_booking_notifications();

update public.notifications notification
set read_at=coalesce(notification.read_at,now()),last_seen_at=now()
from public.bookings booking
where notification.booking_id=booking.id
  and notification.recipient_role='salon'
  and notification.category='bookings'
  and notification.read_at is null
  and lower(trim(coalesce(booking.status,''))) in (
    'completed','cancelled','canceled','no-show','no show','resolved',
    'declined','refunded','closed'
  );

-- Public profile copy is capped at 200 words; the interface exposes a much
-- shorter preview. Plan and fallback behavior from the earlier trigger remain.
create or replace function public.enforce_salon_profile_assistance_controls()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_mode text := coalesce(new.stylist_section_fallback->>'mode','empty');
  v_word_count integer := 0;
begin
  if trim(coalesce(new.description,''))<>'' then
    v_word_count:=coalesce(array_length(regexp_split_to_array(trim(new.description),E'\\s+'),1),0);
  end if;
  if v_word_count>200 then
    raise exception using errcode='22023',message='SALON_DESCRIPTION_WORD_LIMIT';
  end if;
  if trim(coalesce(new.description,''))='' then
    new.description_ai_assisted:=false;
  end if;
  if v_mode<>'empty' and public.plan_rank(new.subscription_tier)<2 then
    if tg_op='UPDATE'
       and new.subscription_tier is distinct from old.subscription_tier
       and new.stylist_section_fallback is not distinct from old.stylist_section_fallback then
      new.stylist_section_fallback:='{"mode":"empty"}'::jsonb;
    else
      raise exception using errcode='23514',message='STYLIST_FALLBACK_REQUIRES_GROWTH';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.admin_archive_salon_application(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_restore_salon_application(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_update_submission_current_salon(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.admin_update_salon_application_snapshot(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.admin_reject_salon_application_atomic(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_delete_salon_application(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.admin_operationally_delete_salon(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.submit_salon_application_atomic(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.admin_archive_salon_application(uuid,uuid,text) to service_role;
grant execute on function public.admin_restore_salon_application(uuid,uuid,text) to service_role;
grant execute on function public.admin_update_submission_current_salon(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.admin_update_salon_application_snapshot(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.admin_reject_salon_application_atomic(uuid,uuid,text) to service_role;
grant execute on function public.admin_delete_salon_application(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.admin_operationally_delete_salon(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.submit_salon_application_atomic(uuid,jsonb,jsonb) to service_role;

update public.engine_settings
set published_value='"20260807020000"'::jsonb,
    draft_value='"20260807020000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';
commit;
