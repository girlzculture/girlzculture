-- Explicit salon publication states, safe public slugs, redirects, and
-- auditable lifecycle reconciliation.
begin;

alter table public.salons
  add column if not exists accepting_bookings boolean not null default true,
  add column if not exists owner_unpublished_at timestamptz,
  add column if not exists owner_unpublished_reason text,
  add column if not exists closure_requested_at timestamptz,
  add column if not exists closure_request_reason text;

create table if not exists public.salon_slug_redirects (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  old_slug text not null unique,
  new_slug text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create index if not exists salon_slug_redirects_salon_idx on public.salon_slug_redirects(salon_id, created_at desc);
alter table public.salon_slug_redirects enable row level security;
drop policy if exists salon_slug_redirects_public_read on public.salon_slug_redirects;
create policy salon_slug_redirects_public_read on public.salon_slug_redirects
for select to anon, authenticated using (retired_at is null);

create table if not exists public.salon_closure_requests (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  status text not null default 'Requested' check (status in ('Requested','In Review','Approved','Declined','Completed','Cancelled')),
  dependency_summary jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists salon_closure_requests_salon_idx on public.salon_closure_requests(salon_id, created_at desc);
alter table public.salon_closure_requests enable row level security;

create table if not exists public.salon_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  acting_admin_id uuid not null references auth.users(id) on delete restrict,
  execute_changes boolean not null,
  candidate_count integer not null default 0,
  corrected_count integer not null default 0,
  skipped_count integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.salon_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.salon_reconciliation_runs(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete restrict,
  previous_slug text,
  resulting_slug text,
  previous_discoverable boolean not null,
  resulting_discoverable boolean not null,
  outcome text not null check (outcome in ('Preview','Corrected','Skipped','Failed')),
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.salon_reconciliation_runs enable row level security;
alter table public.salon_reconciliation_items enable row level security;

create or replace function public.salon_slugify(p_value text)
returns text
language sql
stable
strict
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(lower(extensions.unaccent(trim(p_value))), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ));
$$;

create or replace function public.generate_unique_salon_slug(p_salon_id uuid, p_name text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_base text := left(nullif(public.salon_slugify(p_name), ''), 72);
  v_candidate text;
  v_suffix integer := 1;
begin
  if v_base is null then raise exception 'A public salon name is required before publication.'; end if;
  v_candidate := v_base;
  while exists(select 1 from public.salons where slug = v_candidate and id <> p_salon_id)
     or exists(select 1 from public.salon_slug_redirects where old_slug = v_candidate and salon_id <> p_salon_id and retired_at is null)
  loop
    v_suffix := v_suffix + 1;
    v_candidate := left(v_base, 68) || '-' || v_suffix::text;
    if v_suffix > 10_000 then raise exception 'Unable to allocate a unique public salon URL.'; end if;
  end loop;
  return v_candidate;
end;
$$;

create or replace function public.preserve_salon_slug_redirect()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if old.slug is distinct from new.slug
     and old.slug is not null
     and old.slug !~ '^pending-'
     and new.slug is not null then
    insert into public.salon_slug_redirects(salon_id, old_slug, new_slug)
    values(new.id, old.slug, new.slug)
    on conflict(old_slug) do update set salon_id=excluded.salon_id,new_slug=excluded.new_slug,retired_at=null,created_at=now();
    update public.salon_slug_redirects set new_slug = new.slug
    where salon_id = new.id and retired_at is null and old_slug <> new.slug;
  end if;
  return new;
end;
$$;
drop trigger if exists salons_preserve_slug_redirect on public.salons;
create trigger salons_preserve_slug_redirect after update of slug on public.salons
for each row execute function public.preserve_salon_slug_redirect();

create or replace function public.salon_publication_diagnostic(p_salon_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_base jsonb;
  v_salon public.salons%rowtype;
  v_slug_ready boolean;
  v_base_complete boolean;
  v_public_eligible boolean;
begin
  select * into v_salon from public.salons where id=p_salon_id;
  if not found then raise exception 'Salon not found.'; end if;
  v_base := public.salon_lifecycle_diagnostic(p_salon_id);
  v_slug_ready := nullif(trim(coalesce(v_salon.slug,'')),'') is not null and v_salon.slug !~ '^pending-';
  v_base_complete := coalesce((v_base->>'all_required_complete')::boolean,false);
  v_public_eligible := v_base_complete and v_slug_ready
    and v_salon.status not in ('Suspended','Offboarded','New','Pending')
    and v_salon.owner_unpublished_at is null;
  return v_base || jsonb_build_object(
    'checks', coalesce(v_base->'checks','{}'::jsonb) || jsonb_build_object(
      'public_slug',jsonb_build_object('label','Public salon URL','required',true,'passed',v_slug_ready,'action','/salon/dashboard/my-page')
    ),
    'valid_public_slug',v_slug_ready,
    'all_required_complete',v_base_complete and v_slug_ready,
    'public_eligible',v_public_eligible,
    'application_state',case when coalesce((v_base#>>'{checks,application_approved,passed}')::boolean,false) then 'Approved' else 'Awaiting approval' end,
    'setup_state',case when v_base_complete then 'Complete' else 'Needs setup' end,
    'subscription_state',coalesce(v_salon.subscription_status,'inactive'),
    'address_state',case when v_salon.geocode_status='success' and not v_salon.address_needs_review then 'Ready' else 'Needs review' end,
    'marketplace_state',v_salon.status,
    'publication_state',case
      when v_salon.status='Suspended' then 'Suspended'
      when v_salon.status='Offboarded' then 'Offboarded'
      when v_salon.owner_unpublished_at is not null then 'Owner unpublished'
      when v_salon.is_discoverable then 'Published'
      else 'Not published'
    end,
    'accepting_bookings',v_salon.accepting_bookings,
    'owner_unpublished_at',v_salon.owner_unpublished_at,
    'owner_unpublished_reason',v_salon.owner_unpublished_reason,
    'closure_requested_at',v_salon.closure_requested_at
  );
end;
$$;

create or replace function public.reconcile_salon_publication(
  p_salon_id uuid,
  p_actor_id uuid default null,
  p_reason text default 'Eligibility recalculated'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_salon public.salons%rowtype;
  v_approved boolean;
  v_base jsonb;
begin
  select * into v_salon from public.salons where id=p_salon_id for update;
  if not found then raise exception 'Salon not found.'; end if;
  select v_salon.approved_at is not null or exists(
    select 1 from public.salon_applications a where a.salon_id=p_salon_id and a.status in ('Approved','Active')
  ) into v_approved;
  if v_approved
     and nullif(trim(coalesce(v_salon.name,'')),'') is not null
     and v_salon.name <> 'Pending salon application'
     and (v_salon.slug is null or v_salon.slug ~ '^pending-') then
    update public.salons set slug=public.generate_unique_salon_slug(id,name) where id=p_salon_id;
  end if;
  v_base := public.reconcile_salon_lifecycle(p_salon_id,p_actor_id,p_reason);
  update public.salons
  set is_discoverable = is_discoverable
    and owner_unpublished_at is null
    and status='Active'
    and slug is not null
    and slug !~ '^pending-'
  where id=p_salon_id;
  return public.salon_publication_diagnostic(p_salon_id);
end;
$$;

-- Route all lifecycle-triggered reconciliation through the publication layer.
create or replace function public.refresh_salon_lifecycle_from_salon()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  perform public.reconcile_salon_publication(coalesce(new.id,old.id),null,'A required salon profile field changed');
  return coalesce(new,old);
end;$$;
create or replace function public.refresh_salon_lifecycle_from_child()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  perform public.reconcile_salon_publication(coalesce(new.salon_id,old.salon_id),null,format('A required %s record changed',tg_table_name));
  return coalesce(new,old);
end;$$;

drop trigger if exists salons_refresh_lifecycle on public.salons;
create trigger salons_refresh_lifecycle
after insert or update of name,description,email,phone,address_street,address_city,address_state,address_zip,
  geocode_status,address_needs_review,latitude,longitude,logo_url,cover_photo_url,gallery_photos,hours,
  subscription_status,stripe_account_id,media_consent,owner_is_sole_stylist,owner_unpublished_at
on public.salons for each row when(pg_trigger_depth()=0)
execute function public.refresh_salon_lifecycle_from_salon();

create or replace function public.admin_reconcile_salon_publication(
  p_acting_admin_id uuid,
  p_execute boolean default false,
  p_result_limit integer default 100
)
returns table(run_id uuid,salon_id uuid,previous_slug text,resulting_slug text,previous_discoverable boolean,resulting_discoverable boolean,outcome text,reason text)
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_run uuid;
  v_row record;
  v_after public.salons%rowtype;
  v_outcome text;
  v_reason text;
  v_corrected integer:=0;
  v_skipped integer:=0;
begin
  if not exists(select 1 from public.admin_users a where a.user_id=p_acting_admin_id and a.status='Active' and (a.is_super_admin or coalesce((a.permissions->>'salons')::boolean,false))) then raise exception 'Forbidden'; end if;
  insert into public.salon_reconciliation_runs(acting_admin_id,execute_changes) values(p_acting_admin_id,p_execute) returning id into v_run;
  for v_row in
    select s.* from public.salons s
    where s.slug ~ '^pending-' or (s.status='Active' and not s.is_discoverable)
    order by s.created_at asc limit greatest(1,least(500,p_result_limit))
  loop
    begin
      if p_execute then
        perform public.reconcile_salon_publication(v_row.id,p_acting_admin_id,'Authorized lifecycle reconciliation');
        select * into v_after from public.salons where id=v_row.id;
        v_outcome:=case when v_after.slug is distinct from v_row.slug or v_after.is_discoverable is distinct from v_row.is_discoverable then 'Corrected' else 'Skipped' end;
        v_reason:=case when v_outcome='Corrected' then 'Lifecycle and publication state recalculated' else 'No eligible correction was available; failed gates remain' end;
      else
        v_after:=v_row;
        if v_row.slug ~ '^pending-' and nullif(trim(coalesce(v_row.name,'')),'') is not null and v_row.name<>'Pending salon application' then v_after.slug:=public.generate_unique_salon_slug(v_row.id,v_row.name); end if;
        v_outcome:='Preview';v_reason:='Preview only; no production record changed';
      end if;
    exception when others then
      v_after:=v_row;v_outcome:='Failed';v_reason:='Reconciliation failed; review protected server logs';
    end;
    if v_outcome='Corrected' then v_corrected:=v_corrected+1; elsif v_outcome in('Skipped','Failed') then v_skipped:=v_skipped+1; end if;
    insert into public.salon_reconciliation_items(run_id,salon_id,previous_slug,resulting_slug,previous_discoverable,resulting_discoverable,outcome,reason)
    values(v_run,v_row.id,v_row.slug,v_after.slug,v_row.is_discoverable,v_after.is_discoverable,v_outcome,v_reason);
  end loop;
  update public.salon_reconciliation_runs set candidate_count=(select count(*) from public.salon_reconciliation_items where salon_reconciliation_items.run_id=v_run),corrected_count=v_corrected,skipped_count=v_skipped where id=v_run;
  return query select i.run_id,i.salon_id,i.previous_slug,i.resulting_slug,i.previous_discoverable,i.resulting_discoverable,i.outcome,i.reason from public.salon_reconciliation_items i where i.run_id=v_run order by i.created_at;
end;$$;

revoke all on function public.salon_slugify(text) from public,anon,authenticated;
revoke all on function public.generate_unique_salon_slug(uuid,text) from public,anon,authenticated;
revoke all on function public.salon_publication_diagnostic(uuid) from public,anon,authenticated;
revoke all on function public.reconcile_salon_publication(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_reconcile_salon_publication(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.salon_publication_diagnostic(uuid) to service_role;
grant execute on function public.reconcile_salon_publication(uuid,uuid,text) to service_role;
grant execute on function public.admin_reconcile_salon_publication(uuid,boolean,integer) to service_role;

commit;
