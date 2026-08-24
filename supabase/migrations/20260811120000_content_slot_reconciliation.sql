-- Reconcile stable content-slot identity without overwriting newer authored cards.
-- This migration is idempotent and does not publish a hidden record.

begin;

create or replace function public.normalize_home_hero_sections(p_sections jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  with source as (
    select section, position
    from jsonb_array_elements(case when jsonb_typeof(p_sections) = 'array' then p_sections else '[]'::jsonb end) with ordinality as item(section, position)
  ), chosen as (
    select position from source
    where section ->> 'id' = 'home-hero-promotion-carousel' or section ->> 'type' = 'promo_rail'
    order by case when section ->> 'id' = 'home-hero-promotion-carousel' then 0 else 1 end, position
    limit 1
  )
  select coalesce(jsonb_agg(case when source.position = chosen.position then source.section || jsonb_build_object(
    'id', 'home-hero-promotion-carousel', 'type', 'promo_rail', 'presentation_layout',
    case when source.section ->> 'presentation_layout' in ('promo_rail','community_carousel','carousel','card_grid','banner','text') then source.section ->> 'presentation_layout'
         when source.section ->> 'type' in ('promo_rail','community_carousel','carousel','card_grid','banner','text') then source.section ->> 'type'
         else 'promo_rail' end
  ) else source.section end order by source.position), '[]'::jsonb)
  from source left join chosen on true
$$;

create or replace function public.first_about_carousel(p_sections jsonb, p_offset integer)
returns jsonb language sql immutable set search_path = pg_catalog, public as $$
  select section from jsonb_array_elements(case when jsonb_typeof(p_sections) = 'array' then p_sections else '[]'::jsonb end) with ordinality as item(section, position)
  where section ->> 'type' = 'community_carousel' order by position offset greatest(0, p_offset) limit 1
$$;

create or replace function public.section_card_count(p_section jsonb)
returns integer language sql immutable set search_path = pg_catalog, public as $$
  select case when jsonb_typeof(p_section -> 'cards') = 'array' then jsonb_array_length(p_section -> 'cards') else 0 end
$$;

create or replace function public.reconcile_about_child_sections(p_child_sections jsonb, p_fallback_section jsonb, p_expected_id text, p_default_direction text)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public as $$
declare existing_section jsonb; selected_section jsonb;
begin
  select section into existing_section from jsonb_array_elements(case when jsonb_typeof(p_child_sections) = 'array' then p_child_sections else '[]'::jsonb end) with ordinality as item(section, position)
  where section ->> 'id' = p_expected_id or section ->> 'type' = 'community_carousel'
  order by case when section ->> 'id' = p_expected_id then 0 else 1 end, position limit 1;
  selected_section := case when public.section_card_count(existing_section) > 0 then existing_section when public.section_card_count(p_fallback_section) > 0 then p_fallback_section else coalesce(existing_section, p_fallback_section) end;
  if selected_section is null then return case when jsonb_typeof(p_child_sections) = 'array' then p_child_sections else '[]'::jsonb end; end if;
  return jsonb_build_array(selected_section || jsonb_build_object('id', p_expected_id, 'type', 'community_carousel', 'scroll_direction', case when selected_section ->> 'scroll_direction' in ('forward','reverse') then selected_section ->> 'scroll_direction' else p_default_direction end));
end
$$;

update public.content_pages
set sections = public.normalize_home_hero_sections(sections),
    published_payload = case when jsonb_typeof(published_payload) = 'object' then jsonb_set(published_payload, '{sections}', public.normalize_home_hero_sections(published_payload -> 'sections'), true) else published_payload end,
    scheduled_payload = case when jsonb_typeof(scheduled_payload) = 'object' then jsonb_set(scheduled_payload, '{sections}', public.normalize_home_hero_sections(scheduled_payload -> 'sections'), true) else scheduled_payload end
where slug = 'home';

with parent as (select sections, published_payload, scheduled_payload from public.content_pages where slug = 'about')
update public.content_pages child
set sections = public.reconcile_about_child_sections(child.sections, public.first_about_carousel(parent.sections, 0), 'about-promo-carousel', 'reverse'),
    published_payload = case when jsonb_typeof(child.published_payload) = 'object' then jsonb_set(child.published_payload, '{sections}', public.reconcile_about_child_sections(child.published_payload -> 'sections', public.first_about_carousel(parent.published_payload -> 'sections', 0), 'about-promo-carousel', 'reverse'), true) else child.published_payload end,
    scheduled_payload = case when jsonb_typeof(child.scheduled_payload) = 'object' then jsonb_set(child.scheduled_payload, '{sections}', public.reconcile_about_child_sections(child.scheduled_payload -> 'sections', public.first_about_carousel(parent.scheduled_payload -> 'sections', 0), 'about-promo-carousel', 'reverse'), true) else child.scheduled_payload end
from parent where child.slug = 'about-carousel-one';

with parent as (select sections, published_payload, scheduled_payload from public.content_pages where slug = 'about')
update public.content_pages child
set sections = public.reconcile_about_child_sections(child.sections, public.first_about_carousel(parent.sections, 1), 'about-community-carousel', 'forward'),
    published_payload = case when jsonb_typeof(child.published_payload) = 'object' then jsonb_set(child.published_payload, '{sections}', public.reconcile_about_child_sections(child.published_payload -> 'sections', public.first_about_carousel(parent.published_payload -> 'sections', 1), 'about-community-carousel', 'forward'), true) else child.published_payload end,
    scheduled_payload = case when jsonb_typeof(child.scheduled_payload) = 'object' then jsonb_set(child.scheduled_payload, '{sections}', public.reconcile_about_child_sections(child.scheduled_payload -> 'sections', public.first_about_carousel(parent.scheduled_payload -> 'sections', 1), 'about-community-carousel', 'forward'), true) else child.scheduled_payload end
from parent where child.slug = 'about-carousel-two';

comment on function public.normalize_home_hero_sections(jsonb) is 'Preserves the authored hero section while separating stable slot identity from presentation layout.';
comment on function public.reconcile_about_child_sections(jsonb,jsonb,text,text) is 'Keeps newer child cards, otherwise recovers legacy About carousel cards without publishing a hidden child.';

update public.engine_settings
set published_value='"20260811120000"'::jsonb,
    draft_value='"20260811120000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst, 'reload schema';

commit;