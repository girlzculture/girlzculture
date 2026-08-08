begin;

-- Editorial homepage fallbacks are runtime presentation defaults. Remove only
-- byte-for-byte canonical seed cards; any card an administrator changed stays
-- in the saved pool and is explicitly converted to administrator content.
do $migration$
declare
  v_sections jsonb;
  v_next_sections jsonb := '[]'::jsonb;
  v_section jsonb;
  v_cards jsonb;
  v_next_cards jsonb;
  v_card jsonb;
  v_canonical jsonb;
  v_found_rail boolean := false;
  v_canonical_cards jsonb := $json$[
    {"id":"editorial-nearby","content_type":"image","title":"Find trusted salons nearby","body":"See verified beauty professionals close to you.","media_url":"/images/salon-warm.jpg","href":"/salons","cta_label":"Find a salon","alt_text":"Warm, modern beauty salon interior","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-knotless","content_type":"image","title":"Knotless braids, clear prices","body":"Compare real service details before you reserve.","media_url":"/images/braids-knotless.jpg","href":"/styles?style=knotless-braids","cta_label":"Browse knotless","alt_text":"Client wearing knotless braids","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-box","content_type":"image","title":"Explore box braids","body":"Choose a salon, stylist, length, and available time.","media_url":"/images/braids-box.jpg","href":"/styles?style=box-braids","cta_label":"Explore styles","alt_text":"Detailed box braid hairstyle","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-cornrows","content_type":"image","title":"Cornrow specialists","body":"Discover local professionals and verified client reviews.","media_url":"/images/braids-cornrows.jpg","href":"/styles?style=cornrows","cta_label":"See specialists","alt_text":"Client wearing neat cornrows","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-book","content_type":"image","title":"Reserve with confidence","body":"Choose an available appointment with clear pricing.","media_url":"/images/hero-braids.jpg","href":"/salons","cta_label":"Book now","alt_text":"Client with a finished braided hairstyle","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-how","content_type":"image","title":"How Girlz Culture works","body":"From discovery to a verified review, see every step.","media_url":"/images/salon-modern.jpg","href":"/how-it-works","cta_label":"How it works","alt_text":"Bright contemporary beauty salon","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-partner","content_type":"image","title":"Built for salon owners","body":"Manage services, availability, bookings, and your public page.","media_url":"/images/salon-blush.jpg","href":"/partner","cta_label":"Partner with us","alt_text":"Blush-toned salon interior","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-trust","content_type":"image","title":"Real work. Real reviews.","body":"Book from transparent salon profiles with verified feedback.","media_url":"/images/salon-dark.jpg","href":"/how-it-works","cta_label":"Safety and trust","alt_text":"Premium dark-toned salon interior","status":"Active","editorial_fallback":true,"priority":0}
  ]$json$::jsonb;
