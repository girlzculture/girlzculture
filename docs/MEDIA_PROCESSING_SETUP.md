# Girlz Culture media-processing setup

Girlz Culture accepts MP4, WebM, MOV, M4V, and Matroska uploads for Trending
Picks. Browser-safe H.264/AAC MP4 and VP8/VP9 WebM can be used directly.
Other container or codec combinations require the server-side transcoder.

## Netlify environment variables

Configure these values in the preview environment first:

- `MEDIA_TRANSCODE_ENDPOINT`: HTTPS URL for the private transcoding worker.
- `MEDIA_TRANSCODE_TOKEN`: high-entropy bearer token shared only by the
  application and worker.
- `CRON_SECRET`: separate high-entropy token used by the scheduled
  `media-cleanup` function.
- `NEXT_PUBLIC_SITE_URL`: canonical HTTPS application URL used by the
  scheduled function when Netlify's `URL` value is unavailable.

Never prefix the transcoder token or cron secret with `NEXT_PUBLIC_`.

## Transcoder request contract

The application sends a `POST` request authenticated with
`Authorization: Bearer <MEDIA_TRANSCODE_TOKEN>`. The JSON body contains:

- a non-secret job ID;
- a short-lived signed source URL and source MIME type;
- an output requirement of H.264 video, AAC audio, MP4 container, a 30-second
  maximum, bounded dimensions/bytes, and a JPEG poster.

The worker must return HTTPS `output_url` and `poster_url` values plus
`output_size_bytes`, `duration_seconds`, optional dimensions, and an optional
provider job ID. It may also return a governed `processed/...mp4` storage path
when it writes into the configured Girlz Culture media bucket.

Do not return raw logs, access tokens, signed input URLs, or provider payloads.

## Cleanup lifecycle

- Uploaded sources are registered before processing starts.
- Compatible files remain as the published object.
- Transcoded sources are retained for 24 hours after success.
- Failed sources are retained for seven days by default for retry.
- Cancelled and abandoned sources are retained for 24 hours by default.
- The protected Netlify `media-cleanup` schedule runs daily and removes only
  governed `incoming/` paths whose retention time has expired.
- Published output URLs and campaign audit records are not removed by source
  cleanup.

Both retention defaults are editable in The Engine. The database stores the
job, status, sanitized Engine reference, attempt count, timestamps, and cleanup
state.

## Preview verification

1. Apply migrations through
   `20260724150000_video_processing_lifecycle.sql`.
2. Set the three server-only variables in the preview environment.
3. Confirm System Status shows Video transcoder and Scheduled media cleanup as
   healthy.
4. Upload a small H.264/AAC MP4 and confirm it reaches Ready without conversion.
5. Upload a VP9/Opus WebM and confirm it reaches Ready without conversion.
6. Upload a small HEVC MOV and confirm Inspecting, Transcoding, then Ready with
   a generated poster.
7. Cancel one processing job and confirm it cannot become Ready afterward.
8. Force a disposable failed job, retry it, and confirm the same source remains
   available during the retention window.
9. Run the cleanup function only in preview with an expired disposable
   `incoming/` object and confirm the job records `Removed`.

Real conversion, cleanup, and device playback cannot be claimed until this
provider-backed preview test is completed.
