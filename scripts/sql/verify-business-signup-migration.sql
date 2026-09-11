-- Only for the isolated CLEAN_DATABASE_URL after the full migration chain.
-- Read-only assertions supplement the existing publication/RLS/onboarding suite.
begin transaction read only;
set local statement_timeout = '15s';

do $$
declare
  page_payload jsonb;
  page_config jsonb;
  category_ids text[];
begin
  select published_payload into strict page_payload
  from public.content_pages
  where slug = 'business-signup' and is_enabled and archived_at is null
    and publication_state = 'Published' and published_at is not null;

  if public.get_public_content_page('business-signup') is distinct from page_payload
    or jsonb_typeof(page_payload #> '{labels,business_signup}') is distinct from 'string'
  then raise exception 'Business signup must expose its published namespaced configuration'; end if;

  page_config := (page_payload #>> '{labels,business_signup}')::jsonb;
  if page_config ->> 'version' is distinct from '1'
    or page_config #>> '{hero,media,type}' is distinct from 'image'
    or page_config #>> '{hero,media,src}' is distinct from '/images/business/business-signup-hero.avif'
    or page_config #>> '{header,login,href}' is distinct from '/business/login'
  then raise exception 'Business signup initial configuration or published media is invalid'; end if;

  select array_agg(category ->> 'id' order by (category ->> 'order')::integer)
  into category_ids from jsonb_array_elements(page_config -> 'categories') category;
  if category_ids is distinct from array[
    'hair-salon-braiding', 'nail-studio', 'massage-wellness', 'aesthetics-clinic',
    'tattoo-studio', 'lash-brow-bar', 'barbershop', 'other'
  ] or exists (
    select 1 from jsonb_array_elements(page_config -> 'categories') category
    where category ->> 'mode' is distinct from
      case when category ->> 'id' = 'hair-salon-braiding' then 'live_application' else 'waitlist' end
  ) then raise exception 'Business signup seed changed the approved category destinations'; end if;

  if not exists (
    select 1 from public.media_upload_profiles
    where profile_key = 'business_hero_video' and max_bytes = 12582912
      and accepted_mime_types = array['video/mp4']::text[]
      and aspect_width = 16 and aspect_height = 9 and not safe_area_enabled
  ) then raise exception 'Scoped business hero MP4 upload profile is missing or incorrect'; end if;

  if (select count(*) from storage.buckets where id in ('media-originals', 'content-media')) <> 2
    or exists (
      select 1 from storage.buckets where id in ('media-originals', 'content-media')
        and ((allowed_mime_types is not null and not ('video/mp4' = any(allowed_mime_types)))
          or (file_size_limit is not null and file_size_limit < 12582912))
    )
  then raise exception 'Business hero storage destinations cannot accept the reviewed MP4 profile'; end if;
end;
$$;

rollback;
