-- Unified, auditable media inventory and configurable placement rules.
create table if not exists public.media_upload_profiles (
  profile_key text primary key,
  display_name text not null,
  aspect_width integer not null check (aspect_width > 0),
  aspect_height integer not null check (aspect_height > 0),
  min_width_px integer not null check (min_width_px > 0),
  min_height_px integer not null check (min_height_px > 0),
  output_width_px integer not null check (output_width_px > 0),
  max_bytes bigint not null check (max_bytes between 102400 and 12582912),
  accepted_mime_types text[] not null default array['image/jpeg','image/png'],
  safe_area_enabled boolean not null default false,
  help_text text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.media_upload_profiles(profile_key,display_name,aspect_width,aspect_height,min_width_px,min_height_px,output_width_px,max_bytes,safe_area_enabled,help_text) values
('logo','Square logo',1,1,400,400,900,3145728,false,'Shown in salon and dashboard identity surfaces.'),
('cover','Salon cover',16,7,1200,525,1920,4194304,true,'Wide public-profile hero. Keep important subjects inside the safe area.'),
('gallery','Gallery and card image',4,3,800,600,1600,4194304,false,'Salon work, space, and general gallery media.'),
('avatar','Profile portrait',1,1,400,400,900,3145728,true,'Stylist, customer, team, or administrator portrait.'),
('service','Service card',4,3,800,600,1600,4194304,false,'A real example of the listed service.'),
('product','Product card',1,1,700,700,1200,4194304,false,'Square product image.'),
('review','Review result',4,3,600,450,1400,4194304,false,'Customer result photo for a completed booking.'),
('content','Editorial image',16,9,1200,675,1920,4194304,true,'Homepage, page, blog, and campaign editorial placement.')
on conflict (profile_key) do nothing;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  object_path text not null,
  public_url text not null,
  media_kind text not null references public.media_upload_profiles(profile_key),
  owner_user_id uuid not null references auth.users(id),
  salon_id uuid references public.salons(id) on delete set null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  width_px integer,
  height_px integer,
  duration_seconds numeric,
  poster_url text,
  checksum_sha256 text,
  status text not null default 'Staged' check (status in ('Staged','Attached','Archived','Quarantined')),
  attached_record_type text,
  attached_record_id text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique(bucket_id, object_path),
  unique(public_url)
);
create index if not exists media_assets_owner_status_idx on public.media_assets(owner_user_id,status,created_at desc);
create index if not exists media_assets_salon_status_idx on public.media_assets(salon_id,status,created_at desc) where salon_id is not null;

alter table public.media_upload_profiles enable row level security;
alter table public.media_assets enable row level security;
drop policy if exists media_profiles_public_read on public.media_upload_profiles;
create policy media_profiles_public_read on public.media_upload_profiles for select using (is_active or public.is_admin());
drop policy if exists media_profiles_admin_write on public.media_upload_profiles;
create policy media_profiles_admin_write on public.media_upload_profiles for all to authenticated using (public.admin_has_permission('settings')) with check (public.admin_has_permission('settings'));
drop policy if exists media_assets_owner_read on public.media_assets;
create policy media_assets_owner_read on public.media_assets for select to authenticated using (owner_user_id=auth.uid() or public.is_admin() or (salon_id is not null and public.salon_has_permission(salon_id,'photos')));
drop policy if exists media_assets_admin_write on public.media_assets;
create policy media_assets_admin_write on public.media_assets for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Storage enforces the final optimized upload ceiling and declared formats too.
update storage.buckets set file_size_limit=4194304, allowed_mime_types=array['image/jpeg','image/png'] where id in ('salon-photos','stylist-photos','style-photos','review-photos','content-media');

insert into public.admin_settings(key,value)
values ('media_staged_retention',jsonb_build_object('hours',24,'cleanup_enabled',true))
on conflict (key) do nothing;

create or replace function public.attach_registered_media()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_record_id text;
begin
  v_record_id := coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'slug','');
  update public.media_assets
  set status='Attached', attached_record_type=tg_table_name, attached_record_id=v_record_id, archived_at=null
  where status='Staged' and strpos(to_jsonb(new)::text, public_url)>0;
  return new;
end $$;
revoke all on function public.attach_registered_media() from public,anon,authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['salons','styles','stylists','salon_products','reviews','content_pages','blog_posts','homepage_sections'] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('drop trigger if exists attach_registered_media on public.%I',table_name);
      execute format('create trigger attach_registered_media after insert or update on public.%I for each row execute function public.attach_registered_media()',table_name);
    end if;
  end loop;
end $$;
