begin;

create table if not exists public.platform_error_events (
  id uuid primary key default gen_random_uuid(),
  reference uuid not null unique,
  fingerprint text not null,
  severity text not null check (severity in ('critical','high','medium','low')),
  status text not null default 'Open' check (status in ('Open','Investigating','Resolved','Ignored')),
  environment text not null,
  release text not null,
  route text,
  action text not null,
  feature text not null,
  actor_role text,
  salon_id uuid references public.salons(id) on delete set null,
  technical_message text not null,
  technical_stack text,
  user_safe_message text,
  metadata jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_occurred_at timestamptz not null default now(),
  last_occurred_at timestamptz not null default now(),
  assigned_to uuid references auth.users(id) on delete set null,
  admin_notes text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_error_events_status_last_idx on public.platform_error_events(status,severity,last_occurred_at desc);
create index if not exists platform_error_events_feature_idx on public.platform_error_events(feature,last_occurred_at desc);
create index if not exists platform_error_events_fingerprint_idx on public.platform_error_events(fingerprint,environment,release,last_occurred_at desc);
create index if not exists platform_error_events_reference_idx on public.platform_error_events(reference);

create table if not exists public.platform_error_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.platform_error_events(id) on delete cascade,
  reference uuid not null unique,
  route text,
  action text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists platform_error_occurrences_event_idx on public.platform_error_occurrences(event_id,occurred_at desc);
create index if not exists platform_error_occurrences_reference_idx on public.platform_error_occurrences(reference);

create table if not exists public.platform_error_alert_rules (
  id uuid primary key default gen_random_uuid(),
  severity text not null unique check (severity in ('critical','high')),
  occurrence_threshold integer not null check (occurrence_threshold between 1 and 10000),
  window_minutes integer not null check (window_minutes between 1 and 1440),
  is_enabled boolean not null default true,
  notification_channel text not null default 'engine',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_error_alert_rules(severity,occurrence_threshold,window_minutes,is_enabled)
values ('critical',1,5,true),('high',5,15,true)
on conflict (severity) do nothing;

alter table public.platform_error_events enable row level security;
alter table public.platform_error_occurrences enable row level security;
alter table public.platform_error_alert_rules enable row level security;
drop policy if exists platform_error_events_admin_read on public.platform_error_events;
create policy platform_error_events_admin_read on public.platform_error_events
for select to authenticated using (public.admin_has_permission('settings'));
drop policy if exists platform_error_events_admin_update on public.platform_error_events;
create policy platform_error_events_admin_update on public.platform_error_events
for update to authenticated using (public.admin_has_permission('settings'))
with check (public.admin_has_permission('settings'));
drop policy if exists platform_error_occurrences_admin_read on public.platform_error_occurrences;
create policy platform_error_occurrences_admin_read on public.platform_error_occurrences
for select to authenticated using (public.admin_has_permission('settings'));
drop policy if exists platform_error_alert_rules_admin_read on public.platform_error_alert_rules;
create policy platform_error_alert_rules_admin_read on public.platform_error_alert_rules
for select to authenticated using (public.admin_has_permission('settings'));
drop policy if exists platform_error_alert_rules_admin_write on public.platform_error_alert_rules;
create policy platform_error_alert_rules_admin_write on public.platform_error_alert_rules
for all to authenticated using (public.admin_has_permission('settings'))
with check (public.admin_has_permission('settings'));

create or replace function public.capture_platform_error(p_event jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_reference uuid := coalesce(nullif(p_event->>'reference','')::uuid, gen_random_uuid());
  v_fingerprint text := left(coalesce(nullif(p_event->>'fingerprint',''),'unclassified'),160);
  v_environment text := left(coalesce(nullif(p_event->>'environment',''),'unknown'),80);
  v_release text := left(coalesce(nullif(p_event->>'release',''),'unknown'),160);
  v_severity text := case when p_event->>'severity' in ('critical','high','medium','low') then p_event->>'severity' else 'high' end;
begin
  if auth.role() <> 'service_role' then
    raise exception 'This operation is server-only.' using errcode='42501';
  end if;
  select id into v_existing
  from public.platform_error_events
  where fingerprint=v_fingerprint and environment=v_environment and release=v_release
    and status in ('Open','Investigating')
  order by last_occurred_at desc limit 1 for update;
  if v_existing is not null then
    update public.platform_error_events set
      severity=case
        when severity='critical' or v_severity='critical' then 'critical'
        when severity='high' or v_severity='high' then 'high'
        when severity='medium' or v_severity='medium' then 'medium'
        else 'low' end,
      route=left(nullif(p_event->>'route',''),500),
      action=left(coalesce(nullif(p_event->>'action',''),'unknown'),160),
      feature=left(coalesce(nullif(p_event->>'feature',''),'unknown'),160),
      actor_role=left(nullif(p_event->>'actor_role',''),80),
      salon_id=case when coalesce(p_event->>'salon_id','') ~* '^[0-9a-f-]{36}$' then (p_event->>'salon_id')::uuid else salon_id end,
      technical_message=left(coalesce(nullif(p_event->>'technical_message',''),'Unknown error'),4000),
      technical_stack=left(nullif(p_event->>'technical_stack',''),12000),
      user_safe_message=left(nullif(p_event->>'user_safe_message',''),2000),
      metadata=coalesce(p_event->'metadata','{}'::jsonb),
      occurrence_count=occurrence_count+1,
      last_occurred_at=now(),
      updated_at=now()
    where id=v_existing;
    insert into public.platform_error_occurrences(event_id,reference,route,action,safe_metadata)
    values(v_existing,v_reference,left(nullif(p_event->>'route',''),500),left(coalesce(nullif(p_event->>'action',''),'unknown'),160),coalesce(p_event->'metadata','{}'::jsonb));
    return v_existing;
  end if;
  insert into public.platform_error_events(
    reference,fingerprint,severity,environment,release,route,action,feature,actor_role,
    salon_id,technical_message,technical_stack,user_safe_message,metadata
  ) values (
    v_reference,v_fingerprint,v_severity,v_environment,v_release,left(nullif(p_event->>'route',''),500),
    left(coalesce(nullif(p_event->>'action',''),'unknown'),160),left(coalesce(nullif(p_event->>'feature',''),'unknown'),160),
    left(nullif(p_event->>'actor_role',''),80),case when coalesce(p_event->>'salon_id','') ~* '^[0-9a-f-]{36}$' then (p_event->>'salon_id')::uuid else null end,
    left(coalesce(nullif(p_event->>'technical_message',''),'Unknown error'),4000),left(nullif(p_event->>'technical_stack',''),12000),
    left(nullif(p_event->>'user_safe_message',''),2000),coalesce(p_event->'metadata','{}'::jsonb)
  ) returning id into v_existing;
  insert into public.platform_error_occurrences(event_id,reference,route,action,safe_metadata)
  values(v_existing,v_reference,left(nullif(p_event->>'route',''),500),left(coalesce(nullif(p_event->>'action',''),'unknown'),160),coalesce(p_event->'metadata','{}'::jsonb));
  return v_existing;
end $$;
revoke all on function public.capture_platform_error(jsonb) from public, anon, authenticated;
grant execute on function public.capture_platform_error(jsonb) to service_role;

create or replace function public.purge_platform_error_events(p_retention_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'This operation is server-only.' using errcode='42501'; end if;
  delete from public.platform_error_events
  where status in ('Resolved','Ignored')
    and updated_at < now() - make_interval(days=>greatest(30,least(coalesce(p_retention_days,90),730)));
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.purge_platform_error_events(integer) from public,anon,authenticated;
grant execute on function public.purge_platform_error_events(integer) to service_role;

commit;
