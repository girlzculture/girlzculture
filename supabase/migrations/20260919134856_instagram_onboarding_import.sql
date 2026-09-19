begin;
-- One-time owner-authorized Instagram source. No staff/client/API table grants.
create table public.business_instagram_connections (
 salon_id uuid primary key references public.salons(id) on delete cascade,
 owner_id uuid not null references auth.users(id), generation integer not null default 1,
 status text not null check(status in ('connected','disconnected')),
 secret text, provider_user_id text, app_user_id text, username text, expires_at timestamptz,
 updated_at timestamptz not null default now(),
 check ((status='disconnected' and secret is null) or (status='connected' and secret like 'v1.%' and provider_user_id ~ '^[0-9]{1,30}$' and expires_at is not null))
);
create unique index business_instagram_account_unique on public.business_instagram_connections(provider_user_id) where provider_user_id is not null;
create table public.business_instagram_oauth_flows (
 state_hash text primary key check(state_hash ~ '^[a-f0-9]{64}$'),
 salon_id uuid not null references public.salons(id) on delete cascade,
 owner_id uuid not null references auth.users(id), generation integer not null,
 expires_at timestamptz not null
);
create index business_instagram_flow_expiry on public.business_instagram_oauth_flows(expires_at);
create table public.business_instagram_imports (
 id uuid primary key, salon_id uuid not null references public.salons(id) on delete cascade,
 owner_id uuid not null references auth.users(id), generation integer not null,
 provider_user_id text not null, app_user_id text not null, username text not null,
 profile jsonb not null default '{}', status text not null check(status in ('reading','ready','drafted','purge_pending','purged')),
 is_excerpt boolean not null default false, shown_count integer not null default 0 check(shown_count between 0 and 16),
 draft_id uuid references public.business_onboarding_drafts(id), request_id uuid, request_hash text,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 unique(salon_id,generation)
);
create index business_instagram_import_owner on public.business_instagram_imports(salon_id,owner_id,created_at desc);
create table public.business_instagram_import_assets (
 id uuid primary key, import_id uuid not null references public.business_instagram_imports(id) on delete cascade,
 salon_id uuid not null references public.salons(id) on delete cascade, owner_id uuid not null references auth.users(id),
 provider_media_id text check(provider_media_id ~ '^[0-9]{1,30}$'),
 private_path text, private_sha256 text check(private_sha256 ~ '^[a-f0-9]{64}$'),
 mime text check(mime in ('image/jpeg','image/png')), width integer check(width>0),height integer check(height>0),
 timestamp timestamptz, staging_until timestamptz, private_deleted_at timestamptz, status text not null check(status in ('reserved','staged','prepared','applied','purge_pending','purged')),
 public_path text, public_url text,
 unique(import_id,provider_media_id), unique(private_path), unique(public_path),
 check(private_path like salon_id::text||'/instagram-onboarding/'||import_id::text||'/'||id::text||'.%')
);
create index business_instagram_assets_import on public.business_instagram_import_assets(import_id,salon_id,owner_id);
create table public.business_instagram_deletions (
 code text primary key check(code ~ '^[a-f0-9]{64}$'), provider_user_id text not null,
 status text not null check(status in ('pending','complete')), created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.business_instagram_connections enable row level security;
alter table public.business_instagram_oauth_flows enable row level security;
alter table public.business_instagram_imports enable row level security;
alter table public.business_instagram_import_assets enable row level security;
alter table public.business_instagram_deletions enable row level security;
revoke all on public.business_instagram_connections,public.business_instagram_oauth_flows,public.business_instagram_imports,public.business_instagram_import_assets,public.business_instagram_deletions from public,anon,authenticated;
grant select,insert,update,delete on public.business_instagram_connections,public.business_instagram_oauth_flows,public.business_instagram_imports,public.business_instagram_import_assets,public.business_instagram_deletions to service_role;

create function public.instagram_onboarding_owner(p_salon uuid,p_owner uuid) returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.salons s join public.platform_identities i on i.user_id=s.user_id where s.id=p_salon and s.user_id=p_owner and i.primary_role='salon_owner' and i.status='Active') and public.p0_actor_has_permission(p_salon,p_owner,'my_page');
$$;
create function public.consume_business_instagram_flow(p_hash text) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare f public.business_instagram_oauth_flows%rowtype;
begin
 delete from public.business_instagram_oauth_flows where state_hash=p_hash returning * into f;
 if not found or f.expires_at<=now() or not public.instagram_onboarding_owner(f.salon_id,f.owner_id) then return null;end if;
 if not exists(select 1 from public.business_instagram_connections where salon_id=f.salon_id and owner_id=f.owner_id and generation=f.generation) then return null;end if;
 return to_jsonb(f);
