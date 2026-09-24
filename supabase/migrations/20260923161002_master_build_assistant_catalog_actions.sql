-- Same-business catalog edits with explicit review, moderation and atomic readback.
begin;
do $$declare definition text;begin
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if definition is null then raise exception 'ASSISTANT_TOOL_CONTRACT_MISSING';end if;
 alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
 execute 'alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check (tool in (''prepare_service_change'',''prepare_professional_change'',''prepare_product_change'',''prepare_promotion_change'') or '||substr(definition,7)||')';
end $$;
create function gc_private.assistant_catalog_config(p_tool text) returns jsonb language sql immutable set search_path=pg_catalog as $config$
 select '{"prepare_service_change":{"permission":"styles","table":"styles","schema":{"type":"object","properties":{"name":{"type":"string","maxLength":120},"description":{"type":"string","maxLength":1000},"master_style_id":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"base_price":{"type":"number","minimum":0,"maximum":100000},"price_display_min":{"type":"number","minimum":0,"maximum":100000},"price_display_max":{"type":"number","minimum":0,"maximum":100000},"duration_min_hours":{"type":"number","minimum":0.25,"maximum":24},"duration_max_hours":{"type":"number","minimum":0.25,"maximum":24},"buffer_minutes":{"type":"integer","minimum":0,"maximum":180},"is_draft":{"type":"boolean"},"is_featured":{"type":"boolean"}},"required":[],"additionalProperties":false}},"prepare_professional_change":{"permission":"stylists","table":"stylists","schema":{"type":"object","properties":{"name":{"type":"string","maxLength":120},"bio":{"type":"string","maxLength":500},"specialties":{"type":"array","items":{"type":"string","maxLength":80},"maxItems":20},"years_experience":{"type":"number","minimum":0,"maximum":70},"is_draft":{"type":"boolean"},"assigned_service_ids":{"type":["array","null"],"items":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"maxItems":1000}},"required":[],"additionalProperties":false}},"prepare_product_change":{"permission":"products","table":"salon_products","schema":{"type":"object","properties":{"name":{"type":"string","maxLength":120},"description":{"type":"string","maxLength":1000},"price":{"type":"number","minimum":0,"maximum":100000},"sale_price":{"type":["number","null"],"minimum":0,"maximum":100000},"sku":{"type":["string","null"],"maxLength":80},"is_visible":{"type":"boolean"},"in_person_only":{"type":"boolean"},"product_status":{"type":"string","enum":["Draft","Active","Archived"]},"pickup_enabled":{"type":"boolean"},"pickup_prep_minutes":{"type":"integer","minimum":0,"maximum":43200},"shipping_enabled":{"type":"boolean"},"shipping_price":{"type":"number","minimum":0,"maximum":100000},"shipping_profile":{"type":["string","null"],"maxLength":120},"weight_ounces":{"type":["number","null"],"minimum":0.01,"maximum":100000},"max_quantity_per_order":{"type":"integer","minimum":1,"maximum":1000}},"required":[],"additionalProperties":false}},"prepare_promotion_change":{"permission":"promotions","table":"salon_promotions","schema":{"type":"object","properties":{"title":{"type":"string","maxLength":160},"description":{"type":"string","maxLength":1000},"public_headline":{"type":"string","maxLength":160},"promotion_type":{"type":"string","enum":["percentage","fixed","descriptive"]},"discount_value":{"type":"number","minimum":0,"maximum":100000},"discount_label":{"type":"string","maxLength":80},"starts_at":{"type":"string","maxLength":40},"ends_at":{"type":"string","maxLength":40},"timezone":{"type":"string","maxLength":80},"status":{"type":"string","enum":["Draft","Active","Paused","Archived"]},"target_scope":{"type":"string","enum":["salon","services","products"]},"target_ids":{"type":"array","items":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"maxItems":100}},"required":[],"additionalProperties":false}}}'::jsonb->p_tool;
