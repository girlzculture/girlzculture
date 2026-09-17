begin;

-- Explicitly saved topic references, never transcripts or another business data
-- store. A returning question still goes through current tool authorization.
create table public.gc_assistant_memory (
  salon_id uuid not null references public.salons(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  request_ids uuid[] not null check(cardinality(request_ids) between 1 and 6 and array_position(request_ids,null) is null),
  locale text not null check(locale in ('en','fr','es','zh-CN','wo')),
  saved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key(salon_id,requested_by),
  check(expires_at>saved_at and expires_at<=saved_at+interval '30 days')
);
create index gc_assistant_memory_expiry_idx on public.gc_assistant_memory(expires_at);
alter table public.gc_assistant_memory enable row level security;
revoke all on public.gc_assistant_memory from public,anon,authenticated;
grant all on public.gc_assistant_memory to service_role;
-- All access is through the authenticated route. No direct client grant or
-- client write policy can bypass the actor/business/consent/topic validation.
comment on table public.gc_assistant_memory is 'Explicit opt-in context bookmarks, inaccessible after 30 days and purged by the daily scheduled cleanup. Business audit records have their own retention.';

update public.engine_settings set published_value='"20260917185913"'::jsonb,
  draft_value='"20260917185913"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
