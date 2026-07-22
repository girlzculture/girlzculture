begin;

-- Groups and add-ons can be explicitly ordered. A zero order uses the
-- alphabetical fallback in both admin and salon-facing catalog queries.
alter table public.service_groups add column if not exists sort_order integer not null default 0;
alter table public.service_addons add column if not exists sort_order integer not null default 0;

-- A salon may intentionally sell an entire managed group as one service.
-- The master name is therefore optional, while the managed group and a
-- customer-facing display name remain mandatory.
alter table public.styles add column if not exists service_group_id uuid references public.service_groups(id) on delete restrict;
update public.styles style
set service_group_id = master.service_group_id
from public.master_styles master
where style.master_style_id = master.id
  and style.service_group_id is null;
alter table public.styles alter column master_style_id drop not null;
alter table public.styles alter column service_group_id set not null;
create index if not exists styles_service_group_idx on public.styles(service_group_id, salon_id);

create or replace function public.validate_structured_style()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  managed record;
  option_row jsonb;
  group_row jsonb;
begin
  if new.master_style_id is not null then
    select master.id, master.name, master.category, master.category_id,
           master.service_group_id, category.slug as category_slug
    into managed
    from public.master_styles master
    join public.service_categories category on category.id = master.category_id
    join public.service_groups service_group on service_group.id = master.service_group_id
    where master.id = new.master_style_id
      and (
        (master.is_active and master.archived_at is null
          and category.is_active and category.archived_at is null
          and service_group.is_active and service_group.archived_at is null)
        or (tg_op = 'UPDATE' and old.master_style_id = new.master_style_id)
      );
    if not found then
      raise exception 'Choose a service from the active managed catalog.' using errcode = '23514';
    end if;
    new.name := managed.name;
    new.category := managed.category;
    new.category_id := managed.category_id;
    new.service_group_id := managed.service_group_id;
  else
    select service_group.id as service_group_id, service_group.name as category,
           service_group.category_id, category.slug as category_slug
    into managed
    from public.service_groups service_group
    join public.service_categories category on category.id = service_group.category_id
    where service_group.id = new.service_group_id
      and (
        (service_group.is_active and service_group.archived_at is null
          and category.is_active and category.archived_at is null)
        or (tg_op = 'UPDATE' and old.master_style_id is null and old.service_group_id = new.service_group_id)
      );
    if not found then
      raise exception 'Choose an active service group.' using errcode = '23514';
    end if;
    new.name := trim(coalesce(new.name, ''));
    if length(new.name) not between 1 and 120 then
      raise exception 'Enter a customer-facing service name.' using errcode = '23514';
    end if;
    new.category := managed.category;
    new.category_id := managed.category_id;
  end if;

  if jsonb_typeof(coalesce(new.option_groups, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Service option groups must be an array.' using errcode = '23514';
  end if;
  for group_row in select value from jsonb_array_elements(coalesce(new.option_groups, '[]'::jsonb)) loop
    if coalesce(trim(group_row->>'id'), '') !~ '^[a-z][a-z0-9_-]{0,39}$'
      or coalesce(trim(group_row->>'label'), '') = ''
      or coalesce(group_row->>'selection', 'single') not in ('single', 'multiple')
      or jsonb_typeof(coalesce(group_row->'options', '[]'::jsonb)) is distinct from 'array' then
      raise exception 'A service option group is invalid.' using errcode = '23514';
    end if;
    for option_row in select value from jsonb_array_elements(coalesce(group_row->'options', '[]'::jsonb)) loop
      if coalesce(trim(option_row->>'value'), trim(option_row->>'label'), '') = ''
        or coalesce(nullif(option_row->>'price_add','')::numeric, 0) < 0
        or abs(coalesce(nullif(option_row->>'duration_add_minutes','')::integer, 0)) > 1440 then
        raise exception 'A service option is invalid.' using errcode = '23514';
      end if;
    end loop;
  end loop;

  if managed.category_slug = 'braiding' then
    for option_row in select value from jsonb_array_elements(coalesce(new.size_options,'[]'::jsonb)) loop
      if coalesce(option_row->>'label', option_row->>'value','') not in
        ('X-Small','Small','Small-Medium','Medium','Large','Jumbo') then
        raise exception 'Invalid braiding size option.' using errcode = '23514';
      end if;
    end loop;
    for option_row in select value from jsonb_array_elements(coalesce(new.length_options,'[]'::jsonb)) loop
      if coalesce(option_row->>'label', option_row->>'value','') not in
        ('Shoulder','Bra-strap','Mid-back','Waist','Butt/Hip','Tailbone','Classic','Mid-thigh','Knee') then
        raise exception 'Invalid braiding length option.' using errcode = '23514';
      end if;
    end loop;
  end if;
  for option_row in select value from jsonb_array_elements(coalesce(new.addons,'[]'::jsonb)) loop
    if not exists (
      select 1 from public.service_addons addon
      where addon.category_id = managed.category_id
        and lower(addon.name) = lower(coalesce(option_row->>'label', option_row->>'value',''))
        and (
          (addon.is_active and addon.archived_at is null)
          or (tg_op = 'UPDATE' and exists (
            select 1 from jsonb_array_elements(coalesce(old.addons,'[]'::jsonb)) previous
            where lower(coalesce(previous->>'label',previous->>'value','')) = lower(addon.name)
          ))
        )
    ) then
      raise exception 'Choose add-ons from the active managed catalog.' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists styles_validate_structured_input on public.styles;
create trigger styles_validate_structured_input
before insert or update of master_style_id, service_group_id, name, category, category_id,
  size_options, length_options, addons, option_groups
on public.styles for each row execute function public.validate_structured_style();

-- Server routes already authenticate the salon and verify the style belongs to
-- it before invoking this function. Permit the service role without widening
-- authenticated-user access.
create or replace function public.replace_style_materials(p_style_id uuid, p_materials jsonb)
returns setof public.style_materials
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and not public.owns_style(p_style_id)
     and not public.is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  delete from public.style_materials where style_id = p_style_id;
  insert into public.style_materials(
    style_id, name, price, longevity_weeks, quality_grade, longevity, quality_note, option_type, metadata
  )
  select
    p_style_id,
    value->>'name',
    coalesce((value->>'price')::numeric,0),
    nullif(value->>'longevity_weeks','')::smallint,
    nullif(value->>'quality_grade',''),
    case when nullif(value->>'longevity_weeks','') is null then null else
      (value->>'longevity_weeks') || case when (value->>'longevity_weeks')::smallint = 1 then ' week' else ' weeks' end end,
    nullif(value->>'quality_grade',''),
    coalesce(nullif(value->>'option_type',''), 'material'),
    coalesce(value->'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_materials,'[]'::jsonb));
  return query select * from public.style_materials where style_id = p_style_id order by created_at;
end $$;
revoke all on function public.replace_style_materials(uuid,jsonb) from public;
grant execute on function public.replace_style_materials(uuid,jsonb) to authenticated, service_role;

create or replace function public.admin_reassign_service_group(
  p_group_id uuid,
  p_target_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_dependency_summary jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_before jsonb;
  v_label text;
  v_target record;
  v_allowed boolean := false;
begin
  select exists(
    select 1 from public.admin_users admin_user
    where coalesce(admin_user.user_id, admin_user.id) = p_actor_user_id
      and admin_user.status = 'Active'
      and (coalesce(admin_user.is_super_admin, false)
        or coalesce((admin_user.permissions->>'content')::boolean, false))
  ) into v_allowed;
  if not v_allowed then raise exception 'You do not have permission to manage this record.'; end if;
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'Enter a reason of at least 5 characters.'; end if;
  if p_group_id = p_target_id then raise exception 'Choose a different replacement group.'; end if;

  select name, to_jsonb(service_group.*) into v_label, v_before
  from public.service_groups service_group where id = p_group_id for update;
  if not found then raise exception 'Service group not found.'; end if;
  select id, name, category_id into v_target
  from public.service_groups
  where id = p_target_id and is_active and archived_at is null;
  if not found then raise exception 'Choose an active replacement group.'; end if;

  update public.master_styles
  set service_group_id = v_target.id,
      category_id = v_target.category_id,
      category = v_target.name,
      updated_at = now()
  where service_group_id = p_group_id;
  update public.styles
  set service_group_id = v_target.id,
      category_id = v_target.category_id,
      category = v_target.name
  where service_group_id = p_group_id;
  delete from public.service_groups where id = p_group_id;

  insert into public.record_management_events(
    record_type, record_id, record_label, action, dependency_summary,
    before_values, after_values, reason, acting_user_id, acting_scope
  ) values (
    'service_group', p_group_id::text, v_label, 'Reassigned', coalesce(p_dependency_summary,'{}'::jsonb),
    v_before, jsonb_build_object('replacement_group_id',p_target_id), p_reason, p_actor_user_id, 'platform_admin'
  );
  return jsonb_build_object('ok',true,'record_type','service_group','record_id',p_group_id,'action','reassign','label',v_label);
end $$;
revoke all on function public.admin_reassign_service_group(uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.admin_reassign_service_group(uuid,uuid,uuid,text,jsonb) to service_role;

commit;