begin
  if to_regclass('public.content_pages') is null then return; end if;
  select sections into v_sections from public.content_pages where slug = 'home' for update;
  if not found then return; end if;

  for v_section in select value from jsonb_array_elements(coalesce(v_sections, '[]'::jsonb))
  loop
    if v_section ->> 'type' = 'promo_rail' and not v_found_rail then
      v_found_rail := true;
      v_cards := coalesce(v_section -> 'cards', '[]'::jsonb);
      v_next_cards := '[]'::jsonb;
      for v_card in select value from jsonb_array_elements(v_cards)
      loop
        select value into v_canonical
        from jsonb_array_elements(v_canonical_cards)
        where value ->> 'id' = v_card ->> 'id'
        limit 1;

        if v_canonical is not null
          and coalesce(v_card -> 'editorial_fallback', 'false'::jsonb) = 'true'::jsonb
          and coalesce(v_card ->> 'content_type', '') = coalesce(v_canonical ->> 'content_type', '')
          and coalesce(v_card ->> 'source_kind', '') = coalesce(v_canonical ->> 'source_kind', '')
          and coalesce(v_card ->> 'association_type', '') = coalesce(v_canonical ->> 'association_type', '')
          and coalesce(v_card ->> 'salon_id', '') = coalesce(v_canonical ->> 'salon_id', '')
          and coalesce(v_card ->> 'campaign_id', '') = coalesce(v_canonical ->> 'campaign_id', '')
          and coalesce(v_card ->> 'title', '') = coalesce(v_canonical ->> 'title', '')
          and coalesce(v_card ->> 'body', '') = coalesce(v_canonical ->> 'body', '')
          and coalesce(v_card ->> 'media_url', '') = coalesce(v_canonical ->> 'media_url', '')
          and coalesce(v_card ->> 'href', '') = coalesce(v_canonical ->> 'href', '')
          and coalesce(v_card ->> 'cta_label', '') = coalesce(v_canonical ->> 'cta_label', '')
          and coalesce(v_card ->> 'alt_text', '') = coalesce(v_canonical ->> 'alt_text', '')
          and coalesce(v_card ->> 'status', '') = coalesce(v_canonical ->> 'status', '')
          and coalesce(v_card ->> 'starts_at', '') = coalesce(v_canonical ->> 'starts_at', '')
          and coalesce(v_card ->> 'ends_at', '') = coalesce(v_canonical ->> 'ends_at', '')
          and coalesce(v_card ->> 'market_id', '') = coalesce(v_canonical ->> 'market_id', '')
          and coalesce(v_card ->> 'target_label', '') = coalesce(v_canonical ->> 'target_label', '')
          and coalesce(v_card ->> 'target_latitude', '') = coalesce(v_canonical ->> 'target_latitude', '')
          and coalesce(v_card ->> 'target_longitude', '') = coalesce(v_canonical ->> 'target_longitude', '')
          and coalesce(v_card ->> 'radius_miles', '') = coalesce(v_canonical ->> 'radius_miles', '')
          and coalesce(v_card ->> 'priority', '') = coalesce(v_canonical ->> 'priority', '')
          and coalesce(v_card ->> 'rotation_weight', '') = coalesce(v_canonical ->> 'rotation_weight', '') then
          continue;
        end if;

        if coalesce(v_card -> 'editorial_fallback', 'false'::jsonb) = 'true'::jsonb then
          v_card := v_card || '{"editorial_fallback":false,"source_kind":"upload"}'::jsonb;
        end if;
        v_next_cards := v_next_cards || jsonb_build_array(v_card);
      end loop;
      v_section := jsonb_set(v_section, '{cards}', v_next_cards, true);
      if not (v_section ? 'display_limit') then
        v_section := jsonb_set(v_section, '{display_limit}', '8'::jsonb, true);
      end if;
    end if;
    v_next_sections := v_next_sections || jsonb_build_array(v_section);
  end loop;

  if not v_found_rail then
    v_next_sections := jsonb_build_array(jsonb_build_object(
      'id', 'homepage-promotion-rail', 'type', 'promo_rail',
      'title', 'Featured', 'body', '', 'is_visible', true,
      'display_limit', 8, 'cards', '[]'::jsonb
    )) || v_next_sections;
  end if;

  update public.content_pages
  set sections = v_next_sections, updated_at = now()
  where slug = 'home' and sections is distinct from v_next_sections;
end
$migration$;

-- Ensure the About page and legal hub exist without replacing founder-authored
-- copy. Defaults are applied only when the corresponding field/card collection
-- has never been configured.
insert into public.content_pages(slug,title,eyebrow,hero_title,hero_subtitle,sections,labels,status,is_enabled)
values(
  'about','About Us','ABOUT US','Built for our culture. Backed by purpose.',
  'Girlz Culture connects you with skilled beauty professionals serving your community.',
  '[]'::jsonb,
  '{"mobile_preview":"Learn why Girlz Culture was created for clients, salons, and the communities they serve.","read_more_label":"Read more"}'::jsonb,
  'Published',true
)
on conflict(slug) do nothing;

insert into public.content_pages(slug,title,eyebrow,hero_title,hero_subtitle,sections,labels,status,is_enabled,page_group)
values(
  'legal','Legal & Policies','GIRLZ CULTURE','Legal & Policies',
  'Review the policies that apply to Girlz Culture customers, salon partners, and website visitors.',
  '[]'::jsonb,'{}'::jsonb,'Published',true,'Legal'
)
on conflict(slug) do nothing;