end $$;
create function public.manage_business_instagram(p_salon uuid,p_owner uuid,p_action text,p_args jsonb default '{}') returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.business_instagram_connections%rowtype; i public.business_instagram_imports%rowtype; a jsonb; d jsonb; selected text[]; v_asset public.business_instagram_import_assets%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('instagram-onboarding:'||p_salon::text,0));
 if not public.instagram_onboarding_owner(p_salon,p_owner) then raise exception 'INSTAGRAM_ACCESS_DENIED';end if;
 select * into c from public.business_instagram_connections where salon_id=p_salon for update;
 if p_action='flow' then
  insert into public.business_instagram_connections(salon_id,owner_id,status) values(p_salon,p_owner,'disconnected')
   on conflict(salon_id) do update set owner_id=p_owner,status='disconnected',secret=null,generation=business_instagram_connections.generation+1,updated_at=now() returning * into c;
  delete from public.business_instagram_oauth_flows where salon_id=p_salon or expires_at<=now();
  insert into public.business_instagram_oauth_flows values(p_args->>'state_hash',p_salon,p_owner,c.generation,now()+interval '10 minutes');
  return jsonb_build_object('generation',c.generation);
 elsif p_action='disconnect' then
  update public.business_instagram_connections set secret=null,status='disconnected',generation=generation+1,expires_at=null,updated_at=now() where salon_id=p_salon;
  delete from public.business_instagram_oauth_flows where salon_id=p_salon;
  return jsonb_build_object('disconnected',true);
 elsif p_action='authorize' then
  perform pg_advisory_xact_lock(hashtextextended('instagram-account:'||(p_args->>'provider_user_id'),0));
  if exists(select 1 from public.business_instagram_imports where provider_user_id=p_args->>'provider_user_id' and salon_id<>p_salon and status<>'purged') or exists(select 1 from public.business_instagram_connections where provider_user_id=p_args->>'provider_user_id' and salon_id<>p_salon) then raise exception 'INSTAGRAM_ACCOUNT_MISMATCH';end if;
  if exists(select 1 from public.business_instagram_deletions where provider_user_id=p_args->>'app_user_id' and status='pending') then raise exception 'INSTAGRAM_DELETION_PENDING';end if;
  if c.owner_id is distinct from p_owner or c.generation is distinct from (p_args->>'generation')::integer then raise exception 'INSTAGRAM_CONNECTION_CHANGED';end if;
  if (p_args->>'expires_at')::timestamptz<=now() or (p_args->>'expires_at')::timestamptz>now()+interval '1 hour' then raise exception 'INSTAGRAM_INVALID';end if;
  update public.business_instagram_connections set status='connected',secret=p_args->>'secret',provider_user_id=p_args->>'provider_user_id',app_user_id=p_args->>'app_user_id',username=p_args->>'username',expires_at=(p_args->>'expires_at')::timestamptz,updated_at=now() where salon_id=p_salon;
  return '{}';
 elsif p_action='claim_import' then
  if c.owner_id is distinct from p_owner or c.status is distinct from 'connected' or c.expires_at<=now() or c.generation is distinct from (p_args->>'generation')::integer then raise exception 'INSTAGRAM_CONNECTION_CHANGED';end if;
  select * into i from public.business_instagram_imports where salon_id=p_salon and generation=c.generation;
  if found then return jsonb_build_object('existing',true,'import',to_jsonb(i));end if;
  if (select count(*) from public.business_instagram_imports where salon_id=p_salon and status<>'purged')>=10 then raise exception 'INSTAGRAM_IMPORT_LIMIT';end if;
  insert into public.business_instagram_imports(id,salon_id,owner_id,generation,provider_user_id,app_user_id,username,status) values((p_args->>'id')::uuid,p_salon,p_owner,c.generation,c.provider_user_id,c.app_user_id,c.username,'reading') returning * into i;
  return jsonb_build_object('existing',false,'import',to_jsonb(i));
 elsif p_action='reserve_asset' then
  select * into i from public.business_instagram_imports where id=(p_args->>'import_id')::uuid and salon_id=p_salon and owner_id=p_owner and status='reading' for update;
  if not found or c.status is distinct from 'connected' or c.generation<>i.generation or (select count(*) from public.business_instagram_import_assets where import_id=i.id)>=16 then raise exception 'INSTAGRAM_CONNECTION_CHANGED';end if;
  insert into public.business_instagram_import_assets(id,import_id,salon_id,owner_id,provider_media_id,status,staging_until) values((p_args->>'asset_id')::uuid,i.id,p_salon,p_owner,p_args->>'provider_media_id','reserved',now()+interval '2 minutes');
  return '{}';
 elsif p_action='finish_import' then
  select * into i from public.business_instagram_imports where id=(p_args->>'id')::uuid and salon_id=p_salon and owner_id=p_owner for update;
  if not found or i.status<>'reading' or c.status is distinct from 'connected' or c.generation<>i.generation or c.provider_user_id<>i.provider_user_id then raise exception 'INSTAGRAM_CONNECTION_CHANGED';end if;
  if p_args->'profile'->>'user_id' is distinct from i.provider_user_id or p_args->'profile'->>'username' is distinct from i.username or jsonb_typeof(p_args->'assets') is distinct from 'array' or jsonb_array_length(p_args->'assets')>16 then raise exception 'INSTAGRAM_INVALID';end if;
  for a in select value from jsonb_array_elements(p_args->'assets') loop
   update public.business_instagram_import_assets set private_path=a->>'private_path',private_sha256=a->>'private_sha256',mime=a->>'mime',width=(a->>'width')::integer,height=(a->>'height')::integer,timestamp=(a->>'timestamp')::timestamptz,status='staged',staging_until=null
   where id=(a->>'id')::uuid and import_id=i.id and salon_id=p_salon and owner_id=p_owner and provider_media_id=a->>'provider_media_id' and status='reserved';
   if not found then raise exception 'INSTAGRAM_ASSET_NOT_OWNED';end if;
  end loop;
  update public.business_instagram_imports set profile=p_args->'profile',status='ready',is_excerpt=(p_args->>'is_excerpt')::boolean,shown_count=jsonb_array_length(p_args->'assets') where id=i.id returning * into i;
  -- This token is no longer needed after one bounded source read.
  update public.business_instagram_connections set secret=null,status='disconnected',expires_at=null where salon_id=p_salon;
  return to_jsonb(i);
 elsif p_action='create_draft' then
  select * into i from public.business_instagram_imports where id=(p_args->>'import_id')::uuid and salon_id=p_salon and owner_id=p_owner for update;
  if not found or i.status not in ('ready','drafted') or i.expires_at<=now() then raise exception 'INSTAGRAM_IMPORT_UNAVAILABLE';end if;
  if i.draft_id is not null then
   if i.request_id is distinct from (p_args->>'request_id')::uuid or i.request_hash is distinct from md5(p_args::text) then raise exception 'INSTAGRAM_REQUEST_CONFLICT';end if;
   select to_jsonb(b)-'baseline'-'provenance' into d from public.business_onboarding_drafts b where id=i.draft_id and salon_id=p_salon and created_by=p_owner;return d;
  end if;
  if jsonb_typeof(p_args->'facts'->'photos') is distinct from 'array' or jsonb_array_length(p_args->'facts'->'photos')>16 then raise exception 'INSTAGRAM_INVALID';end if;
  selected:=array(select value from jsonb_array_elements_text(p_args->'facts'->'photos'));
  if cardinality(selected)<>(select count(distinct x) from unnest(selected)x) or exists(select 1 from unnest(selected)x where not exists(select 1 from public.business_instagram_import_assets b where b.import_id=i.id and b.salon_id=p_salon and b.owner_id=p_owner and b.status='staged' and x='instagram-asset:'||b.id::text)) then raise exception 'INSTAGRAM_ASSET_NOT_OWNED';end if;
  d:=public.save_business_onboarding_draft(p_salon,p_owner,jsonb_build_object('kind','instagram','reference',i.username,'permitted',true,'locale',p_args->>'locale','text','',
    'provider_import',jsonb_build_object('provider','instagram','import_id',i.id,'username',i.username,'imported_at',i.created_at,'media_ids',to_jsonb(array(select replace(x,'instagram-asset:','') from unnest(selected)x)))),p_args->'facts',p_args->'uncertain');
  update public.business_instagram_imports set status='drafted',draft_id=(d->>'id')::uuid,request_id=(p_args->>'request_id')::uuid,request_hash=md5(p_args::text) where id=i.id;
  return d;
 elsif p_action in ('begin_prepare','prepare_asset') then
  select * into v_asset from public.business_instagram_import_assets where id=(p_args->>'asset_id')::uuid and salon_id=p_salon and owner_id=p_owner for update;
  if not found or v_asset.status not in ('staged','prepared') or v_asset.private_sha256 is distinct from p_args->>'private_sha256' then raise exception 'INSTAGRAM_ASSET_NOT_OWNED';end if;
  select * into i from public.business_instagram_imports where id=v_asset.import_id and draft_id=(p_args->>'draft_id')::uuid and status='drafted' and expires_at>now();
  if not found or not exists(select 1 from public.business_onboarding_drafts b where b.id=i.draft_id and b.status='draft' and b.revision=(p_args->>'revision')::integer and b.facts->'photos' @> jsonb_build_array('instagram-asset:'||v_asset.id::text)) then raise exception 'INSTAGRAM_REVIEW_CHANGED';end if;
  if p_action='begin_prepare' then
   update public.business_instagram_import_assets set staging_until=now()+interval '2 minutes' where id=v_asset.id;
   return jsonb_build_object('reserved',true);
  end if;
  if v_asset.staging_until is null or v_asset.staging_until<=now() then raise exception 'INSTAGRAM_REVIEW_CHANGED';end if;
  if p_args->>'public_path' not in (p_salon::text||'/instagram-onboarding/'||i.id::text||'/'||v_asset.id::text||'.png',p_salon::text||'/instagram-onboarding/'||i.id::text||'/'||v_asset.id::text||'.jpg') or p_args->>'public_url' !~ '^https://[^/?#]+/storage/v1/object/public/salon-photos/' or right(p_args->>'public_url',length(p_args->>'public_path')) is distinct from p_args->>'public_path' then raise exception 'INSTAGRAM_INVALID';end if;
  if v_asset.status='prepared' and (v_asset.public_path is distinct from p_args->>'public_path' or v_asset.public_url is distinct from p_args->>'public_url') then raise exception 'INSTAGRAM_REVIEW_CHANGED';end if;
  update public.business_instagram_import_assets set status='prepared',public_path=p_args->>'public_path',public_url=p_args->>'public_url',staging_until=null where id=v_asset.id;
  return jsonb_build_object('prepared',true);
 end if;
 raise exception 'INSTAGRAM_INVALID';