$config$;
create function gc_private.assert_catalog_value(v jsonb,s jsonb,depth integer default 0) returns void language plpgsql immutable set search_path=pg_catalog as $$
declare kind text:=jsonb_typeof(v);types jsonb:=case when jsonb_typeof(s->'type')='array' then s->'type' else jsonb_build_array(s->'type') end;item jsonb;
begin
 if depth>3 or kind is null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if kind='null' and types ? 'null' then return;end if;
 if not(types ? kind) and not(kind='number' and types ? 'integer' and v::text ~ '^-?[0-9]+$') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if s ? 'enum' and not(s->'enum' @> jsonb_build_array(v)) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if kind='string' and (length(v#>>'{}')>coalesce((s->>'maxLength')::integer,4000) or (s ? 'pattern' and (v#>>'{}') !~ (s->>'pattern')) or (v#>>'{}') ~ '[[:cntrl:]]' and (v#>>'{}') ~ E'[\x01-\x08\x0b\x0c\x0e-\x1f]') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if kind='number' and ((v::text)::numeric<coalesce((s->>'minimum')::numeric,-1e100) or (v::text)::numeric>coalesce((s->>'maximum')::numeric,1e100)) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if kind='array' then
  if jsonb_array_length(v)>coalesce((s->>'maxItems')::integer,30) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  for item in select value from jsonb_array_elements(v) loop perform gc_private.assert_catalog_value(item,s->'items',depth+1);end loop;
 end if;
end $$;
create function public.preview_gc_catalog_change(p_salon uuid,p_actor uuid,p_tool text,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare cfg jsonb:=gc_private.assistant_catalog_config(p_tool);permission text:=cfg->>'permission';table_name text:=cfg->>'table';target uuid;changes jsonb;prior jsonb:='{}';vals jsonb;defaults jsonb;fields text[];key text;value jsonb;reference text;linked uuid;target_table text;fingerprint text;master public.master_styles%rowtype;assigned uuid;assignment_names jsonb:='[]';target_names jsonb:='[]';
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
 vals:=defaults||prior||changes;
 if permission in ('styles','stylists','products') and (jsonb_typeof(vals->'name') is distinct from 'string' or length(trim(vals->>'name'))=0) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if permission='styles' then
  if not(vals ?& array['base_price','duration_min_hours','duration_max_hours']) or vals->>'base_price' is null or vals->>'duration_min_hours' is null or vals->>'duration_max_hours' is null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if target is null or vals->>'master_style_id' is not null then
   select * into master from public.master_styles where id=(vals->>'master_style_id')::uuid and is_active;
   if not found then raise exception 'ASSISTANT_CATALOG_CLARIFICATION_REQUIRED';end if;
   if (changes ? 'name' or target is null) and vals->>'name' is distinct from master.name then raise exception 'ASSISTANT_CATALOG_CLARIFICATION_REQUIRED';end if;
   vals:=vals||jsonb_build_object('name',master.name,'category_id',master.category_id,'service_group_id',master.service_group_id,'category',master.category);
  end if;
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
 return jsonb_build_object('salon_id',p_salon,'before',jsonb_build_object('record',prior,'fingerprint',fingerprint),'payload',jsonb_build_object('record_id',target,'tool',p_tool,'values',vals,'changes',changes,'assignment_names',assignment_names,'target_names',target_names));
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then raise exception 'ASSISTANT_INVALID_INPUT';
end $$;
alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_catalog;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;cfg jsonb;fresh jsonb;vals jsonb;target uuid;table_name text;columns_sql text;values_sql text;written jsonb;expected jsonb;receipt jsonb;failure text;key text;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 cfg:=gc_private.assistant_catalog_config(r.tool);
 if cfg is null then return public.confirm_gc_assistant_request_before_catalog(p_request,p_salon,p_actor,p_digest);end if;
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
revoke all on function gc_private.assistant_catalog_config(text),gc_private.assert_catalog_value(jsonb,jsonb,integer),public.preview_gc_catalog_change(uuid,uuid,text,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_catalog(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.preview_gc_catalog_change(uuid,uuid,text,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_catalog(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923161002"'::jsonb,draft_value='"20260923161002"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
