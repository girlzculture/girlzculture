-- Explicit, recoverable publication lifecycle for administrator-authored pages
-- and blog posts. This migration is additive and preserves every existing row.

begin;

alter table public.content_pages
  add column if not exists scheduled_publish_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists publication_state text not null default 'Hidden',
  add column if not exists published_payload jsonb,
  add column if not exists scheduled_payload jsonb;

alter table public.blog_posts
  add column if not exists scheduled_publish_at timestamptz,
  add column if not exists publication_state text not null default 'Hidden',
  add column if not exists published_payload jsonb,
  add column if not exists scheduled_payload jsonb;

-- The two About carousels are independently authored and published records.
-- Existing carousel JSON is copied once, without changing or removing the
-- legacy About row. ON CONFLICT intentionally preserves any record that an
-- administrator has already created.
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
  updated_at
)
select
  child.slug,
  child.title,
  '',
  '',
  '',
  coalesce((
    select jsonb_build_array(candidate.section)
    from (
      select section
      from jsonb_array_elements(
        case
          when jsonb_typeof(parent.sections) = 'array' then parent.sections
          else '[]'::jsonb
        end
      )
        with ordinality as source(section, position)
      where section ->> 'type' = 'community_carousel'
      order by position
      offset child.carousel_offset
      limit 1
    ) candidate
  ), '[]'::jsonb),
  'Content Section',
  case when parent.status = 'Published' then 'Published' else 'Draft' end,
  parent.is_enabled,
  parent.updated_at
from public.content_pages parent
cross join (values
  ('about-carousel-one', 'Promotional Carousel One', 0),
  ('about-carousel-two', 'Promotional Carousel Two', 1)
) as child(slug, title, carousel_offset)
where parent.slug = 'about'
on conflict (slug) do nothing;

update public.content_pages
set published_at = coalesce(published_at, updated_at),
    publication_state = 'Published',
    published_payload = coalesce(
      published_payload,
      jsonb_build_object(
        'slug', slug,
        'title', title,
        'eyebrow', eyebrow,
        'hero_title', hero_title,
        'hero_subtitle', hero_subtitle,
        'hero_image_url', hero_image_url,
        'background_image_url', background_image_url,
        'hero_position_x', hero_position_x,
        'hero_position_y', hero_position_y,
        'hero_zoom', hero_zoom,
        'page_group', page_group,
        'sections', sections,
        'labels', labels,
        'seo_title', seo_title,
        'seo_description', seo_description,
        'status', 'Published',
        'is_enabled', true,
        'published_at', coalesce(published_at, updated_at),
        'scheduled_publish_at', null,
        'archived_at', null
      )
    )
where status = 'Published';

update public.blog_posts
set published_at = coalesce(published_at, updated_at, created_at),
    publication_state = 'Published',
    published_payload = coalesce(
      published_payload,
      jsonb_build_object(
        'id', id,
        'slug', slug,
        'title', title,
        'excerpt', excerpt,
        'content', content,
        'category', category,
        'cover_image_url', cover_image_url,
        'author', author,
        'featured', featured,
        'status', 'Published',
        'published_at', coalesce(published_at, updated_at, created_at),
        'scheduled_publish_at', null,
        'archived_at', null
      )
    )
where status = 'Published';

alter table public.content_pages
  drop constraint if exists content_pages_publication_state_check;
alter table public.content_pages
  add constraint content_pages_publication_state_check
  check (publication_state in ('Published','Scheduled','Hidden','Archived')) not valid;
alter table public.content_pages
  validate constraint content_pages_publication_state_check;

alter table public.blog_posts
  drop constraint if exists blog_posts_publication_state_check;
alter table public.blog_posts
  add constraint blog_posts_publication_state_check
  check (publication_state in ('Published','Scheduled','Hidden','Archived')) not valid;
alter table public.blog_posts
  validate constraint blog_posts_publication_state_check;

alter table public.content_pages
  drop constraint if exists content_pages_status_check;
alter table public.content_pages
  add constraint content_pages_status_check
  check (status in ('Draft','Published','Scheduled','Hidden','Archived')) not valid;
alter table public.content_pages
  validate constraint content_pages_status_check;

alter table public.blog_posts
  drop constraint if exists blog_posts_status_check;
