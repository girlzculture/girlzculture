import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CLOUDINARY_RUNTIME_VARIABLE_NAMES,
  cloudinaryCompletedVideoResult,
  classifyVideoProviderStatus,
  classifyVideoTranscoderError,
  loadVideoTranscoderRuntime,
  missingVideoTranscoderConfiguration,
  providerNetworkFailure,
} from "../src/lib/videoTranscoderCore.ts";

function runtime(values = {}) {
  return loadVideoTranscoderRuntime((name) => values[name]);
}

const absent = runtime();
assert.equal(absent.diagnostic.configured, false);
assert.equal(absent.diagnostic.provider, "none");
assert.deepEqual(
  absent.diagnostic.missingVariables,
  CLOUDINARY_RUNTIME_VARIABLE_NAMES,
);
assert.deepEqual(
  absent.diagnostic.variables,
  CLOUDINARY_RUNTIME_VARIABLE_NAMES.map((name) => ({
    name,
    present: false,
  })),
);

for (const missingName of [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
]) {
  const values = {
    CLOUDINARY_CLOUD_NAME: "fixture-cloud",
    CLOUDINARY_API_KEY: "fixture-key",
    CLOUDINARY_API_SECRET: "fixture-secret",
  };
  delete values[missingName];
  const partial = runtime(values);
  assert.equal(partial.diagnostic.cloudinaryConfigured, false);
  assert.deepEqual(partial.diagnostic.missingVariables, [missingName, "CLOUDINARY_URL"]);
}

const cloudinary = runtime({
  CLOUDINARY_CLOUD_NAME: "fixture-cloud",
  CLOUDINARY_API_KEY: "fixture-key",
  CLOUDINARY_API_SECRET: "fixture-secret",
  CLOUDINARY_URL: "cloudinary://url-key:url-secret@url-cloud",
});
assert.equal(cloudinary.diagnostic.configured, true);
assert.equal(cloudinary.diagnostic.cloudinaryConfigured, true);
assert.equal(cloudinary.diagnostic.provider, "cloudinary");
assert.equal(
  JSON.stringify(cloudinary.diagnostic).includes("fixture-cloud"),
  false,
);
assert.equal(
  JSON.stringify(cloudinary.diagnostic).includes("fixture-key"),
  false,
);
assert.equal(
  JSON.stringify(cloudinary.diagnostic).includes("fixture-secret"),
  false,
);
assert.equal(cloudinary.cloudinary.cloudName, "fixture-cloud", "complete explicit variables must be preferred over CLOUDINARY_URL");

const extensionStyle = runtime({
  CLOUDINARY_URL: "cloudinary://extension-key:extension-secret@extension-cloud",
});
assert.equal(extensionStyle.diagnostic.configured, true);
assert.equal(extensionStyle.diagnostic.provider, "cloudinary");
assert.deepEqual(extensionStyle.diagnostic.missingVariables, []);
assert.deepEqual(extensionStyle.cloudinary, {
  cloudName: "extension-cloud",
  apiKey: "extension-key",
  apiSecret: "extension-secret",
});
assert.equal(JSON.stringify(extensionStyle.diagnostic).includes("extension-secret"), false);

const malformedExtensionUrl = runtime({
  CLOUDINARY_URL: "https://not-a-cloudinary-url.example.test",
});
assert.equal(malformedExtensionUrl.diagnostic.configured, false);
assert.equal(malformedExtensionUrl.diagnostic.provider, "none");

const fiveSecondReadyAsset = cloudinaryCompletedVideoResult({
  duration: 5,
  width: 720,
  height: 1280,
  derived: [
    {
      format: "mp4",
      secure_url: "https://res.cloudinary.com/fixture/video/upload/ready.mp4",
      bytes: 1_500_000,
      width: 720,
      height: 1280,
    },
    {
      format: "jpg",
      secure_url: "https://res.cloudinary.com/fixture/video/upload/poster.jpg",
      bytes: 55_000,
    },
  ],
});
assert.equal(fiveSecondReadyAsset?.duration_seconds, 5);
assert.match(fiveSecondReadyAsset?.output_url || "", /ready\.mp4$/);
assert.match(fiveSecondReadyAsset?.poster_url || "", /poster\.jpg$/);
assert.equal(
  cloudinaryCompletedVideoResult({
    duration: 5,
    derived: [
      {
        format: "mp4",
        secure_url: "https://res.cloudinary.com/fixture/video/upload/no-poster.mp4",
        bytes: 1_500_000,
      },
    ],
  }),
  null,
  "a video must never become Ready without its persisted public poster",
);

