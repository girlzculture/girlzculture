import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as protocol from "../src/lib/mediaUploadProtocol.ts";
import {
  reportMediaUploadProfileFallback,
  resolveMediaUploadProfile,
} from "../src/lib/mediaUploadProfileCore.ts";
import {
  createBoundedCleanupFailureReporter,
  runIsolatedCleanupBatch,
} from "../src/lib/mediaCleanupCore.ts";

const read = (path) => fs.readFileSync(path, "utf8");
const clientSource = read("src/lib/mediaUploadClient.ts");
const uploadComponentSource = read("src/components/ImageUpload.tsx");
const serverSource = read("src/lib/mediaUploadServer.ts");
const processorSource = read("src/lib/mediaImageProcessor.ts");
const legacyRouteSource = read("src/app/api/media/upload/route.ts");
const prepareRoutePath = "src/app/api/media/upload/prepare/route.ts";
const finalizeRoutePath = "src/app/api/media/upload/finalize/route.ts";
const finalizeRouteSource = read(finalizeRoutePath);
const cleanupRoutePath = "src/app/api/media/cleanup/route.ts";
const cleanupRouteSource = read(cleanupRoutePath);
const netlifyConfigSource = read("netlify.toml");
const nextConfigSource = read("next.config.ts");

assert.match(netlifyConfigSource, /NODE_VERSION\s*=\s*["']22["']/);
assert.doesNotMatch(netlifyConfigSource, /external_node_modules|included_files/);
assert.match(nextConfigSource, /serverExternalPackages:\s*\[["']sharp["']\]/);
assert.match(
  nextConfigSource,
  /["']\/api\/media\/upload\/finalize["']:\s*\[/,
);
assert.match(nextConfigSource, /node_modules\/@img\/sharp-linux-x64\/\*\*/);
assert.match(
  nextConfigSource,
  /node_modules\/@img\/sharp-libvips-linux-x64\/\*\*/,
);
assert.match(uploadComponentSource, /getSessionForScope\(authScope\)/);
assert.match(uploadComponentSource, /setAuthUnavailable\(true\)/);
assert.match(uploadComponentSource, /Retry access/);
assert.doesNotMatch(
  uploadComponentSource,
  /setTimeout\([\s\S]{0,160}setAuthReload/,
  "Each mounted image control must not create its own fixed Auth-outage polling loop.",
);
assert.doesNotMatch(
  uploadComponentSource,
  /getValidSessionForScope\(authScope,\s*15\)[\s\S]{0,240}\.catch\([\s\S]{0,160}setAuthenticated\(false\)/,
  "A transient Auth outage must not permanently turn an image control into a signed-out state.",
);

function localStaticDependencies(entryPath) {
  const visited = new Set();
  const pending = [entryPath];
  while (pending.length) {
    const currentPath = pending.pop();
    if (!currentPath || visited.has(currentPath)) continue;
    visited.add(currentPath);
    const source = read(currentPath);
    const specifiers = [
      ...source.matchAll(
        /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g,
      ),
    ].map((match) => match[1]);
    for (const specifier of specifiers) {
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) {
        continue;
      }
      const base = specifier.startsWith("@/")
        ? path.join("src", specifier.slice(2))
        : path.resolve(path.dirname(currentPath), specifier);
      const candidate = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.mjs`,
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
      ].find((value) => fs.existsSync(value) && fs.statSync(value).isFile());
      if (candidate) pending.push(path.relative(process.cwd(), candidate));
    }
  }
  return visited;
}

const legacyGetHandler = legacyRouteSource.slice(
  legacyRouteSource.indexOf("async function GETHandler"),
  legacyRouteSource.indexOf("async function POSTHandler"),
);
const legacyPostHandler = legacyRouteSource.slice(
  legacyRouteSource.indexOf("async function POSTHandler"),
  legacyRouteSource.indexOf("async function PATCHHandler"),
);
assert.match(legacyGetHandler, /if \(!kind\)[\s\S]*?Response\.json\([\s\S]*?status: 400/);
assert.match(legacyPostHandler, /Response\.json\([\s\S]*?status: 410/);
assert.match(
  cleanupRouteSource,
  /if \(!authorized\(request\)\)[\s\S]*?Response\.json\([\s\S]*?status: 401/,
);
assert.match(cleanupRouteSource, /runIsolatedCleanupBatch\(/);
assert.match(cleanupRouteSource, /failure_reference_limit:\s*FAILURE_REFERENCE_LIMIT/);
assert.match(cleanupRouteSource, /partial_failure:\s*partialFailure/);
assert.match(cleanupRouteSource, /processOnlyPartialWarnings:\s*true/);
assert.match(cleanupRouteSource, /actorRole:\s*["']system["']/);
assert.doesNotMatch(
  cleanupRouteSource,
  /(?:provider_error|failure_message|technical_message)\s*:/,
  "the cleanup response must not expose provider failure payloads",
);

const cleanupOrder = [];
const isolatedFailures = [];
const isolatedResult = await runIsolatedCleanupBatch(
  ["first", "poison", "after-poison", "last"],
  async (item) => {
    cleanupOrder.push(item);
    if (item === "poison") throw new Error("provider payload must stay internal");
  },
  (error, item) => isolatedFailures.push({ error, item }),
);
assert.deepEqual(cleanupOrder, ["first", "poison", "after-poison", "last"]);
assert.deepEqual(isolatedResult, { attempted: 4, succeeded: 3, failed: 1 });
assert.equal(isolatedFailures.length, 1);
assert.equal(isolatedFailures[0].item, "poison");

const representativeFailures = [];
const boundedCleanupFailures = createBoundedCleanupFailureReporter(
  (scope, error) => representativeFailures.push({ scope, error }),
  2,
);
boundedCleanupFailures.record("staged image item", new Error("first"));
boundedCleanupFailures.record("staged image item", new Error("duplicate scope"));
boundedCleanupFailures.record("expired upload item", new Error("second"));
boundedCleanupFailures.record("video source item", new Error("over limit"));
assert.deepEqual(
  representativeFailures.map((failure) => failure.scope),
  ["staged-image-item", "expired-upload-item"],
);
assert.deepEqual(boundedCleanupFailures.summary(), {
  total: 4,
  reported: 2,
  omitted: 2,
});

for (const entryPath of [
  "src/app/api/media/upload/route.ts",
  prepareRoutePath,
  finalizeRoutePath,
  cleanupRoutePath,
]) {
  const staticGraph = localStaticDependencies(entryPath);
  assert.ok(
    !staticGraph.has("src/lib/mediaImageProcessor.ts"),
    `${entryPath} must cold-start without loading the native Sharp processor`,
  );
  for (const dependencyPath of staticGraph) {
    assert.doesNotMatch(
      read(dependencyPath),
      /\bimport\s+[^;]*?from\s+["']sharp["']/,
      `${entryPath} must not have a static Sharp dependency through ${dependencyPath}`,
    );
  }
}

const fallbackProfile = {
  key: "cover",
  label: "Salon cover",
  aspectWidth: 16,
  aspectHeight: 7,
  minWidth: 1_200,
  minHeight: 525,
  outputWidth: 1_920,
  maxBytes: 4 * 1024 * 1024,
  safeArea: true,
  acceptedMimeTypes: ["image/jpeg", "image/png"],
};

const providerError = new Error("PROFILE_PROVIDER_UNAVAILABLE");
const providerFallback = await resolveMediaUploadProfile({
  fallback: fallbackProfile,
  loadConfiguration: async () => ({ data: null, error: providerError }),
  loadQuality: async () => 91,
});
assert.deepEqual(providerFallback.profile, {
  ...fallbackProfile,
  quality: 91,
});
assert.equal(providerFallback.failures.length, 1);
assert.equal(providerFallback.failures[0].error, providerError);

const rejectedFallback = await resolveMediaUploadProfile({
  fallback: fallbackProfile,
  loadConfiguration: () => {
    throw new Error("PROFILE_NETWORK_FAILURE");
  },
  loadQuality: () => {
    throw new Error("ENGINE_NETWORK_FAILURE");
  },
});
assert.deepEqual(rejectedFallback.profile, {
  ...fallbackProfile,
  quality: 88,
});
assert.deepEqual(
  rejectedFallback.failures.map((failure) => failure.operation),
  [
    "load media upload profile configuration",
    "load media image quality",
  ],
);

let boundedConfigurationCalls = 0;
let boundedQualityCalls = 0;
const boundedStartedAt = performance.now();
const boundedFallback = await resolveMediaUploadProfile({
  fallback: fallbackProfile,
  timeoutMs: 20,
  loadConfiguration: () => {
    boundedConfigurationCalls += 1;
    return new Promise(() => {});
  },
  loadQuality: () => {
    boundedQualityCalls += 1;
    return new Promise(() => {});
  },
});
const boundedElapsedMs = performance.now() - boundedStartedAt;
assert.ok(
  boundedElapsedMs < 500,
  `fallback exceeded its bounded deadline (${boundedElapsedMs}ms)`,
);
assert.equal(boundedConfigurationCalls, 1);
assert.equal(boundedQualityCalls, 1);
assert.equal(boundedFallback.failures.length, 2);
assert.deepEqual(boundedFallback.profile, {
  ...fallbackProfile,
  quality: 88,
});

const warningState = new Map();
const warnings = [];
const warningInput = {
  kind: "cover",
  failures: boundedFallback.failures,
  minimumIntervalMs: 100,
  state: warningState,
  write: (warning) => warnings.push(warning),
};
assert.equal(reportMediaUploadProfileFallback({ ...warningInput, now: 1_000 }), true);
assert.equal(reportMediaUploadProfileFallback({ ...warningInput, now: 1_050 }), false);
assert.equal(reportMediaUploadProfileFallback({ ...warningInput, now: 1_100 }), true);
assert.equal(warnings.length, 2);
assert.deepEqual(
  Object.keys(warnings[0]).sort(),
  ["code", "kind", "operations"],
  "fallback telemetry must not expose provider error payloads",
);

const configuredProfile = await resolveMediaUploadProfile({
  fallback: fallbackProfile,
  loadConfiguration: async () => ({
    data: {
      display_name: "Configured cover",
      aspect_width: 3,
      aspect_height: 2,
      min_width_px: 900,
      min_height_px: 600,
      output_width_px: 1_800,
      max_bytes: 5 * 1024 * 1024,
      safe_area_enabled: false,
      accepted_mime_types: ["IMAGE/JPEG", "text/html"],
    },
    error: null,
  }),
  loadQuality: async () => 94,
});
assert.deepEqual(configuredProfile.profile, {
  ...fallbackProfile,
  label: "Configured cover",
  aspectWidth: 3,
  aspectHeight: 2,
  minWidth: 900,
  minHeight: 600,
  outputWidth: 1_800,
  maxBytes: 5 * 1024 * 1024,
  safeArea: false,
  acceptedMimeTypes: ["image/jpeg"],
  quality: 94,
});
assert.deepEqual(configuredProfile.failures, []);

assert.deepEqual(
  [...protocol.MEDIA_DIRECT_UPLOAD_SLOTS],
  ["source"],
  "the browser contract must upload exactly one untouched source object",
);
assert.equal(protocol.isCanonicalDirectUploadPlan(["source"]), true);
for (const invalid of [
  [],
  ["desktop"],
  ["source", "desktop"],
  ["source", "tablet", "mobile"],
]) {
  assert.equal(
    protocol.isCanonicalDirectUploadPlan(invalid),
    false,
    `the client must reject incompatible signed-upload slots: ${invalid.join(",")}`,
  );
}

assert.match(
  clientSource,
  /isCanonicalDirectUploadPlan\(\s*prepareBody\.uploads\.map/,
  "the browser must reject a server response that asks it to upload derivatives",
);
assert.match(
  clientSource,
  /const normalizedSource = await normalizeImageFile\(input\.source\)[\s\S]*?const uploadFiles: UploadFiles = \{ source: normalizedSource \}/,
  "the browser must normalize byte-verified metadata while retaining one source file",
);
assert.match(
  serverSource,
  /const requiredSlots: MediaUploadSlot\[\] = \[\s*"source",\s*\.\.\.MEDIA_RENDITION_SLOTS/,
  "the prepared session must declare source plus every canonical derivative",
);
assert.match(
  serverSource,
  /for \(const slot of MEDIA_DIRECT_UPLOAD_SLOTS\)[\s\S]*?createSignedUploadUrl/,
  "prepare must sign only the shared browser-upload slot contract",
);
assert.match(
  serverSource,
  /createCanonicalMediaRendition\([\s\S]*?\.upload\(target\.path, uploadBytes/,
  "finalize must generate and upload derivatives on the trusted server",
);
assert.doesNotMatch(
  serverSource.slice(
    serverSource.indexOf("export async function prepareMediaUpload"),
    serverSource.indexOf("function expectedObjects"),
  ),
  /descriptor\(body\.files\?\.\[(?:slot|.+?)\]/,
  "prepare must never require browser-supplied derivative descriptors",
);
assert.doesNotMatch(
  serverSource,
  /from ["']@\/lib\/mediaImageProcessor["']/,
  "the shared route module must not eagerly load the native Sharp processor",
);
assert.doesNotMatch(
  serverSource,
  /await import\(["']@\/lib\/mediaImageProcessor["']\)/,
  "the shared route module must not make unrelated routes trace Sharp",
);
assert.match(
  finalizeRouteSource,
  /await import\(["']@\/lib\/mediaImageProcessor["']\)/,
  "only finalization must load the native processor when it is exercised",
);
assert.match(serverSource, /runWithOperationalContext\([\s\S]*?resolveMediaUploadProfile/);
assert.match(serverSource, /AbortSignal\.timeout\(MEDIA_UPLOAD_PROFILE_TIMEOUT_MS\)/);
assert.match(serverSource, /reportMediaUploadProfileFallback\(\{ kind, failures \}\)/);
assert.doesNotMatch(serverSource, /noteOperationalFailure\(failure\.operation/);
assert.match(processorSource, /from ["']sharp["']/);

const tracePaths = {
  upload: ".next/server/app/api/media/upload/route.js.nft.json",
  prepare: ".next/server/app/api/media/upload/prepare/route.js.nft.json",
  finalize: ".next/server/app/api/media/upload/finalize/route.js.nft.json",
  cleanup: ".next/server/app/api/media/cleanup/route.js.nft.json",
};
const traceFilesPresent = Object.values(tracePaths).every((tracePath) =>
  fs.existsSync(tracePath),
);
if (process.argv.includes("--require-build-traces")) {
  assert.equal(
    traceFilesPresent,
    true,
    "Build the production release before verifying the media function traces.",
  );
}
if (traceFilesPresent) {
  const sharpTraceCount = (tracePath) => {
    const trace = JSON.parse(read(tracePath));
    return (Array.isArray(trace.files) ? trace.files : []).filter((file) =>
      /node_modules\/(?:sharp|@img\/sharp-)/.test(String(file)),
    ).length;
  };
  assert.equal(sharpTraceCount(tracePaths.upload), 0);
  assert.equal(sharpTraceCount(tracePaths.prepare), 0);
  assert.equal(sharpTraceCount(tracePaths.cleanup), 0);
  assert.ok(
    sharpTraceCount(tracePaths.finalize) > 0,
    "the finalizer trace must include Sharp and its Linux runtime files",
  );
}

console.log(
  "Verified JSON cold-start contracts, route-scoped Sharp packaging, bounded/deduplicated media-profile fallback, client protocol guards, and canonical derivative generation.",
);
