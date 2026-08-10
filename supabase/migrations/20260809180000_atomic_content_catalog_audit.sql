begin;

-- Content Management catalog saves must never commit without their immutable
-- management event.  Keep the supported table set explicit: this function is
-- intentionally not a generic dynamic-SQL writer.
create or replace function public.admin_save_content_catalog_record(
  p_record_type text,
  p_actor_user_id uuid,
  p_record jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_existed boolean := false;
  v_name text;
  v_slug text;
  v_description text;
  v_category_id uuid;
  v_group_id uuid;
  v_group_name text;
  v_sort_order integer;
  v_is_active boolean;
  v_archived_at timestamptz;
begin
  if p_record_type not in (
    'master_style','service_category','service_group','service_addon'
  ) then
    raise exception 'Choose a supported content catalog record type.'
      using errcode='22023';
  end if;
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'A catalog record is required.' using errcode='22023';
  end if;
  if not exists (
    select 1
    from public.admin_users actor
    where coalesce(actor.user_id,actor.id)=p_actor_user_id
      and actor.status='Active'
      and (
        coalesce(actor.is_super_admin,false)
        or coalesce((actor.permissions->>'content')::boolean,false)
      )
  ) then
    raise exception 'Forbidden: this admin role does not have access to this section.'
      using errcode='42501';
  end if;

  v_name := nullif(trim(coalesce(p_record->>'name','')), '');
  if v_name is null or length(v_name) > 100 then
    raise exception 'Enter a valid catalog name.' using errcode='22023';
  end if;
  v_sort_order := least(
    100000,
    greatest(0,coalesce((p_record->>'sort_order')::integer,0))
  );
  v_is_active := coalesce((p_record->>'is_active')::boolean,true);
  if nullif(trim(coalesce(p_record->>'archived_at','')), '') is not null then
    v_archived_at := (p_record->>'archived_at')::timestamptz;
  end if;
  if v_is_active then
    v_archived_at := null;
  end if;

  if nullif(trim(coalesce(p_record->>'id','')), '') is not null then
    v_id := (p_record->>'id')::uuid;
  else
    v_id := gen_random_uuid();
  end if;

  if p_record_type='service_category' then
    v_slug := lower(nullif(trim(coalesce(p_record->>'slug','')), ''));
    if v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or length(v_name) > 80 or length(v_slug) > 80 then
      raise exception 'Category name and a lowercase URL slug are required.'
        using errcode='22023';
    end if;
    v_description := nullif(left(trim(coalesce(p_record->>'description','')),500),'');

    if nullif(trim(coalesce(p_record->>'id','')), '') is not null then
      select to_jsonb(category) into v_before
      from public.service_categories category
      where category.id=v_id
      for update;
      v_existed := found;
      if not v_existed then
        raise exception 'Service category not found.' using errcode='P0002';
      end if;
      update public.service_categories category set
        name=v_name,
        slug=v_slug,
        description=v_description,
        sort_order=v_sort_order,
        is_active=v_is_active,
        archived_at=v_archived_at,
        updated_at=clock_timestamp()
      where category.id=v_id
      returning to_jsonb(category.*) into v_after;
    else
      insert into public.service_categories(
        id,name,slug,description,sort_order,is_active,archived_at,updated_at
      ) values (
        v_id,v_name,v_slug,v_description,v_sort_order,v_is_active,
        v_archived_at,clock_timestamp()
      ) returning to_jsonb(service_categories.*) into v_after;
    end if;

  elsif p_record_type in ('service_group','service_addon') then
    if length(v_name) > 80
      or nullif(trim(coalesce(p_record->>'category_id','')), '') is null then
      raise exception 'Name and category are required.' using errcode='22023';
    end if;
    v_category_id := (p_record->>'category_id')::uuid;
    if not exists (
      select 1 from public.service_categories category
      where category.id=v_category_id and category.is_active
    ) then
      raise exception 'Choose an active service category.' using errcode='22023';
    end if;

    if p_record_type='service_group' then
      if nullif(trim(coalesce(p_record->>'id','')), '') is not null then
        select to_jsonb(service_group) into v_before
        from public.service_groups service_group
        where service_group.id=v_id
        for update;
        v_existed := found;
        if not v_existed then
          raise exception 'Service group not found.' using errcode='P0002';
        end if;
        update public.service_groups service_group set
          name=v_name,
          category_id=v_category_id,
          sort_order=v_sort_order,
          is_active=v_is_active,
          archived_at=v_archived_at,
          updated_at=clock_timestamp()
        where service_group.id=v_id
        returning to_jsonb(service_group.*) into v_after;
      else
        insert into public.service_groups(
          id,name,category_id,sort_order,is_active,archived_at,updated_at
        ) values (
          v_id,v_name,v_category_id,v_sort_order,v_is_active,
          v_archived_at,clock_timestamp()
        ) returning to_jsonb(service_groups.*) into v_after;
      end if;
    else
      if nullif(trim(coalesce(p_record->>'id','')), '') is not null then
        select to_jsonb(service_addon) into v_before
        from public.service_addons service_addon
        where service_addon.id=v_id
        for update;
        v_existed := found;
        if not v_existed then
          raise exception 'Service add-on not found.' using errcode='P0002';
        end if;
        update public.service_addons service_addon set
          name=v_name,
          category_id=v_category_id,
          sort_order=v_sort_order,
          is_active=v_is_active,
          archived_at=v_archived_at,
          updated_at=clock_timestamp()
        where service_addon.id=v_id
        returning to_jsonb(service_addon.*) into v_after;
      else
        insert into public.service_addons(
          id,name,category_id,sort_order,is_active,archived_at,updated_at
        ) values (
          v_id,v_name,v_category_id,v_sort_order,v_is_active,
          v_archived_at,clock_timestamp()
        ) returning to_jsonb(service_addons.*) into v_after;
      end if;
    end if;

  else
    if nullif(trim(coalesce(p_record->>'service_group_id','')), '') is null then
      raise exception 'Service name and service group are required.'
        using errcode='22023';
    end if;
    v_group_id := (p_record->>'service_group_id')::uuid;
    select service_group.category_id,service_group.name
      into v_category_id,v_group_name
    from public.service_groups service_group
    join public.service_categories category
      on category.id=service_group.category_id
    where service_group.id=v_group_id
      and service_group.is_active
      and category.is_active;
    if not found then
      raise exception 'Choose an active service group.' using errcode='22023';
    end if;

    if nullif(trim(coalesce(p_record->>'id','')), '') is not null then
      select to_jsonb(master_style) into v_before
      from public.master_styles master_style
      where master_style.id=v_id
      for update;
      v_existed := found;
      if not v_existed then
        raise exception 'Service name not found.' using errcode='P0002';
      end if;
      update public.master_styles master_style set
        name=v_name,
        category=v_group_name,
        category_id=v_category_id,
        service_group_id=v_group_id,
        sort_order=v_sort_order,
        is_active=v_is_active,
        archived_at=v_archived_at,
        updated_at=clock_timestamp()
      where master_style.id=v_id
      returning to_jsonb(master_style.*) into v_after;
    else
      insert into public.master_styles(
        id,name,category,category_id,service_group_id,sort_order,is_active,
        archived_at,updated_at
      ) values (
        v_id,v_name,v_group_name,v_category_id,v_group_id,v_sort_order,
        v_is_active,v_archived_at,clock_timestamp()
      ) returning to_jsonb(master_styles.*) into v_after;
    end if;
  end if;

  -- This insert deliberately precedes the function return. PostgreSQL rolls
  -- back the catalog insert/update above if the immutable event cannot persist.
  insert into public.record_management_events(
    record_type,record_id,record_label,action,before_values,after_values,
    reason,acting_user_id,acting_scope
  ) values (
    p_record_type,v_id::text,v_name,
    case when v_existed then 'Updated' else 'Created' end,
    case when v_existed then v_before else null end,
    v_after,'Saved from Content Management',p_actor_user_id,'platform_admin'
  );

  return jsonb_build_object('record',v_after);
end;
$$;

comment on function public.admin_save_content_catalog_record(text,uuid,jsonb) is
  'Atomically saves an allowlisted Content Management catalog record and its immutable management event.';
revoke all on function public.admin_save_content_catalog_record(text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_save_content_catalog_record(text,uuid,jsonb)
  to service_role;

update public.engine_settings
set published_value='"20260809180000"'::jsonb,
    draft_value='"20260809180000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst, 'reload schema';

commit;
