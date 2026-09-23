begin;
set local lock_timeout='5s';
do $$declare d text;begin
 select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if d is null then raise exception 'ASSISTANT_TOOL_CONTRACT_MISSING';end if;
 alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
 execute 'alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check (tool in (''get_team_controls'',''prepare_team_controls'') or '||substr(d,7)||')';
end $$;
create function gc_private.assert_assistant_team_owner(p_salon uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) or not public.p0_actor_has_permission(p_salon,p_actor,'settings') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) or public.salon_effective_plan_key(p_salon) in('solo','solo-pro') then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
end $$;
create function public.assert_gc_team_target(p_salon uuid,p_actor uuid,p_operation text,p_record uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$begin
 perform gc_private.assert_assistant_team_owner(p_salon,p_actor);
 if p_operation='permissions' then
  if not exists(select 1 from public.salon_team_members where salon_id=p_salon and id=p_record) then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 elsif p_operation='arrangement' then
  if not exists(select 1 from public.stylists where salon_id=p_salon and id=p_record) then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 else raise exception 'ASSISTANT_INVALID_INPUT';end if;
 return jsonb_build_object('salon_id',p_salon,'authorized',true);
end $$;
create function public.read_gc_team_controls(p_salon uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$declare m jsonb;s jsonb;a jsonb;begin
 perform gc_private.assert_assistant_team_owner(p_salon,p_actor);
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into m from(select id,name,role,status,stylist_id,permissions from public.salon_team_members where salon_id=p_salon order by name,id limit 100) r;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into s from(select id,name from public.stylists where salon_id=p_salon and archived_at is null order by name,id limit 100) r;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into a from(select id,stylist_id,effective_from,kind,basis,percent,amount_cents,period from public.business_compensation_arrangements where salon_id=p_salon order by effective_from desc,id limit 100) r;
 return jsonb_build_object('salon_id',p_salon,'members',m,'professionals',s,'arrangements',a,'totals',jsonb_build_object('members',(select count(*) from public.salon_team_members where salon_id=p_salon),'professionals',(select count(*) from public.stylists where salon_id=p_salon and archived_at is null),'arrangements',(select count(*) from public.business_compensation_arrangements where salon_id=p_salon)),'capped_at',100,'as_of',now());
end $$;
create function public.preview_gc_team_change(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare op text:=p_args->>'operation';target_id uuid;changes jsonb;v jsonb;before_data jsonb;target jsonb;history jsonb;fields text[];k text;item jsonb;today date;permissions text[]:=array['overview','my_page','photos','styles','stylists','products','availability','bookings','reviews','earnings','earnings_own','finance_log','finance_manage','client_history','client_formulas','client_notes','client_cautions','client_photos','client_spend','client_edit','promotions','settings'];
begin
 perform gc_private.assert_assistant_team_owner(p_salon,p_actor);
 if jsonb_typeof(p_args) is distinct from 'object' or p_args-array['operation','record_id','changes_json']<>'{}' or op not in('permissions','arrangement') or op is null or jsonb_typeof(p_args->'changes_json') is distinct from 'string' or octet_length(p_args->>'changes_json')>24000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 target_id:=(p_args->>'record_id')::uuid;changes:=(p_args->>'changes_json')::jsonb;
 if target_id is null or jsonb_typeof(changes) is distinct from 'object' or changes='{}' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if op='permissions' then
  select jsonb_build_object('id',m.id,'name',m.name,'role',m.role,'status',m.status,'stylist_id',m.stylist_id,'permissions',m.permissions) into target from public.salon_team_members m where salon_id=p_salon and m.id=target_id;
  if target is null then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
  if changes-array['permissions','status']<>'{}' or changes?'status' and (jsonb_typeof(changes->'status')<>'string' or changes->>'status' not in('Active','Inactive')) or changes?'permissions' and (jsonb_typeof(changes->'permissions')<>'object' or (changes->'permissions')-permissions<>'{}') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if changes?'permissions' then for k,item in select * from jsonb_each(changes->'permissions') loop if jsonb_typeof(item)<>'boolean' then raise exception 'ASSISTANT_INVALID_INPUT';end if;end loop;end if;
  if changes='{"permissions":{}}' or target->>'status' not in('Active','Inactive') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  v:=jsonb_build_object('status',coalesce(changes->'status',target->'status'),'permissions',coalesce(target->'permissions','{}')||coalesce(changes->'permissions','{}'));
  before_data:=target;
 else
  select jsonb_build_object('id',s.id,'name',s.name,'is_active',s.is_active,'archived_at',s.archived_at) into target from public.stylists s where salon_id=p_salon and s.id=target_id and archived_at is null;
  if target is null then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
  fields:=array['effective_from','kind','basis','percent','amount_cents','period'];
  if changes-fields<>'{}' or not changes?&fields or jsonb_typeof(changes->'effective_from')<>'string' or changes->>'effective_from'!~'^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(changes->'kind')<>'string' or changes->>'kind' not in('commission','booth','employee','none') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  select (now() at time zone coalesce(nullif(time_zone,''),'America/New_York'))::date into today from public.salons where salons.id=p_salon;
  if (changes->>'effective_from')::date<today or (changes->>'effective_from')::date>today+interval '5 years' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if changes->>'kind'='commission' then
   if changes->>'basis' not in('before_discount','after_discount') or jsonb_typeof(changes->'basis')<>'string' or jsonb_typeof(changes->'percent')<>'number' or (changes->>'percent')::numeric not between 0 and 100 or (changes->>'percent')::numeric<>round((changes->>'percent')::numeric,2) or changes->'amount_cents'<>'null' or changes->'period'<>'null' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  elsif changes->>'kind' in('booth','employee') then
   if jsonb_typeof(changes->'amount_cents')<>'number' or changes->>'amount_cents'!~'^[0-9]+$' or (changes->>'amount_cents')::numeric>100000000 or jsonb_typeof(changes->'period')<>'string' or changes->>'period' not in('week','month') or changes->'basis'<>'null' or changes->'percent'<>'null' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  elsif changes->'basis'<>'null' or changes->'percent'<>'null' or changes->'amount_cents'<>'null' or changes->'period'<>'null' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if exists(select 1 from public.business_compensation_arrangements where salon_id=p_salon and stylist_id=target_id and effective_from=(changes->>'effective_from')::date) then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.effective_from,a.id),'[]') into history from public.business_compensation_arrangements a where salon_id=p_salon and stylist_id=target_id;
  before_data:=jsonb_build_object('professional',target,'arrangements_fingerprint',md5(history::text));v:=changes;
 end if;
 return jsonb_build_object('salon_id',p_salon,'before',before_data,'payload',jsonb_build_object('operation',op,'record_id',target_id,'name',target->>'name','changes',changes,'values',v,'provider_action',false));
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then raise exception 'ASSISTANT_INVALID_INPUT';
end $$;

alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_team;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;fresh jsonb;v jsonb;saved jsonb;receipt jsonb;actual jsonb;target_id uuid;failure text;op text;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_team_controls' then return public.confirm_gc_assistant_request_before_team(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 perform gc_private.assert_assistant_team_owner(p_salon,p_actor);
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if r.risk_class<>4 or r.permission<>'settings' then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is not null then return jsonb_build_object('verified',true,'replayed',true,'result',r.result);end if;
 if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 begin
  target_id:=(r.arguments->>'record_id')::uuid;op:=r.arguments->>'operation';
  if op='permissions' then perform 1 from public.salon_team_members where id=target_id and salon_id=p_salon for update;
  else perform 1 from public.stylists where id=target_id and salon_id=p_salon for update;end if;
  fresh:=public.preview_gc_team_change(p_salon,p_actor,r.arguments);
  if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  v:=r.execution_payload->'values';
  if op='permissions' then
   update public.salon_team_members set permissions=v->'permissions',status=v->>'status' where id=target_id and salon_id=p_salon;
   select jsonb_build_object('status',status,'permissions',permissions) into actual from public.salon_team_members where id=target_id and salon_id=p_salon;
   if actual is distinct from v then raise exception 'ASSISTANT_READBACK_FAILED';end if;
   insert into public.record_management_events(record_type,record_id,record_label,action,dependency_summary,before_values,after_values,reason,acting_user_id,acting_scope) values('salon_team_member',target_id,r.execution_payload->>'name','Updated',jsonb_build_object('salon_id',p_salon),r.before_summary,r.before_summary||v,'Owner reviewed assistant team permission change',p_actor,'salon_owner');
  else
   saved:=public.record_business_finance(p_salon,p_actor,r.id,'arrangement',v||jsonb_build_object('stylist_id',target_id));
   select to_jsonb(a)-array['id','salon_id','stylist_id','created_at','created_by','is_demo'] into actual from public.business_compensation_arrangements a where salon_id=p_salon and id=(saved->>'id')::uuid and stylist_id=target_id;
   if actual is distinct from v then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  end if;
  receipt:=jsonb_build_object('operation',op,'record_id',target_id,'name',r.execution_payload->>'name','values',actual,'arrangement_id',saved->'id','provider_action',false);
  update public.gc_assistant_requests set confirmed_at=now(),result=receipt where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'confirmed',p_actor,jsonb_build_object('after',receipt,'risk_class',4));
  return jsonb_build_object('verified',true,'replayed',false,'result',receipt);
 exception when others then
  failure:=case when sqlerrm~'^ASSISTANT_[A-Z_]+$' then sqlerrm when sqlerrm~'PLAN_REQUIRED' then 'ASSISTANT_PLAN_REQUIRED' when sqlerrm~'CONFLICT|STALE' then 'ASSISTANT_PREVIEW_STALE' when sqlerrm~'INVALID|check constraint' then 'ASSISTANT_INVALID_INPUT' else 'ASSISTANT_ACTION_FAILED' end;
  update public.gc_assistant_requests set failure_code=failure where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function public.assert_gc_team_target(uuid,uuid,text,uuid),gc_private.assert_assistant_team_owner(uuid,uuid),public.read_gc_team_controls(uuid,uuid),public.preview_gc_team_change(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_team(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.assert_gc_team_target(uuid,uuid,text,uuid),public.read_gc_team_controls(uuid,uuid),public.preview_gc_team_change(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_team(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923171728"',draft_value='"20260923171728"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