alter table public.blog_posts
  add constraint blog_posts_status_check
  check (status in ('Draft','Published','Scheduled','Hidden','Archived')) not valid;
alter table public.blog_posts
  validate constraint blog_posts_status_check;

-- Archive/restore is also exposed through the shared record-lifecycle RPC.
-- Normalize those updates at the table boundary so an older generic caller
-- cannot leave a due scheduled_payload (or a retained published snapshot)
-- eligible for anonymous reads after an archive or restore.
create or replace function public.enforce_content_page_archive_publication()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.archived_at is not null then
    new.status := 'Archived';
    new.publication_state := 'Archived';
    new.is_enabled := false;
    new.scheduled_publish_at := null;
    new.scheduled_payload := null;
  elsif old.archived_at is not null and new.archived_at is null then
    new.status := 'Draft';
    new.publication_state := 'Hidden';
    new.is_enabled := false;
    new.scheduled_publish_at := null;
    new.scheduled_payload := null;
  end if;
  return new;
end
$$;

drop trigger if exists content_pages_archive_publication_guard
  on public.content_pages;
create trigger content_pages_archive_publication_guard
before update of archived_at on public.content_pages
for each row execute function public.enforce_content_page_archive_publication();

create or replace function public.enforce_blog_post_archive_publication()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.archived_at is not null then
    new.status := 'Archived';
    new.publication_state := 'Archived';
    new.featured := false;
    new.scheduled_publish_at := null;
    new.scheduled_payload := null;
  elsif old.archived_at is not null and new.archived_at is null then
    new.status := 'Draft';
    new.publication_state := 'Hidden';
    new.featured := false;
    new.scheduled_publish_at := null;
    new.scheduled_payload := null;
  end if;
  return new;
end
$$;

drop trigger if exists blog_posts_archive_publication_guard
  on public.blog_posts;
create trigger blog_posts_archive_publication_guard
before update of archived_at on public.blog_posts
for each row execute function public.enforce_blog_post_archive_publication();

-- Content lifecycle audit rows use action-specific labels rather than a
-- generic Updated event, while retaining every previously accepted action.
alter table public.record_management_events
  drop constraint if exists record_management_events_action_check;
alter table public.record_management_events
  add constraint record_management_events_action_check
  check (action in (
    'Created','Updated','Archived','Restored','Reassigned','Deleted',
    'Cancelled','Offboarded','Anonymized','Draft created','Draft saved',
    'Published','Scheduled','Unpublished','Restored as draft'
  ));

