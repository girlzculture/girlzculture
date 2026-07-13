-- Optional admin-authored labels replace hard-coded social proof and trust claims.
alter table public.content_pages
  add column if not exists labels jsonb not null default '{}'::jsonb;

insert into public.content_pages (slug, title, hero_title, hero_subtitle, sections, labels, status)
values
  ('salon-profile', 'Salon profile', '', '', '[]'::jsonb, '{}'::jsonb, 'Published'),
  ('partner', 'Partner with us', '', '', '[]'::jsonb, '{}'::jsonb, 'Published')
on conflict (slug) do update set labels = '{}'::jsonb;

update public.content_pages set labels = '{}'::jsonb where slug = 'home';

-- Remove seeded testimonials until verified customer submissions are published.
update public.content_pages
set sections = '[]'::jsonb,
    updated_at = now()
where slug = 'testimonials';

-- Remove the sample media claims and placeholder contact details.
update public.content_pages
set hero_title = 'Press',
    hero_subtitle = 'Official Girlz Culture news and media information will be published here.',
    sections = '[]'::jsonb,
    updated_at = now()
where slug = 'press';

-- Remove the original sample editorial posts. New posts must be authored in Content Management.
delete from public.blog_posts
where slug in (
  'ultimate-guide-to-knotless-braids',
  'boho-braids-styles',
  'healthy-braid-products',
  'scalp-care-101'
);
