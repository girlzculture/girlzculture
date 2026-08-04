import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { pollVideoJobUntilReady } from "../src/lib/videoJobPollingCore.ts";

const read = (path) => readFileSync(path, "utf8");
const coreSource = read("src/lib/homePromotionCore.ts");
const locationUrl = pathToFileURL(`${process.cwd()}/src/lib/location.ts`).href;
const compiledCore = ts.transpileModule(coreSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText.replace('from "@/lib/location"', `from "${locationUrl}"`);
const core = await import(
  `data:text/javascript;base64,${Buffer.from(compiledCore).toString("base64")}`
);

const now = Date.parse("2026-08-04T18:00:00.000Z");
const fallbacks = Array.from({ length: 8 }, (_, index) => ({
  id: `fallback-${index + 1}`,
  association_type: undefined,
  editorial_fallback: true,
  title: `Editorial ${index + 1}`,
  href: `/editorial-${index + 1}`,
  media_url: `/images/editorial-${index + 1}.jpg`,
  status: "Active",
}));
const nyHigh = {
  id: "ny-high",
  association_type: "salon",
  salon_id: "11111111-1111-4111-8111-111111111111",
  target_latitude: 40.758,
  target_longitude: -73.9855,
  radius_miles: 25,
  priority: 90,
  status: "Active",
  media_url: "/images/ny-high.jpg",
};
const nyLow = {
  id: "ny-low",
  association_type: "campaign",
  campaign_id: "22222222-2222-4222-8222-222222222222",
  target_latitude: 40.72,
  target_longitude: -74.0,
  radius_miles: 25,
  priority: 40,
  status: "Active",
  media_url: "/images/ny-low.jpg",
};
const texas = {
  id: "texas",
  association_type: "salon",
  salon_id: "33333333-3333-4333-8333-333333333333",
  target_latitude: 32.7767,
  target_longitude: -96.797,
  radius_miles: 25,
  priority: 100,
  status: "Active",
  media_url: "/images/texas.jpg",
};
const duplicateNy = { ...nyHigh, id: "ny-high-duplicate", media_url: "/images/duplicate.jpg" };
const expired = {
  ...nyLow,
  id: "expired",
  campaign_id: "44444444-4444-4444-8444-444444444444",
  ends_at: "2026-08-03T18:00:00.000Z",
};
const pool = [texas, nyLow, nyHigh, duplicateNy, expired, ...fallbacks];

const damagedThreeCardRail = [nyHigh, duplicateNy, nyLow];
const repairedThreeCardRail = core.uniquePromotionCards([
  ...damagedThreeCardRail,
  ...fallbacks,
]).slice(0, 8);
assert.equal(
  repairedThreeCardRail.length,
  8,
  "a damaged three-card rail with a duplicate must be repaired to eight distinct cards",
);
assert.equal(
  new Set(repairedThreeCardRail.map(core.promotionCardIdentity)).size,
  8,
);

const nySelection = core.selectLocalPromotionCards({
  cards: pool,
  now,
  customerLocation: { lat: 40.75, lng: -73.99 },
  limit: 8,
});
assert.equal(nySelection.length, 8);
assert.equal(nySelection[0].id, "ny-high", "priority must rank the eligible local card first");
assert.equal(nySelection[1].id, "ny-low");
assert(!nySelection.some((card) => card.id === "texas"), "distant salons must never leak into a local pool");
assert.equal(new Set(nySelection.map(core.promotionCardIdentity)).size, nySelection.length);

const texasSelection = core.selectLocalPromotionCards({
  cards: pool,
  now,
  customerLocation: { lat: 32.78, lng: -96.8 },
  limit: 8,
});
assert.equal(texasSelection[0].id, "texas");
assert(!texasSelection.some((card) => card.id === "ny-high"));
assert.equal(texasSelection.length, 8, "editorial cards must safely fill an incomplete local pool");

const unknownLocation = core.selectLocalPromotionCards({ cards: pool, now, limit: 8 });
assert.deepEqual(
  new Set(unknownLocation.map((card) => card.id)),
  new Set(fallbacks.map((card) => card.id)),
);
assert.deepEqual(
  core.selectLocalPromotionCards({ cards: pool, now, limit: 8 }).map((card) => card.id),
  unknownLocation.map((card) => card.id),
  "the same hour and location seed must produce a stable promotion order",
);

const highWeight = {
  id: "weighted-high",
  href: "/weighted-high",
  media_url: "/images/weighted-high.jpg",
  status: "Active",
  priority: 50,
  rotation_weight: 20,
};
const lowWeight = {
  id: "weighted-low",
  href: "/weighted-low",
  media_url: "/images/weighted-low.jpg",
  status: "Active",
  priority: 50,
  rotation_weight: 1,
};
let highWeightFirst = 0;
for (let hour = 0; hour < 240; hour += 1) {
  const selected = core.selectLocalPromotionCards({
    cards: [highWeight, lowWeight],
    now: hour * 3_600_000,
    limit: 1,
  });
  if (selected[0]?.id === highWeight.id) highWeightFirst += 1;
}
assert(
  highWeightFirst > 190,
  `rotation weight must materially affect deterministic selection; high-weight card won only ${highWeightFirst}/240 buckets`,
);

const gif = {
  id: "animated-editorial",
  href: "/salons",
  media_url: "https://example.test/promotion.gif?version=2",
  status: "Active",
  priority: 100,
};
const gifSelection = core.selectLocalPromotionCards({ cards: [gif, ...fallbacks], now, limit: 8 });
assert.equal(gifSelection[0].media_url, gif.media_url, "animated GIF URLs must survive selection unchanged");
assert.equal(
  gifSelection[0].id,
  gif.id,
  "legacy and newly uploaded unassociated GIF cards must remain visible without a migration-only flag",
);

const twentyFive = Array.from({ length: 25 }, (_, index) => ({
  id: `global-${index}`,
  href: `/global-${index}`,
  media_url: `/images/global-${index}.jpg`,
  editorial_fallback: true,
  status: "Active",
}));
assert.equal(
  core.selectLocalPromotionCards({ cards: twentyFive, now, limit: 25 }).length,
  20,
  "the public pool must never exceed the governed maximum",
);

const nationwidePool = [
  ...Array.from({ length: 24 }, (_, index) => ({
    id: `ny-national-${index}`,
    association_type: "salon",
    salon_id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    target_latitude: 40.75 + index * 0.0001,
    target_longitude: -73.99,
    radius_miles: 25,
    priority: 100 - index,
    status: "Active",
    media_url: `/images/ny-${index}.jpg`,
  })),
  ...Array.from({ length: 24 }, (_, index) => ({
    id: `tx-national-${index}`,
    association_type: "salon",
    salon_id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    target_latitude: 32.78 + index * 0.0001,
    target_longitude: -96.8,
    radius_miles: 25,
    priority: 100 - index,
    status: "Active",
    media_url: `/images/tx-${index}.jpg`,
  })),
  ...fallbacks,
];
assert(nationwidePool.length > 20, "the source pool fixture must exceed one visitor's display limit");
const nationwideNy = core.selectLocalPromotionCards({ cards: nationwidePool, now, customerLocation: { lat: 40.75, lng: -73.99 }, limit: 8 });
const nationwideTx = core.selectLocalPromotionCards({ cards: nationwidePool, now, customerLocation: { lat: 32.78, lng: -96.8 }, limit: 8 });
assert.equal(nationwideNy.length, 8);
assert.equal(nationwideTx.length, 8);
assert(nationwideNy.every((card) => card.id.startsWith("ny-national-")));
assert(nationwideTx.every((card) => card.id.startsWith("tx-national-")));
assert.notDeepEqual(nationwideNy.map((card) => card.id), nationwideTx.map((card) => card.id));

const fallbackPollWaits = [];
let fallbackPollCalls = 0;
const fallbackReady = await pollVideoJobUntilReady({
  jobId: "fixture-video-job",
  maxAttempts: 10,
  intervalMs: 2_000,
  maxIntervalMs: 15_000,
  backoffFactor: 2,
  sleep: async (milliseconds) => {
    fallbackPollWaits.push(milliseconds);
  },
  getJob: async () => {
    fallbackPollCalls += 1;
    return {
      id: "fixture-video-job",
      status: fallbackPollCalls >= 4 ? "Ready" : "Transcoding",
      output_url:
        fallbackPollCalls >= 4
          ? "https://res.cloudinary.com/fixture/video/upload/ready.mp4"
          : null,
    };
  },
});
assert.equal(fallbackReady.status, "Ready");
assert.deepEqual(
  fallbackPollWaits,
  [2_000, 4_000, 8_000],
  "provider recovery must use sparse exponential backoff rather than rapid Admin API polling",
);

const rail = read("src/components/public/HomepagePromoRail.tsx");
const server = read("src/lib/homepagePromotionServer.ts");
const contentRoute = read("src/app/api/admin/content/route.ts");
const contentManager = read("src/components/AdminContentManager.tsx");
const campaignRoute = read("src/app/api/admin/trending-campaigns/route.ts");
const campaignManager = read("src/components/admin/AdminTrendingCampaigns.tsx");
const videoJobsRoute = read("src/app/api/admin/media/video-jobs/route.ts");
const videoCallbackRoute = read("src/app/api/media/video/cloudinary-callback/route.ts");
const videoPollingCore = read("src/lib/videoJobPollingCore.ts");
const videoProcessingServer = read("src/lib/videoProcessingServer.ts");
const migration = read("supabase/migrations/20260804190000_homepage_promotion_pool_and_trending_media.sql");
const safeImage = read("src/components/site/SafeImage.tsx");
const responsiveMedia = read("src/lib/responsiveMedia.ts");
const mediaUploadServer = read("src/lib/mediaUploadServer.ts");

assert.match(rail, /w-\[86vw\]/, "phone hero cards must remain wide, horizontal cards");
assert.match(rail, /aspect-\[16\/9\]/, "phone hero cards must keep a horizontal aspect ratio");
assert.doesNotMatch(rail, /card\.target_label/, "phone hero content must not render stacked location metadata");
assert.doesNotMatch(rail, /data-promotion-clone/, "the looping rail must not render the first card twice");
assert.match(rail, /data-media-kind=.*animated-gif/);
assert.match(safeImage, /<img/, "animated GIF delivery must use a browser-native image element");
assert.doesNotMatch(responsiveMedia, /jpe\?g\|png\|gif/, "animated GIF URLs must not be rewritten to nonexistent static renditions");
assert.match(mediaUploadServer, /source\.mimeType === "image\/gif"/);
assert.match(mediaUploadServer, /animatedRenditionDimensions\(/);
assert.match(server, /HOMEPAGE_EDITORIAL_FALLBACKS/);
assert.match(server, /uniquePromotionCards\(\[\.\.\.published, \.\.\.HOMEPAGE_EDITORIAL_FALLBACKS\]\)/);
assert.match(server, /MAX_HOMEPAGE_PROMOTION_SOURCE_COUNT/);
assert.match(server, /resolve_homepage_promotion_targets/);
assert.match(server, /requested\.has\(key\)/);
assert.doesNotMatch(server, /resolve_homepage_promotion_target"/);
assert.doesNotMatch(server, /Promise\.all\(scheduled\.map/);
assert.equal(
  (server.match(/\.rpc\(/g) || []).length,
  1,
  "the homepage source pool must use one bounded association RPC, not one RPC per card",
);
assert.match(server, /requestedDisplayLimit = DEFAULT_HOMEPAGE_PROMOTION_COUNT/);
assert.match(server, /display_limit: poolLimit/);
assert.match(server, /Math\.min\(requestedRadius, authorizedCampaignRadius\)/);
assert.match(server, /target\.target_type === "campaign"/);
assert.match(contentManager, /expected_updated_at: page\.updated_at/);
assert.match(contentManager, /_allow_card_count_change: true/);
assert.match(contentManager, /Cards shown per customer/);
assert.match(contentManager, /Add promotion to pool/);
assert.match(contentManager, /Remove promotion card/);
assert.match(contentManager, /National source pool/);
assert.match(contentManager, /Audience radius \(miles\)/);
assert.match(contentManager, /\["salon", "campaign"\]/);
assert.match(contentRoute, /CONTENT_REVISION_CONFLICT/);
assert.match(contentRoute, /PROMOTION_COLLECTION_CONFLICT/);
assert.match(contentRoute, /cannot reuse the same card ID/);
assert.match(contentRoute, /cannot appear twice in the homepage rail/);
assert.match(contentRoute, /must contain between 8 and 200 cards/);
assert.match(contentRoute, /display_limit/);

assert.match(campaignManager, /let preparedSource = file/);
assert.match(campaignManager, /pendingForSelection\?\.sourceDuration \|\| sourceDuration/);
assert.match(campaignManager, /resumeOrCreateReadyVideoJob/);
assert.match(campaignManager, /loadPendingTrendingVideoJob\(window\.sessionStorage\)/);
assert.match(campaignManager, /pendingJobId: pendingForSelection\?\.jobId/);
assert.match(campaignManager, /action: "create"/);
assert.match(campaignManager, /action: "process"/);
assert.match(campaignManager, /duration_seconds: preparedDuration \|\| null/);
assert.match(campaignManager, /pollVideoJobUntilReady/);
assert.match(campaignManager, /maxAttempts: 10/);
assert.match(campaignManager, /maxIntervalMs: 15_000/);
assert.match(campaignManager, /backoffFactor: 2/);
assert.match(campaignManager, /did not survive a fresh reload/);
assert.match(campaignManager, /both a public video and poster/);
assert.doesNotMatch(campaignManager, /posterFile|uploadedPosterPath/, "the UI must not promise an unsaved local poster");
assert.match(campaignManager, /campaignEntitlement\(campaign\)/);
assert.match(campaignManager, /entitlement_source: entitlement\?\.source \|\| null/);
assert.match(campaignManager, /has no verified funding evidence/);
assert.doesNotMatch(campaignManager, /uploadedPath\s*=\s*`campaigns\/\$\{salonId\}\//, "new videos must not bypass the governed processing-job contract");
assert.match(videoJobsRoute, /duration_seconds: hasClientDuration \? duration : null/);
assert.match(videoJobsRoute, /VIDEO_JOB_VALIDATION/);
assert.match(videoJobsRoute, /X-Request-ID/);
assert.match(videoJobsRoute, /recovery_retryable/);
assert.match(videoJobsRoute, /recovery_message/);
assert.match(videoJobsRoute, /existingReference/);
assert.match(videoJobsRoute, /recover-cloudinary-video-job/);
assert.doesNotMatch(videoProcessingServer, /getPublicUrl\(String\(job\.source_path\)\)/, "browser-safe inputs must not bypass authoritative duration and poster generation");
assert.match(videoProcessingServer, /eager_async: "true"/);
assert.match(videoProcessingServer, /eager_notification_url/);
assert.match(videoProcessingServer, /cloudinaryVideoCallbackToken/);
assert.match(videoProcessingServer, /setTimeout\(\(\) => controller\.abort\(\), 30_000\)/);
assert.match(videoProcessingServer, /poster_url/);
assert.match(videoProcessingServer, /duration_seconds/);
assert.match(videoProcessingServer, /status: "Ready"/);
assert.match(videoProcessingServer, /progress_percent: 100/);
assert.match(videoProcessingServer, /safe_error_code: null/);
assert.match(videoProcessingServer, /error_reference: null/);
assert.match(videoCallbackRoute, /validCloudinaryVideoCallbackToken/);
assert.match(videoCallbackRoute, /reconcileCloudinaryVideoJob/);
assert.match(videoCallbackRoute, /status: reconciled\.status/);
assert.match(videoCallbackRoute, /reconciled\.status !== "Ready"/);
assert.match(videoCallbackRoute, /status: 503/);
assert.match(videoPollingCore, /backoffFactor/);
assert.match(videoPollingCore, /Math\.min\(/);
assert.match(campaignRoute, /validateReadyVideoJob/);
assert.match(campaignRoute, /Every new or changed video must use a Ready video processing job/);
assert.match(campaignRoute, /Unchanged legacy campaign media remains available/);
assert.match(campaignRoute, /Video processing must reach Ready/);
assert.match(campaignRoute, /saved poster must use the Ready processing job output/);
assert.match(campaignRoute, /TRENDING_CAMPAIGN_VALIDATION/);
assert.match(campaignRoute, /savedCampaignResponse/);
assert.match(campaignRoute, /status === "Draft" && !entitlementSource && !entitlementReference/);
assert.match(campaignRoute, /select\("source,external_reference"\)/);
assert.match(campaignRoute, /status !== "Draft" && \(!entitlementSource \|\| !entitlementReference\)/);
const complimentaryStart = campaignRoute.indexOf('if (placementBasis === "complimentary_admin")');
const paidStart = campaignRoute.indexOf("let entitlementSource", complimentaryStart);
assert(complimentaryStart >= 0 && paidStart > complimentaryStart);
const complimentaryBranch = campaignRoute.slice(complimentaryStart, paidStart);
assert.doesNotMatch(
  complimentaryBranch,
  /marketing_entitlements|verifyMarketingEntitlement|entitlement_source/,
  "a complimentary Draft must save without creating or verifying paid entitlement evidence",
);
assert.match(migration, /v_seen \? v_key/);
assert.match(migration, /'display_limit', 8/);
assert.match(migration, /jsonb_array_elements\(v_cards\)/);
assert.match(migration, /resolve_homepage_promotion_targets/);
assert.match(migration, /item\.ordinal <= 200/);
assert.match(migration, /requested\.target_type = 'salon'/);
assert.match(migration, /requested\.target_type = 'campaign'/);
assert.doesNotMatch(migration, /v_unique\s*:=\s*.*slice/i, "migration must not truncate distinct national source cards");
assert.match(migration, /20260804190000/);

console.log(
  "Verified one-call bulk association resolution, deterministic weighted rotation, a 200-card nationwide source pool with distinct radius-governed 1–20 per-visitor selection, animated GIF preservation, collection concurrency protection, wide phone hero cards, and the upload → processing job → Ready → save → reload Trending Picks contract.",
);
