begin;
create table public.business_reusable_replies (
 id uuid primary key,
 salon_id uuid not null references public.salons(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 80),
 body text not null check(length(btrim(body)) between 1 and 2000),
 source_locale text not null check(source_locale in('en','fr','es','zh-CN','unknown')),
 revision integer not null default 1 check(revision>0),
 archived_at timestamptz,
 created_by uuid not null, updated_by uuid not null,
 last_request_id uuid not null, last_request jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index business_reusable_replies_scope on public.business_reusable_replies(salon_id,(archived_at is not null),updated_at desc,id);
alter table public.business_reusable_replies enable row level security;
revoke all on public.business_reusable_replies from public,anon,authenticated;
grant select,insert,update on public.business_reusable_replies to service_role;
-- Lock only authorization rows for a mutation; concurrent permission removal,
-- identity suspension and ownership transfer cannot pass between check/write.
grant select,update(user_id) on public.platform_identities,public.salon_team_members,public.salons to service_role;

create function public.business_reusable_reply_json(p public.business_reusable_replies) returns jsonb
language sql immutable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'salon_id',p.salon_id,'title',p.title,'body',p.body,'source_locale',p.source_locale,'revision',p.revision,'archived_at',p.archived_at,'updated_at',p.updated_at);
$$;

create function public.business_reusable_replies_workspace(p_salon uuid,p_actor uuid,p_offset integer default 0,p_archived boolean default false,p_query text default '',p_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare v_result jsonb;
begin
 if public.p0_actor_has_permission(p_salon,p_actor,'bookings') is not true then raise exception 'REPLY_FORBIDDEN';end if;
 if p_offset is null or p_offset<0 or p_offset>9999999 or p_archived is null or p_query is null or length(p_query)>80 then raise exception 'REPLY_INVALID';end if;
 with matching as materialized (
  select r.* from public.business_reusable_replies r where r.salon_id=p_salon and (r.archived_at is not null)=p_archived
   and (p_id is null or r.id=p_id) and (p_query='' or position(lower(p_query) in lower(r.title||E'\n'||r.body))>0)
 ), page as (select * from matching order by updated_at desc,id offset p_offset limit 25)
 select jsonb_build_object('salon_id',p_salon,'rows',coalesce((select jsonb_agg(public.business_reusable_reply_json(page) order by updated_at desc,id) from page),'[]'::jsonb),'total',(select count(*) from matching),'offset',p_offset,'page_size',25,'archived',p_archived) into v_result;
 return v_result;
end $$;

create function public.save_business_reusable_reply(p_salon uuid,p_actor uuid,p_action jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_id uuid;v_request uuid;v_expected integer;v_row public.business_reusable_replies%rowtype;v_kind text;v_keys text[];
begin
 if p_salon is null or p_actor is null or p_action is null or jsonb_typeof(p_action)<>'object' then raise exception 'REPLY_INVALID';end if;
 -- Fixed lock order for this feature; no booking/message/provider rows are touched.
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salons where id=p_salon for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 if public.p0_actor_has_permission(p_salon,p_actor,'bookings') is not true then raise exception 'REPLY_FORBIDDEN';end if;
 v_kind:=p_action->>'action';
 v_keys:=case when v_kind='save' then array['action','id','request_id','expected_revision','title','body','source_locale'] else array['action','id','request_id','expected_revision','confirm'] end;
 if v_kind is null or v_kind not in('save','archive') or exists(select 1 from jsonb_object_keys(p_action) k where not(k=any(v_keys)))
  or jsonb_typeof(p_action->'id') is distinct from 'string' or jsonb_typeof(p_action->'request_id') is distinct from 'string'
  or (p_action->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or (p_action->>'request_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'REPLY_INVALID';end if;
 v_id:=(p_action->>'id')::uuid;v_request:=(p_action->>'request_id')::uuid;
 if not(p_action ? 'expected_revision') or jsonb_typeof(p_action->'expected_revision') not in('number','null') then raise exception 'REPLY_INVALID';end if;
 if p_action->'expected_revision'<>'null'::jsonb then
  if (p_action->>'expected_revision') !~ '^[1-9][0-9]{0,9}$' or (p_action->>'expected_revision')::numeric>2147483646 then raise exception 'REPLY_INVALID';end if;
  v_expected:=(p_action->>'expected_revision')::integer;
 end if;
 if v_kind='save' and (jsonb_typeof(p_action->'title') is distinct from 'string' or jsonb_typeof(p_action->'body') is distinct from 'string'
  or length(btrim(p_action->>'title')) not between 1 and 80 or length(btrim(p_action->>'body')) not between 1 and 2000
  or length(p_action->>'title')>80 or length(p_action->>'body')>2000 or (p_action->>'source_locale') is null or (p_action->>'source_locale') not in('en','fr','es','zh-CN','unknown')) then raise exception 'REPLY_INVALID';end if;
 if v_kind='archive' and (v_expected is null or p_action->'confirm' is distinct from 'true'::jsonb) then raise exception 'REPLY_INVALID';end if;
 select * into v_row from public.business_reusable_replies where salon_id=p_salon and id=v_id for update;
 if found then
  if v_row.last_request_id=v_request then
   if v_row.last_request is distinct from p_action or v_row.updated_by is distinct from p_actor then raise exception 'REPLY_REQUEST_REUSED';end if;
   return public.business_reusable_reply_json(v_row);
  end if;
  if v_expected is null or v_row.revision<>v_expected then raise exception 'REPLY_STALE';end if;
  if v_row.archived_at is not null then raise exception 'REPLY_NOT_FOUND';end if;
  update public.business_reusable_replies set
   title=case when v_kind='save' then p_action->>'title' else title end,
   body=case when v_kind='save' then p_action->>'body' else body end,
   source_locale=case when v_kind='save' then p_action->>'source_locale' else source_locale end,
   archived_at=case when v_kind='archive' then now() else null end,
   revision=revision+1,updated_at=now(),updated_by=p_actor,last_request_id=v_request,last_request=p_action
   where salon_id=p_salon and id=v_id returning * into v_row;
 else
  if v_kind<>'save' or v_expected is not null then raise exception 'REPLY_NOT_FOUND';end if;
  insert into public.business_reusable_replies(id,salon_id,title,body,source_locale,created_by,updated_by,last_request_id,last_request)
  values(v_id,p_salon,p_action->>'title',p_action->>'body',p_action->>'source_locale',p_actor,p_actor,v_request,p_action)
  on conflict(id) do nothing returning * into v_row;
  if not found then raise exception 'REPLY_STALE';end if;
 end if;
 return public.business_reusable_reply_json(v_row);
end $$;
revoke all on function public.business_reusable_reply_json(public.business_reusable_replies),public.business_reusable_replies_workspace(uuid,uuid,integer,boolean,text,uuid),public.save_business_reusable_reply(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.business_reusable_reply_json(public.business_reusable_replies),public.business_reusable_replies_workspace(uuid,uuid,integer,boolean,text,uuid),public.save_business_reusable_reply(uuid,uuid,jsonb) to service_role;
update public.engine_settings set published_value='"20260919181855"'::jsonb,draft_value='"20260919181855"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
