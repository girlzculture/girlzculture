begin;

create table if not exists public.record_management_events (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  record_id text not null,
  record_label text,
  action text not null check (action in ('Created','Updated','Archived','Reassigned','Deleted','Cancelled','Offboarded','Anonymized')),
  dependency_summary jsonb not null default '{}'::jsonb,
  before_values jsonb,
  after_values jsonb,
  reason text,
  acting_user_id uuid references auth.users(id) on delete restrict,
  acting_scope text not null check (acting_scope in ('platform_admin','salon_owner','system')),
  created_at timestamptz not null default now()
);
create index if not exists record_management_events_record_idx
  on public.record_management_events(record_type,record_id,created_at desc);
create index if not exists record_management_events_actor_idx
  on public.record_management_events(acting_user_id,created_at desc);

alter table public.record_management_events enable row level security;
drop policy if exists record_management_events_admin_read on public.record_management_events;
create policy record_management_events_admin_read on public.record_management_events
  for select to authenticated using(public.admin_has_permission('settings'));

-- Archive markers are additive and deliberately do not change existing status
-- constraints. Public/operational fields are still switched off by the action
-- API, while this timestamp preserves a uniform audit signal.
alter table if exists public.blog_posts add column if not exists archived_at timestamptz;
alter table if exists public.content_pages add column if not exists archived_at timestamptz;
alter table if exists public.service_categories add column if not exists archived_at timestamptz;
alter table if exists public.service_groups add column if not exists archived_at timestamptz;
alter table if exists public.service_addons add column if not exists archived_at timestamptz;
alter table if exists public.master_styles add column if not exists archived_at timestamptz;
alter table if exists public.styles add column if not exists archived_at timestamptz;
alter table if exists public.stylists add column if not exists archived_at timestamptz;
alter table if exists public.salon_products add column if not exists archived_at timestamptz;
alter table if exists public.salon_promotions add column if not exists archived_at timestamptz;
alter table if exists public.promo_codes add column if not exists archived_at timestamptz;
alter table if exists public.newsletter_subscribers add column if not exists archived_at timestamptz;
alter table if exists public.location_markets add column if not exists archived_at timestamptz;
alter table if exists public.support_tickets add column if not exists archived_at timestamptz;
alter table if exists public.reviews add column if not exists archived_at timestamptz;

