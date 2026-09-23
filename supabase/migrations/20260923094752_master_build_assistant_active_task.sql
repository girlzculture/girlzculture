begin;
create table public.gc_assistant_active_tasks(
 id uuid primary key,salon_id uuid not null references public.salons(id),actor_id uuid not null references auth.users(id),is_demo boolean not null default false,
 tool text not null check(tool like 'prepare_%'),permission text not null,
 user_context jsonb not null default '[]' check(jsonb_typeof(user_context)='array' and octet_length(user_context::text)<=24000),
 request_ids uuid[] not null default '{}',revision bigint not null default 1,
 status text not null default 'active' check(status in('active','completed','cancelled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index gc_assistant_one_active_task on public.gc_assistant_active_tasks(salon_id,actor_id) where status='active';
create trigger aaa_demo_record_guard before insert or update on public.gc_assistant_active_tasks for each row execute function gc_private.guard_demo_record();
alter table public.gc_assistant_active_tasks enable row level security;
revoke all on public.gc_assistant_active_tasks from public,anon,authenticated;
grant select on public.gc_assistant_active_tasks to service_role;
comment on table public.gc_assistant_active_tasks is 'Explicit unfinished business action; own user-supplied instructions only, not model replies or retrieved private records. Completed/cancelled task prose is cleared.';
create function public.advance_gc_assistant_task(p_id uuid,p_salon uuid,p_actor uuid,p_revision bigint,p_tool text,p_permission text,p_request uuid,p_text text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.gc_assistant_active_tasks%rowtype;turn jsonb;
begin
 if not public.p0_business_plan_active(p_salon) or not public.p0_actor_has_permission(p_salon,p_actor,p_permission) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if p_text is null or length(trim(p_text)) not between 1 and 2400 or p_tool not like 'prepare_%' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_salon::text||p_actor::text,912));
 select * into t from public.gc_assistant_active_tasks where salon_id=p_salon and actor_id=p_actor and status='active' for update;
 if found then
  if t.id<>p_id or t.tool<>p_tool or t.permission<>p_permission then raise exception 'ASSISTANT_TASK_CHANGED';end if;
  if t.user_context @> jsonb_build_array(jsonb_build_object('request_id',p_request)) then
   if not t.user_context @> jsonb_build_array(jsonb_build_object('request_id',p_request,'text',p_text)) then raise exception 'ASSISTANT_TASK_CHANGED';end if;
   return to_jsonb(t);
  end if;
  if t.revision<>p_revision then raise exception 'ASSISTANT_TASK_CHANGED';end if;
 elsif p_revision<>0 then raise exception 'ASSISTANT_TASK_CHANGED';end if;
 turn:=jsonb_build_array(jsonb_build_object('request_id',p_request,'text',p_text));
 if octet_length((coalesce(t.user_context,'[]'::jsonb)||turn)::text)>24000 then raise exception 'ASSISTANT_TASK_CONTEXT_FULL';end if;
 if t.id is null then
  insert into public.gc_assistant_active_tasks(id,salon_id,actor_id,tool,permission,user_context,request_ids)
   values(p_id,p_salon,p_actor,p_tool,p_permission,turn,array[p_request])returning * into t;
 else
  update public.gc_assistant_active_tasks set user_context=user_context||turn,
   request_ids=(request_ids||p_request)[greatest(1,cardinality(request_ids)-4):],revision=revision+1,updated_at=now() where id=t.id returning * into t;
 end if;
 return to_jsonb(t);
end $$;
create function public.end_gc_assistant_task(p_id uuid,p_salon uuid,p_actor uuid,p_revision bigint,p_completed_request uuid default null) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.gc_assistant_active_tasks%rowtype;
begin
 select * into t from public.gc_assistant_active_tasks where id=p_id and salon_id=p_salon and actor_id=p_actor for update;
 if not found or not public.p0_actor_has_permission(p_salon,p_actor,t.permission) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if t.status<>'active' then return true;end if;
 if t.revision<>p_revision then raise exception 'ASSISTANT_TASK_CHANGED';end if;
 if p_completed_request is not null and not exists(select 1 from public.gc_assistant_requests r where r.id=p_completed_request and r.salon_id=p_salon and r.requested_by=p_actor and r.tool=t.tool and r.confirmed_at is not null and t.user_context @> jsonb_build_array(jsonb_build_object('request_id',r.id))) then raise exception 'ASSISTANT_TASK_NOT_COMPLETED';end if;
 if p_completed_request is null then
  update public.gc_assistant_requests r set failure_code='ASSISTANT_TASK_CANCELLED' where r.salon_id=p_salon and r.requested_by=p_actor and r.tool=t.tool and r.confirmed_at is null and t.user_context @> jsonb_build_array(jsonb_build_object('request_id',r.id));
 end if;
 update public.gc_assistant_active_tasks set status=case when p_completed_request is null then 'cancelled' else 'completed' end,user_context='[]',request_ids='{}',revision=revision+1,updated_at=now()where id=t.id;
 return true;
end $$;
revoke all on function public.advance_gc_assistant_task(uuid,uuid,uuid,bigint,text,text,uuid,text),public.end_gc_assistant_task(uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.advance_gc_assistant_task(uuid,uuid,uuid,bigint,text,text,uuid,text),public.end_gc_assistant_task(uuid,uuid,uuid,bigint,uuid) to service_role;
update public.engine_settings set published_value='"20260923094752"',draft_value='"20260923094752"',updated_at=now()where setting_key='integrations.expected_migration';
commit;
