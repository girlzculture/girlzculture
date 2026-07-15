-- Legal pages can be independently removed from public routes and the footer.

alter table public.content_pages
  add column if not exists is_enabled boolean not null default true;

comment on column public.content_pages.is_enabled is
  'Independent public on/off switch. Content and publish status are preserved while disabled.';

update public.content_pages
set is_enabled = true
where is_enabled is null;

update public.content_pages
set title = 'Cookie & Tracking Notice', hero_title = 'Cookie & Tracking Notice'
where slug = 'cookie-notice' and title in ('Cookie / Tracking Notice', 'cookie notice');

update public.content_pages
set title = 'Community Guidelines', hero_title = 'Community Guidelines'
where slug = 'community-guidelines' and title in ('Community / Content Guidelines', 'community guidelines');

drop policy if exists content_pages_public_read on public.content_pages;
create policy content_pages_public_read on public.content_pages
for select
using ((status = 'Published' and is_enabled = true) or public.is_admin());

create index if not exists content_pages_public_visibility_idx
  on public.content_pages(slug, status, is_enabled);
