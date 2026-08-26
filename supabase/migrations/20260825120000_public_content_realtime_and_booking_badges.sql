-- Public content live refresh, independently managed additional About content,
-- and authoritative salon-owner actionable booking badges.

begin;

create table if not exists public.public_change_events (
  scope text primary key,
  record_id text,
  action text not null default 'updated',
  version bigint not null default 1,
  changed_at timestamptz not null default now()
);

alter table public.public_change_events enable row level security;

drop policy if exists public_change_events_read on public.public_change_events;
create policy public_change_events_read
on public.public_change_events
for select
to anon, authenticated
using (true);

revoke all on table public.public_change_events from public;
revoke insert, update, delete on table public.public_change_events
  from anon, authenticated;
grant select on table public.public_change_events to anon, authenticated;

create or replace function public.bump_public_change_event(
  p_scope text,
  p_record_id text,
  p_action text
) returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into public.public_change_events(
    scope,
    record_id,
    action,
    version,
    changed_at
  )
  values (
    left(coalesce(nullif(trim(p_scope), ''), 'public'), 120),
    left(coalesce(p_record_id, ''), 160),
    left(coalesce(nullif(trim(p_action), ''), 'updated'), 80),
    1,
    now()
  )
  on conflict (scope) do update
  set record_id = excluded.record_id,
      action = excluded.action,
      version = public.public_change_events.version + 1,
      changed_at = excluded.changed_at
$$;

revoke all on function public.bump_public_change_event(text,text,text)
  from public, anon, authenticated;
grant execute on function public.bump_public_change_event(text,text,text)
  to service_role;

create or replace function public.emit_public_change_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
  previous_payload jsonb;
  event_scope text;
  event_record text;
begin
  payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_payload := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;

  if tg_table_name = 'content_pages' and tg_op = 'UPDATE' then
    if payload -> 'published_payload' is not distinct from previous_payload -> 'published_payload'
       and payload ->> 'publication_state' is not distinct from previous_payload ->> 'publication_state'
       and payload ->> 'is_enabled' is not distinct from previous_payload ->> 'is_enabled'
       and payload ->> 'archived_at' is not distinct from previous_payload ->> 'archived_at' then
      return new;
    end if;
  end if;

  event_scope := case tg_table_name
    when 'content_pages' then 'content:' || coalesce(payload ->> 'slug', 'page')
    when 'blog_posts' then 'blog'
    when 'featured_salon_campaigns' then 'featured-salons'
    when 'trending_video_campaigns' then 'trending'
    when 'salon_products' then 'products'
    when 'homepage_sections' then 'home-sections'
    when 'salons' then 'salons'
    else tg_table_name
  end;
  event_record := coalesce(
    payload ->> 'slug',
    payload ->> 'section_key',
    payload ->> 'id',
    ''
  );
  perform public.bump_public_change_event(
    event_scope,
    event_record,
    lower(tg_op)
  );
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

revoke all on function public.emit_public_change_event()
  from public, anon, authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'content_pages',
    'blog_posts',
    'featured_salon_campaigns',
    'trending_video_campaigns',
    'salon_products',
    'homepage_sections',
    'salons'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'emit_public_change_event_' || target_table,
      target_table
    );
    execute format(
      'create trigger %I after insert or update or delete on public.%I
       for each row execute function public.emit_public_change_event()',
      'emit_public_change_event_' || target_table,
      target_table
    );
  end loop;
end
$$;

alter table public.public_change_events replica identity full;
alter table public.bookings replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'public_change_events'
  ) then
    alter publication supabase_realtime
      add table public.public_change_events;
  end if;
end
$$;

create or replace function public.about_additional_sections(p_sections jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(section order by position), '[]'::jsonb)
  from jsonb_array_elements(
    case when jsonb_typeof(p_sections) = 'array'
      then p_sections
      else '[]'::jsonb
    end
  ) with ordinality as item(section, position)
  where coalesce(section ->> 'type', '') <> 'community_carousel'
    and coalesce(section ->> 'type', '') <> 'promo_rail'
    and coalesce(section ->> 'id', '') not in (
      'about-story',
      'our-story',
      'about-community-copy',
      'community-copy'
    )
$$;

insert into public.content_pages (
  slug,
  title,
  eyebrow,
  hero_title,
  hero_subtitle,
  sections,
  page_group,
  status,
  is_enabled,
  publication_state,
  published_payload,
  scheduled_payload,
  scheduled_publish_at,
  published_at,
  updated_at
)
select
  'about-additional-content',
  'Additional About Content',
  '',
  '',
  '',
  public.about_additional_sections(parent.sections),
  'Content Section',
  'Draft',
  false,
  'Hidden',
  null,
  null,
  null,
  null,
  parent.updated_at
from public.content_pages parent
where parent.slug = 'about'
on conflict (slug) do nothing;

create or replace function public.salon_actionable_booking_count(
  p_salon_id uuid
) returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)
  from public.bookings booking
  where booking.salon_id = p_salon_id
    and lower(trim(coalesce(booking.status, ''))) not in (
      'completed',
      'cancelled',
      'canceled',
      'no-show',
      'no show',
      'resolved',
      'refunded',
      'rejected'
    )
$$;

revoke all on function public.salon_actionable_booking_count(uuid)
  from public, anon, authenticated;
grant execute on function public.salon_actionable_booking_count(uuid)
  to service_role;

update public.engine_settings
set published_value = '"20260825120000"'::jsonb,
    draft_value = '"20260825120000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

notify pgrst, 'reload schema';

commit;
