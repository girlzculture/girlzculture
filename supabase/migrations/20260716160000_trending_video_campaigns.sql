-- Radius-based paid Trending Picks video campaigns with moderation and audit.
begin;

create table if not exists public.trending_video_campaigns (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  entitlement_id uuid references public.marketing_entitlements(id) on delete restrict,
  video_url text not null,
  storage_path text not null,
  thumbnail_url text,
  description text not null check (char_length(description) between 1 and 180),
  duration_seconds numeric(5,2) not null check (duration_seconds>0 and duration_seconds<=30.5),
  file_size_bytes bigint not null check (file_size_bytes>0 and file_size_bytes<=26214400),
  mime_type text not null check (mime_type in ('video/mp4','video/webm')),
  moderation_status text not null default 'Pending' check (moderation_status in ('Pending','Approved','Rejected')),
  moderation_note text,
  moderated_by uuid references auth.users(id) on delete restrict,
  moderated_at timestamptz,
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
  check (ends_at>starts_at)
);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='trending_campaigns_no_overlap') then
    alter table public.trending_video_campaigns add constraint trending_campaigns_no_overlap
      exclude using gist(salon_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
      where(status in ('Scheduled','Active','Paused'));
  end if;
end $$;

create table if not exists public.trending_campaign_audit (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.trending_video_campaigns(id) on delete restrict,
  action text not null,
  previous_values jsonb,
  new_values jsonb,
  reason text,
  acting_admin_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists trending_campaigns_active_window_idx on public.trending_video_campaigns(status,moderation_status,starts_at,ends_at,priority desc);
create index if not exists trending_campaigns_salon_idx on public.trending_video_campaigns(salon_id,created_at desc);
create index if not exists trending_campaign_audit_idx on public.trending_campaign_audit(campaign_id,created_at desc);
alter table public.trending_video_campaigns enable row level security;
alter table public.trending_campaign_audit enable row level security;
drop policy if exists trending_campaigns_admin_read on public.trending_video_campaigns;
create policy trending_campaigns_admin_read on public.trending_video_campaigns for select to authenticated using(public.admin_has_permission('marketing'));
drop policy if exists trending_campaign_audit_admin_read on public.trending_campaign_audit;
create policy trending_campaign_audit_admin_read on public.trending_campaign_audit for select to authenticated using(public.admin_has_permission('marketing'));

create or replace function public.prevent_trending_audit_mutation()
returns trigger language plpgsql set search_path=public as $$ begin raise exception 'Trending campaign audit records are immutable.'; end $$;
drop trigger if exists trending_campaign_audit_immutable on public.trending_campaign_audit;
create trigger trending_campaign_audit_immutable before update or delete on public.trending_campaign_audit
for each row execute function public.prevent_trending_audit_mutation();

create or replace function public.admin_save_trending_campaign(
  acting_admin_id uuid,target_campaign_id uuid,target_salon_id uuid,
  campaign_video_url text,campaign_storage_path text,campaign_thumbnail_url text,campaign_description text,
  campaign_duration_seconds numeric,campaign_file_size_bytes bigint,campaign_mime_type text,
  requested_status text,campaign_starts_at timestamptz,campaign_ends_at timestamptz,campaign_timezone text,
  campaign_radius_miles numeric,campaign_priority integer,campaign_rotation_weight numeric,campaign_internal_note text default null,
  entitlement_source text default null,entitlement_reference text default null,entitlement_amount_minor integer default null,change_reason text default null
)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare admin_allowed boolean;salon_row public.salons%rowtype;existing public.trending_video_campaigns%rowtype;saved public.trending_video_campaigns%rowtype;
  campaign_id uuid;entitlement uuid;normalized_status text;previous jsonb;
begin
  select exists(select 1 from public.admin_users au where coalesce(au.user_id,au.id)=acting_admin_id and au.status='Active'
    and(coalesce(au.is_super_admin,false) or coalesce((au.permissions->>'marketing')::boolean,false))) into admin_allowed;
  if not admin_allowed then raise exception 'Forbidden';end if;
  normalized_status:=initcap(lower(trim(requested_status)));
  if normalized_status not in('Draft','Scheduled','Active','Paused','Expired') then raise exception 'Choose a valid campaign status.';end if;
  if campaign_ends_at<=campaign_starts_at then raise exception 'Campaign end must be after its start.';end if;
  if campaign_duration_seconds<=0 or campaign_duration_seconds>30.5 or campaign_file_size_bytes<=0 or campaign_file_size_bytes>26214400 or campaign_mime_type not in('video/mp4','video/webm') then raise exception 'Video validation failed.';end if;
  if length(trim(coalesce(campaign_description,'')))<1 or length(campaign_description)>180 then raise exception 'Enter a description up to 180 characters.';end if;
  if campaign_radius_miles not between 1 and 250 or campaign_priority not between 0 and 100 or campaign_rotation_weight not between 0.1 and 100 then raise exception 'Campaign targeting values are invalid.';end if;
  select * into salon_row from public.salons where id=target_salon_id;if not found then raise exception 'Salon not found.';end if;
  if target_campaign_id is not null then
    select * into existing from public.trending_video_campaigns where id=target_campaign_id for update;if not found then raise exception 'Campaign not found.';end if;
    if existing.salon_id<>target_salon_id then raise exception 'A campaign salon cannot be replaced.';end if;
    campaign_id:=existing.id;entitlement:=existing.entitlement_id;previous:=to_jsonb(existing);
  end if;
  if entitlement_source is not null or entitlement_reference is not null then
    if entitlement_source not in('stripe_payment','verified_invoice','platform_credit') or length(trim(coalesce(entitlement_reference,'')))<4 then raise exception 'A verified entitlement source and reference are required.';end if;
    insert into public.marketing_entitlements(placement_type,salon_id,source,external_reference,status,amount_minor,valid_from,valid_until,created_by)
    values('Trending Video',target_salon_id,entitlement_source,trim(entitlement_reference),'Paid',entitlement_amount_minor,campaign_starts_at,campaign_ends_at,acting_admin_id)
    on conflict(source,external_reference) do update set updated_at=now() returning id into entitlement;
    if not exists(select 1 from public.marketing_entitlements e where e.id=entitlement and e.salon_id=target_salon_id and e.placement_type='Trending Video') then raise exception 'That entitlement belongs to a different salon or placement.';end if;
  end if;
  if normalized_status in('Scheduled','Active') then
    if target_campaign_id is null or existing.moderation_status<>'Approved' then raise exception 'Approve video moderation before scheduling or activation.';end if;
    if existing.storage_path<>campaign_storage_path then raise exception 'Save a replacement video as Draft and approve it before activation.';end if;
    if salon_row.status<>'Active' or not salon_row.is_discoverable or salon_row.latitude is null or salon_row.longitude is null or lower(coalesce(salon_row.subscription_status,'')) not in('active','trialing') then raise exception 'Only active, subscribed, discoverable salons with verified coordinates can trend.';end if;
    if entitlement is null or not exists(select 1 from public.marketing_entitlements e where e.id=entitlement and e.salon_id=target_salon_id and e.placement_type='Trending Video' and e.status in('Paid','Credited') and e.valid_from<=campaign_starts_at and(e.valid_until is null or e.valid_until>=campaign_ends_at)) then raise exception 'A paid or credited Trending Video entitlement covering the campaign is required.';end if;
    if campaign_starts_at>now() then normalized_status:='Scheduled';elsif campaign_ends_at<=now() then normalized_status:='Expired';else normalized_status:='Active';end if;
  end if;
  if target_campaign_id is null then
    insert into public.trending_video_campaigns(salon_id,entitlement_id,video_url,storage_path,thumbnail_url,description,duration_seconds,file_size_bytes,mime_type,status,starts_at,ends_at,timezone,radius_miles,priority,rotation_weight,internal_note,created_by,updated_by)
    values(target_salon_id,entitlement,campaign_video_url,campaign_storage_path,nullif(campaign_thumbnail_url,''),trim(campaign_description),campaign_duration_seconds,campaign_file_size_bytes,campaign_mime_type,normalized_status,campaign_starts_at,campaign_ends_at,coalesce(nullif(trim(campaign_timezone),''),'America/New_York'),campaign_radius_miles,campaign_priority,campaign_rotation_weight,nullif(trim(campaign_internal_note),''),acting_admin_id,acting_admin_id)
    returning * into saved;campaign_id:=saved.id;
    insert into public.trending_campaign_audit(campaign_id,action,new_values,reason,acting_admin_id)values(campaign_id,'Created',to_jsonb(saved),change_reason,acting_admin_id);
  else
    update public.trending_video_campaigns set entitlement_id=entitlement,video_url=campaign_video_url,storage_path=campaign_storage_path,thumbnail_url=nullif(campaign_thumbnail_url,''),description=trim(campaign_description),duration_seconds=campaign_duration_seconds,file_size_bytes=campaign_file_size_bytes,mime_type=campaign_mime_type,status=case when existing.storage_path<>campaign_storage_path then 'Draft' else normalized_status end,moderation_status=case when existing.storage_path<>campaign_storage_path then 'Pending' else moderation_status end,moderation_note=case when existing.storage_path<>campaign_storage_path then null else moderation_note end,moderated_by=case when existing.storage_path<>campaign_storage_path then null else moderated_by end,moderated_at=case when existing.storage_path<>campaign_storage_path then null else moderated_at end,starts_at=campaign_starts_at,ends_at=campaign_ends_at,timezone=coalesce(nullif(trim(campaign_timezone),''),'America/New_York'),radius_miles=campaign_radius_miles,priority=campaign_priority,rotation_weight=campaign_rotation_weight,internal_note=nullif(trim(campaign_internal_note),''),updated_by=acting_admin_id,updated_at=now() where id=campaign_id returning * into saved;
    insert into public.trending_campaign_audit(campaign_id,action,previous_values,new_values,reason,acting_admin_id)values(campaign_id,case when existing.status<>saved.status then existing.status||' → '||saved.status else 'Edited' end,previous,to_jsonb(saved),change_reason,acting_admin_id);
  end if;
  return campaign_id;
end $$;
revoke all on function public.admin_save_trending_campaign(uuid,uuid,uuid,text,text,text,text,numeric,bigint,text,text,timestamptz,timestamptz,text,numeric,integer,numeric,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.admin_save_trending_campaign(uuid,uuid,uuid,text,text,text,text,numeric,bigint,text,text,timestamptz,timestamptz,text,numeric,integer,numeric,text,text,text,integer,text) to service_role;

create or replace function public.admin_moderate_trending_campaign(acting_admin_id uuid,target_campaign_id uuid,decision text,moderation_reason text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare admin_allowed boolean;previous public.trending_video_campaigns%rowtype;saved public.trending_video_campaigns%rowtype;normalized text;
begin
  select exists(select 1 from public.admin_users au where coalesce(au.user_id,au.id)=acting_admin_id and au.status='Active' and(coalesce(au.is_super_admin,false) or coalesce((au.permissions->>'marketing')::boolean,false))) into admin_allowed;
  if not admin_allowed then raise exception 'Forbidden';end if;normalized:=initcap(lower(trim(decision)));
  if normalized not in('Approved','Rejected') or length(trim(coalesce(moderation_reason,'')))<5 then raise exception 'Choose a moderation decision and enter a reason.';end if;
  select * into previous from public.trending_video_campaigns where id=target_campaign_id for update;if not found then raise exception 'Campaign not found.';end if;
  update public.trending_video_campaigns set moderation_status=normalized,moderation_note=trim(moderation_reason),moderated_by=acting_admin_id,moderated_at=now(),status=case when normalized='Rejected' then 'Draft' else status end,updated_by=acting_admin_id,updated_at=now() where id=target_campaign_id returning * into saved;
  insert into public.trending_campaign_audit(campaign_id,action,previous_values,new_values,reason,acting_admin_id)values(target_campaign_id,'Moderation '||normalized,to_jsonb(previous),to_jsonb(saved),moderation_reason,acting_admin_id);
end $$;
revoke all on function public.admin_moderate_trending_campaign(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_moderate_trending_campaign(uuid,uuid,text,text) to service_role;

create or replace function public.refresh_trending_campaign_states()
returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  with activated as(update public.trending_video_campaigns set status='Active',updated_at=now() where status='Scheduled' and moderation_status='Approved' and starts_at<=now() and ends_at>now() returning id,updated_by),
  activation_audit as(insert into public.trending_campaign_audit(campaign_id,action,new_values,reason,acting_admin_id)select id,'Scheduled → Active',jsonb_build_object('status','Active'),'Campaign start time reached.',updated_by from activated),
  expired as(update public.trending_video_campaigns set status='Expired',updated_at=now() where status in('Scheduled','Active','Paused') and ends_at<=now() returning id,updated_by),
  expiry_audit as(insert into public.trending_campaign_audit(campaign_id,action,new_values,reason,acting_admin_id)select id,'Expired',jsonb_build_object('status','Expired'),'Campaign end time reached.',updated_by from expired)
  select(select count(*) from activated)+(select count(*) from expired) into changed;return changed;
end $$;
revoke all on function public.refresh_trending_campaign_states() from public,anon,authenticated;
grant execute on function public.refresh_trending_campaign_states() to service_role;
do $$ begin if exists(select 1 from pg_extension where extname='pg_cron') then begin perform cron.unschedule('girlz-culture-refresh-trending');exception when others then null;end;perform cron.schedule('girlz-culture-refresh-trending','*/5 * * * *','select public.refresh_trending_campaign_states()');end if;exception when undefined_function or invalid_schema_name then raise notice 'pg_cron is not enabled; call refresh_trending_campaign_states from the scheduled platform job.';end $$;

create or replace function public.discover_trending_videos(origin_latitude double precision,origin_longitude double precision,request_radius_miles double precision default 25,rotation_seed text default null,result_limit integer default 12,result_offset integer default 0)
returns table(campaign_id uuid,video_url text,thumbnail_url text,description text,salon_id uuid,salon_name text,salon_slug text,address_city text,address_state text,borough text,distance_miles double precision,total_count bigint)
language sql stable security definer set search_path=public as $$
  with eligible as(
    select c.id campaign_id,c.video_url,c.thumbnail_url,c.description,s.id salon_id,s.name salon_name,s.slug salon_slug,s.address_city,s.address_state,s.borough,c.priority,c.rotation_weight,c.radius_miles,
      public.distance_miles(origin_latitude,origin_longitude,s.latitude,s.longitude) distance_miles
    from public.trending_video_campaigns c join public.marketing_entitlements e on e.id=c.entitlement_id and e.salon_id=c.salon_id join public.salons s on s.id=c.salon_id join public.subscriptions sub on sub.salon_id=s.id
    where c.status in('Active','Scheduled') and c.moderation_status='Approved' and c.starts_at<=now() and c.ends_at>now()
      and e.placement_type='Trending Video' and e.status in('Paid','Credited') and e.valid_from<=now() and(e.valid_until is null or e.valid_until>now())
      and s.status='Active' and s.is_discoverable and s.address_needs_review=false and s.latitude is not null and s.longitude is not null
      and lower(sub.status) in('active','trialing') and(sub.current_period_end is null or sub.current_period_end>now())
  ),local as(select *,(abs(hashtext(campaign_id::text||coalesce(rotation_seed,to_char(now(),'YYYY-MM-DD-HH24')))::bigint)/greatest(rotation_weight,0.1)) rotation_score from eligible where distance_miles<=least(greatest(1,least(250,request_radius_miles)),radius_miles)),
  ordered as(select *,count(*)over() total_count from local order by floor(distance_miles/5.0),priority desc,rotation_score,distance_miles,campaign_id)
  select o.campaign_id,o.video_url,o.thumbnail_url,o.description,o.salon_id,o.salon_name,o.salon_slug,o.address_city,o.address_state,o.borough,o.distance_miles,o.total_count from ordered o limit greatest(1,least(50,result_limit)) offset greatest(0,result_offset)
$$;
revoke all on function public.discover_trending_videos(double precision,double precision,double precision,text,integer,integer) from public;
grant execute on function public.discover_trending_videos(double precision,double precision,double precision,text,integer,integer) to anon,authenticated,service_role;

update public.homepage_sections set is_visible=false where section_key='trending_now';
commit;
