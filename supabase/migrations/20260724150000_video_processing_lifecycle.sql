begin;

alter table public.video_processing_jobs
  add column if not exists source_cleanup_after timestamptz,
  add column if not exists source_cleaned_at timestamptz,
  add column if not exists source_cleanup_status text not null default 'Retained',
  add column if not exists original_preserved boolean not null default true;

alter table public.trending_video_campaigns
  add column if not exists video_processing_job_id uuid
  references public.video_processing_jobs(id) on delete set null;

create index if not exists trending_campaigns_processing_job_idx
  on public.trending_video_campaigns(video_processing_job_id)
  where video_processing_job_id is not null;

alter table public.video_processing_jobs
  drop constraint if exists video_processing_jobs_source_cleanup_status_check;
alter table public.video_processing_jobs
  add constraint video_processing_jobs_source_cleanup_status_check
  check(source_cleanup_status in ('Retained','Scheduled','Removed','Failed'));

create index if not exists video_processing_jobs_cleanup_idx
  on public.video_processing_jobs(source_cleanup_after)
  where source_cleanup_status='Scheduled';

update storage.buckets
set file_size_limit=104857600,
    allowed_mime_types=array[
      'video/mp4','video/webm','video/quicktime','video/x-m4v',
      'video/x-matroska','image/jpeg'
    ]
where id='trending-videos';

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,
  draft_value,published_value,status,impact_level,validation,help_text,
  impact_description,is_public,is_secret_status,sort_order,affected_surfaces
)
values
(
  'media.video_failed_source_retention_hours',
  'media_uploads',
  'Failed video source retention',
  'Hours an original video is retained after processing fails so an authorized admin can retry.',
  'number','168','168','Published','standard',
  '{"min":24,"max":720,"integer":true}',
  'The scheduled media cleanup removes only governed incoming objects after this window.',
  'Affects failed or abandoned Trending Picks source videos; published media is not removed.',
  false,false,70,array['Trending Picks','Media cleanup','System Status']
),
(
  'media.video_cancelled_source_retention_hours',
  'media_uploads',
  'Cancelled video source retention',
  'Hours a cancelled incoming video is retained before governed cleanup.',
  'number','24','24','Published','standard',
  '{"min":1,"max":168,"integer":true}',
  'Cancellation prevents publication immediately. Cleanup is delayed to avoid destructive races.',
  'Affects cancelled Trending Picks processing jobs.',
  false,false,80,array['Trending Picks','Media cleanup']
)
on conflict(setting_key) do update set
  description=excluded.description,
  validation=excluded.validation,
  help_text=excluded.help_text,
  impact_description=excluded.impact_description,
  affected_surfaces=excluded.affected_surfaces;

commit;