-- Saving the editorial row and its management event is one transaction. The
-- service-role API performs presentation validation first, then calls this
-- function with the complete sanitized transition. A failed audit insert or
-- stale revision rolls the content mutation back.
create or replace function public.admin_save_content_record(
  p_record_type text,
  p_actor_user_id uuid,
  p_record jsonb,
  p_action text,
  p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  page_before public.content_pages%rowtype;
  page_after public.content_pages%rowtype;
  post_before public.blog_posts%rowtype;
  post_after public.blog_posts%rowtype;
  record_existed boolean := false;
  action_label text;
begin
  if p_record_type not in ('page','post') then
    raise exception 'Choose a supported content record type.' using errcode='22023';
  end if;
  if p_action not in (
    'save_draft','publish','schedule','unpublish','archive','restore'
  ) then
    raise exception 'Choose a supported publication action.' using errcode='22023';
  end if;
  if not exists (
    select 1
    from public.admin_users actor
    where coalesce(actor.user_id,actor.id)=p_actor_user_id
      and actor.status='Active'
      and (
        coalesce(actor.is_super_admin,false)
        or coalesce((actor.permissions->>'content')::boolean,false)
      )
  ) then
    raise exception 'Forbidden: this admin role does not have access to this section.'
      using errcode='42501';
  end if;

  if p_record_type='page' then
    if nullif(trim(coalesce(p_record->>'slug','')),'') is null then
      raise exception 'A page slug is required.' using errcode='22023';
    end if;
    select * into page_before
    from public.content_pages page
    where page.slug=p_record->>'slug'
    for update;
    record_existed := found;
    if record_existed and (
      p_expected_updated_at is null
      or p_expected_updated_at is distinct from page_before.updated_at
    ) then
      raise exception 'CONTENT_REVISION_CONFLICT' using errcode='40001';
    end if;

    select * into page_after
    from pg_catalog.jsonb_populate_record(
      case when record_existed then page_before else null::public.content_pages end,
      p_record
    );
    page_after.title := nullif(trim(coalesce(page_after.title,'')),'');
    if page_after.title is null then
      raise exception 'A page title is required.' using errcode='22023';
    end if;
    page_after.sections := coalesce(page_after.sections,'[]'::jsonb);
    page_after.labels := coalesce(page_after.labels,'{}'::jsonb);
    page_after.status := coalesce(page_after.status,'Draft');
    page_after.publication_state := coalesce(page_after.publication_state,'Hidden');
    page_after.page_group := coalesce(page_after.page_group,'Content');
    page_after.is_enabled := coalesce(page_after.is_enabled,false);
    page_after.hero_position_x := coalesce(page_after.hero_position_x,50);
    page_after.hero_position_y := coalesce(page_after.hero_position_y,50);
    page_after.hero_zoom := coalesce(page_after.hero_zoom,1);
    page_after.updated_by := p_actor_user_id;
    page_after.updated_at := clock_timestamp();

    if record_existed then
      update public.content_pages page set
        title=page_after.title,
        eyebrow=page_after.eyebrow,
        hero_title=page_after.hero_title,
        hero_subtitle=page_after.hero_subtitle,
        hero_image_url=page_after.hero_image_url,
        background_image_url=page_after.background_image_url,
        sections=page_after.sections,
        seo_title=page_after.seo_title,
        seo_description=page_after.seo_description,
        status=page_after.status,
        updated_by=page_after.updated_by,
        updated_at=page_after.updated_at,
        labels=page_after.labels,
        hero_position_x=page_after.hero_position_x,
        hero_position_y=page_after.hero_position_y,
        hero_zoom=page_after.hero_zoom,
        page_group=page_after.page_group,
        is_enabled=page_after.is_enabled,
        archived_at=page_after.archived_at,
        scheduled_publish_at=page_after.scheduled_publish_at,
        published_at=page_after.published_at,
        publication_state=page_after.publication_state,
        published_payload=page_after.published_payload,
        scheduled_payload=page_after.scheduled_payload
      where page.slug=page_before.slug
      returning * into page_after;
    else
      insert into public.content_pages(
        slug,title,eyebrow,hero_title,hero_subtitle,hero_image_url,
        background_image_url,sections,seo_title,seo_description,status,
        updated_by,updated_at,labels,hero_position_x,hero_position_y,hero_zoom,
        page_group,is_enabled,archived_at,scheduled_publish_at,published_at,
        publication_state,published_payload,scheduled_payload
      ) values (
        page_after.slug,page_after.title,page_after.eyebrow,
        page_after.hero_title,page_after.hero_subtitle,page_after.hero_image_url,
        page_after.background_image_url,page_after.sections,
        page_after.seo_title,page_after.seo_description,page_after.status,
        page_after.updated_by,page_after.updated_at,page_after.labels,
        page_after.hero_position_x,page_after.hero_position_y,
        page_after.hero_zoom,page_after.page_group,page_after.is_enabled,
        page_after.archived_at,page_after.scheduled_publish_at,
        page_after.published_at,page_after.publication_state,
        page_after.published_payload,page_after.scheduled_payload
      ) returning * into page_after;
    end if;

    action_label := case p_action
      when 'save_draft' then case when record_existed then 'Draft saved' else 'Draft created' end
      when 'publish' then 'Published'
      when 'schedule' then 'Scheduled'
      when 'unpublish' then 'Unpublished'
      when 'archive' then 'Archived'
      when 'restore' then 'Restored as draft'
    end;
    insert into public.record_management_events(
      record_type,record_id,record_label,action,before_values,after_values,
      reason,acting_user_id,acting_scope
    ) values (
      'content_page',page_after.slug,page_after.title,action_label,
      case when record_existed then to_jsonb(page_before) else null end,
      to_jsonb(page_after),action_label||' from Content Management',
      p_actor_user_id,'platform_admin'
    );
    return jsonb_build_object('record',to_jsonb(page_after));
  end if;

  if nullif(p_record->>'id','') is not null then
    select * into post_before
    from public.blog_posts post
    where post.id=(p_record->>'id')::uuid
    for update;
  else
    select * into post_before
    from public.blog_posts post
    where post.slug=p_record->>'slug'
    for update;
  end if;
  record_existed := found;
  if record_existed and (
    p_expected_updated_at is null
    or p_expected_updated_at is distinct from post_before.updated_at
  ) then
    raise exception 'CONTENT_REVISION_CONFLICT' using errcode='40001';
  end if;

  select * into post_after
  from pg_catalog.jsonb_populate_record(
    case when record_existed then post_before else null::public.blog_posts end,
    p_record
  );
  post_after.id := coalesce(post_after.id,gen_random_uuid());
  post_after.slug := nullif(trim(coalesce(post_after.slug,'')),'');
  post_after.title := nullif(trim(coalesce(post_after.title,'')),'');
  if post_after.slug is null or post_after.title is null then
    raise exception 'A blog title and slug are required.' using errcode='22023';
  end if;
  post_after.content := coalesce(post_after.content,'');
  post_after.category := coalesce(post_after.category,'Braided Styles');
  post_after.author := coalesce(post_after.author,'Girlz Culture Editorial');
  post_after.featured := coalesce(post_after.featured,false);
  post_after.status := coalesce(post_after.status,'Draft');
  post_after.publication_state := coalesce(post_after.publication_state,'Hidden');
  post_after.created_at := coalesce(post_after.created_at,clock_timestamp());
  post_after.updated_by := p_actor_user_id;
  post_after.updated_at := clock_timestamp();

  if record_existed then
    update public.blog_posts post set
      slug=post_after.slug,
      title=post_after.title,
      excerpt=post_after.excerpt,
      content=post_after.content,
      category=post_after.category,
      cover_image_url=post_after.cover_image_url,
      author=post_after.author,
      featured=post_after.featured,
      status=post_after.status,
      published_at=post_after.published_at,
      updated_at=post_after.updated_at,
      archived_at=post_after.archived_at,
      updated_by=post_after.updated_by,
      scheduled_publish_at=post_after.scheduled_publish_at,
      publication_state=post_after.publication_state,
      published_payload=post_after.published_payload,
      scheduled_payload=post_after.scheduled_payload
    where post.id=post_before.id
    returning * into post_after;
  else
    insert into public.blog_posts(
      id,slug,title,excerpt,content,category,cover_image_url,author,featured,
      status,published_at,created_at,updated_at,archived_at,updated_by,
      scheduled_publish_at,publication_state,published_payload,scheduled_payload
    ) values (
      post_after.id,post_after.slug,post_after.title,post_after.excerpt,
      post_after.content,post_after.category,post_after.cover_image_url,
      post_after.author,post_after.featured,post_after.status,
      post_after.published_at,post_after.created_at,post_after.updated_at,
      post_after.archived_at,post_after.updated_by,
      post_after.scheduled_publish_at,post_after.publication_state,
      post_after.published_payload,post_after.scheduled_payload
    ) returning * into post_after;
  end if;

  action_label := case p_action
    when 'save_draft' then case when record_existed then 'Draft saved' else 'Draft created' end
    when 'publish' then 'Published'
    when 'schedule' then 'Scheduled'
    when 'unpublish' then 'Unpublished'
    when 'archive' then 'Archived'
    when 'restore' then 'Restored as draft'
  end;
  insert into public.record_management_events(
    record_type,record_id,record_label,action,before_values,after_values,
    reason,acting_user_id,acting_scope
  ) values (
    'blog_post',post_after.id::text,post_after.title,action_label,
    case when record_existed then to_jsonb(post_before) else null end,
    to_jsonb(post_after),action_label||' from Content Management',
    p_actor_user_id,'platform_admin'
  );
  return jsonb_build_object('record',to_jsonb(post_after));
end;
$$;

comment on function public.admin_save_content_record(text,uuid,jsonb,text,timestamptz) is
  'Atomically saves a sanitized page or post transition and its management event.';
revoke all on function public.admin_save_content_record(text,uuid,jsonb,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_save_content_record(text,uuid,jsonb,text,timestamptz)
  to service_role;

drop policy if exists content_pages_public_read on public.content_pages;
create policy content_pages_public_read on public.content_pages
for select
using (public.is_admin());

drop policy if exists blog_posts_public_read on public.blog_posts;
create policy blog_posts_public_read on public.blog_posts
for select
using (public.is_admin());

create or replace function public.get_public_content_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when scheduled_payload is not null
      and scheduled_publish_at is not null
      and scheduled_publish_at <= now()
      and publication_state in ('Published','Scheduled')
      then scheduled_payload
    when published_payload is not null and publication_state = 'Published'
      then published_payload
    else null
  end
  from public.content_pages
  where slug = p_slug and is_enabled = true and archived_at is null
  limit 1
$$;

create or replace function public.get_public_content_pages()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select resolved.payload
  from public.content_pages page
  cross join lateral (
    select case
      when page.scheduled_payload is not null
        and page.scheduled_publish_at is not null
        and page.scheduled_publish_at <= now()
        and page.publication_state in ('Published','Scheduled')
        then page.scheduled_payload
      when page.published_payload is not null and page.publication_state = 'Published'
        then page.published_payload
      else null
    end as payload
  ) resolved
  where page.is_enabled = true
    and page.archived_at is null
    and resolved.payload is not null
$$;

create or replace function public.get_public_blog_post(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when scheduled_payload is not null
      and scheduled_publish_at is not null
      and scheduled_publish_at <= now()
      and publication_state in ('Published','Scheduled')
      then scheduled_payload
    when published_payload is not null and publication_state = 'Published'
      then published_payload
    else null
  end
  from public.blog_posts
  where slug = p_slug and archived_at is null
  limit 1
$$;

create or replace function public.get_public_blog_posts()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select resolved.payload
  from public.blog_posts post
  cross join lateral (
    select case
      when post.scheduled_payload is not null
        and post.scheduled_publish_at is not null
        and post.scheduled_publish_at <= now()
        and post.publication_state in ('Published','Scheduled')
        then post.scheduled_payload
      when post.published_payload is not null and post.publication_state = 'Published'
        then post.published_payload
      else null
    end as payload
  ) resolved
  where post.archived_at is null and resolved.payload is not null
  order by case lower(coalesce(resolved.payload ->> 'featured', 'false'))
      when 'true' then true else false
    end desc,
    case
      when post.scheduled_payload is not null
        and post.scheduled_publish_at is not null
        and post.scheduled_publish_at <= now()
        and post.publication_state in ('Published','Scheduled')
        then coalesce(post.scheduled_publish_at, post.updated_at)
      else coalesce(post.published_at, post.updated_at)
    end desc
$$;

revoke all on function public.get_public_content_page(text) from public;
revoke all on function public.get_public_content_pages() from public;
revoke all on function public.get_public_blog_post(text) from public;
revoke all on function public.get_public_blog_posts() from public;
grant execute on function public.get_public_content_page(text) to anon, authenticated, service_role;
grant execute on function public.get_public_content_pages() to anon, authenticated, service_role;
grant execute on function public.get_public_blog_post(text) to anon, authenticated, service_role;
grant execute on function public.get_public_blog_posts() to anon, authenticated, service_role;

create index if not exists content_pages_publication_due_idx
  on public.content_pages(status, scheduled_publish_at, is_enabled)
  where archived_at is null;

create index if not exists blog_posts_publication_due_idx
  on public.blog_posts(status, scheduled_publish_at)
  where archived_at is null;

comment on column public.content_pages.scheduled_publish_at is
  'UTC instant when a Scheduled page becomes anonymously readable.';
comment on column public.content_pages.published_at is
  'Most recent explicit publication instant; retained across unpublish and draft edits.';
comment on column public.blog_posts.scheduled_publish_at is
  'UTC instant when a Scheduled post becomes anonymously readable.';
comment on column public.content_pages.published_payload is
  'Immutable public snapshot retained while an administrator saves later drafts.';
comment on column public.blog_posts.published_payload is
  'Immutable public snapshot retained while an administrator saves later drafts.';

update public.engine_settings
set published_value='"20260808120000"'::jsonb,
    draft_value='"20260808120000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';

commit;
