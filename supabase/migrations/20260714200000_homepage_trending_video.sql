-- Admin-managed homepage rows and short-form Trending Now videos.

create table if not exists public.homepage_sections (
  section_key text primary key check (section_key in ('salons_near_you','featured_salons','trending_now','trending_picks')),
  title text not null,
  description text,
  is_visible boolean not null default true,
  sort_order smallint not null check (sort_order between 1 and 20),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.homepage_sections(section_key,title,description,is_visible,sort_order) values
  ('salons_near_you','Salons Near You','Discover trusted professionals ready to book.',true,1),
  ('featured_salons','Featured Salons','Handpicked top-rated salons near you.',true,2),
  ('trending_now','Trending Now','Fresh work and salon stories from Girlz Culture.',false,3),
  ('trending_picks','Trending Picks This Week','Popular appointments customers are booking now.',true,4)
on conflict (section_key) do nothing;

create table if not exists public.trending_videos (
  slot smallint primary key check (slot between 1 and 6),
  salon_id uuid references public.salons(id) on delete set null,
  video_url text not null,
  storage_path text not null,
  description text not null check (char_length(description) between 1 and 180),
  duration_seconds numeric(5,2) not null check (duration_seconds > 0 and duration_seconds <= 30.5),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 26214400),
  mime_type text not null check (mime_type in ('video/mp4','video/webm')),
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.homepage_sections enable row level security;
alter table public.trending_videos enable row level security;

drop policy if exists homepage_sections_public_read on public.homepage_sections;
create policy homepage_sections_public_read on public.homepage_sections for select using (true);
drop policy if exists homepage_sections_admin_write on public.homepage_sections;
create policy homepage_sections_admin_write on public.homepage_sections for all to authenticated
using (public.admin_has_permission('marketing')) with check (public.admin_has_permission('marketing'));

drop policy if exists trending_videos_public_read on public.trending_videos;
create policy trending_videos_public_read on public.trending_videos for select using (true);
drop policy if exists trending_videos_admin_write on public.trending_videos;
create policy trending_videos_admin_write on public.trending_videos for all to authenticated
using (public.admin_has_permission('marketing')) with check (public.admin_has_permission('marketing'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('trending-videos','trending-videos',true,26214400,array['video/mp4','video/webm'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists trending_video_public_read on storage.objects;
create policy trending_video_public_read on storage.objects for select using (bucket_id='trending-videos');
drop policy if exists trending_video_admin_insert on storage.objects;
create policy trending_video_admin_insert on storage.objects for insert to authenticated
with check (bucket_id='trending-videos' and public.admin_has_permission('marketing'));
drop policy if exists trending_video_admin_update on storage.objects;
create policy trending_video_admin_update on storage.objects for update to authenticated
using (bucket_id='trending-videos' and public.admin_has_permission('marketing'))
with check (bucket_id='trending-videos' and public.admin_has_permission('marketing'));
drop policy if exists trending_video_admin_delete on storage.objects;
create policy trending_video_admin_delete on storage.objects for delete to authenticated
using (bucket_id='trending-videos' and public.admin_has_permission('marketing'));

create index if not exists trending_videos_salon_idx on public.trending_videos(salon_id) where salon_id is not null;
