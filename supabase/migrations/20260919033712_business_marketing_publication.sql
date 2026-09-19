begin;

create table public.business_marketing_posts (
  id uuid primary key,
  salon_id uuid not null references public.salons(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  revision integer not null default 1 check(revision>0),
  status text not null default 'draft' check(status in ('draft','scheduled','published','cancelled','needs_review','expired')),
  source jsonb not null check(jsonb_typeof(source)='object'),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  copies jsonb not null check(jsonb_typeof(copies)='object' and octet_length(copies::text)<=40000),
  booking_path text not null,
  public_path text not null,
  approved_by uuid references auth.users(id),
  approved_revision integer,
  approved_at timestamptz,
  scheduled_at timestamptz,
  expires_at timestamptz,
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status not in ('scheduled','published') or (approved_by is not null and approved_at is not null and scheduled_at is not null and expires_at>scheduled_at)),
  check(status<>'published' or published_at is not null)
);
create index business_marketing_posts_owner on public.business_marketing_posts(salon_id,updated_at desc);
create index business_marketing_posts_due on public.business_marketing_posts(scheduled_at) where status='scheduled';
create index business_marketing_posts_public on public.business_marketing_posts(salon_id,published_at desc) where status='published';
create table public.business_marketing_events (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.business_marketing_posts(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  revision integer not null,
  recorded_at timestamptz not null default now()
);
create index business_marketing_events_post on public.business_marketing_events(post_id,recorded_at desc);
alter table public.business_marketing_posts enable row level security;
alter table public.business_marketing_events enable row level security;
revoke all on public.business_marketing_posts,public.business_marketing_events from public,anon,authenticated;
grant all on public.business_marketing_posts,public.business_marketing_events to service_role;
grant usage,select on sequence public.business_marketing_events_id_seq to service_role;
-- These invoker functions use the actual server role, not the migration owner.
-- SELECT plus a single-column UPDATE grant allows the common salon row lock;
-- no browser role gains direct source or publication access.
grant select on public.salons,public.styles,public.salon_promotions,public.bookings to service_role;
grant update(id) on public.salons to service_role;

-- Canonical source projection deliberately excludes customer identity/contact,
-- private client photos, other businesses and unapproved public service drafts.
create function public.business_marketing_snapshot(p_salon uuid,p_source jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s public.salons%rowtype; st public.styles%rowtype; pr public.salon_promotions%rowtype;
  b public.bookings%rowtype; v_service jsonb; v_promotion jsonb; v_booking jsonb; v_photos jsonb; v_url text;
begin
  select * into s from public.salons where id=p_salon;
  if not found then raise exception 'MARKETING_SOURCE_CHANGED'; end if;
  if jsonb_typeof(p_source->'photo_urls') is distinct from 'array' or jsonb_array_length(p_source->'photo_urls')>4 then raise exception 'MARKETING_INVALID'; end if;
  v_photos:='[]';
  for v_url in select value from jsonb_array_elements_text(p_source->'photo_urls') loop
    if not coalesce(s.gallery_photos,'[]') @> jsonb_build_array(v_url) then raise exception 'MARKETING_SOURCE_CHANGED'; end if;
    v_photos:=v_photos||jsonb_build_array(jsonb_build_object('url',v_url,'category',coalesce(s.photo_metadata->v_url->>'category','other'),'title',coalesce(s.photo_metadata->v_url->>'title','')));
  end loop;
  if p_source->>'booking_id' is not null then
    select * into b from public.bookings where id=(p_source->>'booking_id')::uuid and salon_id=p_salon and status='Completed';
    if not found or b.style_id is null then raise exception 'MARKETING_SOURCE_CHANGED'; end if;
    if p_source->>'service_id' is not null and b.style_id<>(p_source->>'service_id')::uuid then raise exception 'MARKETING_SOURCE_CHANGED'; end if;
    v_booking:=jsonb_build_object('id',b.id,'style_id',b.style_id,'completed_at',b.appointment_datetime);
  end if;
  if coalesce(p_source->>'service_id',b.style_id::text) is not null then
    select * into st from public.styles where id=coalesce(p_source->>'service_id',b.style_id::text)::uuid and salon_id=p_salon and archived_at is null and not coalesce(is_draft,false);
    if not found then raise exception 'MARKETING_SOURCE_CHANGED'; end if;
    v_service:=jsonb_build_object('id',st.id,'name',st.name,'base_price',st.base_price,'price_display_min',st.price_display_min,'price_display_max',st.price_display_max);
  end if;
  if p_source->>'promotion_id' is not null then
    select * into pr from public.salon_promotions where id=(p_source->>'promotion_id')::uuid and salon_id=p_salon and status='Active' and is_active and archived_at is null;
    if not found or not public.salon_has_feature(p_salon,'promotions') then raise exception 'MARKETING_SOURCE_CHANGED'; end if;
    if pr.target_scope not in ('salon','services','service_groups','master_styles') or
      (pr.target_scope='services' and (st.id is null or not st.id::text=any(pr.target_ids))) or
      (pr.target_scope='service_groups' and (st.service_group_id is null or not st.service_group_id::text=any(pr.target_ids))) or
      (pr.target_scope='master_styles' and (st.master_style_id is null or not st.master_style_id::text=any(pr.target_ids))) then raise exception 'MARKETING_SOURCE_CHANGED'; end if;
    v_promotion:=jsonb_build_object('id',pr.id,'title',coalesce(pr.public_headline,pr.title),'promotion_type',pr.promotion_type,'discount_value',pr.discount_value,'starts_at',pr.starts_at,'ends_at',pr.ends_at,'terms',coalesce(pr.restrictions->>'terms',''),'target_scope',pr.target_scope,'target_ids',pr.target_ids,'restrictions',pr.restrictions);
  end if;
  return jsonb_build_object('business',jsonb_build_object('id',s.id,'name',s.name,'slug',s.slug,'vanity_slug',s.vanity_slug,'time_zone',coalesce(s.time_zone,'America/New_York')),'photos',v_photos,'service',v_service,'promotion',v_promotion,'completed_service',v_booking);
end $$;

create function public.business_marketing_sources_current(p_salon uuid,p_source jsonb,p_snapshot jsonb)
returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin return public.business_marketing_snapshot(p_salon,p_source)=p_snapshot;
exception when others then return false;
end $$;

create function public.save_business_marketing_post(p_salon uuid,p_actor uuid,p_id uuid,p_revision integer,p_source jsonb,p_copies jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.salons%rowtype; p public.business_marketing_posts%rowtype; snap jsonb; v_book text; v_public text; v_locale text;
begin
  select * into s from public.salons where id=p_salon and user_id=p_actor for update;
  if not found or not public.p0_actor_has_permission(p_salon,p_actor,'promotions') then raise exception 'MARKETING_FORBIDDEN'; end if;
  snap:=public.business_marketing_snapshot(p_salon,p_source);
  if coalesce(s.slug,'')!~'^[a-z0-9-]+$' or s.slug like 'pending-%' then raise exception 'MARKETING_PAGE_NOT_READY'; end if;
  if jsonb_typeof(p_copies) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_copies))<>4 then raise exception 'MARKETING_INVALID'; end if;
  foreach v_locale in array array['en','fr','es','zh-CN'] loop
    if coalesce(length(trim(p_copies->v_locale->>'title')),0) not between 1 and 160 or coalesce(length(trim(p_copies->v_locale->>'body')),0) not between 1 and 2400 or jsonb_typeof(p_copies->v_locale->'tags') is distinct from 'array' then raise exception 'MARKETING_INVALID'; end if;
  end loop;
  v_public:=case when nullif(s.vanity_slug,'') is not null then '/'||s.vanity_slug else '/salon/'||s.slug end;
  v_book:='/salon/'||s.slug||'/book';
  if snap->'service'->>'id' is not null then v_book:=v_book||'?style='||(snap->'service'->>'id'); end if;
  if snap->'promotion'->>'id' is not null then v_book:=v_book||case when strpos(v_book,'?')>0 then '&' else '?' end||'promotion='||(snap->'promotion'->>'id'); end if;
  select * into p from public.business_marketing_posts where id=p_id and salon_id=p_salon for update;
  if not found then
    if p_revision<>0 then raise exception 'MARKETING_NOT_FOUND'; end if;
    insert into public.business_marketing_posts(id,salon_id,created_by,source,snapshot,copies,booking_path,public_path) values(p_id,p_salon,p_actor,p_source,snap,p_copies,v_book,v_public) returning * into p;
  else
    -- Only identical retries return the already-saved result without a second event.
    if p.revision=p_revision+1 and p.source=p_source and p.copies=p_copies and p.status='draft' then return to_jsonb(p); end if;
    if p.revision<>p_revision or p.status='published' then raise exception 'MARKETING_STALE'; end if;
    update public.business_marketing_posts set revision=revision+1,status='draft',source=p_source,snapshot=snap,copies=p_copies,booking_path=v_book,public_path=v_public,approved_by=null,approved_revision=null,approved_at=null,scheduled_at=null,expires_at=null,published_at=null,last_error=null,updated_at=now() where id=p.id returning * into p;
  end if;
  insert into public.business_marketing_events(post_id,salon_id,actor_id,action,revision) values(p.id,p_salon,p_actor,'draft_saved',p.revision);
  return to_jsonb(p);
end $$;

create function public.approve_business_marketing_post(p_salon uuid,p_actor uuid,p_id uuid,p_revision integer,p_scheduled timestamptz,p_expires timestamptz,p_reviewed text[],p_media_permission boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.business_marketing_posts%rowtype;
begin
  perform 1 from public.salons where id=p_salon and user_id=p_actor for update;
  if not found or not public.p0_actor_has_permission(p_salon,p_actor,'promotions') then raise exception 'MARKETING_FORBIDDEN'; end if;
  select * into p from public.business_marketing_posts where id=p_id and salon_id=p_salon for update;
  if not found then raise exception 'MARKETING_NOT_FOUND'; end if;
  if p.status in ('scheduled','published') and p.approved_revision=p_revision and p.scheduled_at=p_scheduled and p.expires_at=p_expires then return to_jsonb(p); end if;
  if p.status<>'draft' or p.revision<>p_revision then raise exception 'MARKETING_STALE'; end if;
  if p_media_permission is distinct from true or cardinality(p_reviewed) is distinct from 4 or not p_reviewed @> array['en','fr','es','zh-CN'] then raise exception 'MARKETING_REVIEW_REQUIRED'; end if;
  if p_scheduled is null or p_expires is null or p_scheduled<now()-interval '1 minute' or p_scheduled>now()+interval '180 days' or p_expires<=p_scheduled or p_expires>now()+interval '366 days' then raise exception 'MARKETING_SCHEDULE_INVALID'; end if;
  if not public.business_marketing_sources_current(p_salon,p.source,p.snapshot) then raise exception 'MARKETING_SOURCE_CHANGED'; end if;
  if not public.is_salon_profile_public(p_salon) then raise exception 'MARKETING_PAGE_NOT_READY'; end if;
  if p.snapshot->'promotion'->>'starts_at' is not null and p_scheduled<(p.snapshot->'promotion'->>'starts_at')::timestamptz or p.snapshot->'promotion'->>'ends_at' is not null and p_expires>(p.snapshot->'promotion'->>'ends_at')::timestamptz then raise exception 'MARKETING_OFFER_WINDOW'; end if;
  update public.business_marketing_posts set status=case when p_scheduled<=now() then 'published' else 'scheduled' end,approved_by=p_actor,approved_revision=p_revision,approved_at=now(),scheduled_at=p_scheduled,expires_at=p_expires,published_at=case when p_scheduled<=now() then now() end,revision=revision+1,updated_at=now(),last_error=null where id=p_id returning * into p;
  insert into public.business_marketing_events(post_id,salon_id,actor_id,action,revision) values(p.id,p_salon,p_actor,p.status,p.revision);
  return to_jsonb(p);
end $$;

create function public.cancel_business_marketing_post(p_salon uuid,p_actor uuid,p_id uuid,p_revision integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.business_marketing_posts%rowtype;
begin
  perform 1 from public.salons where id=p_salon and user_id=p_actor for update;
  if not found or not public.p0_actor_has_permission(p_salon,p_actor,'promotions') then raise exception 'MARKETING_FORBIDDEN'; end if;
  select * into p from public.business_marketing_posts where id=p_id and salon_id=p_salon for update;
  if not found then raise exception 'MARKETING_NOT_FOUND'; end if;
  if p.status='cancelled' and p.revision=p_revision+1 then return to_jsonb(p); end if;
  if p.revision<>p_revision then raise exception 'MARKETING_STALE'; end if;
  update public.business_marketing_posts set status='cancelled',revision=revision+1,updated_at=now() where id=p_id returning * into p;
  insert into public.business_marketing_events(post_id,salon_id,actor_id,action,revision) values(p.id,p_salon,p_actor,'cancelled',p.revision);
  return to_jsonb(p);
end $$;

create function public.publish_due_business_marketing_posts()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare item record; p public.business_marketing_posts%rowtype; v_published integer:=0; v_review integer:=0; v_expired integer:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('business-marketing-publish',0)) then return jsonb_build_object('busy',true); end if;
  for item in select id,salon_id from public.business_marketing_posts
    where (status='scheduled' and scheduled_at<=now()) or (status='published' and
      (expires_at<=now() or not public.is_salon_profile_public(salon_id) or not public.business_marketing_sources_current(salon_id,source,snapshot)
        or not public.p0_actor_has_permission(salon_id,approved_by,'promotions') or not exists(select 1 from public.salons where id=salon_id and user_id=approved_by)))
    order by scheduled_at limit 50 loop
    -- Same lock order as owner edits, then repeat eligibility after the lock.
    perform 1 from public.salons where id=item.salon_id for update;
    select * into p from public.business_marketing_posts where id=item.id for update;
    if p.status not in ('scheduled','published') or p.scheduled_at>now() then continue; end if;
    if p.expires_at<=now() then
      update public.business_marketing_posts set status='expired',last_error=null,revision=revision+1,updated_at=now() where id=p.id returning * into p;
      v_expired:=v_expired+1;
    elsif not public.is_salon_profile_public(p.salon_id) or not public.business_marketing_sources_current(p.salon_id,p.source,p.snapshot)
      or not public.p0_actor_has_permission(p.salon_id,p.approved_by,'promotions') or not exists(select 1 from public.salons where id=p.salon_id and user_id=p.approved_by) then
      update public.business_marketing_posts set status='needs_review',last_error='MARKETING_SOURCE_CHANGED',revision=revision+1,updated_at=now() where id=p.id returning * into p;
      v_review:=v_review+1;
    elsif p.status='scheduled' then
      update public.business_marketing_posts set status='published',published_at=now(),revision=revision+1,last_error=null,updated_at=now() where id=p.id returning * into p;
      v_published:=v_published+1;
    else
      continue;
    end if;
    insert into public.business_marketing_events(post_id,salon_id,action,revision) values(p.id,p.salon_id,p.status,p.revision);
  end loop;
  return jsonb_build_object('published',v_published,'needs_review',v_review,'expired',v_expired);
end $$;

create function public.public_business_marketing_posts(p_salon uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'copies',p.copies,'photos',p.snapshot->'photos','booking_path',p.booking_path,'published_at',p.published_at) order by p.published_at desc),'[]')
  from (select * from public.business_marketing_posts where salon_id=p_salon and status='published' and expires_at>now() order by published_at desc limit 12) p
  where public.is_salon_profile_public(p_salon)
    and not exists(select 1 from public.test_data_registry where record_type='salon' and record_id=p_salon::text)
    and exists(select 1 from public.salons where id=p_salon and user_id=p.approved_by)
    and public.p0_actor_has_permission(p_salon,p.approved_by,'promotions')
    and public.business_marketing_sources_current(p_salon,p.source,p.snapshot)
    and (p.snapshot->'promotion'->>'starts_at' is null or (p.snapshot->'promotion'->>'starts_at')::timestamptz<=now())
    and (p.snapshot->'promotion'->>'ends_at' is null or (p.snapshot->'promotion'->>'ends_at')::timestamptz>now());
$$;

revoke all on function public.business_marketing_snapshot(uuid,jsonb),public.business_marketing_sources_current(uuid,jsonb,jsonb),public.save_business_marketing_post(uuid,uuid,uuid,integer,jsonb,jsonb),public.approve_business_marketing_post(uuid,uuid,uuid,integer,timestamptz,timestamptz,text[],boolean),public.cancel_business_marketing_post(uuid,uuid,uuid,integer),public.publish_due_business_marketing_posts(),public.public_business_marketing_posts(uuid) from public,anon,authenticated;
grant execute on function public.business_marketing_snapshot(uuid,jsonb),public.business_marketing_sources_current(uuid,jsonb,jsonb),public.save_business_marketing_post(uuid,uuid,uuid,integer,jsonb,jsonb),public.approve_business_marketing_post(uuid,uuid,uuid,integer,timestamptz,timestamptz,text[],boolean),public.cancel_business_marketing_post(uuid,uuid,uuid,integer),public.publish_due_business_marketing_posts(),public.public_business_marketing_posts(uuid) to service_role;
grant execute on function public.public_business_marketing_posts(uuid) to anon,authenticated;
update public.engine_settings set published_value='"20260919033712"'::jsonb,draft_value='"20260919033712"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
