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
const attachmentHardeningMigration = read(
  "supabase/migrations/20260728100000_media_attachment_scope_hardening.sql",
);
const normalizedAttachmentHardeningMigration =
  attachmentHardeningMigration.replaceAll("\r\n", "\n");
const platformAttachmentScopeMarker =
  "      or (\n        tg_table_name in ('content_pages', 'blog_posts', 'homepage_sections')";
const platformAttachmentScopeStart =
  normalizedAttachmentHardeningMigration.indexOf(
    platformAttachmentScopeMarker,
  );
const platformAttachmentScopeEnd =
  normalizedAttachmentHardeningMigration.indexOf(
    "\n      )\n    );",
    platformAttachmentScopeStart,
  );
assert.ok(
  platformAttachmentScopeStart >= 0 &&
    platformAttachmentScopeEnd > platformAttachmentScopeStart,
  "platform editorial media-attachment scope must be present",
);
const platformAttachmentScope =
  normalizedAttachmentHardeningMigration.slice(
    platformAttachmentScopeStart,
    platformAttachmentScopeEnd,
  );
assert.equal(
  (platformAttachmentScope.match(/from public\.admin_users/g) || []).length,
  2,
  "platform editorial attachment must independently authorize the saving and asset-owning administrators",
);
assert.ok(
  !platformAttachmentScope.includes("media.owner_user_id = v_owner_id"),
  "platform editorial attachment must support an authorized uploader and a different authorized saving admin",
);
const ownerDashboard = read(
  "src/components/owner/OwnerDashboardApp.tsx",
);
const catalogEditors = read(
  "src/components/owner/StructuredCatalogEditors.tsx",
);
const contentManager = read("src/components/AdminContentManager.tsx");
const adminContentRoute = read("src/app/api/admin/content/route.ts");
const marketplaceSalonCard = read(
  "src/components/public/MarketplaceSalonCard.tsx",
);
const styleCatalog = read("src/components/public/StyleCatalog.tsx");
const featuredProductPlacement = read(
  "src/components/public/FeaturedProductPlacement.tsx",
);
const application = read("src/components/SalonApplication.tsx");
const review = read("src/components/ReviewForm.tsx");
const reviewRoute = read("src/app/api/reviews/[token]/route.ts");
const safeImage = read("src/components/site/SafeImage.tsx");
const responsiveMediaSource = read("src/lib/responsiveMedia.ts");
const profileSnapshotSource = read(
  "src/lib/mediaUploadProfileSnapshotCore.ts",
);

const ownerProfileSave = ownerDashboard.slice(
  ownerDashboard.indexOf("async function updateSalonServer"),
  ownerDashboard.indexOf("async function saveRecordServer"),
);
const ownerRecordSave = ownerDashboard.slice(
  ownerDashboard.indexOf("async function saveRecordServer"),
  ownerDashboard.indexOf("async function removeRecord"),
);
const uploadLock = upload.slice(
  upload.indexOf("const locked ="),
  upload.indexOf("const aspect ="),
);
assert.ok(
  ownerProfileSave.includes("readApiResponse") &&
    !ownerProfileSave.includes("response.json()"),
  "salon profile persistence must safely parse non-JSON and empty responses",
);
assert.ok(
  ownerRecordSave.includes("readApiResponse") &&
    !ownerRecordSave.includes("response.json()"),
  "salon record persistence must safely parse non-JSON and empty responses",
);
assert.ok(
  catalogEditors.includes("readApiResponse") &&
    !catalogEditors.includes("response.json()"),
  "structured catalog persistence loads must use the shared safe parser",
);
assert.ok(
  contentManager.includes("readApiResponse") &&
    !contentManager.includes("response.json()"),
  "content page, section, and blog persistence must use the shared safe parser",
);

