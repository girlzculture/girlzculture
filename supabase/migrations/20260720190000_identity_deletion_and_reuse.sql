begin;

-- Account deletion must not erase historical business events. Nullable actor
-- links preserve those rows while allowing the Auth identity to be removed.
alter table public.record_management_events alter column acting_user_id drop not null;
alter table public.record_management_events drop constraint if exists record_management_events_acting_user_id_fkey;
alter table public.record_management_events add constraint record_management_events_acting_user_id_fkey foreign key(acting_user_id) references auth.users(id) on delete set null;
alter table public.salon_status_audit alter column acting_admin_id drop not null;
alter table public.salon_status_audit drop constraint if exists salon_status_audit_acting_admin_id_fkey;
alter table public.salon_status_audit add constraint salon_status_audit_acting_admin_id_fkey foreign key(acting_admin_id) references auth.users(id) on delete set null;
alter table public.salon_team_members alter column invited_by drop not null;
alter table public.salon_team_members drop constraint if exists salon_team_members_invited_by_fkey;
alter table public.salon_team_members add constraint salon_team_members_invited_by_fkey foreign key(invited_by) references auth.users(id) on delete set null;

alter table public.marketing_entitlements alter column created_by drop not null;
alter table public.marketing_entitlements drop constraint if exists marketing_entitlements_created_by_fkey;
alter table public.marketing_entitlements add constraint marketing_entitlements_created_by_fkey foreign key(created_by) references auth.users(id) on delete set null;
alter table public.featured_salon_campaigns alter column created_by drop not null, alter column updated_by drop not null;
alter table public.featured_salon_campaigns drop constraint if exists featured_salon_campaigns_created_by_fkey;
alter table public.featured_salon_campaigns drop constraint if exists featured_salon_campaigns_updated_by_fkey;
alter table public.featured_salon_campaigns add constraint featured_salon_campaigns_created_by_fkey foreign key(created_by) references auth.users(id) on delete set null;
alter table public.featured_salon_campaigns add constraint featured_salon_campaigns_updated_by_fkey foreign key(updated_by) references auth.users(id) on delete set null;
alter table public.featured_campaign_audit drop constraint if exists featured_campaign_audit_acting_admin_id_fkey;
alter table public.featured_campaign_audit add constraint featured_campaign_audit_acting_admin_id_fkey foreign key(acting_admin_id) references auth.users(id) on delete set null;
alter table public.trending_video_campaigns alter column created_by drop not null, alter column updated_by drop not null;
alter table public.trending_video_campaigns drop constraint if exists trending_video_campaigns_created_by_fkey;
alter table public.trending_video_campaigns drop constraint if exists trending_video_campaigns_updated_by_fkey;
alter table public.trending_video_campaigns drop constraint if exists trending_video_campaigns_moderated_by_fkey;
alter table public.trending_video_campaigns add constraint trending_video_campaigns_created_by_fkey foreign key(created_by) references auth.users(id) on delete set null;
alter table public.trending_video_campaigns add constraint trending_video_campaigns_updated_by_fkey foreign key(updated_by) references auth.users(id) on delete set null;
alter table public.trending_video_campaigns add constraint trending_video_campaigns_moderated_by_fkey foreign key(moderated_by) references auth.users(id) on delete set null;
alter table public.trending_campaign_audit drop constraint if exists trending_campaign_audit_acting_admin_id_fkey;
alter table public.trending_campaign_audit add constraint trending_campaign_audit_acting_admin_id_fkey foreign key(acting_admin_id) references auth.users(id) on delete set null;

-- Customer-auth removal preserves completed booking/review/support history by
-- detaching the personal identity before Auth deletion.
alter table public.bookings alter column customer_id drop not null;
alter table public.reviews alter column customer_id drop not null;

