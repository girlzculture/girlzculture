-- Approved root-level salon vanity URLs with collision safety and audit history.

begin;

alter table public.salons
  add column if not exists vanity_slug text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text,
  add column if not exists google_business_url text;
create unique index if not exists salons_vanity_slug_unique
  on public.salons(vanity_slug) where vanity_slug is not null;

alter table public.salon_slug_redirects
  add column if not exists route_scope text not null default 'salon'
  check (route_scope in ('salon','vanity'));
create index if not exists salon_slug_redirects_scope_idx
  on public.salon_slug_redirects(route_scope,old_slug) where retired_at is null;

create table if not exists public.salon_slug_reserved_words (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  reason text not null default 'Girlz Culture system route',
  created_at timestamptz not null default now()
);
insert into public.salon_slug_reserved_words(slug) values
('about'),('account'),('admin'),('api'),('blog'),('booking'),('careers'),
('complaint'),('contact'),('dashboard'),('featured'),('forgot-password'),
('help'),('how-it-works'),('login'),('manifest'),('mothership'),('offline'),
('partner'),('pending'),('plans'),('press'),('privacy'),('reset-password'),
('review'),('safety'),('salon'),('salons'),('search'),('social'),('styles'),
('superadmin'),('support'),('terms'),('testimonials'),('tools'),('trending'),
('www')
on conflict (slug) do nothing;

