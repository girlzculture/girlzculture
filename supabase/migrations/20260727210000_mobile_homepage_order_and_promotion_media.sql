-- Mobile homepage correction and authoritative promotional composition.
--
-- Forward-only:
-- * preserves every existing content page, promotion card and marketplace row;
-- * adds the promotion rail to the existing homepage ordering contract;
-- * normalizes the six known homepage positions before enforcing uniqueness;
-- * publishes the four launch-critical rows atomically with an audit record;
-- * permits animated GIFs only in the admin-owned editorial media bucket.

begin;

alter table public.homepage_sections
  drop constraint if exists homepage_sections_section_key_check;
alter table public.homepage_sections
  add constraint homepage_sections_section_key_check
  check (
    section_key in (
      'promo_rail',
      'salons_near_you',
      'featured_salons',
      'trending_now',
      'trending_picks',
      'featured_products'
    )
  );

insert into public.homepage_sections(
  section_key,title,description,is_visible,sort_order,updated_at
) values (
  'promo_rail','Featured',null,true,1,now()
)
on conflict(section_key) do nothing;

-- Use temporary non-conflicting positions so this is safe even when the
-- historical product and Trending Picks rows both have position four.
update public.homepage_sections
set sort_order = case section_key
  when 'promo_rail' then 11
  when 'salons_near_you' then 12
  when 'featured_salons' then 13
  when 'trending_picks' then 14
  when 'featured_products' then 15
  when 'trending_now' then 16
  else sort_order
end,
updated_at = now()
where section_key in (
  'promo_rail','salons_near_you','featured_salons',
  'trending_picks','featured_products','trending_now'
);

update public.homepage_sections
set sort_order = case section_key
  when 'promo_rail' then 1
  when 'salons_near_you' then 2
  when 'featured_salons' then 3
  when 'trending_picks' then 4
  when 'featured_products' then 5
  when 'trending_now' then 6
  else sort_order
end,
description = case
  when section_key in ('salons_near_you','featured_salons','trending_picks')
    then null
  else description
end,
updated_at = now()
where section_key in (
  'promo_rail','salons_near_you','featured_salons',
  'trending_picks','featured_products','trending_now'
);

create unique index if not exists homepage_sections_unique_position
  on public.homepage_sections(sort_order);

create or replace function public.admin_publish_homepage_section_order(
  p_actor_user_id uuid,
  p_sections jsonb
)
returns setof public.homepage_sections
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_allowed boolean;
  v_before jsonb;
  v_after jsonb;
  v_count integer;
  v_distinct_count integer;
begin
  select exists (
    select 1
    from public.admin_users admin_user
    where coalesce(admin_user.user_id, admin_user.id) = p_actor_user_id
      and admin_user.status = 'Active'
      and (
        coalesce(admin_user.is_super_admin,false)
        or coalesce((admin_user.permissions->>'marketing')::boolean,false)
      )
  ) into v_allowed;
  if not v_allowed then raise exception 'Forbidden'; end if;

  if jsonb_typeof(p_sections) <> 'array' then
    raise exception 'Homepage section order must be an array.';
  end if;

  select count(*), count(distinct item->>'section_key')
  into v_count, v_distinct_count
  from jsonb_array_elements(p_sections) item;
  if v_count <> 4 or v_distinct_count <> 4 then
    raise exception 'All four required homepage sections must appear exactly once.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_sections) item
    where item->>'section_key' not in (
      'promo_rail','salons_near_you','featured_salons','trending_picks'
    )
      or length(trim(coalesce(item->>'title',''))) not between 1 and 90
  ) or exists (
    select required.key
    from unnest(array[
      'promo_rail','salons_near_you','featured_salons','trending_picks'
    ]) required(key)
    where not exists (
      select 1
      from jsonb_array_elements(p_sections) item
      where item->>'section_key' = required.key
    )
  ) then
    raise exception 'Homepage section order contains an invalid or missing section.';
  end if;

  lock table public.homepage_sections in exclusive mode;

  select jsonb_agg(to_jsonb(section_row) order by section_row.sort_order)
  into v_before
  from public.homepage_sections section_row
  where section_row.section_key in (
    'promo_rail','salons_near_you','featured_salons','trending_picks'
  );

  update public.homepage_sections
  set sort_order = case section_key
    when 'promo_rail' then 11
    when 'salons_near_you' then 12
    when 'featured_salons' then 13
    when 'trending_picks' then 14
    when 'featured_products' then 15
    when 'trending_now' then 16
    else sort_order
  end
  where section_key in (
    'promo_rail','salons_near_you','featured_salons',
    'trending_picks','featured_products','trending_now'
  );

  with requested as (
    select
      item->>'section_key' section_key,
      trim(item->>'title') title,
      coalesce((item->>'is_visible')::boolean,true) is_visible,
      ordinality::smallint sort_order
    from jsonb_array_elements(p_sections) with ordinality source(item,ordinality)
  )
  update public.homepage_sections destination
  set title = requested.title,
      description = null,
      is_visible = requested.is_visible,
      sort_order = requested.sort_order,
      updated_by = p_actor_user_id,
      updated_at = now()
  from requested
  where destination.section_key = requested.section_key;

  update public.homepage_sections
  set sort_order = case section_key
    when 'featured_products' then 5
    when 'trending_now' then 6
    else sort_order
  end,
  updated_at = now()
  where section_key in ('featured_products','trending_now');

  select jsonb_agg(to_jsonb(section_row) order by section_row.sort_order)
  into v_after
  from public.homepage_sections section_row
  where section_row.section_key in (
    'promo_rail','salons_near_you','featured_salons','trending_picks'
  );

  insert into public.record_management_events(
    record_type,record_id,record_label,action,dependency_summary,
    before_values,after_values,reason,acting_user_id,acting_scope
  ) values (
    'homepage_section_order','homepage','Homepage section order','Updated',
    jsonb_build_object('required_sections',4,'shared_across_devices',true),
    v_before,v_after,'Saved and published from Homepage Marketing',
    p_actor_user_id,'platform_admin'
  );

  return query
  select section_row.*
  from public.homepage_sections section_row
  where section_row.section_key in (
    'promo_rail','salons_near_you','featured_salons','trending_picks'
  )
  order by section_row.sort_order;
