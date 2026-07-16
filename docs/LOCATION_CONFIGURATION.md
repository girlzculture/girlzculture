# Location configuration

Girlz Culture uses separate Google Cloud credentials for browser suggestions/maps and server-side salon geocoding.

## Google Cloud

1. Enable billing on the Google Cloud project.
2. Enable **Maps JavaScript API**, **Places API (New)**, and **Geocoding API**.
3. Create a browser key for `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Restrict it to Maps JavaScript API and Places API (New), then add the exact production, Netlify preview, and local-development HTTP referrers that should load the UI.
4. Create a separate server key for `GOOGLE_MAPS_SERVER_API_KEY`. Restrict it to Geocoding API. Add deployment outbound-IP restrictions if the hosting plan supplies stable egress; never expose this value through a `NEXT_PUBLIC_` variable.
5. Set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` to the production map ID.
6. Set conservative daily quotas and billing alerts in Google Cloud.

## Geocoding lifecycle

- `20260716120000_location_foundation.sql` marks a salon address `pending` whenever a geocoding-relevant field changes and clears stale coordinates.
- Application submission and the owner My Page save flow call the protected server geocoder.
- Only precise, complete US street matches receive coordinates. Partial, ambiguous, or approximate matches are marked `needs_review` and excluded from proximity results.
- Provider configuration or transient provider outages leave the address pending; they do not reject an otherwise valid application.
- Existing records can be reviewed and retried from Admin Salons after the related admin section migration is installed.

Do not log or display customer coordinates. Customer-selected location is stored in session storage only and can be cleared from the visible location control.
