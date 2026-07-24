-- Audited media-processing jobs for browser-incompatible Trending MP4 inputs.

create table if not exists public.media_video_profiles (
  profile_key text primary key,
  display_name text not null,
  max_source_bytes bigint not null check(max_source_bytes between 1048576 and 524288000),
  max_duration_seconds numeric(8,2) not null check(max_duration_seconds between 1 and 600),
  max_width_px integer not null check(max_width_px between 320 and 7680),
  max_height_px integer not null check(max_height_px between 240 and 7680),
  output_video_codec text not null default 'h264',
  output_audio_codec text not null default 'aac',
  output_container text not null default 'mp4',
  poster_format text not null default 'jpeg',
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.media_video_profiles(
  profile_key,display_name,max_source_bytes,max_duration_seconds,
  max_width_px,max_height_px
) values ('trending','Trending Picks video',104857600,30,3840,2160)
on conflict(profile_key) do nothing;

create table if not exists public.video_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null references public.media_video_profiles(profile_key),
  requested_by uuid references auth.users(id) on delete set null,
  salon_id uuid references public.salons(id) on delete set null,
  source_bucket text not null default 'trending-videos',
  source_path text not null,
  source_mime_type text not null,
  source_size_bytes bigint not null check(source_size_bytes > 0),
  detected_container text,
  detected_video_codec text,
  detected_audio_codec text,
  width_px integer,
  height_px integer,
  duration_seconds numeric(8,2),
  status text not null default 'Uploaded'
    check(status in ('Uploaded','Inspecting','Transcoding','Ready','Failed','Cancelled')),
  progress_percent integer not null default 0 check(progress_percent between 0 and 100),
  output_bucket text,
  output_path text,
  output_url text,
  poster_path text,
  poster_url text,
  output_size_bytes bigint,
  attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  provider_job_id text,
  safe_error_code text,
  error_reference text,
  cancellation_requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_bucket,source_path)
);
create index if not exists video_processing_jobs_status_created_idx
  on public.video_processing_jobs(status,created_at desc);
create index if not exists video_processing_jobs_salon_created_idx
  on public.video_processing_jobs(salon_id,created_at desc)
  where salon_id is not null;

alter table public.media_video_profiles enable row level security;
alter table public.video_processing_jobs enable row level security;
drop policy if exists media_video_profiles_read on public.media_video_profiles;
create policy media_video_profiles_read on public.media_video_profiles
  for select to authenticated using(true);
drop policy if exists media_video_profiles_admin_manage on public.media_video_profiles;
create policy media_video_profiles_admin_manage on public.media_video_profiles
  for all to authenticated
  using(public.admin_has_permission('settings'))
  with check(public.admin_has_permission('settings'));
drop policy if exists video_processing_jobs_admin_manage on public.video_processing_jobs;
create policy video_processing_jobs_admin_manage on public.video_processing_jobs
  for all to authenticated
  using(public.admin_has_permission('marketing'))
  with check(public.admin_has_permission('marketing'));

update storage.buckets
set file_size_limit=104857600,
    allowed_mime_types=array['video/mp4','video/webm','image/jpeg']
where id='trending-videos';

comment on table public.video_processing_jobs is
  'Server-governed inspection/transcoding ledger. Raw provider errors and credentials are never stored.';