do $about$
declare
  v_sections jsonb;
  v_next jsonb := '[]'::jsonb;
  v_section jsonb;
  v_has_middle boolean := false;
  v_has_lower boolean := false;
  v_claimed_legacy_lower boolean := false;
  v_middle jsonb := $json${
    "id":"about-promo-carousel","type":"community_carousel","title":"Explore Girlz Culture",
    "body":"Find salons, practical guides, and platform updates.","is_visible":true,"scroll_direction":"reverse",
    "cards":[
      {"id":"about-find-salons","content_type":"image","source_kind":"upload","title":"Find salons","body":"Browse beauty professionals serving your area.","media_url":"/images/salon-warm.jpg","href":"/salons","cta_label":"Explore salons","status":"Active"},
      {"id":"about-browse-styles","content_type":"image","source_kind":"upload","title":"Browse styles","body":"Compare services and find the look that fits you.","media_url":"/images/braids-knotless.jpg","href":"/styles","cta_label":"Browse styles","status":"Active"},
      {"id":"about-how-it-works","content_type":"image","source_kind":"upload","title":"How booking works","body":"See how discovery, booking, and confirmation fit together.","media_url":"/images/salon-modern.jpg","href":"/how-it-works","cta_label":"See the steps","status":"Active"},
      {"id":"about-stories","content_type":"image","source_kind":"upload","title":"Read the blog","body":"Explore beauty care, style, and salon stories.","media_url":"/images/braids-box.jpg","href":"/blog","cta_label":"Read stories","status":"Active"},
      {"id":"about-partner","content_type":"image","source_kind":"upload","title":"For salon owners","body":"Build your public page and manage your business in one place.","media_url":"/images/salon-blush.jpg","href":"/partner","cta_label":"Partner with us","status":"Active"},
      {"id":"about-safety","content_type":"image","source_kind":"upload","title":"Safety and trust","body":"Learn about platform safeguards and customer support.","media_url":"/images/braids-cornrows.jpg","href":"/safety","cta_label":"Learn more","status":"Active"}
    ]
  }$json$::jsonb;
  v_lower_default jsonb := $json${
    "id":"about-community-carousel","type":"community_carousel","title":"Our Community","body":"","is_visible":true,"scroll_direction":"forward",
    "cards":[
      {"id":"about-community-1","content_type":"image","source_kind":"upload","title":"","body":"","media_url":"/images/braids-knotless.jpg","href":"","status":"Active"},
      {"id":"about-community-2","content_type":"image","source_kind":"upload","title":"","body":"","media_url":"/images/braids-box.jpg","href":"","status":"Active"},
      {"id":"about-community-3","content_type":"image","source_kind":"upload","title":"","body":"","media_url":"/images/braids-cornrows.jpg","href":"","status":"Active"},
      {"id":"about-community-4","content_type":"image","source_kind":"upload","title":"","body":"","media_url":"/images/hero-braids.jpg","href":"","status":"Active"},
      {"id":"about-community-5","content_type":"image","source_kind":"upload","title":"","body":"","media_url":"/images/salon-warm.jpg","href":"","status":"Active"},
      {"id":"about-community-6","content_type":"image","source_kind":"upload","title":"","body":"","media_url":"/images/salon-modern.jpg","href":"","status":"Active"}
    ]
  }$json$::jsonb;
