begin;
-- Server-only encrypted connections. No credentials or Google account inventories
-- are exposed through customer, staff, assistant, export or public APIs.
create table public.business_google_connections(
 salon_id uuid primary key references public.salons(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 status text not null check(status in ('authorized','connected','disconnected')),
 secret text,
 generation integer not null default 1,
 account_name text,location_name text,
 remote_hash text,local_hash text,
 auto_sync boolean not null default false,
 last_success_at timestamptz,last_error text,
 lease_id uuid,lease_until timestamptz,
 updated_at timestamptz not null default now(),
 next_check_at timestamptz not null default now(),
 check(account_name is null or account_name ~ '^accounts/[0-9]+$'),
 check(location_name is null or location_name ~ '^locations/[0-9]+$'),
 check((status='disconnected' and secret is null and not auto_sync) or (status<>'disconnected' and secret like 'v1.%'))
);
create unique index business_google_location_mapping on public.business_google_connections(location_name) where status='connected';
create table public.business_google_oauth_flows(
 state_hash text primary key check(state_hash ~ '^[a-f0-9]{64}$'),
 salon_id uuid not null references public.salons(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 verifier_secret text not null check(verifier_secret like 'v1.%'),
 generation integer not null,
 expires_at timestamptz not null
);
create index business_google_flow_expiry on public.business_google_oauth_flows(expires_at);
create table public.business_google_sync_operations(
 id uuid primary key,
 salon_id uuid not null references public.salons(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 generation integer not null,
 kind text not null check(kind in ('info','media','post')),
 payload_hash text not null,
 status text not null check(status in ('running','completed','failed','uncertain','cancelled')),
 provider_name text,error_code text,
 created_at timestamptz not null default now(),completed_at timestamptz
);
create index business_google_operations_business on public.business_google_sync_operations(salon_id,created_at desc);
create table public.business_google_audit(
 id bigint generated always as identity primary key,
 salon_id uuid not null references public.salons(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 action text not null check(action in ('authorize','connect','disconnect','sync_started','sync_completed','sync_failed','sync_uncertain','auto_sync_changed')),
 operation_id uuid,created_at timestamptz not null default now()
);
alter table public.business_google_connections enable row level security;
alter table public.business_google_oauth_flows enable row level security;
alter table public.business_google_sync_operations enable row level security;
alter table public.business_google_audit enable row level security;
revoke all on public.business_google_connections,public.business_google_oauth_flows,public.business_google_sync_operations,public.business_google_audit from public,anon,authenticated;
grant all on public.business_google_connections,public.business_google_oauth_flows,public.business_google_sync_operations,public.business_google_audit to service_role;
grant usage,select on sequence public.business_google_audit_id_seq to service_role;

create function public.google_business_owner(p_salon uuid,p_owner uuid) returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.salons s join public.platform_identities i on i.user_id=s.user_id where s.id=p_salon and s.user_id=p_owner and i.primary_role='salon_owner' and i.status='Active')
$$;
create function public.consume_business_google_flow(p_hash text) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare f public.business_google_oauth_flows%rowtype;
begin
 delete from public.business_google_oauth_flows where state_hash=p_hash returning * into f;
 if not found or f.expires_at<=now() or not public.google_business_owner(f.salon_id,f.owner_id) then return null;end if;
 return to_jsonb(f);
end $$;
create function public.manage_business_google(p_salon uuid,p_owner uuid,p_action text,p_args jsonb default '{}') returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.business_google_connections%rowtype; op public.business_google_sync_operations%rowtype; prior_secret text; new_lease uuid;
begin
 if not public.google_business_owner(p_salon,p_owner) then raise exception 'GOOGLE_ACCESS_DENIED';end if;
 perform pg_advisory_xact_lock(hashtextextended('business-google:'||p_salon::text,0));
 select * into c from public.business_google_connections where salon_id=p_salon for update;
 if p_action='flow' then
  insert into public.business_google_connections(salon_id,owner_id,status) values(p_salon,p_owner,'disconnected') on conflict(salon_id) do nothing;
  select * into c from public.business_google_connections where salon_id=p_salon;
  delete from public.business_google_oauth_flows where salon_id=p_salon or expires_at<=now();
  insert into public.business_google_oauth_flows(state_hash,salon_id,owner_id,verifier_secret,generation,expires_at) values(p_args->>'state_hash',p_salon,p_owner,p_args->>'verifier_secret',c.generation,now()+interval '10 minutes');
  return '{}';
 elsif p_action='authorize' then
  if c.generation is distinct from (p_args->>'generation')::integer then raise exception 'GOOGLE_CONNECTION_CHANGED';end if;
  insert into public.business_google_connections(salon_id,owner_id,status,secret) values(p_salon,p_owner,'authorized',p_args->>'secret')
  on conflict(salon_id) do update set owner_id=p_owner,status='authorized',secret=excluded.secret,generation=business_google_connections.generation+1,account_name=null,location_name=null,auto_sync=false,lease_id=null,lease_until=null,updated_at=now();
  update public.business_google_sync_operations set status='cancelled' where salon_id=p_salon and status='running';
 elsif p_action='disconnect' then
  prior_secret:=c.secret;
  update public.business_google_connections set secret=null,status='disconnected',generation=generation+1,auto_sync=false,lease_id=null,lease_until=null,updated_at=now() where salon_id=p_salon;
  delete from public.business_google_oauth_flows where salon_id=p_salon;
  update public.business_google_sync_operations set status='cancelled' where salon_id=p_salon and status='running';
  insert into public.business_google_audit(salon_id,actor_id,action) values(p_salon,p_owner,'disconnect');
  return jsonb_build_object('secret',prior_secret);
 elsif p_action='connect' then
  if c.status is distinct from 'authorized' or c.generation<>(p_args->>'generation')::integer then raise exception 'GOOGLE_CONNECTION_CHANGED';end if;
  update public.business_google_connections set status='connected',account_name=p_args->>'account',location_name=p_args->>'location',remote_hash=p_args->>'remote_hash',local_hash=p_args->>'local_hash',updated_at=now() where salon_id=p_salon;
 elsif p_action='tokens' then
  if c.status='disconnected' or c.generation is distinct from (p_args->>'generation')::integer or c.secret is distinct from p_args->>'prior_secret' then raise exception 'GOOGLE_CONNECTION_CHANGED';end if;
  update public.business_google_connections set secret=p_args->>'secret',updated_at=now() where salon_id=p_salon;
  return '{}';
 elsif p_action='claim' then
  if c.status is distinct from 'connected' or c.generation is distinct from (p_args->>'generation')::integer then raise exception 'GOOGLE_CONNECTION_CHANGED';end if;
  select * into op from public.business_google_sync_operations where id=(p_args->>'id')::uuid;
  if found then
   if op.salon_id<>p_salon or op.generation<>c.generation or op.kind<>p_args->>'kind' or op.payload_hash<>p_args->>'payload_hash' then raise exception 'GOOGLE_REQUEST_CONFLICT';end if;
   return jsonb_build_object('existing',true,'status',op.status);
  end if;
  if c.lease_until>now() then raise exception 'GOOGLE_SYNC_BUSY';end if;
  -- A lost worker is uncertain, never automatically retry a possibly-created post/media.
  update public.business_google_sync_operations set status='uncertain',error_code='GOOGLE_NETWORK_UNCERTAIN' where salon_id=p_salon and status='running';
  if exists(select 1 from public.business_google_sync_operations where salon_id=p_salon and payload_hash=p_args->>'payload_hash' and kind=p_args->>'kind' and status='uncertain') then return jsonb_build_object('existing',true,'status','uncertain');end if;
  new_lease:=(p_args->>'id')::uuid;
  insert into public.business_google_sync_operations(id,salon_id,actor_id,generation,kind,payload_hash,status) values(new_lease,p_salon,p_owner,c.generation,p_args->>'kind',p_args->>'payload_hash','running');
  update public.business_google_connections set lease_id=new_lease,lease_until=now()+interval '2 minutes' where salon_id=p_salon;
  insert into public.business_google_audit(salon_id,actor_id,action,operation_id) values(p_salon,p_owner,'sync_started',new_lease);
  return jsonb_build_object('existing',false,'lease',new_lease);
 elsif p_action='finish' then
  if c.status is distinct from 'connected' or c.generation is distinct from (p_args->>'generation')::integer or c.lease_id is distinct from (p_args->>'id')::uuid then raise exception 'GOOGLE_CONNECTION_CHANGED';end if;
  if p_args->>'status' not in ('completed','failed','uncertain') or coalesce(p_args->>'error_code','') !~ '^(GOOGLE_[A-Z_]+)?$' then raise exception 'GOOGLE_INVALID_INPUT';end if;
  update public.business_google_sync_operations set status=p_args->>'status',provider_name=p_args->>'provider_name',error_code=p_args->>'error_code',completed_at=now() where id=c.lease_id and salon_id=p_salon;
  update public.business_google_connections set lease_id=null,lease_until=null,last_success_at=case when p_args->>'status'='completed' then now() else last_success_at end,last_error=p_args->>'error_code',remote_hash=coalesce(p_args->>'remote_hash',remote_hash),local_hash=coalesce(p_args->>'local_hash',local_hash),updated_at=now() where salon_id=p_salon;
  insert into public.business_google_audit(salon_id,actor_id,action,operation_id) values(p_salon,p_owner,'sync_'||(p_args->>'status'),(p_args->>'id')::uuid);
  return '{}';
 elsif p_action='check_failed' then
  if c.generation is distinct from (p_args->>'generation')::integer or c.status is distinct from 'connected' then raise exception 'GOOGLE_CONNECTION_CHANGED';end if;
  if coalesce(p_args->>'error_code','') !~ '^GOOGLE_[A-Z_]+$' then raise exception 'GOOGLE_INVALID_INPUT';end if;
  update public.business_google_connections set last_error=p_args->>'error_code',auto_sync=false,updated_at=now() where salon_id=p_salon;
  return '{}';
 elsif p_action='auto_sync' then
  if c.status is distinct from 'connected' then raise exception 'GOOGLE_CONNECTION_CHANGED';end if;
  if (p_args->>'enabled')::boolean and c.last_error is not null then raise exception 'GOOGLE_REVIEW_REQUIRED';end if;
  update public.business_google_connections set auto_sync=(p_args->>'enabled')::boolean,next_check_at=now(),updated_at=now() where salon_id=p_salon;
  insert into public.business_google_audit(salon_id,actor_id,action) values(p_salon,p_owner,'auto_sync_changed');
  return '{}';
 else raise exception 'GOOGLE_INVALID_INPUT';end if;
 insert into public.business_google_audit(salon_id,actor_id,action) values(p_salon,p_owner,case when p_action='authorize' then 'authorize' else 'connect' end);
 return '{}';
end $$;
create function public.due_business_google() returns setof public.business_google_connections language sql security invoker set search_path=pg_catalog,public as $$
 with due as (
  select salon_id from public.business_google_connections c
  where c.status='connected' and c.auto_sync and c.next_check_at<=now()
    and public.google_business_owner(c.salon_id,c.owner_id) and (c.lease_until is null or c.lease_until<=now())
  order by c.next_check_at,c.salon_id limit 1 for update skip locked
 )
 update public.business_google_connections c set next_check_at=now()+interval '15 minutes'
 from due where due.salon_id=c.salon_id returning c.*
$$;
revoke all on function public.due_business_google() from public,anon,authenticated;
grant execute on function public.due_business_google() to service_role;
revoke all on function public.google_business_owner(uuid,uuid),public.consume_business_google_flow(text),public.manage_business_google(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.google_business_owner(uuid,uuid),public.consume_business_google_flow(text),public.manage_business_google(uuid,uuid,text,jsonb) to service_role;
update public.engine_settings set published_value='"20260918234416"'::jsonb,draft_value='"20260918234416"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
