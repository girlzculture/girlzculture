begin;

create or replace function public.admin_import_service_catalog(
  p_rows jsonb,
  p_actor_user_id uuid,
  p_reason text default 'Platform service catalog spreadsheet import'
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_allowed boolean := false;
  v_row jsonb;
  v_row_number integer := 0;
  v_category_name text;
  v_category_slug text;
  v_group_name text;
  v_service_name text;
  v_addons jsonb;
  v_addon jsonb;
  v_addon_name text;
  v_category public.service_categories%rowtype;
  v_group public.service_groups%rowtype;
  v_service public.master_styles%rowtype;
  v_existing_addon public.service_addons%rowtype;
  v_created_categories integer := 0;
  v_restored_categories integer := 0;
  v_created_groups integer := 0;
  v_restored_groups integer := 0;
  v_created_services integer := 0;
  v_restored_services integer := 0;
  v_created_addons integer := 0;
  v_restored_addons integer := 0;
  v_summary jsonb;
begin
  select exists(
    select 1
    from public.admin_users admin_user
    where coalesce(admin_user.user_id, admin_user.id) = p_actor_user_id
      and admin_user.status = 'Active'
      and (
        coalesce(admin_user.is_super_admin, false)
        or coalesce((admin_user.permissions->>'content')::boolean, false)
      )
  ) into v_allowed;
  if not v_allowed then
    raise exception 'CATALOG_IMPORT_FORBIDDEN: You do not have permission to import the service catalog.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception 'CATALOG_IMPORT_INVALID: Choose 1 to 2000 catalog rows.'
      using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'CATALOG_IMPORT_INVALID: Enter an import reason of at least 5 characters.'
      using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_row_number := v_row_number + 1;
    v_category_name := trim(coalesce(v_row->>'category', ''));
    v_category_slug := trim(coalesce(v_row->>'category_slug', ''));
    v_group_name := trim(coalesce(v_row->>'service_group', ''));
    v_service_name := trim(coalesce(v_row->>'service_name', ''));
    v_addons := coalesce(v_row->'addons', '[]'::jsonb);

    if length(v_category_name) not between 1 and 80 then
      raise exception 'CATALOG_IMPORT_INVALID: Row % has an invalid Category.', v_row_number
        using errcode = '22023';
    end if;
    if v_category_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
       or length(v_category_slug) > 80 then
      raise exception 'CATALOG_IMPORT_INVALID: Row % has an invalid category URL slug.', v_row_number
        using errcode = '22023';
    end if;
    if length(v_group_name) > 80 then
      raise exception 'CATALOG_IMPORT_INVALID: Row % has a Service Group longer than 80 characters.', v_row_number
        using errcode = '22023';
    end if;
    if length(v_service_name) > 100 then
      raise exception 'CATALOG_IMPORT_INVALID: Row % has a Service Name longer than 100 characters.', v_row_number
        using errcode = '22023';
    end if;
    if v_service_name <> '' and v_group_name = '' then
      raise exception 'CATALOG_IMPORT_INVALID: Row % needs a Service Group for its Service Name.', v_row_number
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_addons) is distinct from 'array'
       or jsonb_array_length(v_addons) > 50 then
      raise exception 'CATALOG_IMPORT_INVALID: Row % has an invalid add-on list.', v_row_number
        using errcode = '22023';
    end if;

    select *
    into v_category
    from public.service_categories category
    where lower(category.name) = lower(v_category_name)
    limit 1
    for update;

    if not found then
      if exists(
        select 1 from public.service_categories
        where slug = v_category_slug
          and lower(name) <> lower(v_category_name)
      ) then
        raise exception 'CATALOG_IMPORT_CONFLICT: Category URL slug "%" is already in use.', v_category_slug
          using errcode = '23505';
      end if;
      insert into public.service_categories(
        slug, name, description, sort_order, is_active, archived_at, updated_at
      )
      values (
        v_category_slug,
        v_category_name,
        null,
        coalesce((select max(sort_order) from public.service_categories), 0) + 10,
        true,
        null,
        now()
      )
      returning * into v_category;
      v_created_categories := v_created_categories + 1;
    elsif not v_category.is_active or v_category.archived_at is not null then
      update public.service_categories
      set is_active = true, archived_at = null, updated_at = now()
      where id = v_category.id
      returning * into v_category;
      v_restored_categories := v_restored_categories + 1;
    end if;

    v_group := null;
    if v_group_name <> '' then
      select *
      into v_group
      from public.service_groups service_group
      where service_group.category_id = v_category.id
        and lower(service_group.name) = lower(v_group_name)
      limit 1
      for update;
      if not found then
        insert into public.service_groups(
          category_id, name, sort_order, is_active, archived_at, updated_at
        )
        values (
          v_category.id,
          v_group_name,
          coalesce((
            select max(sort_order)
            from public.service_groups
            where category_id = v_category.id
          ), 0) + 10,
          true,
          null,
          now()
        )
        returning * into v_group;
        v_created_groups := v_created_groups + 1;
      elsif not v_group.is_active or v_group.archived_at is not null then
        update public.service_groups
        set is_active = true, archived_at = null, updated_at = now()
        where id = v_group.id
        returning * into v_group;
        v_restored_groups := v_restored_groups + 1;
      end if;
    end if;

    if v_service_name <> '' then
      select *
      into v_service
      from public.master_styles master
      where lower(master.name) = lower(v_service_name)
      limit 1
      for update;
      if found and (
        v_service.category_id is distinct from v_category.id
        or v_service.service_group_id is distinct from v_group.id
      ) then
        raise exception 'CATALOG_IMPORT_CONFLICT: Service Name "%" already belongs to another category or service group.', v_service_name
          using errcode = '23505';
      elsif not found then
        insert into public.master_styles(
          name, category, category_id, service_group_id,
          sort_order, is_active, archived_at, updated_at
        )
        values (
          v_service_name,
          v_group.name,
          v_category.id,
          v_group.id,
          coalesce((select max(sort_order) from public.master_styles), 0) + 10,
          true,
          null,
          now()
        )
        returning * into v_service;
        v_created_services := v_created_services + 1;
      elsif not v_service.is_active or v_service.archived_at is not null then
        update public.master_styles
        set is_active = true, archived_at = null, updated_at = now()
        where id = v_service.id
        returning * into v_service;
        v_restored_services := v_restored_services + 1;
      end if;
    end if;

    for v_addon in select value from jsonb_array_elements(v_addons) loop
      v_addon_name := trim(v_addon #>> '{}');
      if length(v_addon_name) not between 1 and 80 then
        raise exception 'CATALOG_IMPORT_INVALID: Row % has an invalid add-on.', v_row_number
          using errcode = '22023';
      end if;
      select *
      into v_existing_addon
      from public.service_addons addon
      where addon.category_id = v_category.id
        and lower(addon.name) = lower(v_addon_name)
      limit 1
      for update;
      if not found then
        insert into public.service_addons(
          category_id, name, sort_order, is_active, archived_at, updated_at
        )
        values (
          v_category.id,
          v_addon_name,
          coalesce((
            select max(sort_order)
            from public.service_addons
            where category_id = v_category.id
          ), 0) + 10,
          true,
          null,
          now()
        );
        v_created_addons := v_created_addons + 1;
      elsif not v_existing_addon.is_active
            or v_existing_addon.archived_at is not null then
        update public.service_addons
        set is_active = true, archived_at = null, updated_at = now()
        where id = v_existing_addon.id;
        v_restored_addons := v_restored_addons + 1;
      end if;
    end loop;
  end loop;

  v_summary := jsonb_build_object(
    'rows_processed', v_row_number,
    'created', jsonb_build_object(
      'categories', v_created_categories,
      'service_groups', v_created_groups,
      'service_names', v_created_services,
      'addons', v_created_addons
    ),
    'restored', jsonb_build_object(
      'categories', v_restored_categories,
      'service_groups', v_restored_groups,
      'service_names', v_restored_services,
      'addons', v_restored_addons
    )
  );

  insert into public.record_management_events(
    record_type,
    record_id,
    record_label,
    action,
    dependency_summary,
    before_values,
    after_values,
    reason,
    acting_user_id,
    acting_scope
  )
  values (
    'service_catalog_import',
    gen_random_uuid()::text,
    'Platform service catalog spreadsheet import',
    'Created',
    jsonb_build_object('rows', v_row_number),
    null,
    v_summary,
    trim(p_reason),
    p_actor_user_id,
    'platform_admin'
  );

  return jsonb_build_object('ok', true) || v_summary;
end;
$$;

revoke all on function public.admin_import_service_catalog(jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_import_service_catalog(jsonb, uuid, text)
  to service_role;

comment on function public.admin_import_service_catalog(jsonb, uuid, text) is
  'Atomically creates or restores platform service categories, groups, names, and category-level add-ons from a validated spreadsheet preview.';

commit;