end $$;
revoke all on function public.instagram_onboarding_owner(uuid,uuid),public.consume_business_instagram_flow(text),public.manage_business_instagram(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.instagram_onboarding_owner(uuid,uuid),public.consume_business_instagram_flow(text),public.manage_business_instagram(uuid,uuid,text,jsonb) to service_role;

-- Redact only provider-derived facts still identical to their original snapshot.
-- Independent owner-entered services/hours/policies/edits are retained.
create function public.redact_business_instagram_import(p_id uuid) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare i public.business_instagram_imports%rowtype; b public.business_onboarding_drafts%rowtype; f jsonb;
begin
 select * into i from public.business_instagram_imports where id=p_id for update;
 if not found or i.draft_id is null then return;end if;
 select * into b from public.business_onboarding_drafts where id=i.draft_id for update;
 if not found then return;end if;
 f:=b.facts;
 if nullif(i.profile->>'name','') is not null and f->'identity'->>'name'=i.profile->>'name' then f:=jsonb_set(f,'{identity,name}','""');end if;
 f:=jsonb_set(f,'{photos}',coalesce((select jsonb_agg(photo) from jsonb_array_elements(coalesce(f->'photos','[]')) photo where not exists(select 1 from public.business_instagram_import_assets a where a.import_id=i.id and (photo=to_jsonb('instagram-asset:'||a.id::text) or photo=to_jsonb(a.public_url)))),'[]'));
 update public.business_onboarding_drafts set facts=f,
  source=case when source->'provider_import'->>'import_id'=i.id::text then (source-'provider_import'-'extraction')||jsonb_build_object('kind','manual','reference','','provider_data_deleted',true) else source end,
  provenance=(provenance-'source')||jsonb_build_object('provider_data_deleted',true),updated_at=now(),revision=revision+1 where id=b.id and (facts is distinct from f or source ? 'provider_import');
end $$;
revoke all on function public.redact_business_instagram_import(uuid) from public,anon,authenticated;
grant execute on function public.redact_business_instagram_import(uuid) to service_role;

-- Verified provider callbacks call this server-only function. Invalidating state
-- precedes storage deletion, so a delayed callback/import cannot recreate data.
create function public.delete_business_instagram_data(p_user text,p_code text,p_complete boolean default false) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_salon uuid; v_row public.business_instagram_deletions%rowtype; v_assets jsonb;
begin
 if p_user !~ '^[0-9]{1,30}$' or p_code !~ '^[a-f0-9]{64}$' then raise exception 'INSTAGRAM_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('instagram-deletion:'||p_user,0));
 select * into v_row from public.business_instagram_deletions where code=p_code for update;
 if found and v_row.status='complete' then return jsonb_build_object('complete',true,'assets','[]'::jsonb);end if;
 if found and v_row.provider_user_id<>p_user then raise exception 'INSTAGRAM_INVALID';end if;
 insert into public.business_instagram_deletions(code,provider_user_id,status) values(p_code,p_user,'pending') on conflict(code) do nothing;
 for v_salon in select salon_id from public.business_instagram_imports where app_user_id=p_user union select salon_id from public.business_instagram_connections where app_user_id=p_user order by salon_id loop
  perform pg_advisory_xact_lock(hashtextextended('instagram-onboarding:'||v_salon::text,0));
  update public.business_instagram_connections set status='disconnected',secret=null,generation=generation+1,expires_at=null,provider_user_id=null,app_user_id=null,username=null where salon_id=v_salon and app_user_id=p_user;
  if found then delete from public.business_instagram_oauth_flows where salon_id=v_salon;end if;
  update public.business_instagram_imports set status='purge_pending' where salon_id=v_salon and app_user_id=p_user and status<>'purged';
  update public.business_instagram_import_assets a set status='purge_pending' from public.business_instagram_imports i where i.id=a.import_id and i.salon_id=v_salon and i.app_user_id=p_user and a.status<>'purged';
  -- Remove only exact provenance-bound imported image URLs, never unrelated media.
  update public.salons s set gallery_photos=coalesce((select jsonb_agg(photo) from jsonb_array_elements(coalesce(s.gallery_photos,'[]')) photo where not exists(select 1 from public.business_instagram_import_assets a join public.business_instagram_imports i on i.id=a.import_id where a.salon_id=v_salon and i.app_user_id=p_user and photo=to_jsonb(a.public_url))), '[]') where s.id=v_salon;
  perform public.redact_business_instagram_import(i.id) from public.business_instagram_imports i where i.salon_id=v_salon and i.app_user_id=p_user;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'salon_id',a.salon_id,'import_id',a.import_id,'private_path',a.private_path,'public_path',a.public_path)),'[]') into v_assets from public.business_instagram_import_assets a join public.business_instagram_imports i on i.id=a.import_id where i.app_user_id=p_user and a.status='purge_pending';
 if exists(select 1 from public.business_instagram_import_assets a join public.business_instagram_imports i on i.id=a.import_id where i.app_user_id=p_user and a.staging_until>now()) then return jsonb_build_object('complete',false,'busy',true,'assets','[]'::jsonb);end if;
 if p_complete then
  update public.business_instagram_import_assets a set status='purged',provider_media_id=null,private_path=null,private_sha256=null,mime=null,width=null,height=null,timestamp=null,public_path=null,public_url=null from public.business_instagram_imports i where i.id=a.import_id and i.app_user_id=p_user;
  update public.business_instagram_imports set status='purged',provider_user_id='',app_user_id='',username='',profile='{}',shown_count=0 where app_user_id=p_user;
  update public.business_instagram_deletions set status='complete',provider_user_id='',completed_at=now() where code=p_code;
 end if;
 return jsonb_build_object('complete',p_complete,'assets',case when p_complete then '[]'::jsonb else v_assets end);
