import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createImageCropDrag,
  INTERACTIVE_CROP_ZOOM,
  nudgeImageCrop,
  transformForCropPointer,
} from "../src/lib/imageCropCore.ts";
import {
  ACTION_TOAST_SUCCESS_DURATION_MS,
  actionToastIsError,
  actionToastReference,
} from "../src/lib/actionToastCore.ts";
import {
  GOOGLE_MAPS_AUTOMATIC_RETRY_LIMIT,
  googleMapsIncidentMessage,
  runGoogleMapsLoadWithRetry,
  shouldRetryGoogleMapsLoad,
} from "../src/lib/googleMapsFailureCore.ts";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const verticalDrag = createImageCropDrag(1, 100, 100, {
  zoom: 1,
  positionX: 22,
  positionY: 14,
});
const vertical = transformForCropPointer(
  verticalDrag,
  102,
  160,
  240,
  240,
  { zoom: 1, positionX: 22, positionY: 14 },
);
assert.equal(verticalDrag.axis, "y");
assert.equal(vertical.positionX, 22, "vertical movement must preserve X");
assert.notEqual(vertical.positionY, 14);
assert.ok(Number(vertical.zoom) >= INTERACTIVE_CROP_ZOOM);

const horizontalDrag = createImageCropDrag(2, 100, 100, {
  zoom: 1,
  positionX: -5,
  positionY: 37,
});
const horizontal = transformForCropPointer(
  horizontalDrag,
  175,
  103,
  240,
  240,
  { zoom: 1, positionX: -5, positionY: 37 },
);
assert.equal(horizontalDrag.axis, "x");
assert.equal(horizontal.positionY, 37, "horizontal movement must preserve Y");
assert.notEqual(horizontal.positionX, -5);

const movedUp = nudgeImageCrop(
  { zoom: 1, positionX: 41, positionY: 0 },
  "positionY",
  10,
);
assert.equal(movedUp.positionX, 41, "up/down buttons must preserve X");
assert.equal(movedUp.positionY, 10);
assert.ok(Number(movedUp.zoom) >= INTERACTIVE_CROP_ZOOM);
const movedLeft = nudgeImageCrop(
  { zoom: 1, positionX: 0, positionY: -28 },
  "positionX",
  10,
);
assert.equal(movedLeft.positionY, -28, "left/right buttons must preserve Y");

assert.ok(ACTION_TOAST_SUCCESS_DURATION_MS >= 5_000);
assert.equal(actionToastIsError("3 images saved."), false);
assert.equal(actionToastIsError("Upload failed. Reference 11111111-1111-4111-8111-111111111111."), true);
assert.equal(
  actionToastReference(
    "Try again with reference 11111111-1111-4111-8111-111111111111.",
  ),
  "11111111-1111-4111-8111-111111111111",
);

assert.equal(GOOGLE_MAPS_AUTOMATIC_RETRY_LIMIT, 1);
assert.equal(shouldRetryGoogleMapsLoad("GOOGLE_MAPS_SCRIPT_FAILED", 0), true);
assert.equal(shouldRetryGoogleMapsLoad("GOOGLE_MAPS_LOAD_TIMEOUT", 0), true);
assert.equal(shouldRetryGoogleMapsLoad("GOOGLE_MAPS_LOAD_TIMEOUT", 1), false);
assert.equal(shouldRetryGoogleMapsLoad("GOOGLE_MAPS_AUTH_REJECTED", 0), false);
assert.equal(shouldRetryGoogleMapsLoad("GOOGLE_MAPS_NOT_CONFIGURED", 0), false);
assert.equal(
  googleMapsIncidentMessage(
    "Google Maps rejected the browser key.",
    "11111111-1111-4111-8111-111111111111",
  ),
  "Google Maps rejected the browser key. Reference 11111111-1111-4111-8111-111111111111.",
);
assert.equal(
  googleMapsIncidentMessage(
    "This operation failed with reference 11111111-1111-4111-8111-111111111111.",
    "11111111-1111-4111-8111-111111111111",
  ),
  "This operation failed with reference 11111111-1111-4111-8111-111111111111.",
);