end
$$;

revoke all on function public.admin_publish_homepage_section_order(uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.admin_publish_homepage_section_order(uuid,jsonb)
  to service_role;

-- Resolve public promotion associations without exposing private campaign or
-- salon records. Campaigns must be inside their paid active window and their
-- salon must still satisfy the single authoritative marketplace predicate.
create or replace function public.resolve_homepage_promotion_target(
  p_target_type text,
  p_target_id uuid
)
returns table(
  target_type text,
  target_id uuid,
  salon_id uuid,
  campaign_id uuid,
  salon_name text,
  salon_slug text,
  cover_photo_url text,
  address_city text,
  address_state text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    'salon'::text,
    salon.id,
    salon.id,
    null::uuid,
    salon.name,
    salon.slug,
    salon.cover_photo_url,
    salon.address_city,
    salon.address_state
  from public.salons salon
  where lower(trim(p_target_type)) = 'salon'
    and salon.id = p_target_id
    and salon.slug is not null
    and public.is_marketplace_visible(salon.id)
  union all
  select
    'campaign'::text,
    campaign.id,
    salon.id,
    campaign.id,
    salon.name,
    salon.slug,
    salon.cover_photo_url,
    salon.address_city,
    salon.address_state
  from public.featured_salon_campaigns campaign
  join public.marketing_entitlements entitlement
    on entitlement.id = campaign.entitlement_id
    and entitlement.salon_id = campaign.salon_id
    and entitlement.placement_type = 'Featured Salon'
    and entitlement.status in ('Paid','Credited')
    and entitlement.valid_from <= now()
    and (entitlement.valid_until is null or entitlement.valid_until > now())
  join public.salons salon on salon.id = campaign.salon_id
  where lower(trim(p_target_type)) = 'campaign'
    and campaign.id = p_target_id
    and campaign.status in ('Active','Scheduled')
    and campaign.starts_at <= now()
    and campaign.ends_at > now()
    and salon.slug is not null
    and public.is_marketplace_visible(salon.id)
  limit 1
$$;

revoke all on function public.resolve_homepage_promotion_target(text,uuid)
  from public;
grant execute on function public.resolve_homepage_promotion_target(text,uuid)
  to anon,authenticated,service_role;
grant execute on function public.is_marketplace_visible(uuid)
  to service_role;

update public.media_upload_profiles
set accepted_mime_types = array['image/jpeg','image/png','image/gif'],
    max_bytes = greatest(max_bytes,8388608),
    help_text = 'Homepage, page, blog, and campaign editorial placement. JPG and PNG receive device-specific crops; animated GIFs preserve their animation and preview in each device frame.',
    updated_at = now()
where profile_key = 'content';

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg','image/png','image/gif']
where id = 'content-media';

update public.engine_settings
set published_value = '"20260727210000"'::jsonb,
    draft_value = '"20260727210000"'::jsonb,
    updated_at = now()
where setting_key = 'integrations.expected_migration';

commit;
