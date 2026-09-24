-- Extend the existing reviewed settings operation. No provider calls or data
-- rewrites occur on application; verified addresses remain in their own store.
begin;
set local lock_timeout='5s';
alter function gc_private.assistant_controls_schema(text) rename to assistant_controls_schema_before_workspace;
create function gc_private.assistant_controls_schema(p_section text) returns jsonb language sql immutable set search_path=pg_catalog,gc_private as $schema$
 select coalesce('{"profile":{"name":{"type":"string","minLength":1,"maxLength":120},"phone":{"type":"string","maxLength":40},"languages":{"type":"array","maxItems":5,"items":{"type":"string","minLength":1,"maxLength":50}}},"notifications":{"reviews":{"type":"boolean"},"marketing":{"type":"boolean"}},"booking":{"slot_minutes":{"type":"integer","enum":[15,30,60]},"buffer_minutes":{"type":"integer","enum":[0,15,30,45,60]}},"location":{"home_address_public":{"type":"boolean"},"public_neighborhood":{"type":"string","maxLength":120},"offers_mobile":{"type":"boolean"},"travel_radius_miles":{"type":["number","null"],"minimum":1,"maximum":100},"travel_fee_cents":{"type":"integer","minimum":0,"maximum":100000}}}'::jsonb->p_section,gc_private.assistant_controls_schema_before_workspace(p_section));
