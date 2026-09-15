begin;

alter table public.styles add column if not exists sort_order integer;
alter table public.salon_products add column if not exists sort_order integer;
alter table public.salon_spreadsheet_imports add column if not exists source_layout jsonb;

create function public.import_salon_catalog_ordered(
  p_kind text, p_salon_id uuid, p_actor_user_id uuid, p_file_name text,
  p_rows jsonb, p_source_layout jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' or p_kind is null or p_kind not in ('services','products') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if public.p0_actor_has_permission(p_salon_id,p_actor_user_id,case when p_kind='services' then 'styles' else 'products' end) is not true then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if jsonb_typeof(p_source_layout) is distinct from 'object' or octet_length(p_source_layout::text)>12000 then
    raise exception 'SALON_IMPORT_LAYOUT_INVALID' using errcode='22023';
  end if;
  if p_kind='services' then
    v_result := public.import_salon_services_spreadsheet(p_salon_id,p_actor_user_id,p_file_name,p_rows);
    update public.styles s set sort_order=ordered.ordinality::integer
    from jsonb_array_elements_text(v_result->'record_ids') with ordinality ordered(id,ordinality)
    where s.id=ordered.id::uuid and s.salon_id=p_salon_id;
  else
    v_result := public.import_salon_products_spreadsheet(p_salon_id,p_actor_user_id,p_file_name,p_rows);
    update public.salon_products p set sort_order=ordered.ordinality::integer
    from jsonb_array_elements_text(v_result->'record_ids') with ordinality ordered(id,ordinality)
    where p.id=ordered.id::uuid and p.salon_id=p_salon_id;
  end if;
  -- The existing importer holds its per-business advisory lock until commit.
  -- Record the original headings/mapping in that exact import's protected audit.
  update public.salon_spreadsheet_imports set source_layout=p_source_layout
  where salon_id=p_salon_id and actor_user_id=p_actor_user_id
    and import_kind=p_kind and result=v_result and created_at=transaction_timestamp();
  return v_result;
end;
$$;
revoke all on function public.import_salon_catalog_ordered(text,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.import_salon_catalog_ordered(text,uuid,uuid,text,jsonb,jsonb) to service_role;

commit;
