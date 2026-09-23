begin;
set local lock_timeout='5s';
-- Inventory and reservations are private. Published placements continue using
-- the existing Featured Business campaign/audit/entitlement system.
create table gc_private.ad_spaces(
 id uuid primary key, title text not null check(length(trim(title)) between 3 and 100),
 price_cents integer not null check(price_cents between 1 and 1000000),
 opens_at timestamptz not null, starts_at timestamptz not null, ends_at timestamptz not null,
 radius_miles numeric not null check(radius_miles between 1 and 250),
 capacity integer not null check(capacity between 1 and 100),active boolean not null default true,
 created_by uuid not null,created_at timestamptz not null default now(),closed_by uuid,closed_at timestamptz,
 check(starts_at>=opens_at and ends_at>starts_at)
);
create table gc_private.ad_reservations(
 id uuid primary key,salon_id uuid not null references public.salons(id),actor_id uuid not null,
 space_id uuid not null references gc_private.ad_spaces(id),fingerprint text not null,
 plan text not null,discount_percent integer not null,price_cents integer not null,discount_cents integer not null,
 credit_cents integer not null,balance_cents integer not null,
 status text not null default 'reserved' check(status in('reserved','fulfilled','cancelled')),
 created_at timestamptz not null default now(),expires_at timestamptz not null,
 campaign_id uuid references public.featured_salon_campaigns(id),fulfilled_by uuid,
 invoice_reference text,fulfilled_at timestamptz,cancelled_by uuid,cancelled_at timestamptz,
 check(price_cents=discount_cents+credit_cents+balance_cents and credit_cents between 0 and 1000 and balance_cents>=0)
);
create index on gc_private.ad_reservations(salon_id,created_at);
create index on gc_private.ad_reservations(space_id,status);
create unique index ad_reservation_invoice_once on gc_private.ad_reservations(invoice_reference) where invoice_reference is not null;
alter table gc_private.ad_spaces enable row level security;
alter table gc_private.ad_reservations enable row level security;
revoke all on gc_private.ad_spaces,gc_private.ad_reservations from public,anon,authenticated,service_role;

create function gc_private.ad_admin(p_actor uuid) returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.admin_users a where coalesce(a.user_id,a.id)=p_actor and a.status='Active' and (a.is_super_admin or coalesce((a.permissions->>'marketing')::boolean,false))) then raise exception 'AD_ACCESS_DENIED';end if;
end $$;

