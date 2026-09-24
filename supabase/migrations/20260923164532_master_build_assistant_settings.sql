begin;
set local lock_timeout='5s';
do $$declare d text;begin
 select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if d is null then raise exception 'ASSISTANT_TOOL_CONTRACT_MISSING';end if;
 alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
 execute 'alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check (tool in (''get_business_controls'',''prepare_business_controls'') or '||substr(d,7)||')';
end $$;

create function gc_private.assistant_controls_schema(p_section text) returns jsonb language sql immutable set search_path=pg_catalog as $schema$
 select '{"deposits":{"rate":{"type":"number","minimum":0,"maximum":100},"threshold_amount":{"type":["number","null"],"minimum":0,"maximum":10000},"threshold_rate":{"type":["number","null"],"minimum":0,"maximum":100},"repeat_incident_count":{"type":["integer","null"],"minimum":1,"maximum":100},"repeat_incident_rate":{"type":["number","null"],"minimum":0,"maximum":100},"incident_window_days":{"type":"integer","minimum":1,"maximum":730}},"growth":{"reminder_hours":{"type":["array","null"],"maxItems":6,"items":{"type":"integer","minimum":1,"maximum":336}},"waitlist_service_ids":{"type":"array","maxItems":100,"items":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"}},"waitlist_professional_ids":{"type":"array","maxItems":100,"items":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"}}},"rebooking":{"enabled":{"type":"boolean"},"absence_days":{"type":"integer","minimum":30,"maximum":180},"minimum_visits":{"type":"integer","minimum":1,"maximum":20},"service_ids":{"type":"array","maxItems":100,"items":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"}}}}'::jsonb->p_section;
$schema$;

create function public.read_gc_business_controls(p_salon uuid,p_actor uuid,p_section text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb;values_json jsonb;fields text[];plan text;rate numeric;
begin
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor)
  or not public.p0_actor_has_permission(p_salon,p_actor,'settings') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if gc_private.assistant_controls_schema(p_section) is null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 plan:=public.salon_effective_plan_key(p_salon);
 if p_section='deposits' then
  select to_jsonb(d)-array['salon_id'] into r from public.current_business_deposit_rules d where salon_id=p_salon;
  if r is null then
   rate:=public.engine_number_setting('booking.deposit_percentage',10);if rate not between 0 and 100 then rate:=10;end if;
   r:=jsonb_build_object('id',null,'rate',rate,'threshold_amount',null,'threshold_rate',null,'repeat_incident_count',null,'repeat_incident_rate',null,'incident_window_days',365);
  end if;
  r:=(r-'id')||jsonb_build_object('version',r->'id');
 elsif p_section='growth' then r:=public.read_business_growth_settings(p_salon,p_actor);
 else r:=public.read_business_rebooking_settings(p_salon,p_actor)-array['attempts','salon_id'];end if;
 select array_agg(k) into fields from jsonb_object_keys(gc_private.assistant_controls_schema(p_section)) k;
 select jsonb_object_agg(k,r->k) into values_json from unnest(fields) k;
 return jsonb_build_object('salon_id',p_salon,'section',p_section,'plan',plan,'values',values_json,'state',r-fields);
end $$;

