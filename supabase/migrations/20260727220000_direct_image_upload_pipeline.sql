begin;

-- Keep original customer/salon uploads outside the public rendition buckets.
-- Browser uploads use short-lived, path-scoped signed upload tokens created by
-- the authenticated application route; no broad client Storage policy is added.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'media-originals',
  'media-originals',
  false,
  12582912,
  array['image/jpeg','image/png','image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.media_assets
  add column if not exists source_bucket_id text,
  add column if not exists source_object_path text,
  add column if not exists source_mime_type text,
  add column if not exists source_file_size_bytes bigint,
  add column if not exists source_width_px integer,
  add column if not exists source_height_px integer,
  add column if not exists source_checksum_sha256 text;

comment on column public.media_assets.source_object_path is
  'Private preserved source object. Public delivery must use the renditions map.';

create table if not exists public.media_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  salon_id uuid references public.salons(id) on delete cascade,
  destination_bucket text not null,
  destination_folder text not null default '',
  media_kind text not null references public.media_upload_profiles(profile_key),
  expected_objects jsonb not null default '{}'::jsonb
    check (jsonb_typeof(expected_objects) = 'object'),
  crop_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(crop_metadata) = 'object'),
  attachment jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attachment) = 'object'),
  status text not null default 'Prepared'
    check (status in ('Prepared','Finalized','Failed','Expired')),
  failure_code text,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  finalized_asset_id uuid references public.media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_upload_sessions_owner_status_idx
  on public.media_upload_sessions(owner_user_id, status, created_at desc);
create index if not exists media_upload_sessions_expiry_idx
  on public.media_upload_sessions(expires_at)
  where status = 'Prepared';

alter table public.media_upload_sessions enable row level security;

drop policy if exists media_upload_sessions_owner_read
  on public.media_upload_sessions;
create policy media_upload_sessions_owner_read
  on public.media_upload_sessions
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists media_upload_sessions_admin_write
  on public.media_upload_sessions;
-- Upload sessions are mutated only by server routes using the service role.
-- Authenticated owners and administrators can inspect their permitted rows,
-- but no browser role receives a write policy for tokens/session metadata.

