-- Reviewed own-business marketing using the existing draft/publication ledger.
begin;
set local lock_timeout='5s';
do $$declare d text;begin
 select pg_get_constraintdef(oid) into d from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if d is null then raise exception 'ASSISTANT_TOOL_CONTRACT_MISSING';end if;
 alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
 execute 'alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check (tool in (''get_marketing_records'',''prepare_marketing_change'') or '||substr(d,7)||')';
end $$;
create function public.read_gc_business_marketing(p_salon uuid,p_actor uuid,p_record uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare posts jsonb;n integer;
begin
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) or not public.p0_actor_has_permission(p_salon,p_actor,'promotions') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 select count(*) into n from public.business_marketing_posts where salon_id=p_salon;
 if p_record is not null then
  select to_jsonb(p) into posts from public.business_marketing_posts p where id=p_record and salon_id=p_salon;
  if posts is null then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
  posts:=jsonb_build_array(posts-'created_by'-'approved_by');
 else
  select coalesce(jsonb_agg(v),'[]') into posts from (select id,revision,status,copies#>>'{en,title}' as title,scheduled_at,expires_at from public.business_marketing_posts where salon_id=p_salon order by updated_at desc,id limit 25)v;
 end if;
 return jsonb_build_object('salon_id',p_salon,'posts',posts,'total',n,'list_limit',25,'external_posting',false);
end $$;
create function public.preview_gc_assistant_marketing(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c jsonb;operation text;target uuid;p public.business_marketing_posts%rowtype;snap jsonb;before_state jsonb;payload jsonb;loc text;
begin
 perform public.read_gc_business_marketing(p_salon,p_actor,null);
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if jsonb_typeof(p_args) is distinct from 'object' or not p_args?&array['operation','record_id','changes_json'] or p_args-array['operation','record_id','changes_json']<>'{}' or jsonb_typeof(p_args->'changes_json') is distinct from 'string' or octet_length(p_args->>'changes_json')>6000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 operation:=p_args->>'operation';target:=(p_args->>'record_id')::uuid;c:=(p_args->>'changes_json')::jsonb;
 if jsonb_typeof(c) is distinct from 'object' or operation not in ('marketing_draft','marketing_publish','marketing_cancel') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if target is not null then
  select * into p from public.business_marketing_posts where id=target and salon_id=p_salon;
  if not found then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 elsif operation<>'marketing_draft' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 before_state:=case when target is null then jsonb_build_object('new',true) else jsonb_build_object('revision',p.revision,'status',p.status,'fingerprint',md5(to_jsonb(p)::text)) end;
 if operation='marketing_draft' then
  if c-array['source','copies']<>'{}' or not c?&array['source','copies'] or jsonb_typeof(c->'source') is distinct from 'object' or (c->'source')-array['photo_urls','service_id','promotion_id','booking_id']<>'{}' or not(c->'source')?&array['photo_urls','service_id','promotion_id','booking_id'] or jsonb_typeof(c->'copies') is distinct from 'object' or (c->'copies')-array['en','fr','es','zh-CN']<>'{}' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  foreach loc in array array['en','fr','es','zh-CN'] loop
   if jsonb_typeof(c->'copies'->loc) is distinct from 'object' or (c->'copies'->loc)-array['title','body','tags']<>'{}' or jsonb_typeof(c->'copies'->loc->'title') is distinct from 'string' or length(trim(c->'copies'->loc->>'title')) not between 1 and 160 or jsonb_typeof(c->'copies'->loc->'body') is distinct from 'string' or length(trim(c->'copies'->loc->>'body')) not between 1 and 2400 or jsonb_typeof(c->'copies'->loc->'tags') is distinct from 'array' or jsonb_array_length(c->'copies'->loc->'tags')>8 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  end loop;
  if target is not null and p.status='published' then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  snap:=public.business_marketing_snapshot(p_salon,c->'source');
  payload:=jsonb_build_object('operation',operation,'record_id',target,'changes',c,'snapshot',snap,'next_status','draft','external_posting',false);
 else
  if operation='marketing_cancel' then
   if c<>'{}' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  else
   if c-array['scheduled_at','expires_at']<>'{}' or not c?&array['scheduled_at','expires_at'] or jsonb_typeof(c->'scheduled_at') is distinct from 'string' or jsonb_typeof(c->'expires_at') is distinct from 'string' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   if p.status<>'draft' then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   if (c->>'scheduled_at')::timestamptz<now()-interval '1 minute' or (c->>'scheduled_at')::timestamptz>now()+interval '180 days' or (c->>'expires_at')::timestamptz<=(c->>'scheduled_at')::timestamptz or (c->>'expires_at')::timestamptz>now()+interval '366 days' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   if not public.business_marketing_sources_current(p_salon,p.source,p.snapshot) then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  end if;
  payload:=jsonb_build_object('operation',operation,'record_id',target,'changes',c,'copies',p.copies,'snapshot',p.snapshot,'time_zone',(select time_zone from public.salons where id=p_salon),'next_status',case when operation='marketing_cancel' then 'cancelled' else 'scheduled' end,'external_posting',false);
 end if;
 return jsonb_build_object('salon_id',p_salon,'before',before_state,'payload',payload);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'ASSISTANT_INVALID_INPUT';
 when others then
 if sqlerrm like 'MARKETING_%' then raise exception 'ASSISTANT_PREVIEW_STALE';else raise;end if;
end $$;
alter function public.preview_gc_business_operation(uuid,uuid,jsonb) rename to preview_gc_business_operation_before_marketing;
create function public.preview_gc_business_operation(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if p_args->>'operation' like 'marketing_%' then return public.preview_gc_assistant_marketing(p_salon,p_actor,p_args);end if;
 return public.preview_gc_business_operation_before_marketing(p_salon,p_actor,p_args);
end $$;
alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_marketing;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;fresh jsonb;saved jsonb;c jsonb;target uuid;p public.business_marketing_posts%rowtype;failure text;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_marketing_change' then return public.confirm_gc_assistant_request_before_marketing(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 perform public.read_gc_business_marketing(p_salon,p_actor,null);
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if r.risk_class<>4 or r.permission<>'promotions' then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is not null then return jsonb_build_object('verified',true,'replayed',true,'result',r.result);end if;
 if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 begin
  target:=(r.arguments->>'record_id')::uuid;
  perform 1 from public.business_marketing_posts where id=target and salon_id=p_salon for update;
  fresh:=public.preview_gc_assistant_marketing(p_salon,p_actor,r.arguments);
  if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  c:=r.execution_payload->'changes';
  case r.arguments->>'operation'
   when 'marketing_draft' then saved:=public.save_business_marketing_post(p_salon,p_actor,coalesce(target,r.id),coalesce((r.before_summary->>'revision')::integer,0),c->'source',c->'copies');
   when 'marketing_publish' then saved:=public.approve_business_marketing_post(p_salon,p_actor,target,(r.before_summary->>'revision')::integer,(c->>'scheduled_at')::timestamptz,(c->>'expires_at')::timestamptz,array['en','fr','es','zh-CN'],true);
   when 'marketing_cancel' then saved:=public.cancel_business_marketing_post(p_salon,p_actor,target,(r.before_summary->>'revision')::integer);
   else raise exception 'ASSISTANT_INVALID_INPUT';
  end case;
  select * into p from public.business_marketing_posts where id=(saved->>'id')::uuid and salon_id=p_salon;
  if not found or p.revision is distinct from (saved->>'revision')::integer or p.status is distinct from saved->>'status' then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  saved:=jsonb_build_object('id',p.id,'revision',p.revision,'status',p.status,'operation',r.arguments->>'operation','copies',p.copies,'scheduled_at',p.scheduled_at,'expires_at',p.expires_at,'external_posting',false);
  update public.gc_assistant_requests set confirmed_at=now(),result=saved where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'confirmed',p_actor,jsonb_build_object('after',saved,'risk_class',4));
  return jsonb_build_object('verified',true,'replayed',false,'result',saved);
 exception when others then
  failure:=case when sqlerrm~'^ASSISTANT_[A-Z_]+$' then sqlerrm when sqlerrm like 'MARKETING_%' then 'ASSISTANT_PREVIEW_STALE' else 'ASSISTANT_ACTION_FAILED' end;
  update public.gc_assistant_requests set failure_code=failure where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function public.read_gc_business_marketing(uuid,uuid,uuid),public.preview_gc_assistant_marketing(uuid,uuid,jsonb),public.preview_gc_business_operation(uuid,uuid,jsonb),public.preview_gc_business_operation_before_marketing(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_marketing(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_gc_business_marketing(uuid,uuid,uuid),public.preview_gc_assistant_marketing(uuid,uuid,jsonb),public.preview_gc_business_operation(uuid,uuid,jsonb),public.preview_gc_business_operation_before_marketing(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_marketing(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923203222"',draft_value='"20260923203222"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
