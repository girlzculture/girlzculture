--183: analytical allocations reference canonical costs; no receipt, expense or agreement is created or changed.
begin;
set local lock_timeout='5s';
create table public.business_service_cost_reviews (
 id uuid primary key default gen_random_uuid(),salon_id uuid not null references public.salons(id),service_id uuid not null references public.styles(id),
 period_from date not null,period_to date not null,revision integer not null check(revision>0),fingerprint text not null check(fingerprint~'^[0-9a-f]{32}$'),
 complete boolean not null check(complete),zero_confirmed boolean not null,allocations jsonb not null check(jsonb_typeof(allocations)='array' and jsonb_array_length(allocations)<=40),
 note text not null check(length(trim(note)) between 1 and 1000),reviewed_by uuid not null,reviewed_at timestamptz not null default now(),
 unique(salon_id,service_id,period_from,period_to),check(period_to>=period_from and period_to-period_from<366)
);
alter table public.business_service_cost_reviews enable row level security;
revoke all on public.business_service_cost_reviews from public,anon,authenticated;
grant select,insert,update on public.business_service_cost_reviews to service_role;

create function public.read_service_contribution_evidence(p_salon uuid,p_actor uuid,p_from date,p_to date) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.salons%rowtype;fin jsonb;normalized jsonb;services jsonb;mapping jsonb;reviews jsonb;fingerprint text;total integer;
begin
 if not public.p0_actor_has_permission(p_salon,p_actor,'earnings') or not public.p0_actor_has_permission(p_salon,p_actor,'bookings') or not public.p0_actor_has_permission(p_salon,p_actor,'styles') or not public.p0_business_plan_active(p_salon) then raise exception 'CONTRIBUTION_ACCESS_DENIED';end if;
 select * into s from public.salons where id=p_salon;
 if not found or not exists(select 1 from pg_catalog.pg_timezone_names where name=s.time_zone) then raise exception 'CONTRIBUTION_ACCESS_DENIED';end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_to-p_from>=366 or p_to>=(now() at time zone s.time_zone)::date then raise exception 'CONTRIBUTION_INVALID_PERIOD';end if;
 fin:=public.read_business_finance(p_salon,p_actor);
 if fin->'scope'->>'kind'<>'business' then raise exception 'CONTRIBUTION_ACCESS_DENIED';end if;
 select coalesce(sum(jsonb_array_length(value)),0) into total from jsonb_each(fin) where key<>'scope';
 if total>20000 or jsonb_array_length(fin->'bookings')>5000 then raise exception 'CONTRIBUTION_EVIDENCE_INCOMPLETE';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'salon_id',salon_id,'name',name) order by id),'[]') into services from public.styles where salon_id=p_salon;
 if jsonb_array_length(services)>200 then raise exception 'CONTRIBUTION_EVIDENCE_INCOMPLETE';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'salon_id',b.salon_id,'style_id',b.style_id) order by b.id),'[]') into mapping
 from public.bookings b where b.salon_id=p_salon and exists(select 1 from jsonb_array_elements(fin->'bookings') x where x->>'id'=b.id::text);
 if jsonb_array_length(mapping)<>jsonb_array_length(fin->'bookings') then raise exception 'CONTRIBUTION_EVIDENCE_INCOMPLETE';end if;
 -- Stable row ordering; no private financial projection is sent to the browser.
 select jsonb_object_agg(key,case when key='scope' then value else (select coalesce(jsonb_agg(item order by item->>'id',item::text),'[]') from jsonb_array_elements(value)item) end) into normalized from jsonb_each(fin);
 fingerprint:=md5(jsonb_build_object('from',p_from,'to',p_to,'zone',s.time_zone,'finance',normalized,'services',services,'mapping',mapping)::text);
 select coalesce(jsonb_agg(jsonb_build_object('service_id',service_id,'revision',revision,'fingerprint',r.fingerprint,'complete',complete,'zero_confirmed',zero_confirmed,'allocations',allocations,'note',note) order by service_id),'[]') into reviews
 from public.business_service_cost_reviews r where salon_id=p_salon and period_from=p_from and period_to=p_to;
 return jsonb_build_object('salon_id',p_salon,'period',jsonb_build_object('from',p_from,'to',p_to,'timeZone',s.time_zone),'as_of',now(),'fingerprint',fingerprint,'finance',fin,'services',services,'booking_services',mapping,'reviews',reviews);