create function public.preview_gc_business_controls(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare section text:=p_args->>'section';current_data jsonb;cfg jsonb;changes jsonb;v jsonb;fields text[];k text;item jsonb;plan text;ids jsonb;names jsonb:='{}';ref text;table_name text;
begin
 current_data:=public.read_gc_business_controls(p_salon,p_actor,section);cfg:=gc_private.assistant_controls_schema(section);plan:=current_data->>'plan';
 if jsonb_typeof(p_args) is distinct from 'object' or p_args-array['section','changes_json']<>'{}' or jsonb_typeof(p_args->'changes_json') is distinct from 'string' or octet_length(p_args->>'changes_json')>24000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 changes:=(p_args->>'changes_json')::jsonb;
 select array_agg(key) into fields from jsonb_object_keys(cfg) key;
 if jsonb_typeof(changes) is distinct from 'object' or changes='{}' or changes-fields<>'{}' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 for k,item in select * from jsonb_each(changes) loop perform gc_private.assert_catalog_value(item,cfg->k);end loop;
 v:=current_data->'values'||changes;
 -- Validate complete state before review; preserve every unrequested setting.
 for k,item in select * from jsonb_each(v) loop
  perform gc_private.assert_catalog_value(item,cfg->k);
  if jsonb_typeof(item)='array' and jsonb_array_length(item)<>(select count(distinct value) from jsonb_array_elements(item)) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 end loop;
 if section='deposits' then
  if (v->'threshold_amount'='null')<>(v->'threshold_rate'='null') or (v->'repeat_incident_count'='null')<>(v->'repeat_incident_rate'='null')
   or (v->>'threshold_rate')::numeric<(v->>'rate')::numeric or (v->>'repeat_incident_rate')::numeric<(v->>'rate')::numeric
   or exists(select 1 from jsonb_each(v) where jsonb_typeof(value)='number' and (value::text)::numeric<>round((value::text)::numeric,2)) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 elsif section='growth' then
  if v->'reminder_hours'<>'null' and (jsonb_array_length(v->'reminder_hours')=0 or plan not in('solo-pro','growth','premium') or jsonb_array_length(v->'reminder_hours')>case when plan='premium' then 6 else 2 end) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
  if (jsonb_array_length(v->'waitlist_service_ids')>0 or jsonb_array_length(v->'waitlist_professional_ids')>0) and plan<>'premium' then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
  if v->'reminder_hours'<>'null' then select jsonb_agg(value order by value::text::integer desc) into item from jsonb_array_elements(v->'reminder_hours');v:=jsonb_set(v,'{reminder_hours}',item);end if;
 elsif (v->>'enabled')::boolean and (plan not in('solo-pro','growth','premium') or (current_data->'state'->>'is_demo')::boolean
  or plan<>'premium' and ((v->>'minimum_visits')::integer<>1 or jsonb_array_length(v->'service_ids')>0)) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 for k,ids in select key,value from jsonb_each(v) where key in('waitlist_service_ids','waitlist_professional_ids','service_ids') loop
  table_name:=case when k='waitlist_professional_ids' then 'stylists' else 'styles' end;
  for ref in select jsonb_array_elements_text(ids) loop
   execute format('select to_jsonb(r) from public.%I r where id=$1 and salon_id=$2 and archived_at is null and not is_draft',table_name) into item using ref::uuid,p_salon;
   if item is null or table_name='stylists' and item->'is_active'<>'true' then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
  end loop;
  -- Canonical settings storage sorts UUIDs; retain semantic order on readback.
  select coalesce(jsonb_agg(value order by value),'[]') into ids from jsonb_array_elements(ids);v:=jsonb_set(v,array[k],ids);
  execute format('select coalesce(jsonb_agg(r.name order by x.value),''[]'') from jsonb_array_elements_text($1)x join public.%I r on r.id=x.value::uuid and r.salon_id=$2',table_name) into item using ids,p_salon;
  names:=names||jsonb_build_object(k,item);
 end loop;
 return jsonb_build_object('salon_id',p_salon,'before',current_data,'payload',jsonb_build_object('section',section,'values',v,'changes',changes,'names',names));
exception when invalid_text_representation then raise exception 'ASSISTANT_INVALID_INPUT';
end $$;

alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_controls;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;fresh jsonb;v jsonb;saved jsonb;after_data jsonb;section text;receipt jsonb;failure text;version uuid;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_business_controls' then return public.confirm_gc_assistant_request_before_controls(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 section:=r.arguments->>'section';after_data:=public.read_gc_business_controls(p_salon,p_actor,section);
 if r.risk_class<>4 or r.permission<>'settings' then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is not null then return jsonb_build_object('verified',true,'replayed',true,'result',r.result);end if;
 if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 begin
  fresh:=public.preview_gc_business_controls(p_salon,p_actor,r.arguments);
  if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  v:=r.execution_payload->'values';
  if section='deposits' then
   saved:=public.save_business_deposit_rule(p_salon,p_actor,r.id,(r.before_summary->'state'->>'version')::uuid,v);version:=(saved->>'id')::uuid;
  elsif section='growth' then
   saved:=public.save_business_growth_settings(p_salon,p_actor,(r.before_summary->'state'->>'revision')::integer,v);
  else
   saved:=public.save_business_rebooking_settings(p_salon,p_actor,(r.before_summary->'state'->>'revision')::integer,(v->>'enabled')::boolean,(v->>'absence_days')::integer,(v->>'minimum_visits')::integer,array(select value::uuid from jsonb_array_elements_text(v->'service_ids')),true);
  end if;
  after_data:=public.read_gc_business_controls(p_salon,p_actor,section);
  if after_data->'values' is distinct from v
   or section='deposits' and (after_data->'state'->>'version')::uuid is distinct from version
   or section<>'deposits' and (after_data->'state'->>'revision')::integer<>(r.before_summary->'state'->>'revision')::integer+1 then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  receipt:=jsonb_build_object('section',section,'values',v,'state',after_data->'state','provider_action',false);
  update public.gc_assistant_requests set confirmed_at=now(),result=receipt where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'confirmed',p_actor,jsonb_build_object('after',receipt,'risk_class',4));
  return jsonb_build_object('verified',true,'replayed',false,'result',receipt);
 exception when others then
  failure:=case when sqlerrm ~ '^ASSISTANT_[A-Z_]+$' then sqlerrm when sqlerrm ~ 'PLAN_REQUIRED' then 'ASSISTANT_PLAN_REQUIRED' when sqlerrm ~ 'STALE|CHANGED|CONFLICT' then 'ASSISTANT_PREVIEW_STALE' when sqlerrm ~ 'INVALID|check constraint' then 'ASSISTANT_INVALID_INPUT' else 'ASSISTANT_ACTION_FAILED' end;
  update public.gc_assistant_requests set failure_code=failure where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function gc_private.assistant_controls_schema(text),public.read_gc_business_controls(uuid,uuid,text),public.preview_gc_business_controls(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_controls(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_gc_business_controls(uuid,uuid,text),public.preview_gc_business_controls(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_controls(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923164532"'::jsonb,draft_value='"20260923164532"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
