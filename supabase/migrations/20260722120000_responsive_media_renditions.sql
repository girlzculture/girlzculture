begin;

alter table public.media_assets
  add column if not exists crop_metadata jsonb not null default '{}'::jsonb,
  add column if not exists renditions jsonb not null default '{}'::jsonb;

alter table public.media_assets
  drop constraint if exists media_assets_crop_metadata_shape,
  add constraint media_assets_crop_metadata_shape check (
    jsonb_typeof(crop_metadata) = 'object'
    and jsonb_typeof(renditions) = 'object'
  );

comment on column public.media_assets.crop_metadata is
  'Versioned source dimensions and per-device crop transforms used to render immutable upload outputs.';
comment on column public.media_assets.renditions is
  'Public URL, storage path, width, and height for desktop, tablet, and mobile rendered outputs.';

commit;
