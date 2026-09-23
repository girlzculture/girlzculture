begin;
set local lock_timeout='5s';
create table gc_private.google_setup_requests(
 id uuid primary key, salon_id uuid not null references public.salons(id) on delete cascade,
 actor_id uuid not null, kind text not null check(kind in('assisted_setup','profile_review')),
 plan text not null, fingerprint text not null, ticket_id uuid not null references public.support_tickets(id),
 created_at timestamptz not null default now()
);
alter table gc_private.google_setup_requests enable row level security;
revoke all on gc_private.google_setup_requests from public,anon,authenticated,service_role;

create function public.read_business_google_help(p_salon uuid,p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.salons%rowtype;plan text;level text;fields jsonb;review jsonb;
begin
 select * into s from public.salons where id=p_salon and user_id=p_actor;
 if not found or public.p0_actor_has_permission(p_salon,p_actor,'settings') is not true then raise exception 'GOOGLE_HELP_ACCESS_DENIED';end if;
 plan:=public.salon_effective_plan_key(p_salon);
 level:=case when not public.p0_business_plan_active(p_salon) then 'guide' when plan='premium' then 'review' when plan in('solo-pro','growth') then 'assisted' else 'guide' end;
 -- Public-ready fields only. Never read the verification-address table, or
 -- imply this data was fetched from Google while live activation is deferred.
 fields:=jsonb_build_object('name',s.name,'phone',s.phone,'description',s.description,
  'address',case when s.service_location_type='mobile' or s.service_location_type='home' and not s.home_address_public then null
   else nullif(concat_ws(', ',nullif(s.address_street,''),nullif(s.address_city,''),nullif(s.address_state,''),nullif(s.address_zip,'')),'') end,
  'location_type',s.service_location_type,'mobile',s.offers_mobile or s.service_location_type='mobile',
  'area',s.public_neighborhood,'radius_miles',s.travel_radius_miles,'hours',s.hours,
  'page','https://girlzculture.com/salon/'||coalesce(nullif(s.slug,''),s.id::text));
 review:=jsonb_build_object('name',length(trim(coalesce(s.name,'')))>0,'phone',length(trim(coalesce(s.phone,'')))>0,
  'description',length(trim(coalesce(s.description,''))) between 1 and 750,'hours',s.hours is not null and s.hours not in('null'::jsonb,'{}'::jsonb),
  'public_page',public.is_salon_profile_public(s.id),'privacy_review_required',s.service_location_type in('mobile','home','chair_suite'));
 return jsonb_build_object('salon_id',s.id,'level',level,'is_demo',s.is_demo,'fields',case when level<>'guide' then fields else null end,
  'review',case when level='review' then review else null end,'fingerprint',md5(fields::text||review::text||coalesce(plan,'')),
  'requests',(select coalesce(jsonb_agg(jsonb_build_object('id',r.ticket_id,'kind',r.kind,'status',t.status,'created_at',r.created_at) order by r.created_at desc),'[]')
   from (select * from (select distinct on(ticket_id) * from gc_private.google_setup_requests where salon_id=p_salon order by ticket_id,created_at desc)x order by created_at desc limit 20)r join public.support_tickets t on t.id=r.ticket_id));
end $$;

create function public.request_business_google_help(p_salon uuid,p_actor uuid,p_request uuid,p_kind text,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare j jsonb; prior gc_private.google_setup_requests%rowtype;ticket uuid;plan text;name text;
begin
 perform 1 from public.salons where id=p_salon for update;
 j:=public.read_business_google_help(p_salon,p_actor);
 if (j->>'is_demo')::boolean then raise exception 'GOOGLE_HELP_DEMO_DISABLED';end if;
 if p_request is null or p_kind is null or p_kind not in('assisted_setup','profile_review') or p_fingerprint is null or p_fingerprint!~'^[0-9a-f]{32}$' then raise exception 'GOOGLE_HELP_INVALID';end if;
 select * into prior from gc_private.google_setup_requests where id=p_request;
 if found then
  if prior.salon_id<>p_salon or prior.actor_id<>p_actor or prior.kind<>p_kind or prior.fingerprint<>p_fingerprint then raise exception 'GOOGLE_HELP_REQUEST_REUSED';end if;
  return jsonb_build_object('ticket_id',prior.ticket_id,'verified',true);
 end if;
 if j->>'level'='guide' or p_kind='profile_review' and j->>'level'<>'review' then raise exception 'GOOGLE_HELP_PLAN_REQUIRED';end if;
 if j->>'fingerprint'<>p_fingerprint then raise exception 'GOOGLE_HELP_STALE';end if;
 select r.ticket_id into ticket from gc_private.google_setup_requests r join public.support_tickets t on t.id=r.ticket_id
 where r.salon_id=p_salon and r.kind=p_kind and t.status not in('Closed','Resolved') order by r.created_at desc limit 1;
 plan:=public.salon_effective_plan_key(p_salon);
 if ticket is not null then
  insert into gc_private.google_setup_requests(id,salon_id,actor_id,kind,plan,fingerprint,ticket_id)values(p_request,p_salon,p_actor,p_kind,plan,p_fingerprint,ticket);
  return jsonb_build_object('ticket_id',ticket,'verified',true,'already_open',true);
 end if;
 select s.name into name from public.salons s where s.id=p_salon;ticket:=gen_random_uuid();
 insert into public.support_tickets(id,salon_id,subject,message,status,priority,category,requester_name)
 values(ticket,p_salon,case when p_kind='profile_review' then 'Google Business Profile: review request' else 'Google Business Profile: assisted setup request' end,
  'Owner-reviewed Girlz Culture setup information. Live Google integration is not activated by this request.'||E'\nPlan: '||plan||E'\n'||jsonb_pretty(j->'fields'),
  'Open','Normal','Business',name);
 insert into gc_private.google_setup_requests(id,salon_id,actor_id,kind,plan,fingerprint,ticket_id)values(p_request,p_salon,p_actor,p_kind,plan,p_fingerprint,ticket);
 if not exists(select 1 from public.support_tickets where id=ticket and salon_id=p_salon and status='Open') then raise exception 'GOOGLE_HELP_READBACK_FAILED';end if;
 return jsonb_build_object('ticket_id',ticket,'verified',true);
end $$;
revoke all on function public.read_business_google_help(uuid,uuid),public.request_business_google_help(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.read_business_google_help(uuid,uuid),public.request_business_google_help(uuid,uuid,uuid,text,text) to service_role;
update public.engine_settings set published_value='"20260923132437"'::jsonb,draft_value='"20260923132437"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
