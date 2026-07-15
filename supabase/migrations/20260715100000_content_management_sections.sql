-- Structured page sections and hero framing for the admin Content Management system.

alter table public.content_pages
  add column if not exists hero_position_x numeric(5,2) not null default 50,
  add column if not exists hero_position_y numeric(5,2) not null default 50,
  add column if not exists hero_zoom numeric(4,2) not null default 1,
  add column if not exists page_group text not null default 'Content';

alter table public.content_pages drop constraint if exists content_pages_hero_position_x_check;
alter table public.content_pages add constraint content_pages_hero_position_x_check check (hero_position_x between 0 and 100);
alter table public.content_pages drop constraint if exists content_pages_hero_position_y_check;
alter table public.content_pages add constraint content_pages_hero_position_y_check check (hero_position_y between 0 and 100);
alter table public.content_pages drop constraint if exists content_pages_hero_zoom_check;
alter table public.content_pages add constraint content_pages_hero_zoom_check check (hero_zoom between 1 and 2.5);

update public.homepage_sections
set description = null,
    updated_at = now();

update public.content_pages
set hero_subtitle = '',
    labels = coalesce(labels, '{}'::jsonb) || jsonb_build_object(
      'salons_near_you_subheading', '',
      'featured_salons_subheading', '',
      'trending_now_subheading', '',
      'trending_picks_subheading', ''
    ),
    updated_at = now()
where slug = 'home';

update public.content_pages
set sections = coalesce(sections, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'type', 'community_carousel',
    'title', 'Our Community',
    'body', '',
    'is_visible', true,
    'cards', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'content_type', 'image', 'media_url', '/images/braids-knotless.jpg', 'title', '', 'body', '', 'href', ''),
      jsonb_build_object('id', gen_random_uuid()::text, 'content_type', 'image', 'media_url', '/images/braids-box.jpg', 'title', '', 'body', '', 'href', ''),
      jsonb_build_object('id', gen_random_uuid()::text, 'content_type', 'image', 'media_url', '/images/braids-cornrows.jpg', 'title', '', 'body', '', 'href', '')
    )
  )
), updated_at = now()
where slug = 'about'
  and not exists (
    select 1 from jsonb_array_elements(coalesce(sections, '[]'::jsonb)) item
    where item->>'type' = 'community_carousel'
  );

