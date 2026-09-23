-- Reviewed owner-only archive; no deletion, customer contact or provider action.
begin;
do $$
declare definition text;
begin
 select pg_get_constraintdef(oid) into definition from pg_constraint
 where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if definition is null then raise exception 'ASSISTANT_TOOL_CONTRACT_MISSING';end if;
 alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
 execute 'alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check (tool = ''prepare_professional_archive'' or '||substr(definition,7)||')';
end $$;

create function public.preview_gc_professional_archive(p_salon uuid,p_actor uuid,p_professional uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.salons%rowtype;p public.stylists%rowtype;logins jsonb;before_json jsonb;
begin
 select * into s from public.salons where id=p_salon;
 if not found or s.user_id is distinct from p_actor or not public.p0_actor_has_permission(p_salon,p_actor,'stylists') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 select * into p from public.stylists where salon_id=p_salon and id=p_professional and archived_at is null;
 if not found then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 if exists(select 1 from public.bookings where salon_id=p_salon and stylist_id=p.id
  and lower(status) not in ('cancelled','canceled','completed','no-show','no_show','noshow','declined','expired')
  and appointment_datetime+greatest(coalesce(duration_hours,1),0)*interval '1 hour'>now())
 then raise exception 'ASSISTANT_PROFESSIONAL_BOOKINGS_REMAIN';end if;
 -- Only IDs/statuses needed for explicit access-revocation review, never credentials.
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status) order by id),'[]'::jsonb)
 into logins from public.salon_team_members where salon_id=p_salon and stylist_id=p.id and status<>'Inactive';
 before_json:=jsonb_build_object('professional_id',p.id,'professional_name',p.name,'active',p.is_active,'draft',p.is_draft,'staff_access',logins);
 return jsonb_build_object('before',before_json,'payload',jsonb_build_object(
  'professional_id',p.id,'professional_name',p.name,'archive',true,'preserve_history',true,
  'disable_staff_access',logins,'upcoming_appointments',0));
end $$;

alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_professional_archive;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;p public.stylists%rowtype;fresh jsonb;saved jsonb;failure text;replayed boolean;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_professional_archive' then return public.confirm_gc_assistant_request_before_professional_archive(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon and user_id=p_actor for update;
 if not found then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 perform pg_advisory_xact_lock(hashtextextended('p0-calendar:'||p_salon::text,0));
 perform 1 from public.salon_team_members where salon_id=p_salon and stylist_id=(r.arguments->>'stylist_id')::uuid for update;
 select * into p from public.stylists where salon_id=p_salon and id=(r.arguments->>'stylist_id')::uuid for update;
 if not found then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if r.permission<>'stylists' or r.risk_class<>4 or not public.p0_actor_has_permission(p_salon,p_actor,'stylists') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is null and (r.failure_code is not null or r.expires_at<=now()) then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 replayed:=r.confirmed_at is not null;
 begin
  if jsonb_typeof(r.arguments) is distinct from 'object' or jsonb_typeof(r.arguments->'stylist_id') is distinct from 'string'
    or r.arguments-array['stylist_id']<>'{}'::jsonb then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if not replayed then
   fresh:=public.preview_gc_professional_archive(p_salon,p_actor,p.id);
   if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
   update public.stylists set archived_at=now(),is_active=false where id=p.id and salon_id=p_salon;
   update public.salon_team_members set status='Inactive' where salon_id=p_salon and stylist_id=p.id and status<>'Inactive';
   insert into public.record_management_events(record_type,record_id,record_label,action,before_values,after_values,acting_user_id,acting_scope,reason)
   values('stylist',p.id::text,p.name,'Archived',r.before_summary,jsonb_build_object('archived',true,'active',false),p_actor,'salon_owner','Owner-confirmed Assistant archive; history retained.');
  end if;
  select * into p from public.stylists where id=p.id and salon_id=p_salon;
  if p.archived_at is null or p.is_active or exists(select 1 from public.salon_team_members where salon_id=p_salon and stylist_id=p.id and status<>'Inactive') then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  saved:=jsonb_build_object('professional_id',p.id,'professional_name',p.name,'archived',true,'archived_at',p.archived_at,'staff_access_disabled',true,'history_preserved',true);
  if not replayed then
   update public.gc_assistant_requests set confirmed_at=now(),result=saved where id=r.id;
   insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'confirmed',p_actor,jsonb_build_object('after',saved,'risk_class',4));
  end if;
  return jsonb_build_object('verified',true,'replayed',replayed,'result',saved);
 exception when others then
  failure:=case when sqlerrm in ('ASSISTANT_PREVIEW_STALE','ASSISTANT_ACCESS_DENIED','ASSISTANT_INVALID_INPUT','ASSISTANT_READBACK_FAILED','ASSISTANT_PROFESSIONAL_BOOKINGS_REMAIN') then sqlerrm else 'ASSISTANT_ACTION_FAILED' end;
  if not replayed then update public.gc_assistant_requests set failure_code=failure where id=r.id;end if;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function public.preview_gc_professional_archive(uuid,uuid,uuid),
 public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_professional_archive(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.preview_gc_professional_archive(uuid,uuid,uuid),
 public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_professional_archive(uuid,uuid,uuid,text) to service_role;
grant update(archived_at,is_active) on public.stylists to service_role;
grant update(status) on public.salon_team_members to service_role;
grant insert on public.record_management_events to service_role;
commit;
