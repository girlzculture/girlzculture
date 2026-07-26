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
   context first. Select both **Builds** and **Functions** scopes for the
   framework deployment, and do not create `NEXT_PUBLIC_` copies:

   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`

4. Trigger a new Deploy Preview. Environment-variable changes only reach a
   function after a new deploy.
5. Sign in as a platform administrator, open **Engine > Integrations**, find
   **Video transcoder**, and inspect **Netlify function variable presence**.
   The diagnostic reports only `Present` or `Missing` for the three exact
   variable names. It never returns, logs, hashes, or partially displays a
   credential value.
6. When all three variables show `Present`, choose **Test Connection**. This
   performs an authenticated, request-time Cloudinary Admin API call from the
   deployed Node function.
7. Upload one ordinary H.264/AAC MP4 and one incompatible MOV/WebM fixture in
   Marketing > Trending Picks. Confirm progress, a playable MP4 derivative,
   a poster, retry/cancel behavior, and the protected Engine reference on an
   intentional provider failure.

Do not expose `CLOUDINARY_API_SECRET` through a `NEXT_PUBLIC_` variable. Source
files stay in the private/staged Supabase workflow until a derivative succeeds;
the authenticated cleanup job removes scheduled sources afterward.

## Safe runtime outcomes

The Engine and video-processing route share one uncached, server-only
configuration loader. Their safe outcomes are:

- `VIDEO_TRANSCODER_NOT_CONFIGURED`: one or more required variables are missing
  from the deployed function. The authenticated presence diagnostic names only
  the missing variable.
- `VIDEO_TRANSCODER_INVALID_CREDENTIALS`: all variables are present, but
  Cloudinary rejected the cloud name or credential pair.
- `VIDEO_TRANSCODER_PROVIDER_UNAVAILABLE`: Cloudinary timed out, rate-limited
  the request, or returned a provider-side failure.
- `VIDEO_UNSUPPORTED_INPUT_MEDIA`: the submitted media is not supported. This
  is a safe user-input outcome rather than a high-severity platform incident.
- `VIDEO_TRANSCODING_FAILED`: Cloudinary accepted the request but did not
  produce a valid, policy-compliant MP4 and poster.

Unexpected outcomes create a sanitized Engine event whose reference matches the
reference returned to the administrator. No provider response body or
credential data is stored in the event.

Until all three variables show `Present` and the authenticated provider check
runs in the deployed Preview, the integration remains **Blocked**. A local
TypeScript or Next.js build cannot prove that Netlify attached deployment
credentials to its function.