create table if not exists public.identity_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid references auth.users(id) on delete set null,
  primary_role text not null check(primary_role in ('customer','salon_owner','salon_team','admin')),
  target_record_id text,
  status text not null default 'Prepared' check(status in ('Prepared','Auth deletion failed','Completed','Blocked')),
  dependency_summary jsonb not null default '{}'::jsonb,
  reason text not null,
  requested_by uuid references auth.users(id) on delete set null,
  prepared_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text
);
create index if not exists identity_deletion_jobs_target_idx on public.identity_deletion_jobs(target_user_id,prepared_at desc);
alter table public.identity_deletion_jobs enable row level security;
drop policy if exists identity_deletion_jobs_admin_read on public.identity_deletion_jobs;
create policy identity_deletion_jobs_admin_read on public.identity_deletion_jobs for select to authenticated using(public.admin_has_permission('settings'));

create or replace function public.prepare_identity_deletion(
  p_target_user_id uuid,
  p_primary_role text,
  p_target_record_id text,
  p_actor_user_id uuid,
  p_reason text,
  p_dependency_summary jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public,auth as $$
declare
  v_job_id uuid;
  v_actor_super boolean:=false;
  v_salon_id uuid;
begin
  if p_target_user_id is null or p_target_user_id=p_actor_user_id then raise exception 'You cannot remove the account currently performing this action.'; end if;
  if length(trim(coalesce(p_reason,'')))<8 then raise exception 'Enter a reason of at least 8 characters.'; end if;
  select exists(select 1 from public.admin_users where coalesce(user_id,id)=p_actor_user_id and status='Active' and is_super_admin) into v_actor_super;
  if p_primary_role='salon_team' and not v_actor_super then
    select salon_id into v_salon_id from public.salon_team_members where id=p_target_record_id::uuid and user_id=p_target_user_id;
    if v_salon_id is null or not exists(select 1 from public.salons where id=v_salon_id and user_id=p_actor_user_id) then raise exception 'Only the salon owner or a Super Admin can remove this team identity.'; end if;
  elsif not v_actor_super then raise exception 'Only a Super Admin can permanently remove this identity.'; end if;
  if p_primary_role='salon_owner' then raise exception 'Transfer or offboard the salon before removing its owner identity.'; end if;
  if p_primary_role='admin' then
    if exists(select 1 from public.admin_users where coalesce(user_id,id)=p_target_user_id and is_super_admin and status='Active')
      and (select count(*) from public.admin_users where is_super_admin and status='Active')<=1 then raise exception 'The last active Super Admin cannot be removed.'; end if;
    delete from public.admin_users where coalesce(user_id,id)=p_target_user_id;
  elsif p_primary_role='salon_team' then
    update public.stylists set user_id=null where user_id=p_target_user_id;
    delete from public.salon_team_members where user_id=p_target_user_id;
  elsif p_primary_role='customer' then
    update public.bookings set customer_id=null,guest_name='Former customer',guest_email=null,guest_phone=null where customer_id=p_target_user_id;
    update public.reviews set customer_id=null where customer_id=p_target_user_id;
    update public.support_tickets set customer_id=null,requester_name='Former customer',requester_email=null where customer_id=p_target_user_id;
    update public.complaints_log set customer_id=null where customer_id=p_target_user_id;
    delete from public.customers where id=p_target_user_id;
  else raise exception 'Choose a supported identity role.'; end if;
  update public.platform_identities set status='Disabled',disabled_at=now(),updated_at=now() where user_id=p_target_user_id;
  insert into public.identity_deletion_jobs(target_user_id,primary_role,target_record_id,dependency_summary,reason,requested_by)
  values(p_target_user_id,p_primary_role,p_target_record_id,coalesce(p_dependency_summary,'{}'::jsonb),trim(p_reason),p_actor_user_id) returning id into v_job_id;
  insert into public.identity_security_events(event_type,attempted_role,actor_user_id,details)
  values('identity_deletion_prepared',p_primary_role,p_actor_user_id,jsonb_build_object('job_id',v_job_id,'target_user_id',p_target_user_id,'dependencies',coalesce(p_dependency_summary,'{}'::jsonb)));
  return v_job_id;
end $$;
revoke all on function public.prepare_identity_deletion(uuid,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_identity_deletion(uuid,text,text,uuid,text,jsonb) to service_role;

commit;
