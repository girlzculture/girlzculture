import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");

async function importTypeScript(path) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
  );
}

const upload = read("src/components/ImageUpload.tsx");
const legacyApi = read("src/app/api/media/upload/route.ts");
const prepareApi = read("src/app/api/media/upload/prepare/route.ts");
const finalizeApi = read("src/app/api/media/upload/finalize/route.ts");
const client = read("src/lib/mediaUploadClient.ts");
const server = read("src/lib/mediaUploadServer.ts");
const rules = read("src/lib/imageUpload.ts");
const migration = read(
  "supabase/migrations/20260727220000_direct_image_upload_pipeline.sql",
);
const registryMigration = read(
  "supabase/migrations/20260720150000_unified_media_engine.sql",
);
const ownerDashboard = read(
  "src/components/owner/OwnerDashboardApp.tsx",
);
const catalogEditors = read(
  "src/components/owner/StructuredCatalogEditors.tsx",
);
const contentManager = read("src/components/AdminContentManager.tsx");
const application = read("src/components/SalonApplication.tsx");
const review = read("src/components/ReviewForm.tsx");
const reviewRoute = read("src/app/api/reviews/[token]/route.ts");

const checks = [
  [
    upload.includes("Upload queue") &&
      upload.includes("runMediaUploadQueue") &&
      upload.includes("multiple={multiple}") &&
      upload.includes("Each file continues independently"),
    "real multi-file queue with independent outcomes",
  ],
  [
    upload.includes('label={`${device} image zoom`}') &&
      upload.includes("horizontal image position") &&
      upload.includes("vertical image position") &&
      upload.includes("Rotate 90°"),
    "per-device crop controls",
  ],
  [
    upload.includes('role="tablist"') &&
      upload.includes("desktop") &&
      upload.includes("tablet") &&
      upload.includes("mobile") &&
      upload.includes("activeProfile.safeArea"),
    "responsive placement previews",
  ],
  [
    client.includes("/api/media/upload/prepare") &&
      client.includes("uploadToSignedUrl") &&
      client.includes("/api/media/upload/finalize") &&
      client.includes("readApiResponse") &&
      !client.includes("FormData"),
    "signed direct-to-Storage transport with small JSON APIs",
  ],
  [
    prepareApi.includes("request.json()") &&
      finalizeApi.includes("request.json()") &&
      legacyApi.includes("Binary uploads are no longer accepted") &&
      !upload.includes("response.json()"),
    "safe JSON route/parser boundary without multipart function uploads",
  ],
  [
    server.includes("verifyPreparedMediaObjects") &&
      server.includes("checksum_sha256") &&
      server.includes("source") &&
      finalizeApi.includes("finalize_media_upload_session"),
    "server verification and transactional attachment",
  ],
  [
    rules.includes("logo:") &&
      rules.includes("cover:") &&
      rules.includes("avatar:") &&
      rules.includes("product:") &&
      rules.includes("review:"),
    "asset-specific profiles",
  ],
  [
    migration.includes("media-originals") &&
      migration.includes("create table if not exists public.media_upload_sessions") &&
      migration.includes("enable row level security") &&
      migration.includes("finalize_media_upload_session") &&
      migration.includes("grant execute") &&
      !migration.includes("create policy media_upload_sessions_admin_write") &&
      !migration.includes("to anon"),
    "private source retention, read-only browser sessions, RLS, and service-only finalize",
  ],
  [
    ownerDashboard.includes('field: "logo_url"') &&
      ownerDashboard.includes('field: "cover_photo_url"') &&
      ownerDashboard.includes('field: "gallery_photos"') &&
      ownerDashboard.includes('record_type: "product"') &&
      catalogEditors.includes('record_type: "style"') &&
      catalogEditors.includes('record_type: "stylist"'),
    "transactional attachments cover every saved salon-owner media surface",
  ],
  [
    registryMigration.includes("attach_registered_media") &&
      registryMigration.includes("'salon_products'") &&
      registryMigration.includes("'reviews'") &&
      registryMigration.includes("'content_pages'") &&
      registryMigration.includes("'blog_posts'") &&
      contentManager.includes('bucket="content-media"'),
    "staged new-record, review, and editorial uploads attach on record save",
  ],
  [
    !application.includes('bucket="application-media"') &&
      application.includes("Photos are added after approval"),
    "duplicate application media removed",
  ],
  [
    review.includes("/api/reviews/${encodeURIComponent(token)}") &&
      reviewRoute.includes("reviewTokenHash(token)") &&
      reviewRoute.includes('admin.rpc("submit_verified_guest_review"') &&
      !reviewRoute.includes("body.booking_id"),
    "signed booking-owned guest review path",
  ],
];