begin
  select sections into v_sections from public.content_pages where slug = 'about' for update;
  -- Discover canonical identities before rewriting any legacy carousel. A
  -- single-pass discovery/rename made the result depend on array order and
  -- could create two sections with the about-community-carousel id.
  select exists(
    select 1 from jsonb_array_elements(coalesce(v_sections, '[]'::jsonb)) item
    where item.value ->> 'id' = 'about-promo-carousel'
  ) into v_has_middle;
  select exists(
    select 1 from jsonb_array_elements(coalesce(v_sections, '[]'::jsonb)) item
    where item.value ->> 'id' = 'about-community-carousel'
  ) into v_has_lower;

  for v_section in select value from jsonb_array_elements(coalesce(v_sections, '[]'::jsonb))
  loop
    if v_section ->> 'id' = 'about-promo-carousel' then
      v_section := v_section || '{"scroll_direction":"reverse"}'::jsonb;
    elsif v_section ->> 'id' = 'about-community-carousel' then
      v_section := v_section || '{"scroll_direction":"forward"}'::jsonb;
    elsif v_section ->> 'type' = 'community_carousel'
      and not v_has_lower
      and not v_claimed_legacy_lower then
      v_claimed_legacy_lower := true;
      v_section := v_section || '{"id":"about-community-carousel","scroll_direction":"forward"}'::jsonb;
    end if;
    v_next := v_next || jsonb_build_array(v_section);
  end loop;
  if not v_has_middle then v_next := v_next || jsonb_build_array(v_middle); end if;
  if not v_has_lower and not v_claimed_legacy_lower then
    v_next := v_next || jsonb_build_array(v_lower_default);
  end if;
  update public.content_pages
  set sections = v_next,
      labels = '{"mobile_preview":"Learn why Girlz Culture was created for clients, salons, and the communities they serve.","read_more_label":"Read more"}'::jsonb || coalesce(labels,'{}'::jsonb),
      updated_at = now()
  where slug = 'about';
end
$about$;

-- The mobile footer exposes one legal hub link. Individual policy pages remain
-- published, shareable, and present in the full desktop footer.
insert into public.navigation_items as existing(surface,group_key,item_key,label,href,sort_order,is_enabled,show_new_badge)
values('footer','legal','legal-policies','Legal & Policies','/legal',4010,true,false)
on conflict(surface,item_key) do update
set group_key = excluded.group_key,
    href = excluded.href,
    is_enabled = true,
    archived_at = null,
    updated_at = case
      when existing.group_key is distinct from excluded.group_key
        or existing.href is distinct from excluded.href
        or existing.is_enabled is distinct from true
        or existing.archived_at is not null
      then now()
      else existing.updated_at
    end;

-- Public callers must be able to tell an unconfigured navigation surface from
-- an intentionally empty one. RLS correctly hides disabled rows, so expose a
-- narrow projection: a configuration-state bit and enabled rows only. Disabled
-- and archived labels/destinations never leave the database.
create or replace function public.get_public_navigation_surface(p_surface text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'configured', count(*) > 0,
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'surface', item.surface,
          'group_key', item.group_key,
          'item_key', item.item_key,
          'label', item.label,
          'translation_key', item.translation_key,
          'href', item.href,
          'sort_order', item.sort_order,
          'is_enabled', true,
          'show_new_badge', item.show_new_badge,
          'archived_at', null
        ) order by item.sort_order, item.item_key
      ) filter (where item.is_enabled and item.archived_at is null),
      '[]'::jsonb
    )
  )
  from public.navigation_items item
  where item.surface = p_surface
    and p_surface in ('header','mobile_menu','mobile_bottom','footer');
$function$;

revoke all on function public.get_public_navigation_surface(text) from public;
grant execute on function public.get_public_navigation_surface(text) to anon, authenticated, service_role;

-- Legacy seed groups all used 10/20/30 sort values. Normalize only that legacy
-- state so group ordering is deterministic; any previously customized range
-- (>= 1000) is left untouched.
do $footer$
declare v_max integer;
begin
  select max(sort_order) into v_max from public.navigation_items where surface='footer' and archived_at is null and item_key <> 'legal-policies';
  if coalesce(v_max,0) < 1000 then
    with ranked as (
      select id,
        case group_key when 'company' then 1 when 'professionals' then 2 when 'support' then 3 when 'legal' then 4 else 5 end as group_position,
        row_number() over(partition by group_key order by sort_order,item_key) as item_position
      from public.navigation_items where surface='footer' and archived_at is null
    )
    update public.navigation_items item
    set sort_order = ranked.group_position * 1000 + ranked.item_position * 10,
        updated_at = now()
    from ranked where ranked.id = item.id;
  end if;
end
$footer$;

update public.engine_settings
set published_value='"20260807210000"'::jsonb,
    draft_value='"20260807210000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';
commit;