end $$;

create function public.save_service_contribution_review(p_salon uuid,p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.salons%rowtype;evidence jsonb;prior public.business_finance_operations%rowtype;existing public.business_service_cost_reviews%rowtype;
 item jsonb;source_amount bigint;already bigint;v_from date;v_to date;v_service uuid;v_id uuid;v_revision integer;saved jsonb;
begin
 if p_request is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 or (select count(*) from jsonb_object_keys(p_payload))<>9
  or p_payload-array['from','to','service_id','revision','fingerprint','complete','zero_confirmed','allocations','note']<>'{}'::jsonb
  or p_payload->'complete' is distinct from 'true'::jsonb or jsonb_typeof(p_payload->'zero_confirmed')<>'boolean'
  or jsonb_typeof(p_payload->'allocations')<>'array' or jsonb_array_length(p_payload->'allocations')>40
  or jsonb_typeof(p_payload->'revision')<>'number' or p_payload->>'revision'!~'^[0-9]+$'
  or exists(select 1 from jsonb_each(p_payload) where key in('from','to','service_id','fingerprint','note') and jsonb_typeof(value)<>'string')
  or p_payload->>'fingerprint'!~'^[0-9a-f]{32}$' or length(trim(p_payload->>'note')) not between 1 and 1000
  or (jsonb_array_length(p_payload->'allocations')=0 and p_payload->'zero_confirmed' is distinct from 'true'::jsonb) then raise exception 'CONTRIBUTION_REVIEW_INVALID';end if;
 select * into s from public.salons where id=p_salon for update;
 if not found then raise exception 'CONTRIBUTION_ACCESS_DENIED';end if;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 if s.user_id is distinct from p_actor or not public.p0_actor_has_permission(p_salon,p_actor,'finance_manage') then raise exception 'CONTRIBUTION_OWNER_REQUIRED';end if;
 v_from:=(p_payload->>'from')::date;v_to:=(p_payload->>'to')::date;v_service:=(p_payload->>'service_id')::uuid;
 evidence:=public.read_service_contribution_evidence(p_salon,p_actor,v_from,v_to);
 select * into prior from public.business_finance_operations where salon_id=p_salon and actor_id=p_actor and request_id=p_request;
 if found then
  if prior.action<>'service_cost_review' or prior.payload<>p_payload then raise exception 'CONTRIBUTION_REQUEST_CONFLICT';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if evidence->>'fingerprint' is distinct from p_payload->>'fingerprint' then raise exception 'CONTRIBUTION_SOURCE_CHANGED';end if;
 if not exists(select 1 from public.styles where id=v_service and salon_id=p_salon) or not exists(select 1 from public.bookings b where b.salon_id=p_salon and b.style_id=v_service and b.status='Completed' and coalesce(b.payment_mode,'live')<>'test' and (coalesce(b.service_completed_at,b.appointment_datetime) at time zone s.time_zone)::date between v_from and v_to) then raise exception 'CONTRIBUTION_SERVICE_UNAVAILABLE';end if;
 select * into existing from public.business_service_cost_reviews where salon_id=p_salon and service_id=v_service and period_from=v_from and period_to=v_to for update;
 if coalesce(existing.revision,0)<>(p_payload->>'revision')::integer then raise exception 'CONTRIBUTION_REVIEW_CONFLICT';end if;
 if (select count(*) from jsonb_array_elements(p_payload->'allocations'))<>(select count(distinct (value->>'kind',value->>'id')) from jsonb_array_elements(p_payload->'allocations')) then raise exception 'CONTRIBUTION_ALLOCATION_INVALID';end if;
 for item in select value from jsonb_array_elements(p_payload->'allocations') loop
  if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>3 or item-array['kind','id','cents']<>'{}'::jsonb
   or jsonb_typeof(item->'kind')<>'string' or jsonb_typeof(item->'id')<>'string' or jsonb_typeof(item->'cents')<>'number'
   or item->>'kind' not in('expense','wage') or item->>'cents'!~'^[1-9][0-9]*$' or (item->>'cents')::numeric>100000000 then raise exception 'CONTRIBUTION_ALLOCATION_INVALID';end if;
  source_amount:=null;
  if item->>'kind'='expense' then
   select amount_cents into source_amount from public.business_finance_expenses where id=(item->>'id')::uuid and salon_id=p_salon and treatment='operating' and (occurred_at at time zone s.time_zone)::date between v_from and v_to for share;
  else
   select amount_cents into source_amount from public.business_compensation_obligations where id=(item->>'id')::uuid and salon_id=p_salon and kind='wage' and (due_at at time zone s.time_zone)::date between v_from and v_to for share;
  end if;
  select coalesce(sum((a->>'cents')::bigint),0) into already from public.business_service_cost_reviews r cross join lateral jsonb_array_elements(r.allocations)a
   where r.salon_id=p_salon and r.period_from=v_from and r.period_to=v_to and r.service_id<>v_service and r.fingerprint=evidence->>'fingerprint' and a->>'kind'=item->>'kind' and a->>'id'=item->>'id';
  if source_amount is null or already+(item->>'cents')::bigint>source_amount then raise exception 'CONTRIBUTION_ALLOCATION_EXCEEDS_SOURCE';end if;
 end loop;
 -- A source may have changed while its row lock was being acquired. Re-read
 -- under the acquired locks before saving; the API also independently reads
 -- committed evidence after this transaction before reporting success.
 evidence:=public.read_service_contribution_evidence(p_salon,p_actor,v_from,v_to);
 if evidence->>'fingerprint' is distinct from p_payload->>'fingerprint' then raise exception 'CONTRIBUTION_SOURCE_CHANGED';end if;
 v_revision:=coalesce(existing.revision,0)+1;
 insert into public.business_service_cost_reviews(salon_id,service_id,period_from,period_to,revision,fingerprint,complete,zero_confirmed,allocations,note,reviewed_by)
 values(p_salon,v_service,v_from,v_to,v_revision,p_payload->>'fingerprint',true,(p_payload->>'zero_confirmed')::boolean,p_payload->'allocations',trim(p_payload->>'note'),p_actor)
 on conflict(salon_id,service_id,period_from,period_to) do update set revision=excluded.revision,fingerprint=excluded.fingerprint,complete=excluded.complete,zero_confirmed=excluded.zero_confirmed,allocations=excluded.allocations,note=excluded.note,reviewed_by=p_actor,reviewed_at=now() returning id into v_id;
 saved:=jsonb_build_object('id',v_id,'service_id',v_service,'revision',v_revision,'fingerprint',p_payload->>'fingerprint','verified',true);
 insert into public.business_finance_operations(salon_id,actor_id,request_id,action,payload,result) values(p_salon,p_actor,p_request,'service_cost_review',p_payload,saved);
 return saved;
end $$;
revoke all on function public.read_service_contribution_evidence(uuid,uuid,date,date),public.save_service_contribution_review(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_service_contribution_evidence(uuid,uuid,date,date),public.save_service_contribution_review(uuid,uuid,uuid,jsonb) to service_role;
grant select on public.salons,public.styles,public.bookings,public.platform_identities,public.salon_team_members,public.business_finance_expenses,public.business_compensation_obligations,public.business_finance_operations to service_role;
grant update(id) on public.salons,public.salon_team_members,public.business_finance_expenses,public.business_compensation_obligations to service_role;
grant update(user_id) on public.platform_identities to service_role;
update public.engine_settings set published_value='"20260919101239"'::jsonb,draft_value='"20260919101239"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