create or replace function public.admin_manage_catalog_record(
  p_record_type text,
  p_record_id text,
  p_action text,
  p_reassign_to text,
  p_actor_user_id uuid,
  p_reason text,
  p_dependency_summary jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_id uuid;
  v_target uuid;
  v_label text;
  v_before jsonb;
  v_after jsonb;
  v_count integer:=0;
  v_permission text;
  v_allowed boolean:=false;
begin
  if p_action not in ('archive','delete','reassign') then raise exception 'Choose archive, delete, or reassign.'; end if;
  v_permission:=case when p_record_type in ('blog_post','content_page','service_category','service_group','service_addon','master_style') then 'content' when p_record_type in ('salon_product','salon_promotion','promo_code') then 'marketing' else 'settings' end;
  select exists(select 1 from public.admin_users a where coalesce(a.user_id,a.id)=p_actor_user_id and a.status='Active' and (coalesce(a.is_super_admin,false) or coalesce((a.permissions->>v_permission)::boolean,false))) into v_allowed;
  if not v_allowed then raise exception 'You do not have permission to manage this record.'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Enter a reason of at least 5 characters.'; end if;

  if p_record_type='content_page' then
    select title,to_jsonb(p) into v_label,v_before from public.content_pages p where slug=p_record_id for update;
    if not found then raise exception 'Content page not found.'; end if;
    if p_action='delete' then raise exception 'Content pages are retained for recovery. Archive this page instead.'; end if;
    update public.content_pages set status='Draft',is_enabled=false,archived_at=now(),updated_at=now() where slug=p_record_id returning to_jsonb(content_pages.*) into v_after;
  elsif p_record_type='blog_post' then
    v_id:=p_record_id::uuid; select title,to_jsonb(p) into v_label,v_before from public.blog_posts p where id=v_id for update;
    if not found then raise exception 'Blog post not found.'; end if;
    if p_action='archive' then update public.blog_posts set status='Draft',featured=false,archived_at=now(),updated_at=now() where id=v_id returning to_jsonb(blog_posts.*) into v_after;
    elsif p_action='delete' then delete from public.blog_posts where id=v_id;
    else raise exception 'Blog posts cannot be reassigned.'; end if;
  elsif p_record_type='service_category' then
    v_id:=p_record_id::uuid; select name,to_jsonb(c) into v_label,v_before from public.service_categories c where id=v_id for update;
    if not found then raise exception 'Service category not found.'; end if;
    select (select count(*) from public.service_groups where category_id=v_id)+(select count(*) from public.service_addons where category_id=v_id)+(select count(*) from public.master_styles where category_id=v_id) into v_count;
    if p_action='archive' then update public.service_categories set is_active=false,archived_at=now(),updated_at=now() where id=v_id returning to_jsonb(service_categories.*) into v_after;
    elsif p_action='delete' and v_count=0 then delete from public.service_categories where id=v_id;
    elsif p_action='reassign' then raise exception 'Reassign service groups, names, and add-ons individually before removing this category.';
    else raise exception 'This category is still used by % catalog records. Reassign or archive it.',v_count; end if;
  elsif p_record_type='service_group' then
    v_id:=p_record_id::uuid; select name,to_jsonb(g) into v_label,v_before from public.service_groups g where id=v_id for update;
    if not found then raise exception 'Service group not found.'; end if;
    select count(*) into v_count from public.master_styles where service_group_id=v_id;
    if p_action='archive' then update public.service_groups set is_active=false,archived_at=now(),updated_at=now() where id=v_id returning to_jsonb(service_groups.*) into v_after;
    elsif p_action='reassign' then v_target:=p_reassign_to::uuid; if not exists(select 1 from public.service_groups where id=v_target and is_active) then raise exception 'Choose an active replacement group.'; end if; update public.master_styles set service_group_id=v_target where service_group_id=v_id; delete from public.service_groups where id=v_id;
    elsif p_action='delete' and v_count=0 then delete from public.service_groups where id=v_id;
    else raise exception 'This group is still used by % service names. Reassign or archive it.',v_count; end if;
  elsif p_record_type='master_style' then
    v_id:=p_record_id::uuid; select name,to_jsonb(m) into v_label,v_before from public.master_styles m where id=v_id for update;
    if not found then raise exception 'Service name not found.'; end if;
    select count(*) into v_count from public.styles where master_style_id=v_id;
    if p_action='archive' then update public.master_styles set is_active=false,archived_at=now(),updated_at=now() where id=v_id returning to_jsonb(master_styles.*) into v_after;
    elsif p_action='reassign' then v_target:=p_reassign_to::uuid; if not exists(select 1 from public.master_styles where id=v_target and is_active) then raise exception 'Choose an active replacement service.'; end if; update public.styles set master_style_id=v_target where master_style_id=v_id; delete from public.master_styles where id=v_id;
    elsif p_action='delete' and v_count=0 then delete from public.master_styles where id=v_id;
    else raise exception 'This service name is still used by % salon services. Reassign or archive it.',v_count; end if;
  elsif p_record_type='service_addon' then
    v_id:=p_record_id::uuid; select name,to_jsonb(a) into v_label,v_before from public.service_addons a where id=v_id for update;
    if not found then raise exception 'Add-on not found.'; end if;
    if p_action='archive' then update public.service_addons set is_active=false,archived_at=now(),updated_at=now() where id=v_id returning to_jsonb(service_addons.*) into v_after;
    elsif p_action='delete' then delete from public.service_addons where id=v_id;
    else raise exception 'Add-ons cannot be reassigned automatically.'; end if;
  elsif p_record_type='promo_code' then
    v_id:=p_record_id::uuid; select code,to_jsonb(p) into v_label,v_before from public.promo_codes p where id=v_id for update;
    if not found then raise exception 'Promo code not found.'; end if;
    if p_action='archive' then update public.promo_codes set is_active=false,archived_at=now(),updated_at=now() where id=v_id returning to_jsonb(promo_codes.*) into v_after;
    elsif p_action='delete' and not exists(select 1 from public.promo_code_redemptions where promo_code_id=v_id) then delete from public.promo_codes where id=v_id;
    else raise exception 'Promo codes with redemption history must be archived, not deleted.'; end if;
  else
    raise exception 'This record type uses its dedicated safe management workflow.';
  end if;

  insert into public.record_management_events(record_type,record_id,record_label,action,dependency_summary,before_values,after_values,reason,acting_user_id,acting_scope)
  values(p_record_type,p_record_id,v_label,case p_action when 'archive' then 'Archived' when 'reassign' then 'Reassigned' else 'Deleted' end,coalesce(p_dependency_summary,'{}'::jsonb),v_before,v_after,p_reason,p_actor_user_id,'platform_admin');
  return jsonb_build_object('ok',true,'record_type',p_record_type,'record_id',p_record_id,'action',p_action,'label',v_label);
end $$;
revoke all on function public.admin_manage_catalog_record(text,text,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_manage_catalog_record(text,text,text,text,uuid,text,jsonb) to service_role;

commit;