end $$;
revoke all on function public.delete_business_instagram_data(text,text,boolean) from public,anon,authenticated;
grant execute on function public.delete_business_instagram_data(text,text,boolean) to service_role;

create function public.queue_business_instagram_expiry() returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare i public.business_instagram_imports%rowtype; applied boolean; results jsonb:='[]'; assets jsonb;
begin
 delete from public.business_instagram_oauth_flows where expires_at<=now();
 update public.business_instagram_connections set secret=null,status='disconnected',expires_at=null where expires_at<=now();
 for i in select x.* from public.business_instagram_imports x where (x.status='reading' and x.created_at<now()-interval '1 hour') or (x.expires_at<=now() and x.status in ('ready','drafted') and (not exists(select 1 from public.business_onboarding_drafts d where d.id=x.draft_id and d.status='applied') or exists(select 1 from public.business_instagram_import_assets a where a.import_id=x.id and a.private_deleted_at is null))) or x.status='purge_pending' order by x.created_at limit 10 loop
  perform pg_advisory_xact_lock(hashtextextended('instagram-onboarding:'||i.salon_id::text,0));
  select * into i from public.business_instagram_imports where id=i.id for update;
  if exists(select 1 from public.business_instagram_import_assets where import_id=i.id and staging_until>now()) then continue;end if;
  applied:=exists(select 1 from public.business_onboarding_drafts where id=i.draft_id and status='applied') and i.status<>'purge_pending';
  if not applied then
   update public.business_instagram_imports set status='purge_pending' where id=i.id;
   update public.business_instagram_import_assets set status='purge_pending' where import_id=i.id and status<>'purged';
   update public.business_instagram_connections set secret=null,status='disconnected',expires_at=null where salon_id=i.salon_id and generation=i.generation;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'salon_id',a.salon_id,'import_id',a.import_id,'preserve_public',applied and a.status='applied')),'[]') into assets from public.business_instagram_import_assets a where a.import_id=i.id and (not applied or a.private_deleted_at is null);
  if jsonb_array_length(assets)>0 or not applied then results:=results||jsonb_build_array(jsonb_build_object('id',i.id,'private_only',applied,'assets',assets));end if;
 end loop;
 return results;
