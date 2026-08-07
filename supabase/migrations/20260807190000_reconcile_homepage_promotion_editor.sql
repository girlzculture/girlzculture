begin;

-- Reconcile the homepage promotion editor with the eight positions customers
-- actually see. Preserve every existing distinct administrator card, never
-- truncate a larger pool, and append only non-paid Girlz Culture editorial
-- cards when fewer than eight editable records remain.
do $migration$
declare
  v_sections jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_unique jsonb := '[]'::jsonb;
  v_fallbacks jsonb := $json$[
    {"id":"editorial-nearby","content_type":"image","title":"Find trusted salons nearby","body":"See verified beauty professionals close to you.","media_url":"/images/salon-warm.jpg","href":"/salons","cta_label":"Find a salon","alt_text":"Warm, modern beauty salon interior","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-knotless","content_type":"image","title":"Knotless braids, clear prices","body":"Compare real service details before you reserve.","media_url":"/images/braids-knotless.jpg","href":"/styles?style=knotless-braids","cta_label":"Browse knotless","alt_text":"Client wearing knotless braids","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-box","content_type":"image","title":"Explore box braids","body":"Choose a salon, stylist, length, and available time.","media_url":"/images/braids-box.jpg","href":"/styles?style=box-braids","cta_label":"Explore styles","alt_text":"Detailed box braid hairstyle","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-cornrows","content_type":"image","title":"Cornrow specialists","body":"Discover local professionals and verified client reviews.","media_url":"/images/braids-cornrows.jpg","href":"/styles?style=cornrows","cta_label":"See specialists","alt_text":"Client wearing neat cornrows","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-book","content_type":"image","title":"Reserve with confidence","body":"Choose an available appointment with clear pricing.","media_url":"/images/hero-braids.jpg","href":"/salons","cta_label":"Book now","alt_text":"Client with a finished braided hairstyle","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-how","content_type":"image","title":"How Girlz Culture works","body":"From discovery to a verified review, see every step.","media_url":"/images/salon-modern.jpg","href":"/how-it-works","cta_label":"How it works","alt_text":"Bright contemporary beauty salon","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-partner","content_type":"image","title":"Built for salon owners","body":"Manage services, availability, bookings, and your public page.","media_url":"/images/salon-blush.jpg","href":"/partner","cta_label":"Partner with us","alt_text":"Blush-toned salon interior","status":"Active","editorial_fallback":true,"priority":0},
    {"id":"editorial-trust","content_type":"image","title":"Real work. Real reviews.","body":"Book from transparent salon profiles with verified feedback.","media_url":"/images/salon-dark.jpg","href":"/how-it-works","cta_label":"Safety and trust","alt_text":"Premium dark-toned salon interior","status":"Active","editorial_fallback":true,"priority":0}
  ]$json$::jsonb;
  v_seen jsonb := '{}'::jsonb;
  v_card jsonb;
  v_key text;
  v_rail_index integer;
  v_display_limit integer := 8;
begin
  if to_regclass('public.content_pages') is null then
    return;
  end if;

  select sections into v_sections
  from public.content_pages
  where slug = 'home'
  for update;

  if not found then
    return;
  end if;

  v_sections := coalesce(v_sections, '[]'::jsonb);

  select ordinal,
         coalesce(section -> 'cards', '[]'::jsonb),
         greatest(8, least(20, case
           when coalesce(section ->> 'display_limit', '') ~ '^[0-9]+$'
             then (section ->> 'display_limit')::integer
           else 8
         end))
  into v_rail_index, v_cards, v_display_limit
  from jsonb_array_elements(v_sections) with ordinality as rail(section, ordinal)
  where section ->> 'type' = 'promo_rail'
  order by ordinal
  limit 1;

  if v_rail_index is not null then
    for v_card in select value from jsonb_array_elements(v_cards)
    loop
      v_key := case
        when v_card ->> 'association_type' = 'campaign'
          and nullif(v_card ->> 'campaign_id', '') is not null
          then 'campaign:' || lower(v_card ->> 'campaign_id')
        when v_card ->> 'association_type' = 'salon'
          and nullif(v_card ->> 'salon_id', '') is not null
          then 'salon:' || lower(v_card ->> 'salon_id')
        else 'editorial:' || lower(coalesce(v_card ->> 'href', ''))
          || '|' || lower(coalesce(v_card ->> 'media_url', ''))
      end;

      if v_key = 'editorial:|' then
        v_key := 'card:' || lower(coalesce(v_card ->> 'id', md5(v_card::text)));
      end if;

      if not (v_seen ? v_key) then
        v_unique := v_unique || jsonb_build_array(v_card);
        v_seen := v_seen || jsonb_build_object(v_key, true);
      end if;
    end loop;
  end if;

  for v_card in select value from jsonb_array_elements(v_fallbacks)
  loop
    exit when jsonb_array_length(v_unique) >= 8;
    v_key := 'editorial:' || lower(v_card ->> 'href')
      || '|' || lower(v_card ->> 'media_url');
    if not (v_seen ? v_key) then
      v_unique := v_unique || jsonb_build_array(v_card);
      v_seen := v_seen || jsonb_build_object(v_key, true);
    end if;
  end loop;

  if v_rail_index is null then
    v_sections := jsonb_build_array(jsonb_build_object(
      'id', 'homepage-promotion-rail',
      'type', 'promo_rail',
      'title', 'Featured',
      'body', '',
      'is_visible', true,
      'display_limit', 8,
      'cards', v_unique
    )) || v_sections;
  else
    v_sections := jsonb_set(
      v_sections,
      array[(v_rail_index - 1)::text, 'cards'],
      v_unique,
      true
    );
    v_sections := jsonb_set(
      v_sections,
      array[(v_rail_index - 1)::text, 'display_limit'],
      to_jsonb(v_display_limit),
      true
    );
  end if;

  update public.content_pages
  set sections = v_sections,
      updated_at = now()
  where slug = 'home';
end
$migration$;

update public.engine_settings
set published_value='"20260807190000"'::jsonb,
    draft_value='"20260807190000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';
commit;