create table if not exists public.salon_vanity_requests (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_slug text not null
    check (requested_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and length(requested_slug) between 3 and 72),
  instagram_url text,
  tiktok_url text,
  google_business_url text,
  status text not null default 'Pending'
    check (status in ('Pending','Approved','Rejected','Superseded')),
  approved_slug text
    check (approved_slug is null or (
      approved_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and length(approved_slug) between 3 and 72
    )),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists salon_vanity_one_pending_idx
  on public.salon_vanity_requests(salon_id) where status='Pending';
create index if not exists salon_vanity_requests_review_idx
  on public.salon_vanity_requests(status,created_at);

create table if not exists public.salon_vanity_audit (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  request_id uuid references public.salon_vanity_requests(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  previous_slug text,
  resulting_slug text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists salon_vanity_audit_salon_idx
  on public.salon_vanity_audit(salon_id,created_at desc);

alter table public.salon_slug_reserved_words enable row level security;
alter table public.salon_vanity_requests enable row level security;
alter table public.salon_vanity_audit enable row level security;
revoke all on public.salon_slug_reserved_words from anon,authenticated;
revoke all on public.salon_vanity_requests from anon,authenticated;
revoke all on public.salon_vanity_audit from anon,authenticated;

create or replace function public.prevent_salon_vanity_audit_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'Salon vanity audit records are immutable.' using errcode='42501';
end;
$$;
revoke all on function public.prevent_salon_vanity_audit_mutation() from public,anon,authenticated;
drop trigger if exists salon_vanity_audit_immutable on public.salon_vanity_audit;
create trigger salon_vanity_audit_immutable
before update or delete on public.salon_vanity_audit
for each row execute function public.prevent_salon_vanity_audit_mutation();

create or replace function public.normalized_salon_vanity_slug(p_value text)
returns text language sql immutable strict set search_path='' as $$
  select left(trim(both '-' from regexp_replace(
    regexp_replace(lower(trim(p_value)), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  )),72);
$$;

create or replace function public.salon_vanity_slug_available(
  p_slug text,
  p_salon_id uuid default null
)
returns boolean language sql stable security definer set search_path=public as $$
  select
    p_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and length(p_slug) between 3 and 72
    and not exists(select 1 from public.salon_slug_reserved_words r where r.slug=p_slug)
    and not exists(select 1 from public.content_pages p where p.slug=p_slug)
    and not exists(
      select 1 from public.salons s
      where (s.slug=p_slug or s.vanity_slug=p_slug)
        and (p_salon_id is null or s.id<>p_salon_id)
    )
    and not exists(
      select 1 from public.salon_slug_redirects d
      where d.old_slug=p_slug and d.retired_at is null
        and (p_salon_id is null or d.salon_id<>p_salon_id)
    );
$$;

create or replace function public.enforce_salon_slug_namespaces()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.slug is not null then
    perform pg_advisory_xact_lock(hashtext('salon-slug:'||new.slug));
  end if;
  if new.vanity_slug is not null then
    perform pg_advisory_xact_lock(hashtext('salon-slug:'||new.vanity_slug));
  end if;
  if new.slug is not null and (
    exists(select 1 from public.salon_slug_reserved_words r where r.slug=new.slug)
    or exists(select 1 from public.salons s where s.vanity_slug=new.slug and s.id<>new.id)
  ) then raise exception 'This salon URL is reserved.' using errcode='23505'; end if;
  if new.vanity_slug is not null and not public.salon_vanity_slug_available(new.vanity_slug,new.id)
  then raise exception 'This salon URL is unavailable.' using errcode='23505'; end if;
  return new;
end;
$$;
drop trigger if exists salons_enforce_slug_namespaces on public.salons;
create trigger salons_enforce_slug_namespaces
before insert or update of slug,vanity_slug on public.salons
for each row execute function public.enforce_salon_slug_namespaces();

-- Keep automated canonical slugs out of the reserved and vanity namespaces.
create or replace function public.generate_unique_salon_slug(p_salon_id uuid, p_name text)
returns text language plpgsql stable security definer set search_path=public,extensions as $$
declare
  v_base text := left(nullif(public.salon_slugify(p_name), ''), 72);
  v_candidate text;
  v_suffix integer := 1;
begin
  if v_base is null then raise exception 'A public salon name is required before publication.'; end if;
  v_candidate := v_base;
  while not public.salon_vanity_slug_available(v_candidate,p_salon_id)
  loop
    v_suffix := v_suffix + 1;
    v_candidate := left(v_base, 68) || '-' || v_suffix::text;
    if v_suffix > 10_000 then raise exception 'Unable to allocate a unique public salon URL.'; end if;
  end loop;
  return v_candidate;
end;
$$;

create or replace function public.request_salon_vanity_url(
  p_salon_id uuid,
  p_requested_by uuid,
  p_requested_slug text,
  p_instagram_url text default null,
  p_tiktok_url text default null,
  p_google_business_url text default null
)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_slug text := public.normalized_salon_vanity_slug(p_requested_slug);
  v_request public.salon_vanity_requests%rowtype;
  v_previous_slug text;
begin
  perform 1 from public.salons where id=p_salon_id for update;
  if not found then raise exception 'Salon not found.'; end if;
  perform pg_advisory_xact_lock(hashtext('salon-slug:'||v_slug));
  if not public.salon_vanity_slug_available(v_slug,p_salon_id)
  then raise exception 'This vanity URL is not available.' using errcode='23505'; end if;
  if exists(
    select 1 from public.salon_vanity_requests
    where salon_id=p_salon_id and status='Pending'
  ) then raise exception 'A vanity URL request is already pending.' using errcode='23505'; end if;
  select vanity_slug into v_previous_slug from public.salons where id=p_salon_id;
  insert into public.salon_vanity_requests(
    salon_id,requested_by,requested_slug,instagram_url,tiktok_url,google_business_url
  ) values(
    p_salon_id,p_requested_by,v_slug,nullif(trim(p_instagram_url),''),
    nullif(trim(p_tiktok_url),''),nullif(trim(p_google_business_url),'')
  ) returning * into v_request;
  insert into public.salon_vanity_audit(
    salon_id,request_id,actor_user_id,action,previous_slug,resulting_slug
  ) values(
    p_salon_id,v_request.id,p_requested_by,'Requested',v_previous_slug,v_slug
  );
  return jsonb_build_object(
    'id',v_request.id,'requested_slug',v_request.requested_slug,
    'status',v_request.status,'created_at',v_request.created_at
  );
end;
$$;

create or replace function public.admin_review_salon_vanity_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_approved_slug text default null,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_request public.salon_vanity_requests%rowtype;
  v_salon public.salons%rowtype;
  v_slug text;
begin
  if not exists(
    select 1 from public.admin_users a
    where a.user_id=p_admin_id and a.status='Active'
      and (a.is_super_admin or coalesce((a.permissions->>'salons')::boolean,false))
  ) then raise exception 'Forbidden'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Choose approve or reject.'; end if;
  select * into v_request from public.salon_vanity_requests
  where id=p_request_id and status='Pending' for update;
  if not found then raise exception 'This vanity request is no longer pending.'; end if;
  select * into v_salon from public.salons where id=v_request.salon_id for update;
  if p_decision='reject' then
    update public.salon_vanity_requests set status='Rejected',reviewed_by=p_admin_id,
      reviewed_at=now(),review_note=left(trim(coalesce(p_note,'')),500),updated_at=now()
    where id=p_request_id;
    insert into public.salon_vanity_audit(salon_id,request_id,actor_user_id,action,previous_slug,details)
    values(v_salon.id,p_request_id,p_admin_id,'Rejected',v_salon.vanity_slug,jsonb_build_object('note',left(trim(coalesce(p_note,'')),500)));
    return jsonb_build_object('status','Rejected','salon_id',v_salon.id);
  end if;
  v_slug:=public.normalized_salon_vanity_slug(coalesce(nullif(trim(p_approved_slug),''),v_request.requested_slug));
  perform pg_advisory_xact_lock(hashtext('salon-slug:'||v_slug));
  if not public.salon_vanity_slug_available(v_slug,v_salon.id)
  then raise exception 'This vanity URL is not available.' using errcode='23505'; end if;
  if v_salon.vanity_slug is not null and v_salon.vanity_slug<>v_slug then
    insert into public.salon_slug_redirects(salon_id,old_slug,new_slug,route_scope)
    values(v_salon.id,v_salon.vanity_slug,v_slug,'vanity')
    on conflict(old_slug) do update set salon_id=excluded.salon_id,new_slug=excluded.new_slug,
      route_scope='vanity',retired_at=null,created_at=now();
    update public.salon_slug_redirects set new_slug=v_slug
    where salon_id=v_salon.id and route_scope='vanity' and retired_at is null;
  end if;
  update public.salons set vanity_slug=v_slug,
    instagram_url=v_request.instagram_url,tiktok_url=v_request.tiktok_url,
    google_business_url=v_request.google_business_url
  where id=v_salon.id;
  update public.salon_vanity_requests set status='Approved',approved_slug=v_slug,
    reviewed_by=p_admin_id,reviewed_at=now(),review_note=left(trim(coalesce(p_note,'')),500),updated_at=now()
  where id=p_request_id;
  update public.salon_vanity_requests set status='Superseded',updated_at=now()
  where salon_id=v_salon.id and status='Pending' and id<>p_request_id;
  insert into public.salon_vanity_audit(salon_id,request_id,actor_user_id,action,previous_slug,resulting_slug,details)
  values(v_salon.id,p_request_id,p_admin_id,'Approved',v_salon.vanity_slug,v_slug,
    jsonb_build_object('requested_slug',v_request.requested_slug,'note',left(trim(coalesce(p_note,'')),500)));
  return jsonb_build_object('status','Approved','salon_id',v_salon.id,'vanity_slug',v_slug);
end;
$$;

revoke all on function public.normalized_salon_vanity_slug(text) from public,anon,authenticated;
revoke all on function public.salon_vanity_slug_available(text,uuid) from public,anon,authenticated;
revoke all on function public.request_salon_vanity_url(uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.admin_review_salon_vanity_request(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.normalized_salon_vanity_slug(text) to service_role;
grant execute on function public.salon_vanity_slug_available(text,uuid) to service_role;
grant execute on function public.request_salon_vanity_url(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.admin_review_salon_vanity_request(uuid,uuid,text,text,text) to service_role;

comment on column public.salons.vanity_slug is 'Founder-approved root-level public salon slug; canonical /salon/{slug} remains supported.';
comment on table public.salon_vanity_requests is 'Owner-requested vanity URL and social-link changes awaiting platform review.';
comment on table public.salon_vanity_audit is 'Immutable server-written history for vanity approvals, rejections, and changes.';

commit;