end $$;
create function public.finish_business_instagram_expiry(p_id uuid,p_private_only boolean) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare i public.business_instagram_imports%rowtype;
begin
 select * into i from public.business_instagram_imports where id=p_id;
 if not found then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('instagram-onboarding:'||i.salon_id::text,0));
 select * into i from public.business_instagram_imports where id=p_id for update;
 if exists(select 1 from public.business_instagram_import_assets where import_id=i.id and staging_until>now()) then raise exception 'INSTAGRAM_DELETION_PENDING';end if;
 if p_private_only then
  if i.expires_at>now() or i.status<>'drafted' or not exists(select 1 from public.business_onboarding_drafts where id=i.draft_id and status='applied') then raise exception 'INSTAGRAM_REVIEW_CHANGED';end if;
  update public.business_instagram_import_assets set private_deleted_at=now() where import_id=i.id;
  update public.business_instagram_import_assets set status='purged',provider_media_id=null,private_path=null,private_sha256=null,mime=null,width=null,height=null,timestamp=null,public_path=null,public_url=null where import_id=i.id and status<>'applied';
 else
  if i.status<>'purge_pending' then raise exception 'INSTAGRAM_REVIEW_CHANGED';end if;
  perform public.redact_business_instagram_import(i.id);
  update public.business_instagram_import_assets set status='purged',provider_media_id=null,private_path=null,private_sha256=null,mime=null,width=null,height=null,timestamp=null,public_path=null,public_url=null,private_deleted_at=now() where import_id=i.id;
  update public.business_instagram_imports set status='purged',profile='{}',username='',shown_count=0 where id=i.id;
 end if;
