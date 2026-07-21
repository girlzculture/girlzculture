-- Permit admin-generated poster frames in the existing governed Trending media bucket.
-- Existing marketing-permission storage policies continue to enforce ownership/access.
update storage.buckets
set allowed_mime_types = array['video/mp4','video/webm','image/jpeg','image/webp']
where id = 'trending-videos';