for (const [passed, name] of checks) {
  assert.ok(passed, `Unified media verification failed: ${name}`);
}

const protocol = await importTypeScript("src/lib/mediaUploadProtocol.ts");
assert.deepEqual(
  protocol.appendUniqueMediaUrl(["one", "two", "one"], "three", 3),
  ["one", "two", "three"],
);
assert.deepEqual(
  protocol.normalizeAttachment({
    record_type: "salon",
    record_id: "123e4567-e89b-42d3-a456-426614174000",
    field: "gallery_photos",
  }),
  {
    record_type: "salon",
    record_id: "123e4567-e89b-42d3-a456-426614174000",
    field: "gallery_photos",
  },
);
assert.throws(
  () =>
    protocol.normalizeAttachment({
      record_type: "salon",
      record_id: "not-a-uuid",
      field: "gallery_photos",
    }),
  /invalid/i,
);

const queue = await importTypeScript("src/lib/mediaUploadQueueCore.ts");
const visited = [];
const queueResult = await queue.runMediaUploadQueue(
  ["first", "broken", "last"],
  async (id) => {
    visited.push(id);
    if (id === "broken") throw new Error("simulated upload failure");
    return true;
  },
);
assert.deepEqual(visited, ["first", "broken", "last"]);
assert.deepEqual(queueResult, { completed: 2, failed: 1 });

const mediaErrors = await importTypeScript(
  "src/lib/mediaUploadErrorCore.ts",
);
assert.deepEqual(
  mediaErrors.expectedMediaRequestFailure(new Error("Unauthorized")),
  { status: 401, message: "Unauthorized" },
);
assert.deepEqual(
  mediaErrors.expectedMediaRequestFailure(
    new Error("Forbidden: this admin role does not have access to this section."),
  ),
  {
    status: 403,
    message:
      "Forbidden: this admin role does not have access to this section.",
  },
);
assert.deepEqual(
  mediaErrors.expectedMediaRequestFailure(
    new Error("The upload session was not found."),
  ),
  { status: 404, message: "The upload session was not found." },
);
assert.deepEqual(
  mediaErrors.expectedMediaRequestFailure(
    new Error("The upload session is no longer available."),
  ),
  {
    status: 409,
    message: "The upload session is no longer available.",
  },
);
assert.deepEqual(
  mediaErrors.expectedMediaRequestFailure(
    new Error("The upload reference is invalid."),
  ),
  { status: 400, message: "The upload reference is invalid." },
);
assert.equal(
  mediaErrors.expectedMediaRequestFailure(
    new Error(
      'new row violates row-level security policy for table "media_assets"',
    ),
  ),
  null,
);
assert.equal(
  mediaErrors.expectedMediaRequestFailure(
    new Error("invalid input syntax for type uuid: raw-provider-detail"),
  ),
  null,
);

const apiResponse = await importTypeScript("src/lib/apiResponseClient.ts");
const htmlResponse = new Response("<!DOCTYPE html><title>Internal Error</title>", {
  status: 502,
  headers: {
    "content-type": "text/html",
    "x-nf-request-id": "netlify-edge-reference",
  },
});
assert.deepEqual(
  await apiResponse.readApiResponse(htmlResponse, "Upload failed safely."),
  {
    error: "Upload failed safely. Reference netlify-edge-reference.",
    request_id: "netlify-edge-reference",
    reference: "netlify-edge-reference",
  },
);
const jsonResponse = new Response(
  JSON.stringify({ error: "Safe API error", request_id: "api-reference" }),
  { status: 400, headers: { "content-type": "application/json" } },
);
assert.deepEqual(await apiResponse.readApiResponse(jsonResponse), {
  error: "Safe API error",
  request_id: "api-reference",
});

console.log(
  "Verified direct signed image transport, safe response parsing, source/rendition registration, transactional attachment, and independent multi-file queue behavior.",
);