end $$;
revoke all on function public.queue_business_instagram_expiry(),public.finish_business_instagram_expiry(uuid,boolean) from public,anon,authenticated;
grant execute on function public.queue_business_instagram_expiry(),public.finish_business_instagram_expiry(uuid,boolean) to service_role;

create or replace function public.apply_business_onboarding_draft(p_salon uuid,p_actor uuid,p_id uuid,p_revision integer,p_reviewed text[],p_keep_unpublished boolean,p_public_impact boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_draft public.business_onboarding_drafts%rowtype; v_salon public.salons%rowtype;
  v_identity jsonb; v_service jsonb; v_group public.service_groups%rowtype; v_rows jsonb:='[]';
  v_import jsonb; v_team jsonb; v_team_ids jsonb:='[]'; v_id uuid; v_policy uuid; v_result jsonb; v_existing boolean; v_published boolean; v_photos jsonb; v_photo text; v_asset public.business_instagram_import_assets%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('instagram-onboarding:'||p_salon::text,0));
  -- Match the canonical importer lock order: importer -> child trigger ->
  -- salon. The lock also prevents an upsert racing our append-only precheck.
  perform pg_advisory_xact_lock(hashtext(p_salon::text||':salon-service-spreadsheet'));
  -- Serialize against profile edits and every other onboarding confirmation.
  select * into v_salon from public.salons where id=p_salon and user_id=p_actor for update;
  if not found or not public.p0_actor_has_permission(p_salon,p_actor,'my_page') then raise exception 'ONBOARDING_FORBIDDEN'; end if;
  select * into v_draft from public.business_onboarding_drafts where id=p_id and salon_id=p_salon and created_by=p_actor for update;
  if not found then raise exception 'ONBOARDING_NOT_FOUND'; end if;
  if v_draft.revision is distinct from p_revision then raise exception 'ONBOARDING_STALE'; end if;
  if cardinality(p_reviewed) is distinct from 6 or not p_reviewed @> array['identity','services','hours','photos','team','policies'] or p_keep_unpublished is null or p_public_impact is null or p_keep_unpublished=p_public_impact then raise exception 'ONBOARDING_REVIEW_REQUIRED'; end if;
  -- An uncertain response can be safely retried without replaying profile writes.
  if v_draft.status='applied' then return to_jsonb(v_draft)-'baseline'-'provenance'; end if;
  if v_draft.baseline is distinct from public.business_onboarding_baseline(p_salon) then raise exception 'ONBOARDING_WORKSPACE_CHANGED'; end if;
  v_existing:=coalesce(v_salon.is_discoverable,false) or v_salon.status='Active';
  if (v_existing and (p_keep_unpublished or not p_public_impact)) or (not v_existing and (not p_keep_unpublished or p_public_impact)) then raise exception 'ONBOARDING_LIVE_BUSINESS_REVIEW_REQUIRED'; end if;
  v_identity:=v_draft.facts->'identity';
  if length(trim(coalesce(v_identity->>'name',''))) not between 1 and 240 then raise exception 'ONBOARDING_NAME_REQUIRED'; end if;
  v_photos:='[]'::jsonb;
  for v_photo in select value from jsonb_array_elements_text(v_draft.facts->'photos') loop
    if v_photo like 'instagram-asset:%' then
      select a.* into v_asset from public.business_instagram_import_assets a join public.business_instagram_imports i on i.id=a.import_id
       where v_photo='instagram-asset:'||a.id::text and a.salon_id=p_salon and a.owner_id=p_actor and a.status='prepared' and a.public_url is not null
       and i.status='drafted' and i.expires_at>now() and i.draft_id=p_id and i.owner_id=p_actor
       and v_draft.source->'provider_import'->>'import_id'=i.id::text and v_draft.source->'provider_import'->'media_ids' @> jsonb_build_array(a.id::text) for update of a,i;
      if not found then raise exception 'ONBOARDING_PHOTO_NOT_OWNED';end if;
      v_photos:=v_photos||jsonb_build_array(v_asset.public_url);
    else
      if not coalesce(v_salon.gallery_photos,'[]'::jsonb) @> jsonb_build_array(v_photo) then raise exception 'ONBOARDING_PHOTO_NOT_OWNED';end if;
      v_photos:=v_photos||jsonb_build_array(v_photo);
    end if;
  end loop;
  -- Replace only the local reviewed snapshot; saved provenance retains opaque IDs.
  v_draft.facts:=jsonb_set(v_draft.facts,'{photos}',v_photos);
  -- Existing publication reconciliation honors this owner hold. Set it before
  -- any child/profile trigger can reconsider marketplace eligibility.
  if p_keep_unpublished then
    update public.salons set owner_unpublished_at=coalesce(owner_unpublished_at,now()),
      owner_unpublished_reason=coalesce(owner_unpublished_reason,'Owner is reviewing imported onboarding details'),is_discoverable=false where id=p_salon;
  end if;
  update public.salons set name=v_identity->>'name',
    description=coalesce(nullif(v_identity->>'description',''),description),
    description_ai_assisted=case when nullif(v_identity->>'description','') is not null then false else description_ai_assisted end,
    phone=coalesce(nullif(v_identity->>'phone',''),phone),
    address_street=coalesce(nullif(v_identity->>'address_street',''),address_street),
    address_city=coalesce(nullif(v_identity->>'address_city',''),address_city),
    address_state=coalesce(nullif(v_identity->>'address_state',''),address_state),
    address_zip=coalesce(nullif(v_identity->>'address_zip',''),address_zip),
    hours=coalesce(hours,'{}'::jsonb)||(v_draft.facts->'hours'),
    gallery_photos=case when jsonb_array_length(v_draft.facts->'photos')>0 then v_draft.facts->'photos' else gallery_photos end
    where id=p_salon;
  for v_service in select value from jsonb_array_elements(v_draft.facts->'services') loop
    -- Missing facts stay in the private draft. Never manufacture a free price,
    -- a duration or catalog classification to satisfy a required DB field.
    if v_service->>'price' is null or v_service->>'minutes' is null or v_service->>'group_id' is null then continue; end if;
    if exists(select 1 from public.styles where salon_id=p_salon and lower(trim(name))=lower(trim(v_service->>'name'))) then raise exception 'ONBOARDING_EXISTING_SERVICE'; end if;
    select * into v_group from public.service_groups where id=(v_service->>'group_id')::uuid and is_active and archived_at is null;
    if not found then raise exception 'ONBOARDING_CATALOG_CHANGED'; end if;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('record_id',null,'category_id',v_group.category_id,'service_group_id',v_group.id,'master_style_id',null,
      'name',v_service->>'name','description','','duration_min_hours',(v_service->>'minutes')::numeric/60,
      'duration_max_hours',(v_service->>'minutes')::numeric/60,'buffer_minutes',0,'base_price',(v_service->>'price')::numeric,
      'price_display_max',(v_service->>'price')::numeric,'addons','[]'::jsonb));
  end loop;
  if jsonb_array_length(v_rows)>0 then
    -- Reuse the canonical import's catalog validation, audit and plan rules.
    v_import:=public.import_salon_services_spreadsheet(p_salon,p_actor,'Owner-reviewed onboarding',v_rows);
    if coalesce((v_import->>'updated')::integer,0)<>0 then raise exception 'ONBOARDING_WORKSPACE_CHANGED'; end if;
    update public.styles set is_draft=true where salon_id=p_salon and id in(select value::uuid from jsonb_array_elements_text(v_import->'record_ids'));
  end if;
  for v_team in select value from jsonb_array_elements(v_draft.facts->'team') loop
    if exists(select 1 from public.stylists where salon_id=p_salon and lower(trim(name))=lower(trim(v_team->>'name'))) then raise exception 'ONBOARDING_EXISTING_TEAM'; end if;
    insert into public.stylists(salon_id,name,bio,is_active) values(p_salon,v_team->>'name',v_team->>'bio',false) returning id into v_id;
    v_team_ids:=v_team_ids||jsonb_build_array(v_id);
  end loop;
  if jsonb_typeof(v_draft.facts->'policies')='object' then
    insert into public.business_policy_revisions(salon_id,policy,source_locale,created_by)
      values(p_salon,v_draft.facts->'policies',coalesce(v_draft.source->>'locale','en'),p_actor) returning id into v_policy;
  end if;
  if p_keep_unpublished and exists(select 1 from public.salons where id=p_salon and (is_discoverable or owner_unpublished_at is null)) then raise exception 'ONBOARDING_PUBLICATION_GUARD'; end if;
  -- Existing publication holds are never lifted by this import. Lifecycle
  -- checks may reduce eligibility after a reviewed address/profile change.
  if v_existing and exists(select 1 from public.salons where id=p_salon and owner_unpublished_at is distinct from v_salon.owner_unpublished_at) then raise exception 'ONBOARDING_PUBLICATION_GUARD'; end if;
  select coalesce(is_discoverable,false) into v_published from public.salons where id=p_salon;
  v_result:=jsonb_build_object('profile_saved',true,'services_created',coalesce(v_import->'created','0'::jsonb),
    'service_ids',coalesce(v_import->'record_ids','[]'::jsonb),'team_ids',v_team_ids,'policy_revision_id',v_policy,'published',v_published,'public_impact_reviewed',p_public_impact,'uncertain',v_draft.uncertain);
  update public.business_instagram_import_assets a set status='applied' from public.business_instagram_imports i where i.id=a.import_id and i.draft_id=p_id and a.salon_id=p_salon and a.owner_id=p_actor and a.status='prepared' and v_photos @> jsonb_build_array(a.public_url);
  update public.business_onboarding_drafts set status='applied',confirmed_at=now(),updated_at=now(),result=v_result where id=p_id returning * into v_draft;
  return to_jsonb(v_draft)-'baseline'-'provenance';
end $$;


create function public.instagram_onboarding_account_available(p_salon uuid,p_owner uuid,p_user text) returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select public.instagram_onboarding_owner(p_salon,p_owner) and p_user ~ '^[0-9]{1,30}$'
  and not exists(select 1 from public.business_instagram_connections where app_user_id=p_user and salon_id<>p_salon)
  and not exists(select 1 from public.business_instagram_imports where app_user_id=p_user and salon_id<>p_salon and status<>'purged')
  and not exists(select 1 from public.business_instagram_deletions where provider_user_id=p_user and status='pending');
$$;
revoke all on function public.instagram_onboarding_account_available(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.instagram_onboarding_account_available(uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260919134856"'::jsonb,draft_value='"20260919134856"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
