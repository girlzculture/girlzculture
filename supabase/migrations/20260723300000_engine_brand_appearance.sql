-- Founder-controlled, versioned platform brand assets.

begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'platform-brand-assets',
  'platform-brand-assets',
  true,
  8388608,
  array['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon']
)
on conflict (id) do update set
  public=true,
  file_size_limit=8388608,
  allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.platform_brand_assets (
  asset_key text primary key,
  display_name text not null,
  guidance text not null default '',
  allowed_mime_types text[] not null default array['image/png','image/jpeg','image/webp'],
  min_width_px integer not null default 64,
  min_height_px integer not null default 64,
  max_bytes integer not null default 5242880,
  draft_url text,
  draft_storage_path text,
  draft_alt_text text not null default 'Girlz Culture',
  draft_focal_x numeric(5,2) not null default 50,
  draft_focal_y numeric(5,2) not null default 50,
  draft_width_px integer,
  draft_height_px integer,
  published_url text,
  published_storage_path text,
  published_alt_text text not null default 'Girlz Culture',
  published_focal_x numeric(5,2) not null default 50,
  published_focal_y numeric(5,2) not null default 50,
  published_width_px integer,
  published_height_px integer,
  published_version integer not null default 0,
  cache_version bigint not null default 0,
  published_at timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint platform_brand_asset_focal_check check (
    draft_focal_x between 0 and 100 and draft_focal_y between 0 and 100
    and published_focal_x between 0 and 100 and published_focal_y between 0 and 100
  )
);

create table if not exists public.platform_brand_asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_key text not null references public.platform_brand_assets(asset_key) on delete restrict,
  version integer not null,
  action text not null,
  source_version integer,
  public_url text not null,
  storage_path text not null,
  alt_text text not null,
  focal_x numeric(5,2) not null,
  focal_y numeric(5,2) not null,
  width_px integer,
  height_px integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(asset_key,version)
);

insert into public.platform_brand_assets(
  asset_key,display_name,guidance,allowed_mime_types,min_width_px,min_height_px,max_bytes
) values
('primary_header_logo','Primary header logo','Transparent PNG, WebP, or SVG. Recommended 640 × 180 px.',array['image/png','image/webp','image/svg+xml'],320,80,4194304),
('light_logo','Light logo','Use on plum or dark backgrounds. Transparent PNG, WebP, or SVG; 640 × 180 px recommended.',array['image/png','image/webp','image/svg+xml'],320,80,4194304),
('dark_logo','Dark logo','Use on cream or light backgrounds. Transparent PNG, WebP, or SVG; 640 × 180 px recommended.',array['image/png','image/webp','image/svg+xml'],320,80,4194304),
('mobile_logo','Mobile logo','Compact horizontal or square mark. Recommended 320 × 160 px.',array['image/png','image/webp','image/svg+xml'],160,80,3145728),
('favicon','Favicon','Square PNG, ICO, or SVG. Recommended 64 × 64 px or larger.',array['image/png','image/x-icon','image/svg+xml'],32,32,1048576),
('app_icon','Browser and app icon','Square PNG or WebP. Use at least 512 × 512 px with safe padding.',array['image/png','image/webp'],512,512,4194304),
('email_logo','Email logo','Transparent PNG or WebP. Recommended 600 × 180 px and under 1 MB.',array['image/png','image/webp'],300,80,1048576),
('social_share_image','Social-sharing image','Landscape PNG, JPEG, or WebP. Recommended 1200 × 630 px.',array['image/png','image/jpeg','image/webp'],1200,630,6291456)
on conflict (asset_key) do update set
  display_name=excluded.display_name,
  guidance=excluded.guidance,
  allowed_mime_types=excluded.allowed_mime_types,
  min_width_px=excluded.min_width_px,
  min_height_px=excluded.min_height_px,
  max_bytes=excluded.max_bytes;

alter table public.platform_brand_assets enable row level security;
alter table public.platform_brand_asset_versions enable row level security;
drop policy if exists platform_brand_assets_admin_read on public.platform_brand_assets;
create policy platform_brand_assets_admin_read on public.platform_brand_assets
for select to authenticated using (public.admin_has_permission('settings'));
drop policy if exists platform_brand_versions_admin_read on public.platform_brand_asset_versions;
create policy platform_brand_versions_admin_read on public.platform_brand_asset_versions
for select to authenticated using (public.admin_has_permission('settings'));
revoke all on table public.platform_brand_assets from anon,authenticated;
revoke all on table public.platform_brand_asset_versions from anon,authenticated;
grant select on table public.platform_brand_assets to authenticated;
grant select on table public.platform_brand_asset_versions to authenticated;

create or replace function public.prevent_brand_asset_version_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Brand asset versions are immutable.' using errcode='42501';
end $$;
revoke all on function public.prevent_brand_asset_version_mutation() from public,anon,authenticated;
drop trigger if exists platform_brand_asset_versions_immutable on public.platform_brand_asset_versions;
create trigger platform_brand_asset_versions_immutable
before update or delete on public.platform_brand_asset_versions
for each row execute function public.prevent_brand_asset_version_mutation();

commit;
