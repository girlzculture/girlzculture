import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import {
  ScopedApiError,
  createScopedJsonApiClient,
  scopedApiErrorMessage,
} from "../src/lib/scopedApiCore.ts";
import {
  pollVideoJobUntilReady,
} from "../src/lib/videoJobPollingCore.ts";
import {
  cloudinaryCompletedVideoResult,
} from "../src/lib/videoTranscoderCore.ts";

const platformErrorsSource = fs
  .readFileSync("src/lib/platformErrors.ts", "utf8")
  .replace(
    'import { isStaticBuildPhase } from "@/lib/buildPhaseCore";',
    "const isStaticBuildPhase = () => false;",
  )
  .replace(
    'import { deploymentReleaseId } from "@/lib/deploymentIdentity";',
    'const deploymentReleaseId = () => "verification";',
  );
const { capturePlatformError } = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(platformErrorsSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64")}`
);

const adminId = "10000000-0000-4000-8000-000000000001";
const jobId = "20000000-0000-4000-8000-000000000002";
const engineReference = "30000000-0000-4000-8000-000000000003";
const eventId = "40000000-0000-4000-8000-000000000004";
const occurrenceReference = "50000000-0000-4000-8000-000000000005";
let activeSession = {
  access_token: "admin-token-before-refresh",
  user: { id: adminId },
};
let refreshCount = 0;
let getPollCount = 0;
const requests = [];

const fetcher = async (target, init = {}) => {
  const url = String(target);
  const headers = new Headers(init.headers);
  requests.push({
    url,
    method: init.method || "GET",
    authorization: headers.get("authorization"),
    accept: headers.get("accept"),
    requestedWith: headers.get("x-requested-with"),
    credentials: init.credentials,
    redirect: init.redirect,
  });
  assert.equal(init.credentials, "same-origin");
  assert.equal(init.redirect, "manual");
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("x-requested-with"), "GirlzCultureAdmin");

  if (url === "/api/admin/media/video-jobs" && init.method === "POST") {
    const action = JSON.parse(String(init.body || "{}")).action;
    if (action === "create") {
      assert.equal(
        headers.get("authorization"),
        "Bearer admin-token-before-refresh",
      );
      return Response.json({ job: { id: jobId, status: "Uploaded" } }, {
        status: 202,
      });
    }
    assert.equal(action, "process");
    assert.equal(
      headers.get("authorization"),
      "Bearer admin-token-before-refresh",
    );
    return Response.json({
      job: { id: jobId, status: "Transcoding", progress_percent: 35 },
      provider: "cloudinary",
    }, { status: 202 });
  }

  if (url.includes("/api/admin/media/video-jobs?id=")) {
    getPollCount += 1;
    if (getPollCount === 1) {
      return Response.json({
        error: `Your session could not be verified. Reference ${engineReference}.`,
        code: "AUTHENTICATION_SESSION_FAILURE",
        request_id: engineReference,
        record_type: "record",
        record_id: jobId,
      }, {
        status: 401,
        headers: { "X-Request-ID": engineReference },
      });
    }
    assert.equal(
      headers.get("authorization"),
      "Bearer admin-token-after-refresh",
    );
    if (getPollCount === 2) {
      return Response.json({
        jobs: [{
          id: jobId,
          status: "Inspecting",
          progress_percent: 20,
          provider_job_id: `cloudinary:girlz-culture/trending/${jobId}`,
        }],
      });
    }
    if (getPollCount === 3) {
      return Response.json({
        jobs: [{
          id: jobId,
          status: "Transcoding",
          progress_percent: 70,
          provider_job_id: `cloudinary:girlz-culture/trending/${jobId}`,
        }],
      });
    }
    return Response.json({
      jobs: [{
        id: jobId,
        status: "Ready",
        progress_percent: 100,
        output_url: "https://res.cloudinary.com/example/video/upload/ready.mp4",
        poster_url: "https://res.cloudinary.com/example/image/upload/poster.jpg",
        provider_job_id: `cloudinary:girlz-culture/trending/${jobId}`,
      }],
    });
  }
  throw new Error(`Unexpected test request: ${url}`);
};

const api = await createScopedJsonApiClient({
  getSession: async () => activeSession,
  refreshSession: async () => {
    refreshCount += 1;
    activeSession = {
      access_token: "admin-token-after-refresh",
      user: { id: adminId },
    };
    return activeSession;
  },
  fetcher,
});

