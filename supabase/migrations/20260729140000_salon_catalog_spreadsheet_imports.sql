-- Transactional salon-owner spreadsheet imports for services and products.
-- Additive and forward-only. Existing catalog, booking, media, and commerce
-- records are preserved.

begin;

create table if not exists public.salon_spreadsheet_imports (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  import_kind text not null check (import_kind in ('services', 'products')),
  file_name text,
  rows_created integer not null default 0 check (rows_created >= 0),
  rows_updated integer not null default 0 check (rows_updated >= 0),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists salon_spreadsheet_imports_salon_created_idx
  on public.salon_spreadsheet_imports(salon_id, created_at desc);

alter table public.salon_spreadsheet_imports enable row level security;

drop policy if exists salon_spreadsheet_imports_owner_read
  on public.salon_spreadsheet_imports;
create policy salon_spreadsheet_imports_owner_read
  on public.salon_spreadsheet_imports
  for select
  to authenticated
  using (public.owns_salon(salon_id) or public.is_admin());

grant select on public.salon_spreadsheet_imports to authenticated;

create or replace function public.import_salon_services_spreadsheet(
  p_salon_id uuid,
  p_actor_user_id uuid,
  p_file_name text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row jsonb;
  v_record_id uuid;
  v_category_id uuid;
  v_group_id uuid;
  v_master_id uuid;
  v_style_id uuid;
  v_category_name text;
  v_group_name text;
  v_name text;
  v_addon jsonb;
  v_created integer := 0;
  v_updated integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_salon_id is null
     or not exists (select 1 from public.salons where id = p_salon_id) then
    raise exception 'SALON_IMPORT_SALON_NOT_FOUND' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) < 1
     or jsonb_array_length(p_rows) > 1000 then
    raise exception 'SALON_IMPORT_SERVICE_ROWS_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtext(p_salon_id::text || ':salon-service-spreadsheet')
  );

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_record_id := nullif(v_row->>'record_id', '')::uuid;
    v_category_id := nullif(v_row->>'category_id', '')::uuid;
    v_group_id := nullif(v_row->>'service_group_id', '')::uuid;
    v_master_id := nullif(v_row->>'master_style_id', '')::uuid;
    v_name := nullif(trim(v_row->>'name'), '');
    if v_name is null then
      raise exception 'SALON_IMPORT_SERVICE_NAME_REQUIRED' using errcode = '22023';
    end if;

    select category.name
    into v_category_name
    from public.service_categories category
    where category.id = v_category_id
      and category.is_active
      and category.archived_at is null;
    if not found then
      raise exception 'SALON_IMPORT_CATEGORY_INVALID' using errcode = '22023';
    end if;

    select service_group.name
    into v_group_name
    from public.service_groups service_group
    where service_group.id = v_group_id
      and service_group.category_id = v_category_id
      and service_group.is_active
      and service_group.archived_at is null;
    if not found then
      raise exception 'SALON_IMPORT_GROUP_INVALID' using errcode = '22023';
    end if;

    if v_master_id is not null and not exists (
      select 1
      from public.master_styles master_style
      where master_style.id = v_master_id
        and master_style.category_id = v_category_id
        and master_style.service_group_id = v_group_id
        and master_style.is_active
        and master_style.archived_at is null
    ) then
      raise exception 'SALON_IMPORT_PLATFORM_SERVICE_INVALID' using errcode = '22023';
    end if;

    for v_addon in
      select value
      from jsonb_array_elements(coalesce(v_row->'addons', '[]'::jsonb))
    loop
      if not exists (
        select 1
        from public.service_addons addon
        where addon.category_id = v_category_id
          and lower(trim(addon.name)) = lower(trim(v_addon->>'label'))
          and addon.is_active
          and addon.archived_at is null
      ) then
        raise exception 'SALON_IMPORT_ADDON_INVALID: %', v_addon->>'label'
          using errcode = '22023';
      end if;
    end loop;

    if v_record_id is not null then
      select style.id
      into v_style_id
      from public.styles style
      where style.id = v_record_id and style.salon_id = p_salon_id
      for update;
      if not found then
        raise exception 'SALON_IMPORT_SERVICE_RECORD_NOT_FOUND'
          using errcode = 'P0002';
      end if;
    else
      select style.id
      into v_style_id
      from public.styles style
      where style.salon_id = p_salon_id
        and style.category_id = v_category_id
        and style.service_group_id = v_group_id
        and style.master_style_id is not distinct from v_master_id
        and lower(trim(style.name)) = lower(v_name)
      order by (style.archived_at is null) desc, style.created_at desc
      limit 1
      for update;
    end if;

    if v_style_id is null then
      insert into public.styles (
        salon_id,
        master_style_id,
        service_group_id,
        category_id,
        name,
        category,
        description,
        duration_min_hours,
        duration_max_hours,
        buffer_minutes,
        base_price,
        price_display_min,
        price_display_max,
        addons,
        is_draft,
        archived_at
      ) values (
        p_salon_id,
        v_master_id,
        v_group_id,
        v_category_id,
        v_name,
        v_group_name,
        coalesce(v_row->>'description', ''),
        (v_row->>'duration_min_hours')::numeric,
        (v_row->>'duration_max_hours')::numeric,
        (v_row->>'buffer_minutes')::integer,
        (v_row->>'base_price')::numeric,
        (v_row->>'base_price')::numeric,
        (v_row->>'price_display_max')::numeric,
        coalesce(v_row->'addons', '[]'::jsonb),
        false,
        null
      )
      returning id into v_style_id;
      v_created := v_created + 1;
    else
      update public.styles
      set
        master_style_id = v_master_id,
        service_group_id = v_group_id,
        category_id = v_category_id,
        name = v_name,
        category = v_group_name,
        description = coalesce(v_row->>'description', ''),
        duration_min_hours = (v_row->>'duration_min_hours')::numeric,
        duration_max_hours = (v_row->>'duration_max_hours')::numeric,
        buffer_minutes = (v_row->>'buffer_minutes')::integer,
        base_price = (v_row->>'base_price')::numeric,
        price_display_min = (v_row->>'base_price')::numeric,
        price_display_max = (v_row->>'price_display_max')::numeric,
        addons = coalesce(v_row->'addons', '[]'::jsonb),
        is_draft = false,
        archived_at = null
      where id = v_style_id and salon_id = p_salon_id;
      v_updated := v_updated + 1;
    end if;
    v_ids := v_ids || jsonb_build_array(v_style_id);
  end loop;

  v_result := jsonb_build_object(
    'kind', 'services',
    'created', v_created,
    'updated', v_updated,
    'record_ids', v_ids
  );
  insert into public.salon_spreadsheet_imports (
    salon_id,
    actor_user_id,
    import_kind,
    file_name,
    rows_created,
    rows_updated,
    result
  ) values (
    p_salon_id,
    p_actor_user_id,
    'services',
    nullif(left(trim(coalesce(p_file_name, '')), 255), ''),
    v_created,
    v_updated,
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.import_salon_products_spreadsheet(
  p_salon_id uuid,
  p_actor_user_id uuid,
  p_file_name text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row jsonb;
  v_record_id uuid;
  v_product_id uuid;
  v_name text;
  v_sku text;
  v_status text;
  v_pickup boolean;
  v_shipping boolean;
  v_visible boolean;
  v_created integer := 0;
  v_updated integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_salon_id is null
     or not exists (select 1 from public.salons where id = p_salon_id) then
    raise exception 'SALON_IMPORT_SALON_NOT_FOUND' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) < 1
     or jsonb_array_length(p_rows) > 1000 then
    raise exception 'SALON_IMPORT_PRODUCT_ROWS_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtext(p_salon_id::text || ':salon-product-spreadsheet')
  );

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_record_id := nullif(v_row->>'record_id', '')::uuid;
    v_name := nullif(trim(v_row->>'name'), '');
    v_sku := nullif(trim(v_row->>'sku'), '');
    v_status := coalesce(nullif(v_row->>'product_status', ''), 'Draft');
    v_pickup := coalesce((v_row->>'pickup_enabled')::boolean, false);
    v_shipping := coalesce((v_row->>'shipping_enabled')::boolean, false);
    v_visible := coalesce((v_row->>'is_visible')::boolean, true);
    if v_name is null then
      raise exception 'SALON_IMPORT_PRODUCT_NAME_REQUIRED' using errcode = '22023';
    end if;
    if v_status not in ('Draft', 'Active', 'Archived') then
      raise exception 'SALON_IMPORT_PRODUCT_STATUS_INVALID' using errcode = '22023';
    end if;
    if v_status = 'Active' and v_visible and not v_pickup and not v_shipping then
      raise exception 'SALON_IMPORT_PRODUCT_FULFILLMENT_REQUIRED'
        using errcode = '22023';
    end if;

    if v_record_id is not null then
      select product.id
      into v_product_id
      from public.salon_products product
      where product.id = v_record_id and product.salon_id = p_salon_id
      for update;
      if not found then
        raise exception 'SALON_IMPORT_PRODUCT_RECORD_NOT_FOUND'
          using errcode = 'P0002';
      end if;
    elsif v_sku is not null then
      select product.id
      into v_product_id
      from public.salon_products product
      where product.salon_id = p_salon_id
        and lower(trim(product.sku)) = lower(v_sku)
      order by (product.archived_at is null) desc, product.created_at desc
      limit 1
      for update;
    else
      select product.id
      into v_product_id
      from public.salon_products product
      where product.salon_id = p_salon_id
        and lower(trim(product.name)) = lower(v_name)
      order by (product.archived_at is null) desc, product.created_at desc
      limit 1
      for update;
    end if;

    if v_product_id is null then
      insert into public.salon_products (
        salon_id,
        name,
        description,
        price,
        sale_price,
        sku,
        is_visible,
        in_person_only,
        inventory_quantity,
        low_stock_threshold,
        track_inventory,
        product_status,
        pickup_enabled,
        pickup_prep_minutes,
        shipping_enabled,
        weight_ounces,
        dimensions,
        shipping_profile,
        shipping_price,
        tax_category,
        max_quantity_per_order,
        archived_at
      ) values (
        p_salon_id,
        v_name,
        coalesce(v_row->>'description', ''),
        (v_row->>'price')::numeric,
        nullif(v_row->>'sale_price', '')::numeric,
        v_sku,
        case when v_status = 'Archived' then false else v_visible end,
        not v_pickup and not v_shipping,
        (v_row->>'inventory_quantity')::integer,
        (v_row->>'low_stock_threshold')::integer,
        (v_row->>'track_inventory')::boolean,
        v_status,
        v_pickup,
        (v_row->>'pickup_prep_minutes')::integer,
        v_shipping,
        nullif(v_row->>'weight_ounces', '')::numeric,
        jsonb_build_object(
          'length', nullif(v_row->>'dimension_length', '')::numeric,
          'width', nullif(v_row->>'dimension_width', '')::numeric,
          'height', nullif(v_row->>'dimension_height', '')::numeric,
          'unit', 'in'
        ),
        nullif(v_row->>'shipping_profile', ''),
        (v_row->>'shipping_price')::numeric,
        v_row->>'tax_category',
        (v_row->>'max_quantity_per_order')::integer,
        case when v_status = 'Archived' then now() else null end
      )
      returning id into v_product_id;
      v_created := v_created + 1;
    else
      update public.salon_products
      set
        name = v_name,
        description = coalesce(v_row->>'description', ''),
        price = (v_row->>'price')::numeric,
        sale_price = nullif(v_row->>'sale_price', '')::numeric,
        sku = v_sku,
        is_visible = case when v_status = 'Archived' then false else v_visible end,
        in_person_only = not v_pickup and not v_shipping,
        inventory_quantity = (v_row->>'inventory_quantity')::integer,
        low_stock_threshold = (v_row->>'low_stock_threshold')::integer,
        track_inventory = (v_row->>'track_inventory')::boolean,
        product_status = v_status,
        pickup_enabled = v_pickup,
        pickup_prep_minutes = (v_row->>'pickup_prep_minutes')::integer,
        shipping_enabled = v_shipping,
        weight_ounces = nullif(v_row->>'weight_ounces', '')::numeric,
        dimensions = jsonb_build_object(
          'length', nullif(v_row->>'dimension_length', '')::numeric,
          'width', nullif(v_row->>'dimension_width', '')::numeric,
          'height', nullif(v_row->>'dimension_height', '')::numeric,
          'unit', 'in'
        ),
        shipping_profile = nullif(v_row->>'shipping_profile', ''),
        shipping_price = (v_row->>'shipping_price')::numeric,
        tax_category = v_row->>'tax_category',
        max_quantity_per_order = (v_row->>'max_quantity_per_order')::integer,
        archived_at = case when v_status = 'Archived' then now() else null end,
        updated_at = now()
      where id = v_product_id and salon_id = p_salon_id;
      v_updated := v_updated + 1;
    end if;
    v_ids := v_ids || jsonb_build_array(v_product_id);
  end loop;

  v_result := jsonb_build_object(
    'kind', 'products',
    'created', v_created,
    'updated', v_updated,
    'record_ids', v_ids
  );
  insert into public.salon_spreadsheet_imports (
    salon_id,
    actor_user_id,
    import_kind,
    file_name,
    rows_created,
    rows_updated,
    result
  ) values (
    p_salon_id,
    p_actor_user_id,
    'products',
    nullif(left(trim(coalesce(p_file_name, '')), 255), ''),
    v_created,
    v_updated,
    v_result
  );
  return v_result;
end;
$$;

revoke all on function public.import_salon_services_spreadsheet(
  uuid, uuid, text, jsonb
) from public;
revoke all on function public.import_salon_products_spreadsheet(
  uuid, uuid, text, jsonb
) from public;
grant execute on function public.import_salon_services_spreadsheet(
  uuid, uuid, text, jsonb
) to service_role;
grant execute on function public.import_salon_products_spreadsheet(
  uuid, uuid, text, jsonb
) to service_role;

commit;