for (const [file, source] of [
  ["AdminContentManager.tsx", contentManager],
  ["OwnerDashboardApp.tsx", ownerDashboard],
  ["StructuredCatalogEditors.tsx", catalogEditors],
]) {
  const callSites = [...source.matchAll(/<ImageUpload\b[\s\S]*?\/>/g)].map(
    (match) => match[0],
  );
  assert.ok(callSites.length > 0, `${file} must contain media upload surfaces`);
  assert.ok(
    callSites.every((callSite) => /\bpreset=/.test(callSite)),
    `${file} has an ImageUpload without an explicit placement preset`,
  );
}

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
    upload.includes("const profileReady =") &&
      !uploadLock.includes("!profileReady") &&
      upload.includes("disabled={locked}") &&
      upload.includes("profile: IMAGE_UPLOAD_PROFILES[presetKey]") &&
      !upload.includes("Image requirements unavailable") &&
      !upload.includes("Retry image requirements"),
    "safe checked-in placement rules remain usable while authoritative guidance reloads",
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
    client.includes("resumeUploadId") &&
      client.includes("onFinalizePending") &&
      client.includes("runBoundedMediaFinalize") &&
      upload.includes("pendingUploadId") &&
      upload.includes("Retry finishes the same saved upload"),
    "bounded idempotent finalize retry retains the prepared upload ID",
  ],
  [
    prepareApi.includes("request.json()") &&
      finalizeApi.includes("request.json()") &&
      legacyApi.includes("This binary upload route is no longer available") &&
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
    legacyApi.includes("loadConfiguredMediaProfile") &&
      !legacyApi.includes("getEngineNumber") &&
      !server.includes('from "@/lib/mediaImageProcessor"') &&
      !server.includes('await import("@/lib/mediaImageProcessor")') &&
      finalizeApi.includes('await import("@/lib/mediaImageProcessor")') &&
      server.includes("resolveMediaUploadProfile") &&
      server.includes("runWithOperationalContext") &&
      server.includes("MEDIA_UPLOAD_PROFILE_TIMEOUT_MS") &&
      server.includes("reportMediaUploadProfileFallback({ kind, failures })") &&
      server.includes('.from("engine_settings")') &&
      (server.match(/loadConfiguredMediaProfile/g) || []).length >= 2 &&
      server.includes("quality: profile.quality,") &&
      server.includes("quality: profileSnapshot.quality"),
    "one bounded server profile loader applies configured overrides or safe deduplicated fallbacks to GET and immutable upload preparation",
  ],
  [
    finalizeApi.includes("preparedMediaProfileSnapshot") &&
      !finalizeApi.includes("loadMediaProfile") &&
      !finalizeApi.includes("loadConfiguredMediaProfile") &&
      server.includes('slot === "source" ? extensionFor(value.mime_type) : "img"') &&
      responsiveMediaSource.includes("jpe?g|png|img") &&
      profileSnapshotSource.includes("maximum_bytes"),
    "immutable prepared profile and MIME-safe neutral derivative paths",
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
    attachmentHardeningMigration.includes(
      "create or replace function public.attach_registered_media()",
    ) &&
      attachmentHardeningMigration.includes(
        "media.salon_id = v_salon_id",
      ) &&
      attachmentHardeningMigration.includes(
        "media.owner_user_id = v_owner_id",
      ) &&
      attachmentHardeningMigration.includes(
        "saving_administrator.permissions ->> v_admin_permission",
      ) &&
      attachmentHardeningMigration.includes(
        "coalesce(saving_administrator.status, 'Active') = 'Active'",
      ) &&
      attachmentHardeningMigration.includes(
        "media.bucket_id = 'content-media'",
      ) &&
      attachmentHardeningMigration.includes(
        "media.salon_id is null",
      ) &&
      attachmentHardeningMigration.includes(
        "asset_owner_administrator.permissions",
      ) &&
      attachmentHardeningMigration.includes(
        "asset_owner_administrator.status",
      ) &&
      attachmentHardeningMigration.includes(
        ") = media.owner_user_id",
      ) &&
      attachmentHardeningMigration.includes(
        "saving_administrator.permissions ->> 'settings'",
      ) &&
      attachmentHardeningMigration.includes(
        "asset_owner_administrator.permissions ->> 'settings'",
      ) &&
      attachmentHardeningMigration.includes(
        "revoke all on function public.attach_registered_media()",
      ) &&
      !attachmentHardeningMigration.includes(
        "auth.role() = 'service_role'",
      ) &&
      adminContentRoute.includes("updated_by: user.id"),
    "automatic attachment is scoped to the saved salon/review owner or two active authorized platform administrators and content-only media",
  ],
  [
    !application.includes('bucket="application-media"') &&
      application.includes("Photos are added after approval"),
    "duplicate application media removed",
  ],
  [
    safeImage.includes("responsiveMediaSources") &&
      safeImage.includes("<picture") &&
      safeImage.includes("responsiveSources.mobile") &&
      safeImage.includes("responsiveSources.tablet") &&
      safeImage.includes('rendition?: "responsive" | "thumbnail"') &&
      safeImage.includes("responsiveSources.thumbnail"),
    "public image rendering selects generated responsive and thumbnail renditions",
  ],
  [
    marketplaceSalonCard.includes('rendition="thumbnail"') &&
      styleCatalog.includes('rendition="thumbnail"') &&
      featuredProductPlacement.includes('rendition="thumbnail"'),
    "compact marketplace, style, and product cards request thumbnail renditions",
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

const retryCore = await importTypeScript("src/lib/mediaUploadRetryCore.ts");
assert.equal(retryCore.MEDIA_FINALIZE_MAX_ATTEMPTS, 3);
for (const status of [408, 425, 429, 500, 503]) {
  assert.equal(retryCore.shouldRetryMediaFinalizeStatus(status), true);
}
for (const status of [400, 401, 403, 404, 409, 410, 422]) {
  assert.equal(retryCore.shouldRetryMediaFinalizeStatus(status), false);
}
assert.deepEqual(
  [1, 2, 3].map(retryCore.mediaFinalizeRetryDelay),
  [200, 400, 800],
);
assert.equal(retryCore.mediaFinalizeSessionIsTerminal(404), true);
assert.equal(retryCore.mediaFinalizeSessionIsTerminal(409), true);
assert.equal(retryCore.mediaFinalizeSessionIsTerminal(503), false);
const repeatedUploadIds = [];
const retriedFinalize = await retryCore.runBoundedMediaFinalize({
  uploadId: "123e4567-e89b-42d3-a456-426614174000",
  attempt: async (uploadId, attempt) => {
    repeatedUploadIds.push(uploadId);
    if (attempt < 3) {
      return {
        ok: false,
        status: 503,
        error: new Error("simulated ambiguous finalize failure"),
      };
    }
    return { ok: true, value: { url: "https://example.com/media.img" } };
  },
  wait: async () => undefined,
});
assert.deepEqual(repeatedUploadIds, [
  "123e4567-e89b-42d3-a456-426614174000",
  "123e4567-e89b-42d3-a456-426614174000",
  "123e4567-e89b-42d3-a456-426614174000",
]);
assert.deepEqual(retriedFinalize, {
  url: "https://example.com/media.img",
});

const profileSnapshot = await importTypeScript(
  "src/lib/mediaUploadProfileSnapshotCore.ts",
);
const preparedSnapshot = {
  profile: {
    key: "cover",
    aspect_width: 16,
    aspect_height: 7,
    output_width: 1920,
    quality: 88,
    maximum_bytes: 4 * 1024 * 1024,
  },
};
assert.deepEqual(
  profileSnapshot.preparedMediaProfileSnapshot(
    preparedSnapshot,
    "cover",
  ),
  {
    key: "cover",
    aspectWidth: 16,
    aspectHeight: 7,
    outputWidth: 1920,
    quality: 88,
    maximumBytes: 4 * 1024 * 1024,
  },
);
assert.equal(
  profileSnapshot.preparedMediaProfileSnapshot(
    {
      profile: {
        ...preparedSnapshot.profile,
        quality: 99.5,
      },
    },
    "cover",
  ).quality,
  99.5,
  "the Engine quality value must remain immutable in the upload snapshot",
);
assert.throws(
  () =>
    profileSnapshot.preparedMediaProfileSnapshot(
      {
        profile: {
          ...preparedSnapshot.profile,
          quality: 100.1,
        },
      },
      "cover",
    ),
  /quality/i,
);
assert.deepEqual(
  profileSnapshot.preparedMediaRenditionDimensions(
    profileSnapshot.preparedMediaProfileSnapshot(
      preparedSnapshot,
      "cover",
    ),
    "desktop",
  ),
  { width: 1920, height: 840 },
);
assert.deepEqual(
  profileSnapshot.preparedMediaRenditionDimensions(
    profileSnapshot.preparedMediaProfileSnapshot(
      preparedSnapshot,
      "cover",
    ),
    "tablet",
  ),
  { width: 1440, height: 1080 },
);
assert.deepEqual(
  profileSnapshot.preparedMediaRenditionDimensions(
    profileSnapshot.preparedMediaProfileSnapshot(
      preparedSnapshot,
      "cover",
    ),
    "mobile",
  ),
  { width: 1080, height: 1920 },
);
assert.deepEqual(
  profileSnapshot.preparedMediaRenditionDimensions(
    profileSnapshot.preparedMediaProfileSnapshot(
      preparedSnapshot,
      "cover",
    ),
    "thumbnail",
  ),
  { width: 480, height: 360 },
);
assert.throws(
  () =>
    profileSnapshot.preparedMediaProfileSnapshot(
      preparedSnapshot,
      "gallery",
    ),
  /does not match/i,
);
assert.throws(
  () =>
    profileSnapshot.preparedMediaProfileSnapshot(
      {
        profile: {
          ...preparedSnapshot.profile,
          maximum_bytes: Number.MAX_SAFE_INTEGER,
        },
      },
      "cover",
  ),
  /file-size limit/i,
);
const gallerySnapshot = {
  ...profileSnapshot.preparedMediaProfileSnapshot(
    {
      profile: {
        key: "gallery",
        aspect_width: 4,
        aspect_height: 3,
        output_width: 1600,
        quality: 88,
        maximum_bytes: 4 * 1024 * 1024,
      },
    },
    "gallery",
  ),
};
assert.deepEqual(
  Object.fromEntries(
    ["desktop", "tablet", "mobile", "thumbnail"].map((slot) => [
      slot,
      profileSnapshot.preparedMediaRenditionDimensions(
        gallerySnapshot,
        slot,
      ),
    ]),
  ),
  {
    desktop: { width: 1600, height: 1200 },
    tablet: { width: 1200, height: 900 },
    mobile: { width: 720, height: 540 },
    thumbnail: { width: 480, height: 360 },
  },
);
assert.deepEqual(
  Object.fromEntries(
    ["desktop", "tablet", "mobile", "thumbnail"].map((slot) => [
      slot,
      profileSnapshot.preparedMediaRenditionDimensions(
        profileSnapshot.preparedMediaProfileSnapshot(
          preparedSnapshot,
          "cover",
        ),
        slot,
      ),
    ]),
  ),
  {
    desktop: { width: 1920, height: 840 },
    tablet: { width: 1440, height: 1080 },
    mobile: { width: 1080, height: 1920 },
    thumbnail: { width: 480, height: 360 },
  },
);

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
for (const message of [
  "The prepared upload is invalid.",
  "The prepared upload is incomplete.",
  "The prepared image profile is unavailable.",
  "The prepared image profile does not match this upload.",
  "The prepared image file-size limit is invalid.",
  "The original upload size does not match its preparation.",
  "The desktop derivative was not prepared.",
  "The prepared derivative extension does not match its generated format.",
  "The canonical image derivative could not be verified.",
  "The public image rendition is unavailable.",
  "This image format does not match the selected file. Export it as JPG, PNG, or GIF and try again.",
  "This file is damaged or its image format does not match its extension.",
  "MEDIA_STORAGE_OBJECT_MISSING",
  "MEDIA_DERIVATIVE_STORAGE_FAILED",
  "MEDIA_DERIVATIVE_VERIFY_FAILED",
]) {
  assert.equal(
    mediaErrors.expectedMediaRequestFailure(new Error(message)),
    null,
    `internal media failure must become a monitored 5xx: ${message}`,
  );
}

const monitoringCore = await importTypeScript(
  "src/lib/operationalMonitoringCore.ts",
);
for (const [status, message] of [
  [400, "Send a valid JSON image-upload request."],
  [400, "Upload a supported JPG, PNG, or animated GIF."],
  [400, "Only one original image may be uploaded."],
  [410, "This binary upload route is no longer available."],
  [404, "The upload session was not found."],
  [409, "The upload session is no longer available."],
]) {
  assert.equal(
    monitoringCore.shouldCaptureResponse(
      status,
      message,
      "provider-backed",
    ),
    false,
    `expected media response must not create an Engine incident: ${message}`,
  );
}
assert.equal(
  monitoringCore.shouldCaptureResponse(
    400,
    'new row violates row-level security policy for table "media_assets"',
    "provider-backed",
  ),
  true,
  "unexpected RLS failures must create an Engine incident",
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
  { error: "Upload failed safely." },
);
const correlatedHtmlResponse = new Response(
  "<!DOCTYPE html><title>Internal Error</title>",
  {
    status: 502,
    headers: {
      "content-type": "text/html",
      "x-request-id": "engine-reference",
      "x-nf-request-id": "engine-reference",
    },
  },
);
assert.deepEqual(
  await apiResponse.readApiResponse(
    correlatedHtmlResponse,
    "Upload failed safely.",
  ),
  {
    error: "Upload failed safely. Reference engine-reference.",
    request_id: "engine-reference",
    reference: "engine-reference",
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
const emptyJsonResponse = new Response("", {
  status: 504,
  headers: {
    "content-type": "application/json",
    "x-request-id": "empty-json-reference",
  },
});
assert.deepEqual(
  await apiResponse.readApiResponse(
    emptyJsonResponse,
    "The save could not be completed.",
  ),
  {
    error:
      "The save could not be completed. Reference empty-json-reference.",
    request_id: "empty-json-reference",
    reference: "empty-json-reference",
  },
);
const referenceOnlyJsonResponse = new Response(
  JSON.stringify({ reference: "api-failure-reference" }),
  {
    status: 500,
    headers: { "content-type": "application/json" },
  },
);
assert.deepEqual(
  await apiResponse.readApiResponse(
    referenceOnlyJsonResponse,
    "The save could not be completed.",
  ),
  {
    error:
      "The save could not be completed. Reference api-failure-reference.",
    request_id: "api-failure-reference",
    reference: "api-failure-reference",
  },
);
const unsafeReferenceResponse = new Response("<!DOCTYPE html>", {
  status: 502,
  headers: {
    "content-type": "text/html",
    "x-request-id": "<script>alert(1)</script>",
  },
});
assert.deepEqual(
  await apiResponse.readApiResponse(
    unsafeReferenceResponse,
    "The save could not be completed.",
  ),
  { error: "The save could not be completed." },
);

const responsiveMedia = await importTypeScript(
  "src/lib/responsiveMedia.ts",
);
const canonicalDesktop =
  "https://project.supabase.co/storage/v1/object/public/salon-photos/salons/example/123e4567-e89b-42d3-a456-426614174000-desktop-salon-cover.jpg?version=2";
assert.deepEqual(responsiveMedia.responsiveMediaSources(canonicalDesktop), {
  desktop: canonicalDesktop,
  tablet:
    "https://project.supabase.co/storage/v1/object/public/salon-photos/salons/example/123e4567-e89b-42d3-a456-426614174000-tablet-salon-cover.jpg?version=2",
  mobile:
    "https://project.supabase.co/storage/v1/object/public/salon-photos/salons/example/123e4567-e89b-42d3-a456-426614174000-mobile-salon-cover.jpg?version=2",
  thumbnail:
    "https://project.supabase.co/storage/v1/object/public/salon-photos/salons/example/123e4567-e89b-42d3-a456-426614174000-thumbnail-salon-cover.jpg?version=2",
});
const neutralDesktop =
  "https://project.supabase.co/storage/v1/object/public/salon-photos/salons/example/123e4567-e89b-42d3-a456-426614174000-desktop-salon-cover.img";
assert.deepEqual(responsiveMedia.responsiveMediaSources(neutralDesktop), {
  desktop: neutralDesktop,
  tablet:
    "https://project.supabase.co/storage/v1/object/public/salon-photos/salons/example/123e4567-e89b-42d3-a456-426614174000-tablet-salon-cover.img",
  mobile:
    "https://project.supabase.co/storage/v1/object/public/salon-photos/salons/example/123e4567-e89b-42d3-a456-426614174000-mobile-salon-cover.img",
  thumbnail:
    "https://project.supabase.co/storage/v1/object/public/salon-photos/salons/example/123e4567-e89b-42d3-a456-426614174000-thumbnail-salon-cover.img",
});
assert.equal(
  responsiveMedia.responsiveMediaSources(
    "https://example.com/non-media-desktop-photo.jpg",
  ),
  null,
);
assert.equal(
  responsiveMedia.responsiveMediaSources(
    "https://project.supabase.co/storage/v1/object/public/content-media/123e4567-e89b-42d3-a456-426614174000-desktop-animation.gif",
  ),
  null,
);

console.log(
  "Verified direct signed image transport, safe response parsing, source/rendition registration, transactional attachment, and independent multi-file queue behavior.",
);
