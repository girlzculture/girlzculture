-- Paid Featured Salon campaigns. Placement entitlement is explicit and
-- auditable; a subscription tier alone never qualifies a public placement.
begin;

create extension if not exists btree_gist with schema extensions;

alter table public.homepage_sections
  add column if not exists empty_title text,
  add column if not exists empty_body text,
  add column if not exists empty_href text;
update public.homepage_sections set
  empty_title=coalesce(empty_title,'Own a business? Get featured here.'),
  empty_body=coalesce(empty_body,'Put your salon in front of nearby clients with a clearly labeled featured placement.'),
  empty_href=coalesce(empty_href,'/partner')
where section_key='featured_salons';

create table if not exists public.marketing_entitlements (
  id uuid primary key default gen_random_uuid(),
  placement_type text not null check (placement_type in ('Featured Salon','Trending Video')),
  salon_id uuid not null references public.salons(id) on delete restrict,
  source text not null check (source in ('stripe_payment','verified_invoice','platform_credit')),
  external_reference text not null,
  status text not null default 'Paid' check (status in ('Paid','Credited','Revoked','Refunded','Expired')),
  amount_minor integer check (amount_minor is null or amount_minor >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_reference),
  check (valid_until is null or valid_until > valid_from)
);

create table if not exists public.featured_salon_campaigns (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  entitlement_id uuid references public.marketing_entitlements(id) on delete restrict,
  status text not null default 'Draft' check (status in ('Draft','Scheduled','Active','Paused','Expired')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/New_York',
  radius_miles numeric(6,2) not null default 25 check (radius_miles between 1 and 250),
  priority smallint not null default 50 check (priority between 0 and 100),
  rotation_weight numeric(6,2) not null default 1 check (rotation_weight between 0.1 and 100),
  internal_note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='featured_campaigns_no_overlap') then
    alter table public.featured_salon_campaigns add constraint featured_campaigns_no_overlap
      exclude using gist (salon_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
      where (status in ('Scheduled','Active','Paused'));
  end if;
end $$;

create table if not exists public.featured_campaign_audit (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.featured_salon_campaigns(id) on delete restrict,
  action text not null,
  previous_values jsonb,
  new_values jsonb,
  reason text,
  acting_admin_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists marketing_entitlements_salon_status_idx on public.marketing_entitlements(salon_id,placement_type,status,valid_until);
create index if not exists featured_campaigns_active_window_idx on public.featured_salon_campaigns(status,starts_at,ends_at,priority desc);
create index if not exists featured_campaigns_salon_idx on public.featured_salon_campaigns(salon_id,created_at desc);
create index if not exists featured_campaign_audit_campaign_idx on public.featured_campaign_audit(campaign_id,created_at desc);

alter table public.marketing_entitlements enable row level security;
alter table public.featured_salon_campaigns enable row level security;
alter table public.featured_campaign_audit enable row level security;
drop policy if exists marketing_entitlements_admin on public.marketing_entitlements;
create policy marketing_entitlements_admin on public.marketing_entitlements for select to authenticated using (public.admin_has_permission('marketing'));
drop policy if exists featured_campaigns_admin on public.featured_salon_campaigns;
create policy featured_campaigns_admin on public.featured_salon_campaigns for select to authenticated using (public.admin_has_permission('marketing'));
drop policy if exists featured_campaign_audit_admin on public.featured_campaign_audit;
create policy featured_campaign_audit_admin on public.featured_campaign_audit for select to authenticated using (public.admin_has_permission('marketing'));

create or replace function public.prevent_featured_audit_mutation()
returns trigger language plpgsql set search_path=public as $$ begin raise exception 'Featured campaign audit records are immutable.'; end $$;
drop trigger if exists featured_campaign_audit_immutable on public.featured_campaign_audit;
create trigger featured_campaign_audit_immutable before update or delete on public.featured_campaign_audit
for each row execute function public.prevent_featured_audit_mutation();

create or replace function public.admin_save_featured_campaign(
  acting_admin_id uuid,
  target_campaign_id uuid,
  target_salon_id uuid,
  requested_status text,
  campaign_starts_at timestamptz,
  campaign_ends_at timestamptz,
  campaign_timezone text,
  campaign_radius_miles numeric,
  campaign_priority integer,
  campaign_rotation_weight numeric,
  campaign_internal_note text default null,
  entitlement_source text default null,
  entitlement_reference text default null,
  entitlement_amount_minor integer default null,
  change_reason text default null
)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare
  admin_allowed boolean; salon_row public.salons%rowtype; existing public.featured_salon_campaigns%rowtype;
  campaign_id uuid; entitlement uuid; normalized_status text; previous jsonb; saved public.featured_salon_campaigns%rowtype;
begin
  select exists(select 1 from public.admin_users au where coalesce(au.user_id,au.id)=acting_admin_id and au.status='Active'
    and (coalesce(au.is_super_admin,false) or coalesce((au.permissions->>'marketing')::boolean,false))) into admin_allowed;
  if not admin_allowed then raise exception 'Forbidden'; end if;
  normalized_status:=initcap(lower(trim(requested_status)));
  if normalized_status not in ('Draft','Scheduled','Active','Paused','Expired') then raise exception 'Choose a valid campaign status.'; end if;
  if campaign_ends_at<=campaign_starts_at then raise exception 'Campaign end must be after its start.'; end if;
  if campaign_radius_miles not between 1 and 250 then raise exception 'Choose a radius between 1 and 250 miles.'; end if;
  if campaign_priority not between 0 and 100 or campaign_rotation_weight not between 0.1 and 100 then raise exception 'Choose valid priority and rotation values.'; end if;
  select * into salon_row from public.salons where id=target_salon_id;
  if not found then raise exception 'Salon not found.'; end if;
  if target_campaign_id is not null then
    select * into existing from public.featured_salon_campaigns where id=target_campaign_id for update;
    if not found then raise exception 'Campaign not found.'; end if;
    if existing.salon_id<>target_salon_id then raise exception 'A campaign salon cannot be replaced.'; end if;
    previous:=to_jsonb(existing); entitlement:=existing.entitlement_id; campaign_id:=existing.id;
  end if;
  if entitlement_source is not null or entitlement_reference is not null then
    if entitlement_source not in ('stripe_payment','verified_invoice','platform_credit') or length(trim(coalesce(entitlement_reference,'')))<4 then
      raise exception 'A verified entitlement source and reference are required.';
    end if;
    insert into public.marketing_entitlements(placement_type,salon_id,source,external_reference,status,amount_minor,valid_from,valid_until,created_by)
    values('Featured Salon',target_salon_id,entitlement_source,trim(entitlement_reference),'Paid',entitlement_amount_minor,campaign_starts_at,campaign_ends_at,acting_admin_id)
    on conflict(source,external_reference) do update set updated_at=now()
    returning id into entitlement;
    if not exists(select 1 from public.marketing_entitlements e where e.id=entitlement and e.salon_id=target_salon_id and e.placement_type='Featured Salon') then
      raise exception 'That entitlement reference belongs to a different salon or placement.';
    end if;
  end if;
  if normalized_status in ('Scheduled','Active') then
    if salon_row.status<>'Active' or not salon_row.is_discoverable or salon_row.latitude is null or salon_row.longitude is null
      or lower(coalesce(salon_row.subscription_status,'')) not in ('active','trialing') then
      raise exception 'Only active, subscribed, discoverable salons with verified coordinates can be featured.';
    end if;
    if entitlement is null or not exists(select 1 from public.marketing_entitlements e where e.id=entitlement and e.salon_id=target_salon_id
      and e.placement_type='Featured Salon' and e.status in ('Paid','Credited') and e.valid_from<=campaign_starts_at and (e.valid_until is null or e.valid_until>=campaign_ends_at)) then
      raise exception 'A paid or credited Featured Salon entitlement covering the full campaign is required.';
    end if;
    if campaign_starts_at>now() then normalized_status:='Scheduled';
    elsif campaign_ends_at<=now() then normalized_status:='Expired'; else normalized_status:='Active'; end if;
  end if;
  if target_campaign_id is null then
    insert into public.featured_salon_campaigns(salon_id,entitlement_id,status,starts_at,ends_at,timezone,radius_miles,priority,rotation_weight,internal_note,created_by,updated_by)
    values(target_salon_id,entitlement,normalized_status,campaign_starts_at,campaign_ends_at,coalesce(nullif(trim(campaign_timezone),''),'America/New_York'),campaign_radius_miles,campaign_priority,campaign_rotation_weight,nullif(trim(campaign_internal_note),''),acting_admin_id,acting_admin_id)
    returning * into saved; campaign_id:=saved.id;
    insert into public.featured_campaign_audit(campaign_id,action,new_values,reason,acting_admin_id) values(campaign_id,'Created',to_jsonb(saved),change_reason,acting_admin_id);
  else
    update public.featured_salon_campaigns set entitlement_id=entitlement,status=normalized_status,starts_at=campaign_starts_at,ends_at=campaign_ends_at,
      timezone=coalesce(nullif(trim(campaign_timezone),''),'America/New_York'),radius_miles=campaign_radius_miles,priority=campaign_priority,
      rotation_weight=campaign_rotation_weight,internal_note=nullif(trim(campaign_internal_note),''),updated_by=acting_admin_id,updated_at=now()
    where id=campaign_id returning * into saved;
    insert into public.featured_campaign_audit(campaign_id,action,previous_values,new_values,reason,acting_admin_id)
    values(campaign_id,case when existing.status<>saved.status then existing.status||' → '||saved.status else 'Edited' end,previous,to_jsonb(saved),change_reason,acting_admin_id);
  end if;
  return campaign_id;
end $$;
revoke all on function public.admin_save_featured_campaign(uuid,uuid,uuid,text,timestamptz,timestamptz,text,numeric,integer,numeric,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.admin_save_featured_campaign(uuid,uuid,uuid,text,timestamptz,timestamptz,text,numeric,integer,numeric,text,text,text,integer,text) to service_role;

create or replace function public.expire_featured_campaigns()
returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  with activated as (
    update public.featured_salon_campaigns set status='Active',updated_at=now()
    where status='Scheduled' and starts_at<=now() and ends_at>now()
    returning id,updated_by
  ), activation_audit as (
    insert into public.featured_campaign_audit(campaign_id,action,new_values,reason,acting_admin_id)
    select id,'Scheduled → Active',jsonb_build_object('status','Active','updated_at',now()),'Campaign start time reached.',updated_by from activated
  ), expired as (
    update public.featured_salon_campaigns set status='Expired',updated_at=now()
    where status in ('Scheduled','Active','Paused') and ends_at<=now()
    returning id,status,updated_by
  ), audited as (
    insert into public.featured_campaign_audit(campaign_id,action,new_values,reason,acting_admin_id)
    select id,'Expired',jsonb_build_object('status','Expired','updated_at',now()),'Campaign end time reached.',updated_by from expired
  ) select (select count(*) from activated)+(select count(*) from expired) into changed;
  return changed;
end $$;
revoke all on function public.expire_featured_campaigns() from public,anon,authenticated;
grant execute on function public.expire_featured_campaigns() to service_role;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    begin
      perform cron.unschedule('girlz-culture-expire-featured');
    exception when others then null;
    end;
    perform cron.schedule('girlz-culture-expire-featured','*/5 * * * *','select public.expire_featured_campaigns()');
  end if;
exception when undefined_function or invalid_schema_name then
  raise notice 'pg_cron is not enabled; call expire_featured_campaigns from the scheduled platform job.';
end $$;

create or replace function public.discover_featured_salons(
  origin_latitude double precision, origin_longitude double precision,
  request_radius_miles double precision default 25, rotation_seed text default null,
  result_limit integer default 12, result_offset integer default 0
)
returns table(
  id uuid,name text,slug text,address_city text,address_state text,borough text,cover_photo_url text,
  verification_status text,rating_overall numeric,review_count integer,latitude double precision,longitude double precision,
  starting_price numeric,services jsonb,distance_miles double precision,total_count bigint
)
language sql stable security definer set search_path=public as $$
  with eligible as (
    select s.id,s.name,s.slug,s.address_city,s.address_state,s.borough,s.cover_photo_url,s.verification_status,
      coalesce(s.rating_overall,0)::numeric rating_overall,coalesce(s.review_count,0)::integer review_count,s.latitude,s.longitude,
      c.id campaign_id,c.priority,c.rotation_weight,c.radius_miles,
      public.distance_miles(origin_latitude,origin_longitude,s.latitude,s.longitude) distance_miles,
      (select min(st.price_display_min) from public.styles st where st.salon_id=s.id) starting_price,
      coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'name',st.name) order by st.name) from public.styles st where st.salon_id=s.id),'[]'::jsonb) services
    from public.featured_salon_campaigns c
    join public.marketing_entitlements e on e.id=c.entitlement_id and e.salon_id=c.salon_id
    join public.salons s on s.id=c.salon_id
    join public.subscriptions sub on sub.salon_id=s.id
    where c.status in ('Active','Scheduled') and c.starts_at<=now() and c.ends_at>now()
      and e.placement_type='Featured Salon' and e.status in ('Paid','Credited') and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now())
      and s.status='Active' and s.is_discoverable and s.address_needs_review=false and s.latitude is not null and s.longitude is not null
      and lower(sub.status) in ('active','trialing') and (sub.current_period_end is null or sub.current_period_end>now())
  ), local as (
    select *, (abs(hashtext(campaign_id::text||coalesce(rotation_seed,to_char(now(),'YYYY-MM-DD-HH24')))::bigint)/greatest(rotation_weight,0.1)) rotation_score
    from eligible where distance_miles<=least(greatest(1,least(250,request_radius_miles)),radius_miles)
  ), ordered as (
    select *,count(*) over() total_count from local
    order by floor(distance_miles/5.0),priority desc,rotation_score,distance_miles,id
  )
  select o.id,o.name,o.slug,o.address_city,o.address_state,o.borough,o.cover_photo_url,o.verification_status,o.rating_overall,o.review_count,
    o.latitude,o.longitude,o.starting_price,o.services,o.distance_miles,o.total_count
  from ordered o limit greatest(1,least(50,result_limit)) offset greatest(0,result_offset)
$$;
revoke all on function public.discover_featured_salons(double precision,double precision,double precision,text,integer,integer) from public;
grant execute on function public.discover_featured_salons(double precision,double precision,double precision,text,integer,integer) to anon,authenticated,service_role;

commit;
