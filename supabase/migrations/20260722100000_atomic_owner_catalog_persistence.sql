begin;

-- A service and its material choices are one owner action. Keeping them in one
-- database function prevents partial/ghost services when material validation
-- fails after the service row was already committed.
create or replace function public.save_salon_style_with_materials(
  p_salon_id uuid,
  p_style_id uuid,
  p_values jsonb,
  p_materials jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_style public.styles;
  v_materials jsonb;
begin
  if auth.role() <> 'service_role'
     and not public.salon_has_permission(p_salon_id, 'styles')
     and not public.admin_has_permission('salons') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_style_id is not null then
    select * into v_style
    from public.styles
    where id = p_style_id and salon_id = p_salon_id
    for update;
    if not found then
      raise exception 'The service was not found in this salon.' using errcode = 'P0002';
    end if;
    v_style := jsonb_populate_record(v_style, coalesce(p_values, '{}'::jsonb));
    update public.styles set
      master_style_id = v_style.master_style_id,
      service_group_id = v_style.service_group_id,
      category_id = v_style.category_id,
      name = v_style.name,
      category = v_style.category,
      description = v_style.description,
      duration_min_hours = v_style.duration_min_hours,
      duration_max_hours = v_style.duration_max_hours,
      buffer_minutes = v_style.buffer_minutes,
      base_price = v_style.base_price,
      price_display_min = v_style.price_display_min,
      price_display_max = v_style.price_display_max,
      size_options = v_style.size_options,
      length_options = v_style.length_options,
      addons = v_style.addons,
      included_items = v_style.included_items,
      option_groups = v_style.option_groups,
      photos = v_style.photos,
      is_draft = v_style.is_draft,
      archived_at = v_style.archived_at
    where id = p_style_id and salon_id = p_salon_id
    returning * into v_style;
  else
    v_style := jsonb_populate_record(null::public.styles, coalesce(p_values, '{}'::jsonb));
    insert into public.styles(
      salon_id, master_style_id, service_group_id, category_id, name, category,
      description, duration_min_hours, duration_max_hours, buffer_minutes,
      base_price, price_display_min, price_display_max, size_options,
      length_options, addons, included_items, option_groups, photos, is_draft,
      archived_at
    ) values (
      p_salon_id, v_style.master_style_id, v_style.service_group_id, v_style.category_id,
      v_style.name, v_style.category, v_style.description, v_style.duration_min_hours,
      v_style.duration_max_hours, coalesce(v_style.buffer_minutes, 0), v_style.base_price,
      v_style.price_display_min, v_style.price_display_max,
      coalesce(v_style.size_options, '[]'::jsonb), coalesce(v_style.length_options, '[]'::jsonb),
      coalesce(v_style.addons, '[]'::jsonb), coalesce(v_style.included_items, '{}'::text[]),
      coalesce(v_style.option_groups, '[]'::jsonb), coalesce(v_style.photos, '{}'::text[]),
      coalesce(v_style.is_draft, false), v_style.archived_at
    ) returning * into v_style;
  end if;

  delete from public.style_materials where style_id = v_style.id;
  insert into public.style_materials(
    style_id, name, price, longevity_weeks, quality_grade, longevity,
    quality_note, option_type, metadata
  )
  select
    v_style.id,
    trim(value->>'name'),
    coalesce(nullif(value->>'price','')::numeric, 0),
    nullif(value->>'longevity_weeks','')::smallint,
    nullif(value->>'quality_grade',''),
    case when nullif(value->>'longevity_weeks','') is null then null else
      (value->>'longevity_weeks') || case when (value->>'longevity_weeks')::smallint = 1 then ' week' else ' weeks' end end,
    nullif(value->>'quality_grade',''),
    coalesce(nullif(value->>'option_type',''), 'material'),
    coalesce(value->'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb))
  where nullif(trim(value->>'name'), '') is not null;

  select coalesce(jsonb_agg(to_jsonb(material) order by material.created_at), '[]'::jsonb)
  into v_materials
  from public.style_materials material
  where material.style_id = v_style.id;

  return jsonb_build_object('record', to_jsonb(v_style), 'materials', v_materials);
end $$;

revoke all on function public.save_salon_style_with_materials(uuid,uuid,jsonb,jsonb) from public;
grant execute on function public.save_salon_style_with_materials(uuid,uuid,jsonb,jsonb) to authenticated, service_role;

commit;