-- Verified home/mobile origins qualify without publishing private coordinates.
create function gc_private.ad_verified_location(p_salon uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce((case when v.salon_id is not null then v.geocode_status='success' and v.latitude is not null and v.longitude is not null
  else b.geocode_status='success' and b.latitude is not null and b.longitude is not null and not coalesce(b.address_needs_review,false) end),false)
 from public.salons b left join public.business_verification_locations v on v.salon_id=b.id where b.id=p_salon
$$;
revoke all on function gc_private.ad_verified_location(uuid) from public,anon,authenticated,service_role;
-- Fail closed if a prior definition differs; keep the rest of the reviewed
-- canonical campaign authorization, entitlement and audit implementation intact.
do $patch$
declare source text; original text; needle text;
begin
 source:=pg_get_functiondef('public.admin_save_featured_campaign_v2(uuid,uuid,uuid,text,timestamptz,timestamptz,text,numeric,integer,numeric,text,text,text,text,integer,text)'::regprocedure);
 source:=regexp_replace(replace(source,E'\r',''),E'\n[ \t]*\n',E'\n','g');
 needle:=E'       or v_salon.latitude is null\n       or v_salon.longitude is null\n       or v_salon.geocode_status <> ''success''\n       or coalesce(v_salon.address_needs_review, false)';
 if position(needle in source)=0 then raise exception 'AD_CANONICAL_LOCATION_GUARD_CHANGED';end if;
 source:=replace(source,needle,'       or not gc_private.ad_verified_location(p_salon_id)');execute source;
 source:=pg_get_functiondef('public.discover_featured_salons(double precision,double precision,double precision,text,integer,integer)'::regprocedure);source:=regexp_replace(replace(source,E'\r',''),E'\n[ \t]*\n',E'\n','g');original:=source;
 source:=replace(source,'public.distance_miles(origin_latitude,origin_longitude,s.latitude,s.longitude) distance_miles','public.distance_miles(origin_latitude,origin_longitude,actual.lat,actual.lng) distance_miles');
 source:=replace(source,'join public.salons s on s.id=campaign.salon_id',E'join public.salons s on s.id=campaign.salon_id\n    left join public.business_verification_locations v on v.salon_id=s.id\n    cross join lateral(select coalesce(v.latitude,s.latitude) lat,coalesce(v.longitude,s.longitude) lng)actual');
 needle:=E'      and s.geocode_status=''success''\n      and coalesce(s.address_needs_review,false)=false\n      and s.latitude is not null\n      and s.longitude is not null';
 if position(needle in source)=0 or source=original then raise exception 'AD_CANONICAL_DISCOVERY_GUARD_CHANGED';end if;
 source:=replace(source,needle,E'      and gc_private.ad_verified_location(s.id)\n      and (s.service_location_type is distinct from ''mobile'' or public.distance_miles(origin_latitude,origin_longitude,actual.lat,actual.lng)<=s.travel_radius_miles)');execute source;
end $patch$;

create function gc_private.ad_benefits(p_salon uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare plan text:=public.salon_effective_plan_key(p_salon);discount integer:=0;period_start timestamptz;period_end timestamptz;spent integer:=0;
begin
 if public.p0_business_plan_active(p_salon) then discount:=case plan when 'premium' then 15 when 'growth' then 5 when 'solo-pro' then 5 else 0 end;end if;
 period_start:=date_trunc(case when plan='premium' then 'month' else 'quarter' end,now() at time zone 'UTC') at time zone 'UTC';
 period_end:=((period_start at time zone 'UTC')+case when plan='premium' then interval '1 month' else interval '3 months' end) at time zone 'UTC';
 select coalesce(sum(credit_cents),0) into spent from gc_private.ad_reservations where salon_id=p_salon and created_at>=period_start and created_at<period_end and (status='fulfilled' or status='reserved' and expires_at>now());
 return jsonb_build_object('plan',plan,'discount_percent',discount,'credit_available_cents',case when discount>0 then greatest(0,1000-spent) else 0 end,
 'period_start',period_start,'period_end',period_end,'early_hours',case when discount=15 then 48 else 0 end);
end $$;
create function gc_private.ad_quote(p_salon uuid,p_space uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare b jsonb:=gc_private.ad_benefits(p_salon);s gc_private.ad_spaces%rowtype;discount integer;credit integer;j jsonb;
begin
 select * into s from gc_private.ad_spaces where id=p_space and active and ends_at>now() and starts_at>now();
 if not found or now()<s.opens_at-make_interval(hours=>(b->>'early_hours')::integer) then raise exception 'AD_NOT_AVAILABLE';end if;
 if (select count(*) from gc_private.ad_reservations where space_id=s.id and(status='fulfilled' or status='reserved' and expires_at>now()))>=s.capacity then raise exception 'AD_NOT_AVAILABLE';end if;
 discount:=round(s.price_cents*(b->>'discount_percent')::numeric/100)::integer;
 credit:=least(s.price_cents-discount,(b->>'credit_available_cents')::integer);
 j:=jsonb_build_object('id',s.id,'title',s.title,'starts_at',s.starts_at,'ends_at',s.ends_at,'radius_miles',s.radius_miles,'plan',b->>'plan',
 'price_cents',s.price_cents,'discount_percent',(b->>'discount_percent')::integer,'discount_cents',discount,'credit_cents',credit,'balance_cents',s.price_cents-discount-credit,'period_start',b->'period_start');
 return j||jsonb_build_object('fingerprint',md5(j::text));
end $$;
create function public.read_business_ad_spaces(p_salon uuid,p_actor uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.salons%rowtype;b jsonb;offers jsonb:='[]';r record;
begin
 select * into s from public.salons where id=p_salon and user_id=p_actor;
 if not found or not public.p0_actor_has_permission(p_salon,p_actor,'settings') then raise exception 'AD_ACCESS_DENIED';end if;
 b:=gc_private.ad_benefits(p_salon);
 for r in select id from gc_private.ad_spaces where active and starts_at>now() and opens_at-make_interval(hours=>(b->>'early_hours')::integer)<=now() order by starts_at,id limit 100 loop
  begin offers:=offers||jsonb_build_array(gc_private.ad_quote(p_salon,r.id));exception when others then if sqlerrm<>'AD_NOT_AVAILABLE' then raise;end if;end;
 end loop;
 return jsonb_build_object('salon_id',p_salon,'is_demo',s.is_demo,'eligible',not s.is_demo and public.is_marketplace_visible(s.id) and gc_private.ad_verified_location(s.id),
 'benefits',b,'offers',offers,'reservations',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',a.title,'status',case when x.status='reserved' and x.expires_at<=now() then 'expired' else x.status end,'balance_cents',x.balance_cents,'credit_cents',x.credit_cents,'expires_at',x.expires_at,'campaign_id',x.campaign_id) order by x.created_at desc),'[]') from (select * from gc_private.ad_reservations where salon_id=p_salon order by created_at desc limit 50)x join gc_private.ad_spaces a on a.id=x.space_id));
end $$;
create function public.reserve_business_ad_space(p_salon uuid,p_actor uuid,p_space uuid,p_request uuid,p_fingerprint text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare prior gc_private.ad_reservations%rowtype;j jsonb;q jsonb;
begin
 perform 1 from public.salons where id=p_salon for update;j:=public.read_business_ad_spaces(p_salon,p_actor);
 if p_request is null or p_space is null or p_fingerprint is null or p_fingerprint!~'^[0-9a-f]{32}$' then raise exception 'AD_INVALID';end if;
 select * into prior from gc_private.ad_reservations where id=p_request;
 if found then
  if prior.salon_id<>p_salon or prior.actor_id<>p_actor or prior.space_id<>p_space or prior.fingerprint<>p_fingerprint then raise exception 'AD_REQUEST_REUSED';end if;
  return jsonb_build_object('id',prior.id,'verified',true);
 end if;
 if (j->>'eligible')::boolean is not true then raise exception 'AD_BUSINESS_NOT_ELIGIBLE';end if;
 perform 1 from gc_private.ad_spaces where id=p_space for update;
 q:=gc_private.ad_quote(p_salon,p_space);
 if q->>'fingerprint'<>p_fingerprint then raise exception 'AD_QUOTE_CHANGED';end if;
 if exists(select 1 from gc_private.ad_reservations where salon_id=p_salon and space_id=p_space and(status='fulfilled' or status='reserved' and expires_at>now()))then raise exception 'AD_ALREADY_RESERVED';end if;
 insert into gc_private.ad_reservations(id,salon_id,actor_id,space_id,fingerprint,plan,discount_percent,price_cents,discount_cents,credit_cents,balance_cents,expires_at)
 values(p_request,p_salon,p_actor,p_space,p_fingerprint,q->>'plan',(q->>'discount_percent')::integer,(q->>'price_cents')::integer,(q->>'discount_cents')::integer,(q->>'credit_cents')::integer,(q->>'balance_cents')::integer,least(now()+interval '48 hours',(q->>'starts_at')::timestamptz));
 return jsonb_build_object('id',p_request,'verified',true);
end $$;
create function public.cancel_business_ad_reservation(p_salon uuid,p_actor uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r gc_private.ad_reservations%rowtype;
begin
 perform 1 from public.salons where id=p_salon for update;perform public.read_business_ad_spaces(p_salon,p_actor);
 select * into r from gc_private.ad_reservations where id=p_request and salon_id=p_salon for update;
 if not found then raise exception 'AD_NOT_FOUND';end if;
 if r.status='fulfilled' then raise exception 'AD_ALREADY_FULFILLED';end if;
 update gc_private.ad_reservations set status='cancelled',cancelled_by=coalesce(cancelled_by,p_actor),cancelled_at=coalesce(cancelled_at,now()) where id=r.id;
 return jsonb_build_object('id',r.id,'verified',true);
end $$;
create function public.admin_ad_spaces(p_actor uuid,p_action text,p_input jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s gc_private.ad_spaces%rowtype;r gc_private.ad_reservations%rowtype;campaign uuid;reference text;salon uuid;
begin
 perform gc_private.ad_admin(p_actor);
 if p_action='create' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_input)k)<>array['capacity','ends_at','id','opens_at','price_cents','radius_miles','starts_at','title'] then raise exception 'AD_INVALID';end if;
  if exists(select 1 from gc_private.ad_spaces where id=(p_input->>'id')::uuid) then
   select * into s from gc_private.ad_spaces where id=(p_input->>'id')::uuid;
   if s.created_by<>p_actor or s.title<>p_input->>'title' or s.price_cents<>(p_input->>'price_cents')::integer or s.opens_at<>(p_input->>'opens_at')::timestamptz or s.starts_at<>(p_input->>'starts_at')::timestamptz or s.ends_at<>(p_input->>'ends_at')::timestamptz or s.capacity<>(p_input->>'capacity')::integer or s.radius_miles<>(p_input->>'radius_miles')::numeric then raise exception 'AD_REQUEST_REUSED';end if;
  else
   if (p_input->>'opens_at')::timestamptz<now()+interval '48 hours' then raise exception 'AD_EARLY_ACCESS_REQUIRED';end if;
   insert into gc_private.ad_spaces(id,title,price_cents,opens_at,starts_at,ends_at,radius_miles,capacity,created_by)values((p_input->>'id')::uuid,p_input->>'title',(p_input->>'price_cents')::integer,(p_input->>'opens_at')::timestamptz,(p_input->>'starts_at')::timestamptz,(p_input->>'ends_at')::timestamptz,(p_input->>'radius_miles')::numeric,(p_input->>'capacity')::integer,p_actor);
  end if;
 elsif p_action='close' then
  update gc_private.ad_spaces set active=false,closed_by=coalesce(closed_by,p_actor),closed_at=coalesce(closed_at,now()) where id=(p_input->>'id')::uuid;if not found then raise exception 'AD_NOT_FOUND';end if;
 elsif p_action='fulfill' then
  -- All reservation mutations serialize on the business before the inventory.
  select salon_id into salon from gc_private.ad_reservations where id=(p_input->>'id')::uuid;
  perform 1 from public.salons where id=salon for update;
  select * into r from gc_private.ad_reservations where id=(p_input->>'id')::uuid for update;if not found then raise exception 'AD_NOT_FOUND';end if;
  reference:=nullif(trim(p_input->>'invoice_reference'),'');
  if r.status='fulfilled' then
   if reference is distinct from r.invoice_reference or (p_input->>'received_cents')::integer is distinct from r.balance_cents or r.balance_cents>0 and p_input->>'payment_verified' is distinct from 'true' then raise exception 'AD_REQUEST_REUSED';end if;
  else
   select * into s from gc_private.ad_spaces where id=r.space_id for update;
   if r.status<>'reserved' or r.expires_at<=now() or not s.active or s.starts_at<=now() then raise exception 'AD_NOT_AVAILABLE';end if;
   if exists(select 1 from public.salons where id=r.salon_id and is_demo)then raise exception 'AD_BUSINESS_NOT_ELIGIBLE';end if;
   if r.balance_cents>0 and (reference is null or length(reference) not between 4 and 160 or p_input->>'payment_verified' is distinct from 'true' or (p_input->>'received_cents')::integer is distinct from r.balance_cents) then raise exception 'AD_INVOICE_REQUIRED';end if;
   if r.balance_cents=0 then reference:=null;end if;
   if reference is not null and exists(select 1 from public.marketing_entitlements where source='verified_invoice' and external_reference=reference) then raise exception 'AD_INVOICE_REUSED';end if;
   campaign:=public.admin_save_featured_campaign_v2(p_actor,null,r.salon_id,'Scheduled',s.starts_at,s.ends_at,'UTC',s.radius_miles,50,1,
    'Reviewed ad reservation '||r.id::text||'; price='||r.price_cents||'; discount='||r.discount_cents||'; credit='||r.credit_cents||'; received='||r.balance_cents,
    case when r.balance_cents=0 then 'platform_credit' else 'paid' end,case when r.balance_cents=0 then null else 'verified_invoice' end,reference,
    case when r.balance_cents=0 then r.credit_cents else r.balance_cents end,'Plan benefits recorded; no payment provider operation');
   update gc_private.ad_reservations set status='fulfilled',campaign_id=campaign,invoice_reference=reference,fulfilled_by=p_actor,fulfilled_at=now() where id=r.id;
  end if;
 elsif p_action<>'read' then raise exception 'AD_INVALID';end if;
 return jsonb_build_object('spaces',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]')from(select * from gc_private.ad_spaces order by created_at desc limit 100)x),
 'reservations',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('business_name',biz.name,'title',inventory.title,'status',case when x.status='reserved' and x.expires_at<=now() then 'expired' else x.status end) order by x.created_at desc),'[]')from(select * from gc_private.ad_reservations order by created_at desc limit 200)x join public.salons biz on biz.id=x.salon_id join gc_private.ad_spaces inventory on inventory.id=x.space_id));
end $$;
revoke all on function gc_private.ad_admin(uuid),gc_private.ad_benefits(uuid),gc_private.ad_quote(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.read_business_ad_spaces(uuid,uuid),public.reserve_business_ad_space(uuid,uuid,uuid,uuid,text),public.cancel_business_ad_reservation(uuid,uuid,uuid),public.admin_ad_spaces(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.read_business_ad_spaces(uuid,uuid),public.reserve_business_ad_space(uuid,uuid,uuid,uuid,text),public.cancel_business_ad_reservation(uuid,uuid,uuid),public.admin_ad_spaces(uuid,text,jsonb) to service_role;
update public.engine_settings set published_value='"20260923134319"'::jsonb,draft_value='"20260923134319"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
