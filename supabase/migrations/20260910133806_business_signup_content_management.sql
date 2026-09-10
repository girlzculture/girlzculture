begin;

-- One scoped editorial preset. Existing image profiles and their application
-- limits remain unchanged; no new bucket, upload policy or media table.
insert into public.media_upload_profiles (
  profile_key, display_name, aspect_width, aspect_height, min_width_px,
  min_height_px, output_width_px, max_bytes, accepted_mime_types,
  safe_area_enabled, help_text
) values (
  'business_hero_video', 'Business signup hero MP4', 16, 9, 48, 48, 1920,
  12582912, array['video/mp4'], false,
  'Completed H.264 MP4, at most 12 MB and 120 seconds. Original preserved; poster is managed separately in Business Signup content.'
)
on conflict (profile_key) do nothing;

-- Signed uploads still originate exclusively from authenticated server routes.
-- The business video prepare route fixes its destination and requires content
-- permission; existing image routes retain their current validation ceilings.
update storage.buckets
set allowed_mime_types = case
      when allowed_mime_types is null then null
      else array(select distinct mime from unnest(allowed_mime_types || array['video/mp4']) as mime order by mime)
    end,
    file_size_limit = case
      when file_size_limit is null then null
      else greatest(file_size_limit, 12582912)
    end
where id in ('media-originals', 'content-media');

-- Seed only this new page. Existing founder edits are never overwritten.
with seed as (
  select $business_signup${
  "slug": "business-signup",
  "title": "Business Signup Landing Page",
  "hero_title": "Grow Your Beauty Business",
  "hero_subtitle": "Get discovered by more clients, manage your business all in one place, and be part of a supportive community built for beauty entrepreneurs.",
  "sections": [],
  "labels": {
    "business_signup": "{\"version\":1,\"header\":{\"logo\":{\"mode\":\"text\",\"text\":\"Girlz Culture\",\"image\":{\"src\":\"\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50},\"visible\":true,\"size\":\"standard\",\"alignment\":\"left\"},\"login\":{\"helperText\":\"Already have an account?\",\"label\":\"Log In\",\"href\":\"/business/login\",\"visible\":true}},\"hero\":{\"heading\":\"Grow Your Beauty Business\",\"supportingText\":\"Get discovered by more clients, manage your business all in one place, and be part of a supportive community built for beauty entrepreneurs.\",\"visible\":true,\"accent\":\"teal\",\"overlay\":\"medium\",\"height\":\"standard\",\"alignment\":\"left\",\"media\":{\"src\":\"/images/business/business-signup-hero.avif\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50,\"type\":\"image\",\"poster\":{\"src\":\"/images/business/business-signup-hero.avif\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50}}},\"selector\":{\"heading\":\"What’s Your Business?\",\"supportingText\":\"Select the category that best fits your business.\"},\"categories\":[{\"id\":\"hair-salon-braiding\",\"name\":\"Hair Salon & Braiding\",\"image\":{\"src\":\"/images/business/hair-service.avif\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50},\"visible\":true,\"order\":0,\"mode\":\"live_application\"},{\"id\":\"nail-studio\",\"name\":\"Nail Studio\",\"image\":{\"src\":\"/images/business/nails-service.avif\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50},\"visible\":true,\"order\":1,\"mode\":\"waitlist\"},{\"id\":\"massage-wellness\",\"name\":\"Massage & Wellness\",\"image\":{\"src\":\"/images/business/massage-service.avif\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50},\"visible\":true,\"order\":2,\"mode\":\"waitlist\"},{\"id\":\"aesthetics-clinic\",\"name\":\"Aesthetics Clinic\",\"image\":{\"src\":\"/images/business/facial-service.avif\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50},\"visible\":true,\"order\":3,\"mode\":\"waitlist\"},{\"id\":\"tattoo-studio\",\"name\":\"Tattoo Studio\",\"image\":{\"src\":\"/images/business/tattoo-service.avif\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50},\"visible\":true,\"order\":4,\"mode\":\"waitlist\"},{\"id\":\"lash-brow-bar\",\"name\":\"Lash & Brow Bar\",\"image\":{\"src\":\"/images/business/lashes-service.avif\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50},\"visible\":true,\"order\":5,\"mode\":\"waitlist\"},{\"id\":\"barbershop\",\"name\":\"Barbershop\",\"image\":{\"src\":\"/images/business/barber-service.avif\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50},\"visible\":true,\"order\":6,\"mode\":\"waitlist\"},{\"id\":\"other\",\"name\":\"Other\",\"image\":{\"src\":\"/images/business/other-service.avif\",\"alt\":\"\",\"fit\":\"cover\",\"focalX\":50,\"focalY\":50},\"visible\":true,\"order\":7,\"mode\":\"waitlist\"}],\"waitlist\":{\"eyebrow\":\"EARLY ACCESS\",\"heading\":\"Join the {businessType} Waitlist\",\"description\":\"We’re opening access to more beauty and wellness businesses in stages. Join the waitlist and we’ll reach out when onboarding opens for {businessType} businesses in your area.\",\"submitLabel\":\"Join the Waitlist\",\"successHeading\":\"You’re on the waitlist\",\"successDescription\":\"We’ve received your interest in {businessType}. We’ll email you when this category opens in your area.\",\"privacyText\":\"Join to receive an email when this category opens.\",\"supportText\":\"\"},\"trust\":[{\"id\":\"built-for-you\",\"icon\":\"gem\",\"heading\":\"A Platform Built for You\",\"description\":\"Designed for beauty and wellness businesses like yours.\",\"visible\":true,\"order\":0},{\"id\":\"safe-secure\",\"icon\":\"lock-keyhole\",\"heading\":\"Safe & Secure\",\"description\":\"Your data and business information are always protected.\",\"visible\":true,\"order\":1},{\"id\":\"community\",\"icon\":\"heart\",\"heading\":\"More Than a Platform\",\"description\":\"Join a growing community of entrepreneurs, creators, and professionals.\",\"visible\":true,\"order\":2}]}"
  },
  "page_group": "Marketing",
  "status": "Published",
  "is_enabled": true
}$business_signup$::jsonb as payload
)
insert into public.content_pages (slug,title,hero_title,hero_subtitle,sections,labels,page_group,status,is_enabled,publication_state,published_payload,published_at,updated_at)
select payload->>'slug', payload->>'title', payload->>'hero_title', payload->>'hero_subtitle', payload->'sections', payload->'labels', payload->>'page_group', 'Published', true, 'Published', payload, now(), now()
from seed
on conflict (slug) do nothing;

-- Keep the Engine deployment status aligned with this repository migration.
update public.engine_settings
set published_value='"20260910133806"'::jsonb,
    draft_value='"20260910133806"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

commit;
