# Location configuration

Girlz Culture uses separate Google Cloud credentials for browser suggestions/maps and server-side salon geocoding.

## Google Cloud

1. Enable billing on the Google Cloud project.
2. Enable **Maps JavaScript API**, **Places API (New)**, and **Geocoding API**.
3. Create a browser key for `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Restrict it to Maps JavaScript API and Places API (New), then add the exact production, Netlify preview, and local-development HTTP referrers that should load the UI.
4. Create a separate server key for `GOOGLE_MAPS_SERVER_API_KEY`. Restrict it to Geocoding API. Add deployment outbound-IP restrictions if the hosting plan supplies stable egress; never expose this value through a `NEXT_PUBLIC_` variable.
5. Set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` to the production map ID.
6. Set conservative daily quotas and billing alerts in Google Cloud.

## Real Google Maps browser acceptance

`npm run test:google-maps-provider` loads Google's real Maps JavaScript API at
`http://127.0.0.1:3104/internal/acceptance/map-provider`. It requires a browser key
in `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` when building and starting the application.
There is no opt-in skip: missing configuration fails the test with setup guidance.

For GitHub Actions, add the repository Actions secret `GOOGLE_MAPS_TEST_BROWSER_KEY`.
Both verification workflows supply it at build and test time. Use a dedicated test
key with billing enabled, Maps JavaScript API enabled, and the website referrer
`http://127.0.0.1:3104/*` allowed. Restrict the key to Maps JavaScript API (and Places
API (New) if exercising autocomplete). Do not use a server key or change production
key restrictions. A Map ID is optional: the application supports real map overlays
without one. No Geocoding server key is needed for the two synthetic salon locations.

Store local configuration in an untracked environment file or process environment;
never put key values in source, logs, PR comments, or chat. A `RefererNotAllowedMapError`
means Google Cloud has not authorized the test origin. The founder must update the
test key's website restrictions, then rerun the workflow. An absent or rejected key
is an external acceptance blocker, not a passing or skipped provider test.

## Geocoding lifecycle

- `20260716120000_location_foundation.sql` marks a salon address `pending` whenever a geocoding-relevant field changes and clears stale coordinates.
- Application submission and the owner My Page save flow call the protected server geocoder.
- Only precise, complete US street matches receive coordinates. Partial, ambiguous, or approximate matches are marked `needs_review` and excluded from proximity results.
- Provider configuration or transient provider outages leave the address pending; they do not reject an otherwise valid application.
- Existing records can be reviewed and retried from Admin Salons after the related admin section migration is installed.

Do not log or display customer coordinates. Customer-selected location is stored in session storage only and can be cleared from the visible location control.
