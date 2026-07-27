-- Founding-salon pilot: replace the oversized homepage hero with an editable,
-- scheduled eight-card promotion rail. Existing page content is preserved.
do $migration$
declare
  promotion_rail jsonb := $json$
  {
    "id": "homepage-pilot-promotion-rail",
    "type": "promo_rail",
    "title": "Featured",
    "body": "Featured looks and local salon highlights.",
    "is_visible": true,
    "cards": [
      {"id":"pilot-nearby","content_type":"image","title":"Find trusted salons nearby","body":"See verified braiding salons serving Harlem and the Bronx.","media_url":"/images/salon-warm.jpg","href":"/salons","cta_label":"Find a salon","alt_text":"Warm, modern braiding salon interior","status":"Active","starts_at":"","ends_at":""},
      {"id":"pilot-knotless","content_type":"image","title":"Knotless braids, clear prices","body":"Compare real service details before you reserve.","media_url":"/images/braids-knotless.jpg","href":"/styles?style=knotless-braids","cta_label":"Browse knotless","alt_text":"Client wearing knotless braids","status":"Active","starts_at":"","ends_at":""},
      {"id":"pilot-box","content_type":"image","title":"Explore box braids","body":"Choose a salon, stylist, length, and available time.","media_url":"/images/braids-box.jpg","href":"/styles?style=box-braids","cta_label":"Explore styles","alt_text":"Detailed box braid hairstyle","status":"Active","starts_at":"","ends_at":""},
      {"id":"pilot-cornrows","content_type":"image","title":"Cornrow specialists","body":"Discover local professionals and verified client reviews.","media_url":"/images/braids-cornrows.jpg","href":"/styles?style=cornrows","cta_label":"See specialists","alt_text":"Client wearing neat cornrows","status":"Active","starts_at":"","ends_at":""},
      {"id":"pilot-book","content_type":"image","title":"Reserve with confidence","body":"Secure an appointment with a clear reservation deposit.","media_url":"/images/hero-braids.jpg","href":"/salons","cta_label":"Book now","alt_text":"Client with a finished braided hairstyle","status":"Active","starts_at":"","ends_at":""},
      {"id":"pilot-how","content_type":"image","title":"How Girlz Culture works","body":"From discovery to a verified review, see every step.","media_url":"/images/salon-modern.jpg","href":"/how-it-works","cta_label":"How it works","alt_text":"Bright contemporary beauty salon","status":"Active","starts_at":"","ends_at":""},
      {"id":"pilot-partner","content_type":"image","title":"Built for salon owners","body":"Manage services, availability, bookings, and your public page.","media_url":"/images/salon-blush.jpg","href":"/partner","cta_label":"Partner with us","alt_text":"Blush-toned salon interior","status":"Active","starts_at":"","ends_at":""},
      {"id":"pilot-trust","content_type":"image","title":"Real work. Real reviews.","body":"Book from transparent salon profiles with verified feedback.","media_url":"/images/salon-dark.jpg","href":"/safety","cta_label":"Safety and trust","alt_text":"Premium dark-toned salon interior","status":"Active","starts_at":"","ends_at":""}
    ]
  }
  $json$::jsonb;
begin
  if to_regclass('public.content_pages') is not null then
    insert into public.content_pages (
      slug,
      title,
      hero_title,
      hero_subtitle,
      sections,
      status
    )
    values (
      'home',
      'Home',
      'Book with Confidence.',
      'Discover nearby salons, compare clear prices, and reserve a real appointment.',
      jsonb_build_array(promotion_rail),
      'Published'
    )
    on conflict (slug) do nothing;

    update public.content_pages
    set sections = jsonb_build_array(promotion_rail) || coalesce(sections, '[]'::jsonb),
        updated_at = now()
    where slug = 'home'
      and not jsonb_path_exists(
        coalesce(sections, '[]'::jsonb),
        '$[*] ? (@.type == "promo_rail")'
      );
  end if;
end
$migration$;

update public.engine_settings
set published_value = '"20260726200000"'::jsonb,
    draft_value = '"20260726200000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';
