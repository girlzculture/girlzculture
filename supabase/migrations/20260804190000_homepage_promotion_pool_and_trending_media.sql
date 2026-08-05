begin;

-- Repair only the homepage promotion collection. Keep every distinct current
-- card, remove duplicate identities, and fill a damaged/short pool with
-- clearly editorial (non-paid, non-local-business) fallbacks. A valid custom
-- pool above eight cards remains the administrator's configured size.
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
  v_target integer := 8;
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
         greatest(1, least(20, case
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
        when v_card ->> 'association_type' = 'campaign' and nullif(v_card ->> 'campaign_id', '') is not null
          then 'campaign:' || lower(v_card ->> 'campaign_id')
        when v_card ->> 'association_type' = 'salon' and nullif(v_card ->> 'salon_id', '') is not null
          then 'salon:' || lower(v_card ->> 'salon_id')
        else 'editorial:' || lower(coalesce(v_card ->> 'href', '')) || '|' || lower(coalesce(v_card ->> 'media_url', ''))
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
    exit when jsonb_array_length(v_unique) >= v_target;
    v_key := 'editorial:' || lower(v_card ->> 'href') || '|' || lower(v_card ->> 'media_url');
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

-- Resolve the bounded national source pool in one query. Every returned row
-- must match an exact (type,id) tuple supplied by the caller; the function
-- never broadens a salon request into campaigns (or vice versa), and retains
-- the same marketplace, entitlement, schedule, and coordinate gates as the
-- single-target compatibility resolver.
create or replace function public.resolve_homepage_promotion_targets(
  p_targets jsonb
) returns table(
  target_type text,
  target_id uuid,
  salon_id uuid,
  campaign_id uuid,
  salon_name text,
  salon_slug text,
  cover_photo_url text,
  address_city text,
  address_state text,
  target_latitude double precision,
  target_longitude double precision,
  radius_miles numeric
)
language sql
stable
security definer
set search_path = public
rows 200
as $$
  with parsed as (
    select
      lower(trim(item.value ->> 'target_type')) as target_type,
      case
        when coalesce(item.value ->> 'target_id', '') ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (item.value ->> 'target_id')::uuid
        else null::uuid
      end as target_id
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(p_targets, '[]'::jsonb)) = 'array'
          then coalesce(p_targets, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) with ordinality as item(value, ordinal)
    where item.ordinal <= 200
  ), requested as (
    select distinct parsed.target_type, parsed.target_id
    from parsed
    where parsed.target_type in ('salon', 'campaign')
      and parsed.target_id is not null
  ), salon_targets as (
    select
      'salon'::text as target_type,
      salon.id as target_id,
      salon.id as salon_id,
      null::uuid as campaign_id,
      salon.name as salon_name,
      salon.slug as salon_slug,
      salon.cover_photo_url,
      salon.address_city,
      salon.address_state,
      salon.latitude::double precision as target_latitude,
      salon.longitude::double precision as target_longitude,
      25::numeric as radius_miles
    from requested
    join public.salons salon
      on requested.target_type = 'salon'
      and salon.id = requested.target_id
    where salon.slug is not null
      and salon.latitude is not null
      and salon.longitude is not null
      and public.is_marketplace_visible(salon.id)
  ), campaign_targets as (
    select
      'campaign'::text as target_type,
      campaign.id as target_id,
      salon.id as salon_id,
      campaign.id as campaign_id,
      salon.name as salon_name,
      salon.slug as salon_slug,
      salon.cover_photo_url,
      salon.address_city,
      salon.address_state,
      salon.latitude::double precision as target_latitude,
      salon.longitude::double precision as target_longitude,
      campaign.radius_miles
    from requested
    join public.featured_salon_campaigns campaign
      on requested.target_type = 'campaign'
      and campaign.id = requested.target_id
    left join public.marketing_entitlements entitlement
      on entitlement.id = campaign.entitlement_id
      and entitlement.salon_id = campaign.salon_id
    join public.salons salon on salon.id = campaign.salon_id
    where campaign.status in ('Active', 'Scheduled')
      and campaign.starts_at <= now()
      and campaign.ends_at > now()
      and (
        (
          campaign.placement_basis = 'complimentary_admin'
          and campaign.complimentary_approved_by is not null
          and char_length(trim(coalesce(campaign.complimentary_reason, ''))) >= 5
        )
        or
        (
          campaign.placement_basis = 'paid'
          and entitlement.placement_type = 'Featured Salon'
          and entitlement.status in ('Paid', 'Credited')
          and entitlement.valid_from <= now()
          and (entitlement.valid_until is null or entitlement.valid_until > now())
        )
      )
      and salon.slug is not null
      and salon.latitude is not null
      and salon.longitude is not null
      and public.is_marketplace_visible(salon.id)
  )
  select * from salon_targets
  union all
  select * from campaign_targets
$$;

revoke all on function public.resolve_homepage_promotion_targets(jsonb)
  from public;
grant execute on function public.resolve_homepage_promotion_targets(jsonb)
  to anon, authenticated, service_role;

update public.engine_settings
set published_value='"20260804190000"'::jsonb,
    draft_value='"20260804190000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst, 'reload schema';
commit;