const customFallback = runtime({
  MEDIA_TRANSCODE_ENDPOINT: "https://media.example.test/transcode",
  MEDIA_TRANSCODE_TOKEN: "fixture-token",
});
assert.equal(customFallback.diagnostic.configured, true);
assert.equal(customFallback.diagnostic.provider, "custom");
assert.equal(customFallback.diagnostic.cloudinaryConfigured, false);

const missing = classifyVideoTranscoderError(
  missingVideoTranscoderConfiguration(),
);
assert.equal(missing.state, "missing_deployment_configuration");
assert.equal(missing.code, "VIDEO_TRANSCODER_NOT_CONFIGURED");
assert.equal(missing.status, 503);

const invalidCredentials = classifyVideoProviderStatus(401, "connection");
assert.equal(
  invalidCredentials.state,
  "invalid_cloudinary_credentials",
);
assert.equal(
  invalidCredentials.code,
  "VIDEO_TRANSCODER_INVALID_CREDENTIALS",
);
assert.equal(invalidCredentials.status, 502);

const outage = classifyVideoProviderStatus(503, "connection");
assert.equal(outage.state, "cloudinary_provider_outage");
assert.equal(outage.code, "VIDEO_TRANSCODER_PROVIDER_UNAVAILABLE");
assert.equal(outage.status, 503);
assert.equal(
  classifyVideoProviderStatus(420, "connection").state,
  "cloudinary_provider_outage",
  "Cloudinary rate limiting must remain retryable instead of becoming a permanent failure",
);
assert.equal(
  providerNetworkFailure(new TypeError("fetch failed")).state,
  "cloudinary_provider_outage",
);

const unsupported = classifyVideoProviderStatus(415, "transcode");
assert.equal(unsupported.state, "unsupported_input_media");
assert.equal(unsupported.code, "VIDEO_UNSUPPORTED_INPUT_MEDIA");
assert.equal(unsupported.status, 415);

const failed = classifyVideoProviderStatus(409, "transcode");
assert.equal(failed.state, "transcoding_failure");
assert.equal(failed.code, "VIDEO_TRANSCODING_FAILED");
assert.equal(failed.status, 502);

const serverLoader = fs.readFileSync(
  "src/lib/videoTranscoderServer.ts",
  "utf8",
);
assert.match(serverLoader, /import "server-only"/);
assert.match(serverLoader, /process\.env\[name\]/);
assert.match(serverLoader, /cache:\s*"no-store"/);
assert.match(serverLoader, /resources\/video\?max_results=1/);
assert.match(serverLoader, /Authorization:\s*`Basic/);
assert.doesNotMatch(serverLoader, /unstable_cache|React\.cache|cache\(/);

const processing = fs.readFileSync(
  "src/lib/videoProcessingServer.ts",
  "utf8",
);
assert.doesNotMatch(processing, /process\.env\.CLOUDINARY_/);
assert.match(processing, /loadVideoTranscoderRuntimeConfig/);
assert.match(processing, /classifyVideoProviderStatus/);

const jobsRoute = fs.readFileSync(
  "src/app/api/admin/media/video-jobs/route.ts",
  "utf8",
);
const statusRoute = fs.readFileSync(
  "src/app/api/admin/engine/system-status/route.ts",
  "utf8",
);
for (const route of [jobsRoute, statusRoute]) {
  assert.match(route, /videoTranscoderRuntimeDiagnostic/);
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /Cache-Control.*private, no-store/s);
}
assert.match(jobsRoute, /missing_variable_names/);
assert.match(jobsRoute, /X-Request-ID/);
assert.match(statusRoute, /testVideoTranscoderConnection/);
assert.match(statusRoute, /missing_variable_names/);

const client = fs.readFileSync(
  "src/components/admin/SystemStatusManager.tsx",
  "utf8",
);
assert.doesNotMatch(client, /process\.env|apiSecret|apiKey|cloudName/);
assert.match(client, /Netlify function variable presence/);
assert.match(client, /Present.*Missing/s);

console.log(
  "Video transcoder runtime verification passed: request-time presence-only loading, server-only Node routing, no cached configuration, authenticated Cloudinary connectivity wiring, and distinct missing configuration, invalid credentials, provider outage, unsupported media, and transcoding-failure states are covered.",
);
