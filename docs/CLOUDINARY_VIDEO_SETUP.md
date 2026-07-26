# Cloudinary video processing

Girlz Culture uses Cloudinary as its launch video-processing provider because
Netlify functions should orchestrate, rather than perform, CPU-intensive video
transcoding. Cloudinary accepts MP4, MOV, M4V, WebM and Matroska source files,
produces an H.264/AAC MP4 derivative and JPEG poster, and keeps provider
credentials server-side.

## Founder setup

1. Create a Cloudinary account and cloud from the Cloudinary console.
2. Open **Settings > API Keys**.
3. Add these server-only environment variables to the relevant Netlify Preview
   context first:

   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`

4. Trigger a new Deploy Preview.
5. Sign in as a platform administrator, open **Engine > Integrations**, find
   **Video transcoder**, and choose **Test Connection**.
6. Upload one ordinary H.264/AAC MP4 and one incompatible MOV/WebM fixture in
   Marketing > Trending Picks. Confirm progress, a playable MP4 derivative,
   a poster, retry/cancel behavior, and the protected Engine reference on an
   intentional provider failure.

Do not expose `CLOUDINARY_API_SECRET` through a `NEXT_PUBLIC_` variable. Source
files stay in the private/staged Supabase workflow until a derivative succeeds;
the authenticated cleanup job removes scheduled sources afterward.

Until credentials are provided and these provider-backed checks run in Preview,
the integration status is **Blocked**, even though the repository integration
is complete.
