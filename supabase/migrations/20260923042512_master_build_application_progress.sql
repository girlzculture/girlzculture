-- A single private draft backs both the form and conversational application.
begin;
create table public.business_application_progress (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 1 check(revision > 0),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=65536),
 submitted_application_id uuid references public.salon_applications(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table public.business_application_progress enable row level security;
revoke all on public.business_application_progress from anon,authenticated;
grant select on public.business_application_progress to authenticated;
grant all on public.business_application_progress to service_role;
create policy application_progress_owner_read on public.business_application_progress for select to authenticated using(user_id=auth.uid());

create function public.save_business_application_progress(p_actor uuid,p_revision bigint,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved public.business_application_progress%rowtype;
begin
 if not exists(select 1 from public.platform_identities i join auth.users u on u.id=i.user_id where i.user_id=p_actor and i.primary_role='salon_owner' and i.status='Active' and i.email_normalized=lower(trim(u.email))) then raise insufficient_privilege using message='APPLICATION_OWNER_REQUIRED';end if;
 if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536 then raise check_violation using message='APPLICATION_DRAFT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('application-progress:'||p_actor::text,0));
 select * into saved from public.business_application_progress where user_id=p_actor for update;
 if found then
  if p_revision is distinct from saved.revision then raise exception 'APPLICATION_DRAFT_STALE';end if;
  if saved.payload=p_payload then return to_jsonb(saved);end if;
  update public.business_application_progress set payload=p_payload,revision=revision+1,updated_at=now() where user_id=p_actor returning * into saved;
 else
  if p_revision is not null then raise exception 'APPLICATION_DRAFT_STALE';end if;
  insert into public.business_application_progress(user_id,payload) values(p_actor,p_payload) returning * into saved;
 end if;
 return to_jsonb(saved);
end $$;
revoke all on function public.save_business_application_progress(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_business_application_progress(uuid,bigint,jsonb) to service_role;
comment on table public.business_application_progress is 'Owner-only application progress shared by the form and Application Agent; never public or available to another business.';
update public.engine_settings set published_value='"20260923042512"'::jsonb,draft_value='"20260923042512"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