const created = await api.request("/api/admin/media/video-jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "create" }),
});
assert.equal(created.job.id, jobId);

const accepted = await api.request("/api/admin/media/video-jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "process", id: jobId }),
});
assert.equal(accepted.provider, "cloudinary");

const statuses = [];
const ready = await pollVideoJobUntilReady({
  jobId,
  intervalMs: 1,
  maxAttempts: 8,
  sleep: async () => undefined,
  getJob: async () => {
    const body = await api.request(
      `/api/admin/media/video-jobs?id=${encodeURIComponent(jobId)}`,
    );
    return Array.isArray(body.jobs) ? body.jobs[0] || null : null;
  },
  onUpdate: (job) => statuses.push(job.status),
});
assert.deepEqual(statuses, ["Inspecting", "Transcoding", "Ready"]);
assert.equal(refreshCount, 1);
assert.equal(ready.provider_job_id, `cloudinary:girlz-culture/trending/${jobId}`);
assert.match(String(ready.output_url), /^https:\/\/res\.cloudinary\.com\//);

const attachedSlot = {
  video_processing_job_id: ready.id,
  video_url: ready.output_url,
  thumbnail_url: ready.poster_url,
};
assert.deepEqual(attachedSlot, {
  video_processing_job_id: jobId,
  video_url: "https://res.cloudinary.com/example/video/upload/ready.mp4",
  thumbnail_url: "https://res.cloudinary.com/example/image/upload/poster.jpg",
});

const recoveredProviderResult = cloudinaryCompletedVideoResult({
  duration: 18.5,
  width: 1080,
  height: 1920,
  derived: [
    {
      format: "mp4",
      secure_url:
        "https://res.cloudinary.com/example/video/upload/recovered.mp4",
      bytes: 4_200_000,
      width: 720,
      height: 1280,
    },
    {
      format: "jpg",
      secure_url:
        "https://res.cloudinary.com/example/image/upload/recovered.jpg",
      bytes: 42_000,
    },
  ],
});
assert.deepEqual(recoveredProviderResult, {
  output_url:
    "https://res.cloudinary.com/example/video/upload/recovered.mp4",
  poster_url:
    "https://res.cloudinary.com/example/image/upload/recovered.jpg",
  output_size_bytes: 4_200_000,
  duration_seconds: 18.5,
  width_px: 720,
  height_px: 1280,
});
assert.equal(
  cloudinaryCompletedVideoResult({
    duration: 18.5,
    derived: [{
      format: "mp4",
      secure_url: "https://res.cloudinary.com/example/video/upload/only.mp4",
      bytes: 1_000,
    }],
  }),
  null,
  "A provider result is not Ready until both browser video and poster exist.",
);
assert.ok(getPollCount >= 4, "The lifecycle must perform repeated GET polling.");
assert.ok(
  requests.every((request) =>
    /^Bearer admin-token-(?:before|after)-refresh$/.test(
      String(request.authorization),
    )
  ),
  "Every POST and GET must carry the scoped admin bearer identity.",
);

let htmlError;
const htmlClient = await createScopedJsonApiClient({
  getSession: async () => ({
    access_token: "expired",
    user: { id: adminId },
  }),
  refreshSession: async () => ({
    access_token: "refreshed",
    user: { id: adminId },
  }),
  fetcher: async () => new Response("<!DOCTYPE html><title>Log in</title>", {
    status: 401,
    headers: {
      "Content-Type": "text/html",
      "X-Request-ID": engineReference,
    },
  }),
});
try {
  await htmlClient.request("/api/admin/trending-campaigns");
} catch (error) {
  htmlError = error;
}
assert.ok(htmlError instanceof ScopedApiError);
assert.equal(htmlError.code, "AUTHENTICATION_SESSION_FAILURE");
assert.equal(htmlError.requestId, engineReference);
assert.doesNotMatch(htmlError.message, /doctype|<html|unexpected token/i);

let correlatedError;
const correlatedClient = await createScopedJsonApiClient({
  getSession: async () => ({
    access_token: "expired",
    user: { id: adminId },
  }),
  refreshSession: async () => ({
    access_token: "still-expired",
    user: { id: adminId },
  }),
  fetcher: async () => Response.json({
    error: "Your session could not be verified.",
    code: "AUTHENTICATION_SESSION_FAILURE",
    request_id: engineReference,
    record_id: jobId,
  }, {
    status: 401,
    headers: { "X-Request-ID": engineReference },
  }),
});
try {
  await correlatedClient.request(
    `/api/admin/media/video-jobs?id=${encodeURIComponent(jobId)}`,
  );
} catch (error) {
  correlatedError = error;
}
assert.ok(correlatedError instanceof ScopedApiError);
assert.equal(correlatedError.requestId, engineReference);
assert.equal(correlatedError.recordId, jobId);
const correlatedMessage = scopedApiErrorMessage(
  correlatedError,
  "Unable to poll video.",
  jobId,
);
assert.match(correlatedMessage, new RegExp(engineReference));
assert.match(correlatedMessage, new RegExp(jobId));
assert.equal(
  correlatedMessage.match(new RegExp(engineReference, "g"))?.length,
  1,
);

let identityChangedError;
let changedIdentityFetches = 0;
const changedIdentityClient = await createScopedJsonApiClient({
  getSession: async () => ({
    access_token: "expired",
    user: { id: adminId },
  }),
  refreshSession: async () => ({
    access_token: "different-account",
    user: { id: "60000000-0000-4000-8000-000000000006" },
  }),
  fetcher: async () => {
    changedIdentityFetches += 1;
    return Response.json({ error: "Session expired." }, { status: 401 });
  },
});
try {
  await changedIdentityClient.request("/api/admin/media/video-jobs");
} catch (error) {
  identityChangedError = error;
}
assert.ok(identityChangedError instanceof ScopedApiError);
assert.equal(identityChangedError.code, "AUTHENTICATION_SESSION_FAILURE");
assert.equal(changedIdentityFetches, 1);

const originalConsoleError = console.error;
console.error = () => undefined;
const canonicalReference = await capturePlatformError({
  admin: {
    rpc: () => ({
      abortSignal: async (signal) => {
        assert.ok(signal instanceof AbortSignal);
        return { data: eventId, error: null };
      },
    }),
    from: () => ({
      select: () => ({
        eq: () => {
          const builder = {
            abortSignal(signal) {
              assert.ok(signal instanceof AbortSignal);
              return builder;
            },
            maybeSingle: async () => ({
              data: { reference: engineReference },
              error: null,
            }),
          };
          return builder;
        },
      }),
    }),
  },
  error: new Error("AUTHENTICATION_SESSION_FAILURE"),
  feature: "trending-video-processing",
  action: "get:/api/admin/media/video-jobs",
  actorRole: "admin",
  recordType: "video_processing_job",
  recordId: jobId,
  safeMessage: "Your session could not be verified.",
  metadata: { occurrence_reference: occurrenceReference },
});
console.error = originalConsoleError;
assert.equal(
  canonicalReference,
  engineReference,
  "The user-visible reference must be the canonical deduplicated Engine event reference.",
);

const jobsRoute = fs.readFileSync(
  "src/app/api/admin/media/video-jobs/route.ts",
  "utf8",
);
assert.match(jobsRoute, /requireAdminPermission\(request,\s*"marketing"\)/);
assert.match(jobsRoute, /withOperationalMonitoring/);
assert.match(jobsRoute, /Cache-Control": "private, no-store"/);
assert.doesNotMatch(jobsRoute, /NextResponse\.redirect|redirect\(/);

const adminManager = fs.readFileSync(
  "src/components/admin/AdminTrendingCampaigns.tsx",
  "utf8",
);
assert.match(adminManager, /createAuthenticatedApiClient\("admin"\)/);
assert.match(adminManager, /pollVideoJobUntilReady/);
assert.doesNotMatch(
  adminManager,
  /\/api\/admin\/media\/video-jobs[\s\S]{0,300}response\.json\(\)/,
);

console.log(
  "Video-job authentication lifecycle verification passed: POST and repeated GET polling use one pinned admin identity, cookies and bearer auth are sent, a 401 refresh keeps the same account, HTML login/error responses never reach JSON parsing, Ready Cloudinary output remains attached to its media job and campaign slot, and the user-visible reference resolves to the canonical deduplicated Engine event.",
);