create or replace function public.finalize_media_upload_session(
  p_session_id uuid,
  p_verified_objects jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_session public.media_upload_sessions;
  v_asset public.media_assets;
  v_source jsonb;
  v_desktop jsonb;
  v_renditions jsonb;
  v_attachment jsonb;
  v_record_type text;
  v_record_id uuid;
  v_field text;
  v_attached boolean := false;
  v_existing_url text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select *
    into v_session
  from public.media_upload_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Upload session not found' using errcode = 'P0002';
  end if;

  if v_session.status = 'Finalized' then
    select * into v_asset
    from public.media_assets
    where id = v_session.finalized_asset_id;

    return jsonb_build_object(
      'asset_id', v_asset.id,
      'url', v_asset.public_url,
      'status', v_asset.status,
      'attached', v_asset.status = 'Attached'
    );
  end if;

  if v_session.status <> 'Prepared' or v_session.expires_at <= now() then
    raise exception 'Upload session is no longer available'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_verified_objects, '{}'::jsonb)) <> 'object' then
    raise exception 'Verified media payload must be an object'
      using errcode = '22023';
  end if;

  v_source := p_verified_objects -> 'source';
  v_renditions := p_verified_objects -> 'renditions';
  v_desktop := v_renditions -> 'desktop';

  if coalesce(v_source ->> 'bucket', '') <> 'media-originals'
     or coalesce(v_source ->> 'path', '') <>
        coalesce(v_session.expected_objects -> 'source' ->> 'path', '')
     or coalesce(v_desktop ->> 'bucket', '') <> v_session.destination_bucket
     or coalesce(v_desktop ->> 'path', '') <>
        coalesce(v_session.expected_objects -> 'desktop' ->> 'path', '') then
    raise exception 'Verified media paths do not match the prepared upload'
      using errcode = '22023';
  end if;

  insert into public.media_assets (
    bucket_id,
    object_path,
    public_url,
    media_kind,
    owner_user_id,
    salon_id,
    mime_type,
    file_size_bytes,
    width_px,
    height_px,
    checksum_sha256,
    status,
    crop_metadata,
    renditions,
    source_bucket_id,
    source_object_path,
    source_mime_type,
    source_file_size_bytes,
    source_width_px,
    source_height_px,
    source_checksum_sha256
  ) values (
    v_session.destination_bucket,
    v_desktop ->> 'path',
    v_desktop ->> 'url',
    v_session.media_kind,
    v_session.owner_user_id,
    v_session.salon_id,
    v_desktop ->> 'mime_type',
    (v_desktop ->> 'file_size_bytes')::bigint,
    (v_desktop ->> 'width')::integer,
    (v_desktop ->> 'height')::integer,
    v_desktop ->> 'checksum_sha256',
    'Staged',
    v_session.crop_metadata,
    v_renditions,
    v_source ->> 'bucket',
    v_source ->> 'path',
    v_source ->> 'mime_type',
    (v_source ->> 'file_size_bytes')::bigint,
    (v_source ->> 'width')::integer,
    (v_source ->> 'height')::integer,
    v_source ->> 'checksum_sha256'
  )
  returning * into v_asset;

  v_attachment := coalesce(v_session.attachment, '{}'::jsonb);
  v_record_type := nullif(v_attachment ->> 'record_type', '');
  v_field := nullif(v_attachment ->> 'field', '');

  if nullif(v_attachment ->> 'record_id', '') is not null then
    begin
      v_record_id := (v_attachment ->> 'record_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Prepared attachment identifier is invalid'
        using errcode = '22023';
    end;
  end if;

  if v_record_type = 'salon'
     and v_record_id = v_session.salon_id
     and v_field = 'logo_url' then
    select logo_url into v_existing_url
    from public.salons
    where id = v_record_id;
    update public.salons
      set logo_url = v_asset.public_url
    where id = v_record_id;
    v_attached := found;
  elsif v_record_type = 'salon'
     and v_record_id = v_session.salon_id
     and v_field = 'cover_photo_url' then
    select cover_photo_url into v_existing_url
    from public.salons
    where id = v_record_id;
    update public.salons
      set cover_photo_url = v_asset.public_url
    where id = v_record_id;
    v_attached := found;
  elsif v_record_type = 'salon'
     and v_record_id = v_session.salon_id
     and v_field = 'gallery_photos' then
    update public.salons
      set gallery_photos = case
        when coalesce(gallery_photos, '[]'::jsonb)
             @> jsonb_build_array(v_asset.public_url)
          then coalesce(gallery_photos, '[]'::jsonb)
        else coalesce(gallery_photos, '[]'::jsonb)
             || jsonb_build_array(v_asset.public_url)
      end
    where id = v_record_id;
    v_attached := found;
  elsif v_record_type = 'style' and v_field = 'photos' then
    update public.styles
      set photos = case
        when coalesce(photos, '[]'::jsonb)
             @> jsonb_build_array(v_asset.public_url)
          then coalesce(photos, '[]'::jsonb)
        else coalesce(photos, '[]'::jsonb)
             || jsonb_build_array(v_asset.public_url)
      end
    where id = v_record_id
      and salon_id = v_session.salon_id;
    v_attached := found;
  elsif v_record_type = 'stylist' and v_field = 'avatar_url' then
    select avatar_url into v_existing_url
    from public.stylists
    where id = v_record_id
      and salon_id = v_session.salon_id;
    update public.stylists
      set avatar_url = v_asset.public_url
    where id = v_record_id
      and salon_id = v_session.salon_id;
    v_attached := found;
  elsif v_record_type = 'stylist' and v_field = 'photos' then
    update public.stylists
      set photos = case
        when coalesce(photos, '[]'::jsonb)
             @> jsonb_build_array(v_asset.public_url)
          then coalesce(photos, '[]'::jsonb)
        else coalesce(photos, '[]'::jsonb)
             || jsonb_build_array(v_asset.public_url)
      end
    where id = v_record_id
      and salon_id = v_session.salon_id;
    v_attached := found;
  elsif v_record_type = 'product' and v_field = 'images' then
    update public.salon_products
      set images = case
        when coalesce(images, '[]'::jsonb)
             @> jsonb_build_array(v_asset.public_url)
          then coalesce(images, '[]'::jsonb)
        else coalesce(images, '[]'::jsonb)
             || jsonb_build_array(v_asset.public_url)
      end,
      photo_url = coalesce(nullif(photo_url, ''), v_asset.public_url)
    where id = v_record_id
      and salon_id = v_session.salon_id;
    v_attached := found;
  elsif v_record_type is not null then
    raise exception 'Prepared media attachment is not supported'
      using errcode = '22023';
  end if;

  if v_record_type is not null and not v_attached then
    raise exception 'Prepared media attachment record was not found'
      using errcode = 'P0002';
  end if;

  if v_attached then
    update public.media_assets
      set status = 'Attached',
          attached_record_type = case v_record_type
            when 'salon' then 'salons'
            when 'style' then 'styles'
            when 'stylist' then 'stylists'
            when 'product' then 'salon_products'
          end,
          attached_record_id = v_record_id::text,
          archived_at = null
    where id = v_asset.id
    returning * into v_asset;

    if nullif(v_existing_url, '') is not null
       and v_existing_url <> v_asset.public_url then
      update public.media_assets
        set status = 'Archived',
            archived_at = now()
      where public_url = v_existing_url
        and salon_id is not distinct from v_session.salon_id
        and status = 'Attached';
    end if;
  end if;

  update public.media_upload_sessions
    set status = 'Finalized',
        finalized_asset_id = v_asset.id,
        updated_at = now()
  where id = v_session.id;

  return jsonb_build_object(
    'asset_id', v_asset.id,
    'url', v_asset.public_url,
    'status', v_asset.status,
    'attached', v_attached,
    'record_type', v_record_type,
    'record_id', v_record_id,
    'field', v_field
  );
end;
$$;

revoke all on function public.finalize_media_upload_session(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_media_upload_session(uuid,jsonb)
  to service_role;

commit;
