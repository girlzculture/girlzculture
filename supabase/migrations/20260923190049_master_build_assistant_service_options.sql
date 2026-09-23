-- Extend existing catalog review with the manual editor's priced options and
-- materials. No provider operation, historical booking rewrite or notification.
begin;
set local lock_timeout='5s';
alter function gc_private.assistant_catalog_config(text) rename to assistant_catalog_config_before_options;
create function gc_private.assistant_catalog_config(p_tool text) returns jsonb language sql immutable set search_path=pg_catalog,gc_private as $config$
 select case when p_tool='prepare_service_change' then jsonb_set(gc_private.assistant_catalog_config_before_options(p_tool),'{schema,properties}',gc_private.assistant_catalog_config_before_options(p_tool)#>'{schema,properties}' || '{"size_options":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string","maxLength":120,"minLength":1},"price_add":{"type":"number","minimum":0,"maximum":100000}},"required":["label","price_add"],"additionalProperties":false},"maxItems":30},"length_options":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string","maxLength":120,"minLength":1},"price_add":{"type":"number","minimum":0,"maximum":100000}},"required":["label","price_add"],"additionalProperties":false},"maxItems":30},"addons":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string","maxLength":120,"minLength":1},"price_add":{"type":"number","minimum":0,"maximum":100000}},"required":["label","price_add"],"additionalProperties":false},"maxItems":30},"included_items":{"type":"array","items":{"type":"string","maxLength":120,"minLength":1},"maxItems":30},"style_materials":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string","maxLength":120,"minLength":1},"price":{"type":"number","minimum":0,"maximum":100000},"longevity_weeks":{"type":"integer","minimum":1,"maximum":12},"quality_grade":{"type":"string","maxLength":50,"minLength":1}},"required":["name","price","longevity_weeks","quality_grade"],"additionalProperties":false},"maxItems":30}}'::jsonb) else gc_private.assistant_catalog_config_before_options(p_tool) end;
$config$;
create or replace function gc_private.assert_catalog_value(v jsonb,s jsonb,depth integer default 0) returns void language plpgsql immutable set search_path=pg_catalog as $$
declare kind text:=jsonb_typeof(v);types jsonb:=case when jsonb_typeof(s->'type')='array' then s->'type' else jsonb_build_array(s->'type') end;item jsonb;key text;
begin
 if depth>8 or kind is null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if kind='null' and types ? 'null' then return;end if;
 if not(types ? kind) and not(kind='number' and types ? 'integer' and v::text ~ '^-?[0-9]+$') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if s ? 'enum' and not(s->'enum' @> jsonb_build_array(v)) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if kind='string' and (length(trim(v#>>'{}'))<coalesce((s->>'minLength')::integer,0) or length(v#>>'{}')>coalesce((s->>'maxLength')::integer,4000) or (s ? 'pattern' and (v#>>'{}') !~ (s->>'pattern')) or (v#>>'{}') ~ '[[:cntrl:]]' and (v#>>'{}') ~ E'[\x01-\x08\x0b\x0c\x0e-\x1f]') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if kind='number' and ((v::text)::numeric<coalesce((s->>'minimum')::numeric,-1e100) or (v::text)::numeric>coalesce((s->>'maximum')::numeric,1e100)) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if kind='object' then
  if s->'additionalProperties' is distinct from 'false'::jsonb or jsonb_typeof(s->'properties') is distinct from 'object' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  for key in select jsonb_array_elements_text(coalesce(s->'required','[]')) loop
   if not(v ? key) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  end loop;
  for key,item in select * from jsonb_each(v) loop
   if not(s->'properties' ? key) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   perform gc_private.assert_catalog_value(item,s->'properties'->key,depth+1);
  end loop;
 end if;
 if kind='array' then
  if jsonb_array_length(v)>coalesce((s->>'maxItems')::integer,30) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  for item in select value from jsonb_array_elements(v) loop perform gc_private.assert_catalog_value(item,s->'items',depth+1);end loop;
 end if;
end $$;
create or replace function public.preview_gc_catalog_change(p_salon uuid,p_actor uuid,p_tool text,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare cfg jsonb:=gc_private.assistant_catalog_config(p_tool);permission text:=cfg->>'permission';table_name text:=cfg->>'table';target uuid;changes jsonb;prior jsonb:='{}';vals jsonb;defaults jsonb;fields text[];key text;value jsonb;reference text;linked uuid;target_table text;fingerprint text;master public.master_styles%rowtype;assigned uuid;assignment_names jsonb:='[]';target_names jsonb:='[]';materials jsonb;materials_before jsonb;materials_fingerprint text;resolved_category_id uuid;category_slug text;choice jsonb;
begin
 if cfg is null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if not public.p0_actor_has_permission(p_salon,p_actor,permission) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if jsonb_typeof(p_args) is distinct from 'object' or not(p_args ?& array['record_id','changes_json']) or p_args-array['record_id','changes_json']<>'{}' or jsonb_typeof(p_args->'changes_json') is distinct from 'string' or octet_length(p_args->>'changes_json')>24000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 target:=(p_args->>'record_id')::uuid;
 if permission='stylists' then
  select stylist_id into assigned from public.salon_team_members where salon_id=p_salon and user_id=p_actor and status='Active';
  if assigned is not null and target is distinct from assigned then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 end if;
 changes:=(p_args->>'changes_json')::jsonb;
 select array_agg(k) into fields from jsonb_object_keys(cfg->'schema'->'properties') k;
 if jsonb_typeof(changes) is distinct from 'object' or changes='{}' or changes-fields<>'{}' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 for key,value in select * from jsonb_each(changes) loop perform gc_private.assert_catalog_value(value,cfg->'schema'->'properties'->key);end loop;
 if p_tool='prepare_service_change' and changes ? 'style_materials' and jsonb_typeof(changes->'style_materials')='array' then
  -- The canonical manual save trims these two authored fields. Bind the same
  -- normalization into the exact review, never silently alter it at execution.
  select coalesce(jsonb_agg(m || jsonb_build_object('name',trim(m->>'name'),'quality_grade',trim(m->>'quality_grade')) order by n),'[]') into materials from jsonb_array_elements(changes->'style_materials') with ordinality x(m,n);
  changes:=jsonb_set(changes,'{style_materials}',materials);
 end if;
 if target is not null then
  execute format('select to_jsonb(r) from public.%I r where id=$1 and salon_id=$2 and archived_at is null',table_name) into prior using target,p_salon;
  if prior is null then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
  fingerprint:=md5(prior::text);
  -- Snapshot all current fields for stale-review protection, but expose only
  -- this tool's public catalog fields to the model and review.
  select jsonb_object_agg(k,prior->k) into prior from unnest(fields) k;
 end if;
 defaults:=case permission
 when 'styles' then jsonb_build_object('description','','is_draft',true,'is_featured',false,'buffer_minutes',0)
 when 'stylists' then jsonb_build_object('bio','','specialties','[]'::jsonb,'years_experience',0,'is_draft',true,'assigned_service_ids',null)
 when 'products' then jsonb_build_object('description','','product_status','Draft','is_visible',false,'in_person_only',true,'pickup_enabled',false,'pickup_prep_minutes',0,'shipping_enabled',false,'shipping_price',0,'max_quantity_per_order',10)
 else jsonb_build_object('description','','promotion_type','descriptive','discount_value',0,'discount_label','','status','Draft','target_scope','salon','target_ids','[]'::jsonb) end;
 if p_tool='prepare_service_change' then
  prior:=prior-'style_materials';
  if materials is not null then
   select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') into materials_before from public.style_materials m join public.styles st on st.id=m.style_id where st.id=target and st.salon_id=p_salon;
   materials_fingerprint:=md5(materials_before::text);
  end if;
 end if;
 vals:=defaults||prior||(changes-'style_materials');
 if permission in ('styles','stylists','products') and (jsonb_typeof(vals->'name') is distinct from 'string' or length(trim(vals->>'name'))=0) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if permission='styles' then
  if not(vals ?& array['base_price','duration_min_hours','duration_max_hours']) or vals->>'base_price' is null or vals->>'duration_min_hours' is null or vals->>'duration_max_hours' is null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if target is null or vals->>'master_style_id' is not null then
   select * into master from public.master_styles where id=(vals->>'master_style_id')::uuid and is_active;
   if not found then raise exception 'ASSISTANT_CATALOG_CLARIFICATION_REQUIRED';end if;
   if (changes ? 'name' or target is null) and vals->>'name' is distinct from master.name then raise exception 'ASSISTANT_CATALOG_CLARIFICATION_REQUIRED';end if;
   vals:=vals||jsonb_build_object('name',master.name,'category_id',master.category_id,'service_group_id',master.service_group_id,'category',master.category);
  end if;
  select st.category_id into resolved_category_id from public.styles st where st.id=target and st.salon_id=p_salon;
  resolved_category_id:=coalesce((vals->>'category_id')::uuid,resolved_category_id);
  select c.slug into category_slug from public.service_categories c where c.id=resolved_category_id;
  if category_slug='braiding' then
   for choice in select jsonb_array_elements(coalesce(changes->'size_options','[]')) loop
    if choice->>'label' not in ('X-Small','Small','Small-Medium','Medium','Large','Jumbo') then raise exception 'ASSISTANT_CATALOG_CLARIFICATION_REQUIRED';end if;
   end loop;
   for choice in select jsonb_array_elements(coalesce(changes->'length_options','[]')) loop
    if choice->>'label' not in ('Shoulder','Bra-strap','Mid-back','Waist','Butt/Hip','Tailbone','Classic','Mid-thigh','Knee') then raise exception 'ASSISTANT_CATALOG_CLARIFICATION_REQUIRED';end if;
   end loop;
   for choice in select jsonb_array_elements(coalesce(materials,'[]')) loop
    if choice->>'name' not in ('Kanekalon (standard)','X-Pression (premium)','Pre-stretched (premium)','Human hair (luxury)','Client provides own hair') or choice->>'quality_grade' not in ('Good','Better','Best','Luxury') then raise exception 'ASSISTANT_CATALOG_CLARIFICATION_REQUIRED';end if;
   end loop;
  end if;
  for choice in select jsonb_array_elements(coalesce(changes->'addons','[]')) loop
   if not exists(select 1 from public.service_addons a where a.category_id=resolved_category_id and lower(a.name)=lower(choice->>'label') and ((a.is_active and a.archived_at is null) or exists(select 1 from jsonb_array_elements(coalesce(prior->'addons','[]')) old_option where lower(coalesce(old_option->>'label',old_option->>'value'))=lower(a.name)))) then raise exception 'ASSISTANT_CATALOG_CLARIFICATION_REQUIRED';end if;
  end loop;
  if target is null then vals:=jsonb_build_object('price_display_min',vals->'base_price','price_display_max',vals->'base_price')||vals;end if;
  if (vals->>'duration_min_hours')::numeric>(vals->>'duration_max_hours')::numeric or (vals->>'price_display_min')::numeric>(vals->>'price_display_max')::numeric then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 elsif permission='stylists' then
  if changes ? 'assigned_service_ids' then
   if not public.p0_actor_has_permission(p_salon,p_actor,'styles') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
   if changes->'assigned_service_ids'<>'null'::jsonb then
    for reference in select jsonb_array_elements_text(changes->'assigned_service_ids') loop
     if not exists(select 1 from public.styles where id=reference::uuid and salon_id=p_salon and archived_at is null) then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
    end loop;
   end if;
  end if;
 elsif permission='products' then
  if vals->>'price' is null or (vals->>'sale_price')::numeric>(vals->>'price')::numeric then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if vals->>'product_status'='Active' and vals->'is_visible'='true' and vals->'pickup_enabled'<>'true' and vals->'shipping_enabled'<>'true' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 else
  if jsonb_typeof(vals->'title') is distinct from 'string' or length(trim(vals->>'title'))=0 or coalesce(vals->>'starts_at','')='' or coalesce(vals->>'ends_at','')='' or not exists(select 1 from pg_timezone_names where name=vals->>'timezone') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if (vals->>'starts_at')::timestamptz>=(vals->>'ends_at')::timestamptz or (vals->>'promotion_type'='percentage' and (vals->>'discount_value')::numeric>100) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if vals->>'status'='Active' and (vals->>'ends_at')::timestamptz<=now() then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if target is null and not(vals ? 'public_headline') then vals:=vals||jsonb_build_object('public_headline',vals->'title');end if;
  if vals->>'target_scope'<>'salon' then
   target_table:=case vals->>'target_scope' when 'services' then 'styles' when 'products' then 'salon_products' end;
   if target_table is null or jsonb_array_length(vals->'target_ids')=0 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   for reference in select jsonb_array_elements_text(vals->'target_ids') loop
    execute format('select id from public.%I where id=$1 and salon_id=$2 and archived_at is null',target_table) into linked using reference::uuid,p_salon;
    if linked is null then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
   end loop;
  elsif jsonb_array_length(vals->'target_ids')<>0 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 end if;
 if permission='stylists' and jsonb_typeof(vals->'assigned_service_ids')='array' then
  select coalesce(jsonb_agg(s.name order by v.n),'[]') into assignment_names from jsonb_array_elements_text(vals->'assigned_service_ids') with ordinality v(id,n) join public.styles s on s.id=v.id::uuid and s.salon_id=p_salon;
 end if;
 if permission='promotions' and vals->>'target_scope' in ('services','products') then
  execute format('select coalesce(jsonb_agg(r.name order by v.n),''[]'') from jsonb_array_elements_text($1) with ordinality v(id,n) join public.%I r on r.id=v.id::uuid and r.salon_id=$2',target_table) into target_names using vals->'target_ids',p_salon;
 end if;
 return jsonb_build_object('salon_id',p_salon,'before',jsonb_build_object('record',prior,'fingerprint',fingerprint)||case when materials is not null then jsonb_build_object('materials_fingerprint',materials_fingerprint) else '{}'::jsonb end,'payload',jsonb_build_object('record_id',target,'tool',p_tool,'values',vals,'changes',changes,'assignment_names',assignment_names,'target_names',target_names)||case when materials is not null then jsonb_build_object('materials',materials) else '{}'::jsonb end);
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then raise exception 'ASSISTANT_INVALID_INPUT';
end $$;
alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_service_options;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;cfg jsonb;fresh jsonb;vals jsonb;target uuid;table_name text;columns_sql text;values_sql text;written jsonb;expected jsonb;receipt jsonb;failure text;key text;material_result jsonb;material_readback jsonb;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 cfg:=gc_private.assistant_catalog_config(r.tool);
 if r.tool is distinct from 'prepare_service_change' then return public.confirm_gc_assistant_request_before_service_options(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if r.risk_class<>4 or r.permission is distinct from cfg->>'permission' or not public.p0_actor_has_permission(p_salon,p_actor,cfg->>'permission') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is not null then return jsonb_build_object('verified',true,'replayed',true,'result',r.result);end if;
 if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 begin
  target:=(r.arguments->>'record_id')::uuid;table_name:=cfg->>'table';
  if target is not null then execute format('select id from public.%I where id=$1 and salon_id=$2 for update',table_name) using target,p_salon;end if;
  fresh:=public.preview_gc_catalog_change(p_salon,p_actor,r.tool,r.arguments);
  if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  vals:=r.execution_payload->'values';
  -- Public-content review occurred server-side before this immutable request.
  -- The model has no route to insert or modify an approved request.
  if table_name='salon_promotions' then vals:=vals||jsonb_build_object('is_active',vals->>'status'='Active');end if;
  if table_name='stylists' and target is null then vals:=vals||jsonb_build_object('is_active',true);end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('x.%I',k),',' order by k) into columns_sql,values_sql from jsonb_object_keys(vals) k;
  if target is null then
   target:=r.id;
   execute format('insert into public.%I(id,salon_id,%s) select $2,$3,%s from jsonb_populate_record(null::public.%I,$1) x returning to_jsonb(%I.*)',table_name,columns_sql,values_sql,table_name,table_name) into written using vals,target,p_salon;
  else
   execute format('update public.%I r set (%s)=(select %s from jsonb_populate_record(r,$1) x) where id=$2 and salon_id=$3 returning to_jsonb(r.*)',table_name,columns_sql,values_sql) into written using vals,target,p_salon;
  end if;
  if r.execution_payload ? 'materials' then
   material_result:=public.save_salon_style_with_materials(p_salon,target,'{}',r.execution_payload->'materials');
   if material_result#>>'{record,id}' is distinct from target::text then raise exception 'ASSISTANT_READBACK_FAILED';end if;
   select coalesce(jsonb_agg(jsonb_build_object('name',m.name,'price',m.price,'longevity_weeks',m.longevity_weeks,'quality_grade',m.quality_grade) order by m.name,m.price,m.longevity_weeks,m.quality_grade),'[]') into material_readback from public.style_materials m where m.style_id=target;
   if material_readback is distinct from (select coalesce(jsonb_agg(v order by v->>'name',(v->>'price')::numeric,(v->>'longevity_weeks')::integer,v->>'quality_grade'),'[]') from jsonb_array_elements(r.execution_payload->'materials') v) then raise exception 'ASSISTANT_READBACK_FAILED';end if;
   select to_jsonb(st) into written from public.styles st where st.id=target and st.salon_id=p_salon;
  end if;
  execute format('select to_jsonb(x) from jsonb_populate_record(null::public.%I,$1) x',table_name) into expected using vals;
  if written->>'id' is distinct from target::text or written->>'salon_id' is distinct from p_salon::text then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  for key in select jsonb_object_keys(vals) loop
   if written->key is distinct from expected->key then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  end loop;
  receipt:=jsonb_build_object('record_id',target,'tool',r.tool,'verified',true,'provider_action',false);
  update public.gc_assistant_requests set confirmed_at=now(),result=receipt where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'confirmed',p_actor,jsonb_build_object('after',receipt,'risk_class',4));
  return jsonb_build_object('verified',true,'replayed',false,'result',receipt);
 exception when others then
  failure:=case when sqlerrm ~ '^ASSISTANT_[A-Z_]+$' then sqlerrm when sqlerrm ~ 'PLAN_.*LIMIT' then 'ASSISTANT_PLAN_LIMIT' when sqlerrm ~ 'ACCESS_DENIED|FORBIDDEN|PERMISSION' then 'ASSISTANT_ACCESS_DENIED' when sqlerrm ~ 'STALE|CONFLICT' then 'ASSISTANT_PREVIEW_STALE' else 'ASSISTANT_ACTION_FAILED' end;
  update public.gc_assistant_requests set failure_code=failure where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function gc_private.assistant_catalog_config(text),gc_private.assistant_catalog_config_before_options(text),gc_private.assert_catalog_value(jsonb,jsonb,integer),public.preview_gc_catalog_change(uuid,uuid,text,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_service_options(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.preview_gc_catalog_change(uuid,uuid,text,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_service_options(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923190049"',draft_value='"20260923190049"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