$schema$;
alter function public.read_gc_business_controls(uuid,uuid,text) rename to read_gc_business_controls_before_workspace;
create function public.read_gc_business_controls(p_salon uuid,p_actor uuid,p_section text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.salons%rowtype;r jsonb;v jsonb;state jsonb;loc jsonb;
begin
 if p_section is null or p_section not in('profile','notifications','booking','location') then return public.read_gc_business_controls_before_workspace(p_salon,p_actor,p_section);end if;
 if not public.p0_actor_has_permission(p_salon,p_actor,'settings') or not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 select * into s from public.salons where id=p_salon;
 if p_section='profile' then
  v:=jsonb_build_object('name',s.name,'phone',coalesce(s.phone,''),'languages',coalesce(to_jsonb(s.languages),'[]'));
  state:=jsonb_build_object('fingerprint',md5(v::text));
 elsif p_section='notifications' then
  r:=coalesce(s.notification_preferences,'{}');v:=jsonb_build_object('reviews',coalesce(r->'reviews','true'),'marketing',coalesce(r->'marketing','true'));
  state:=jsonb_build_object('fingerprint',md5(r::text));
 elsif p_section='booking' then
  r:=coalesce(s.booking_settings,'{}');v:=jsonb_build_object('slot_minutes',coalesce(r->'slot_minutes','30'),'buffer_minutes',coalesce(r->'buffer_minutes','15'));
  state:=jsonb_build_object('fingerprint',md5(r::text));
 else
  r:=public.business_location_settings(p_salon);select to_jsonb(l) into loc from public.business_verification_locations l where salon_id=p_salon;
  if s.service_location_type is null or loc is null then raise exception 'ASSISTANT_LOCATION_REVIEW_REQUIRED';end if;
  v:=(r-array['service_location_type','revision'])||jsonb_build_object('public_neighborhood',coalesce(r->>'public_neighborhood',''));
  state:=jsonb_build_object('revision',r->'revision','service_location_type',r->'service_location_type','verification_fingerprint',md5(loc::text),'verified_address',concat_ws(', ',loc->>'address_street',nullif(loc->>'address_line2',''),loc->>'address_city',loc->>'address_state',loc->>'address_zip'));
 end if;
 return jsonb_build_object('salon_id',p_salon,'section',p_section,'plan',public.salon_effective_plan_key(p_salon),'values',v,'state',state);
end $$;
alter function public.preview_gc_business_controls(uuid,uuid,jsonb) rename to preview_gc_business_controls_before_workspace;
create function public.preview_gc_business_controls(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb;v jsonb;c jsonb;section text:=p_args->>'section';loc_type text;phone text;
begin
 r:=public.preview_gc_business_controls_before_workspace(p_salon,p_actor,p_args);
 if section not in('profile','notifications','booking','location') then return r;end if;
 v:=r->'payload'->'values';c:=r->'payload'->'changes';
 if section='profile' then
  if c?'name' then v:=jsonb_set(v,'{name}',to_jsonb(trim(v->>'name')));if length(v->>'name')=0 then raise exception 'ASSISTANT_INVALID_INPUT';end if;end if;
  if c?'phone' then
   phone:=regexp_replace(v->>'phone','[^0-9]','','g');
   if length(phone)=11 and left(phone,1)='1' then phone:=substr(phone,2);end if;
   if phone<>'' and length(phone)<>10 or trim(v->>'phone')<>'' and (phone='' or v->>'phone'~'[^0-9+(). -]') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   v:=jsonb_set(v,'{phone}',to_jsonb(case when phone='' then '' else '+1'||phone end));
  end if;
 elsif section='location' then
  loc_type:=r->'before'->'state'->>'service_location_type';
  if loc_type='mobile' then v:=jsonb_set(v,'{offers_mobile}','true');end if;
  if loc_type<>'home' then v:=jsonb_set(v,'{home_address_public}','false');end if;
  v:=jsonb_set(v,'{public_neighborhood}',to_jsonb(trim(v->>'public_neighborhood')));
  if (v->>'offers_mobile')::boolean and v->'travel_radius_miles'='null' or loc_type='home' and not (v->>'home_address_public')::boolean and length(v->>'public_neighborhood')<2 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if not (v->>'offers_mobile')::boolean then v:=jsonb_set(jsonb_set(v,'{travel_radius_miles}','null'),'{travel_fee_cents}','0');end if;
  if (v->>'home_address_public')::boolean then r:=jsonb_set(r,'{payload,public_address}',r->'before'->'state'->'verified_address');end if;
 end if;
 -- Show normalized values for every requested field, never silently save a
 -- different phone, locale or canonical location setting after confirmation.
 select jsonb_object_agg(key,v->key) into c from jsonb_object_keys(c) key;
 return jsonb_set(jsonb_set(r,'{payload,changes}',c),'{payload,values}',v);
end $$;
alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_workspace;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;fresh jsonb;v jsonb;state jsonb;receipt jsonb;section text;failure text;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 section:=r.arguments->>'section';
 if r.tool<>'prepare_business_controls' or section is null or section not in('profile','notifications','booking','location') then return public.confirm_gc_assistant_request_before_workspace(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 if section='location' then perform 1 from public.business_verification_locations where salon_id=p_salon for share;end if;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 state:=public.read_gc_business_controls(p_salon,p_actor,section);
 if r.risk_class<>4 or r.permission<>'settings' then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is not null then return jsonb_build_object('verified',true,'replayed',true,'result',r.result);end if;
 if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 begin
  fresh:=public.preview_gc_business_controls(p_salon,p_actor,r.arguments);
  if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  v:=r.execution_payload->'values';
  if section='profile' then
   update public.salons set name=v->>'name',phone=v->>'phone',languages=array(select jsonb_array_elements_text(v->'languages')) where id=p_salon;
  elsif section='notifications' then
   update public.salons set notification_preferences=coalesce(notification_preferences,'{}')||v||'{"in_app":true,"email":true,"sms":true}'::jsonb where id=p_salon;
  elsif section='booking' then
   update public.salons set booking_settings=coalesce(booking_settings,'{}')||v||'{"any_available_stylist":true}'::jsonb where id=p_salon;
  else
   perform public.update_business_location_settings(p_salon,p_actor,(r.before_summary->'state'->>'revision')::bigint,v);
  end if;
  state:=public.read_gc_business_controls(p_salon,p_actor,section);
  if state->'values' is distinct from v then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  receipt:=jsonb_build_object('section',section,'values',v,'state',state->'state','provider_action',false);
  update public.gc_assistant_requests set confirmed_at=now(),result=receipt where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'confirmed',p_actor,jsonb_build_object('after',receipt,'risk_class',4));
  return jsonb_build_object('verified',true,'replayed',false,'result',receipt);
 exception when others then
  failure:=case when sqlerrm~'^ASSISTANT_[A-Z_]+$' then sqlerrm when sqlerrm~'STALE|CHANGED|CONFLICT' then 'ASSISTANT_PREVIEW_STALE' when sqlerrm~'INVALID|check constraint' then 'ASSISTANT_INVALID_INPUT' else 'ASSISTANT_ACTION_FAILED' end;
  update public.gc_assistant_requests set failure_code=failure where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function gc_private.assistant_controls_schema(text),gc_private.assistant_controls_schema_before_workspace(text),public.read_gc_business_controls(uuid,uuid,text),public.read_gc_business_controls_before_workspace(uuid,uuid,text),public.preview_gc_business_controls(uuid,uuid,jsonb),public.preview_gc_business_controls_before_workspace(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_workspace(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_gc_business_controls(uuid,uuid,text),public.read_gc_business_controls_before_workspace(uuid,uuid,text),public.preview_gc_business_controls(uuid,uuid,jsonb),public.preview_gc_business_controls_before_workspace(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_workspace(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923183729"',draft_value='"20260923183729"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