let transientLoadAttempts = 0;
let transientLoadResets = 0;
const retryWaits = [];
const recoveredLoad = await runGoogleMapsLoadWithRetry({
  load: async () => {
    transientLoadAttempts += 1;
    if (transientLoadAttempts === 1) {
      throw { code: "GOOGLE_MAPS_SCRIPT_FAILED" };
    }
    return "ready";
  },
  reset: () => {
    transientLoadResets += 1;
  },
  codeForError: (error) => error?.code || null,
  wait: async (milliseconds) => {
    retryWaits.push(milliseconds);
  },
});
assert.equal(recoveredLoad, "ready");
assert.equal(transientLoadAttempts, 2);
assert.equal(transientLoadResets, 1);
assert.deepEqual(retryWaits, [250]);

let rejectedLoadAttempts = 0;
await assert.rejects(
  runGoogleMapsLoadWithRetry({
    load: async () => {
      rejectedLoadAttempts += 1;
      throw { code: "GOOGLE_MAPS_AUTH_REJECTED" };
    },
    reset: () => assert.fail("an authentication rejection must not retry"),
    codeForError: (error) => error?.code || null,
    wait: async () => assert.fail("an authentication rejection must not wait"),
  }),
);
assert.equal(rejectedLoadAttempts, 1);

const upload = read("src/components/ImageUpload.tsx");
const toast = read("src/components/ActionToast.tsx");
const loader = read("src/components/search/AutocompleteInputs.tsx");
const map = read("src/components/search/GoogleSalonMap.tsx");
const supabase = read("src/lib/supabase.ts");
const deployment = read("src/lib/deploymentIdentity.ts");
const nearby = read("src/components/public/NearbySalonPlacement.tsx");
const featured = read("src/components/public/FeaturedSalonPlacement.tsx");
const discovery = read("src/components/public/SalonDiscovery.tsx");
const concierge = read("src/components/public/BeautyConcierge.tsx");

assert.match(upload, /transforms:\s*item\.transforms/);
assert.match(upload, /transformForCropPointer/);
assert.doesNotMatch(toast, /addEventListener\("pointerdown"/);
assert.match(toast, /Copy reference/);
assert.match(loader, /GOOGLE_MAPS_LOAD_TIMEOUT_MS/);
assert.match(loader, /gm_authFailure/);
assert.match(loader, /GOOGLE_MAPS_AUTH_FAILURE_EVENT/);
assert.match(loader, /googleMapsPromise = null/);
assert.match(loader, /loadGoogleMapsWithBoundedRetry/);
assert.match(loader, /const code =[\s\S]{0,180}loadError\?\.code/);
assert.match(loader, /reportClientOperationalFailure\(\{[\s\S]{0,100}code,/);
assert.match(loader, /data-error-reference=\{failure\?\.reference/);
assert.match(loader, /Retry location suggestions/);
assert.match(map, /configuredMapId === "DEMO_MAP_ID" \? ""/);
assert.match(map, /await loadGoogleMapsWithBoundedRetry\(\)/);
assert.match(map, /Retry map/);
assert.match(map, /addEventListener\([\s\S]*GOOGLE_MAPS_AUTH_FAILURE_EVENT/);
assert.match(map, /window\.location\.assign\(`\/salon\//);
assert.match(map, /rating\.toFixed\(1\)/);
assert.match(map, /From \$/);
assert.doesNotMatch(
  supabase,
  /shouldRetryTransientAuthTokenResponse|one short retry absorbs a transient Supabase token-edge/i,
  "Auth retries must have one coordinated owner instead of replaying every raw token request.",
);
assert.match(deployment, /const COMPILED_RELEASE_ID = process\.env\.GIRLZ_CULTURE_RELEASE_ID/);
for (const [name, placement] of [["nearby", nearby], ["featured", featured]]) {
  assert.match(placement, /readApiResponse/);
  assert.doesNotMatch(placement, /response\.json\(\)/, `${name} placement must not parse an HTML proxy response as JSON`);
}
for (const [name, surface] of [["salon discovery", discovery], ["beauty concierge", concierge], ["autocomplete", loader]]) {
  assert.match(surface, /readApiResponse/, `${name} must use the safe API parser`);
  assert.doesNotMatch(surface, /response\.json\(\)/, `${name} must not parse an HTML proxy response as JSON`);
}

console.log(
  "Verified axis-locked crop movement, persisted transforms, durable/copyable notifications, retryable Maps loading, release identification, and bounded transient Auth token retry.",
);
