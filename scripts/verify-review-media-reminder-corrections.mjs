import assert from "node:assert/strict";
import fs from "node:fs";
import { deterministicContentDecision } from "../src/lib/contentModerationCore.ts";
import { normalizeImageFile } from "../src/lib/imageUpload.ts";
import { bookingReminderDueWindow, notificationDeliveryKey, runIsolatedReminderBatch } from "../src/lib/bookingReminderCore.ts";
import { runBookingReminderWorker } from "../netlify/functions/_booking-reminder-worker.mjs";
import { netlifyReleaseIdentity } from "../netlify/functions/_monitoring.mjs";

const blockedExamples = [
  ["stupid", "stupid"],
  ["stup1d", "stup1d"],
  ["stuuuuupid", "stuuuuupid"],
  ["s t u p i d", "s t u p i d"],
  ["stu-p!d", "stu-p!d"],
  ["bitch", "bitch"],
  ["b1tch", "b1tch"],
  ["st\u200bup1d", "stup1d"],
];
for (const [submitted, excerpt] of blockedExamples) {
  const decision = deterministicContentDecision({ body: submitted });
  assert.equal(decision.outcome, "block", `${submitted} must be blocked`);
  assert.equal(decision.field, "body");
  assert.equal(decision.matchedInput, excerpt);
}
assert.equal(deterministicContentDecision({ name: "b1tch" }).field, "name");
assert.equal(deterministicContentDecision({ title: "stu-p!d" }).field, "title");

for (const threat of [
  "I'm going to burn the salon.",
  "I’m going to hurt you.",
  "I'll shoot you.",
  "We're going to bomb the salon.",
  "You're going to die.",
]) {
  const decision = deterministicContentDecision({ body: threat });
  assert.equal(decision.outcome, "block", `${threat} must be blocked`);
  assert.equal(decision.reason, "threat", `${threat} must be classified as a threat`);
}

for (const allowed of [
  "Bad service.",
  "Poor service.",
  "Terrible experience.",
  "Horrible wait time.",
  "The appointment began two hours late.",
  "The style did not match the photograph.",
  "4C hair",
  "2 hours",
  "5 stars",
  "Scunthorpe salon visit",
]) {
  assert.equal(
    deterministicContentDecision({ body: allowed }).outcome,
    "allow",
    `${allowed} must not be a compact-match false positive`,
  );
}

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const gifBytes = new TextEncoder().encode("GIF89a image-data");

const renamedJpeg = await normalizeImageFile(
  new File([jpegBytes], "portrait.png", { type: "image/png" }),
);
assert.equal(renamedJpeg.type, "image/jpeg");
assert.equal(renamedJpeg.name, "portrait.jpg");

const genericPng = await normalizeImageFile(
  new File([pngBytes], "camera-upload", { type: "application/octet-stream" }),
);
assert.equal(genericPng.type, "image/png");
assert.equal(genericPng.name, "camera-upload.png");

const genericGif = await normalizeImageFile(
  new File([gifBytes], "animation.bin", { type: "application/octet-stream" }),
);
assert.equal(genericGif.type, "image/gif");
assert.equal(genericGif.name, "animation.gif");

await assert.rejects(
  normalizeImageFile(new File([new TextEncoder().encode("RIFFxxxxWEBP")], "photo.webp", { type: "image/webp" })),
  /supported JPG, PNG, or animated GIF/,
);
await assert.rejects(
  normalizeImageFile(new File([new Uint8Array([1, 2, 3, 4])], "broken.jpg", { type: "image/jpeg" })),
  /damaged or cannot be read/,
);

const environment = {
  DEPLOY_PRIME_URL: "https://deploy-preview.example.test",
  INTERNAL_API_SECRET: "test-secret-never-log",
};
const noSleep = async () => {};

assert.deepEqual(
  netlifyReleaseIdentity({ COMMIT_REF: "0123456789abcdef" }),
  { release: "0123456789abcdef", source: "COMMIT_REF", configured: true },
);
assert.deepEqual(
  netlifyReleaseIdentity({ DEPLOY_URL: "https://deploy-123.example.netlify.app" }),
  { release: "https://deploy-123.example.netlify.app", source: "DEPLOY_URL", configured: true },
);
assert.deepEqual(
  netlifyReleaseIdentity({}),
  { release: "release-id-missing", source: "missing", configured: false },
);

let successAttempts = 0;
const transientSuccess = await runBookingReminderWorker({
  environment,
  sleep: noSleep,
  fetchImpl: async (_url, init) => {
    successAttempts += 1;
    assert.equal(init.headers["x-internal-secret"], environment.INTERNAL_API_SECRET);
    if (successAttempts < 3) {
      return Response.json({ error: "temporarily unavailable" }, { status: 503 });
    }
    return Response.json({ ok: true, processed: 1 });
  },
});
assert.equal(successAttempts, 3);
assert.equal(transientSuccess.status, 200);
assert.deepEqual(await transientSuccess.json(), { ok: true, processed: 1 });

const upstreamReference = "8dd7e107-7610-4f2e-a10f-a4034a3f42ad";
let permanentAttempts = 0;
const correlatedFailure = await runBookingReminderWorker({
  environment,
  sleep: noSleep,
  fetchImpl: async () => {
    permanentAttempts += 1;
    return Response.json(
      { error: `Reminder processing failed. Reference ${upstreamReference}.`, request_id: upstreamReference },
      { status: 500, headers: { "x-request-id": upstreamReference } },
    );
  },
});
assert.equal(permanentAttempts, 3);
assert.equal(correlatedFailure.status, 500);
assert.equal(correlatedFailure.headers.get("x-request-id"), upstreamReference);
assert.equal((await correlatedFailure.json()).request_id, upstreamReference);

let authAttempts = 0;
const authFailure = await runBookingReminderWorker({
  environment,
  sleep: noSleep,
  fetchImpl: async () => {
    authAttempts += 1;
    return Response.json(
      { error: `Session failure. Reference ${upstreamReference}.`, request_id: upstreamReference },
      { status: 401 },
    );
  },
});
assert.equal(authAttempts, 1, "permanent authentication failures must not be retried");
assert.equal(authFailure.status, 401);
assert.equal(authFailure.headers.get("x-request-id"), upstreamReference);

let invalidAttempts = 0;
await assert.rejects(
  runBookingReminderWorker({
    environment,
    sleep: noSleep,
    fetchImpl: async () => {
      invalidAttempts += 1;
      return Response.json({ error: "invalid request" }, { status: 400 });
    },
  }),
  /REMINDER_UPSTREAM_HTTP_400/,
);
assert.equal(invalidAttempts, 1);

let timeoutAttempts = 0;
await assert.rejects(
  runBookingReminderWorker({
    environment,
    sleep: noSleep,
    timeoutMs: 5,
    maxAttempts: 2,
    fetchImpl: async (_url, init) => {
      timeoutAttempts += 1;
      return await new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    },
  }),
  /REMINDER_UPSTREAM_TIMEOUT/,
);
assert.equal(timeoutAttempts, 2);

const reminderWindow = bookingReminderDueWindow({
  now: Date.parse("2026-08-08T12:00:00.000Z"),
  reminderHours: 2,
});
assert.deepEqual(reminderWindow, {
  from: "2026-08-08T13:30:00.000Z",
  to: "2026-08-08T14:20:00.000Z",
});
assert.equal(
  Date.parse(reminderWindow.to) - Date.parse(reminderWindow.from),
  50 * 60 * 1_000,
  "the due window must contain at least three 15-minute scheduled retry opportunities",
);

const delivered = [];
const completed = [];
const reported = [];
const recordedFailures = [];
const reminderResults = await runIsolatedReminderBatch({
  bookings: [
    { id: "due" },
    { id: "duplicate" },
    { id: "provider-failure" },
    { id: "resolved-provider-failure" },
    { id: "skipped-provider" },
    { id: "after-failure" },
  ],
  reminderHours: 24,
  claim: async (bookingId) => bookingId !== "duplicate",
  deliver: async (bookingId) => {
    delivered.push(bookingId);
    if (bookingId === "provider-failure") throw new Error("provider unavailable");
    if (bookingId === "resolved-provider-failure") {
      return { deliveries: [{ status: "failed", request_id: "provider-reference" }] };
    }
    if (bookingId === "skipped-provider") {
      return { deliveries: [{ status: "skipped" }] };
    }
    return { deliveries: [{ status: "delivered" }] };
  },
  getDeliveryFailure: (delivery) => {
    const failedDelivery = delivery.deliveries.find((item) => item.status === "failed");
    return failedDelivery
      ? { error: new Error("resolved provider failure"), request_id: failedDelivery.request_id }
      : null;
  },
  complete: async (bookingId) => completed.push(bookingId),
  recordDeliveryFailure: async (bookingId, reference) => recordedFailures.push({ bookingId, reference }),
  reportFailure: async (stage, _error, bookingId) => {
    const reference = `reference-${stage}-${bookingId}`;
    reported.push(reference);
    return reference;
  },
});
assert.deepEqual(delivered, ["due", "provider-failure", "resolved-provider-failure", "skipped-provider", "after-failure"]);
assert.deepEqual(completed, ["due", "skipped-provider", "after-failure"]);
assert.deepEqual(recordedFailures, [
  { bookingId: "provider-failure", reference: "reference-deliver_booking_reminder-provider-failure" },
  { bookingId: "resolved-provider-failure", reference: "provider-reference" },
]);
assert.equal(reminderResults.filter((item) => item.status === "processed").length, 3);
assert.equal(reminderResults.filter((item) => item.status === "failed").length, 2);
assert.equal(
  reminderResults.find((item) => item.bookingId === "resolved-provider-failure")?.request_id,
  "provider-reference",
);
assert.equal(reported.length, 1);
assert.deepEqual(
  await runIsolatedReminderBatch({
    bookings: [], reminderHours: 24,
    claim: async () => true, deliver: async () => ({}), complete: async () => {},
    recordDeliveryFailure: async () => {}, reportFailure: async () => "unused",
  }),
  [],
);

assert.equal(
  notificationDeliveryKey({
    bookingId: "booking-1",
    eventType: "booking_reminder_24h",
    recipientType: "customer",
    channel: "email",
  }),
  "booking-1:booking_reminder_24h:customer:email",
);
assert.notEqual(
  notificationDeliveryKey({ bookingId: "booking-1", eventType: "booking_reminder_24h", recipientType: "customer", channel: "email" }),
  notificationDeliveryKey({ bookingId: "booking-1", eventType: "booking_reminder_24h", recipientType: "customer", channel: "sms" }),
);

const reviewRoute = fs.readFileSync("src/app/api/reviews/[token]/route.ts", "utf8");
assert.match(reviewRoute, /Thank you for your feedback\. Your written review is being checked before it is published\./);
assert.match(reviewRoute, /moderation\.matchedInput/);
assert.match(reviewRoute, /classification:\s*"provider-backed"/);
const moderationServer = fs.readFileSync("src/lib/contentModerationServer.ts", "utf8");
assert.match(moderationServer, /REVIEW_MODERATION_PROVIDER_TIMEOUT/);
assert.match(moderationServer, /REVIEW_MODERATION_PROVIDER_HTTP_/);
assert.match(moderationServer, /noteOperationalFailure/);
const ownerSource = fs.readFileSync("src/components/owner/OwnerDashboardApp.tsx", "utf8");
assert.match(ownerSource, /title=["']Your Dashboard["']/);
assert.doesNotMatch(ownerSource, /title=["']Salon Owner Dashboard["']/);
const workspaceSource = fs.readFileSync("src/app/api/salon/workspace/route.ts", "utf8");
assert.match(workspaceSource, /\.eq\("moderation_status",\s*"Published"\)/);
assert.match(workspaceSource, /dispute_status/);
const monitoringSource = fs.readFileSync("netlify/functions/_monitoring.mjs", "utf8");
assert.doesNotMatch(monitoringSource, /production-release-not-injected/);
assert.doesNotMatch(monitoringSource, /unversioned/);
assert.match(monitoringSource, /release_identity_configured/);
const reviewMigration = fs.readFileSync(
  "supabase/migrations/20260807220000_review_moderation_and_rating_sync.sql",
  "utf8",
);
const reminderRetryMigration = fs.readFileSync(
  "supabase/migrations/20260807230000_booking_reminder_retry_semantics.sql",
  "utf8",
);
const cleanDatabaseAssertions = fs.readFileSync(
  "scripts/sql/verify-clean-database.sql",
  "utf8",
);
assert.match(reviewMigration, /review_content_moderation_queue/);
assert.match(reviewMigration, /review_reply_moderation_queue/);
assert.match(reviewMigration, /refresh_salon_review_summary/);
assert.match(reviewMigration, /order by id\s+for no key update/);
assert.match(reviewMigration, /claim_notification_delivery/);
assert.match(reviewMigration, /notification_delivery_deduplication_idx/);
assert.match(reviewMigration, /review_id uuid not null unique references public\.reviews\(id\) on delete cascade/g);
assert.match(reviewMigration, /submitted_by uuid references auth\.users\(id\) on delete set null/);
assert.match(reviewMigration, /drop policy if exists reviews_public_read on public\.reviews/);
assert.doesNotMatch(reviewMigration, /create policy reviews_public_read/);
assert.match(reviewMigration, /drop policy if exists reviews_admin_update on public\.reviews/);
assert.match(reviewMigration, /drop policy if exists reviews_admin_delete on public\.reviews/);
assert.match(reviewMigration, /revoke all on table public\.reviews from public,anon,authenticated/);
assert.doesNotMatch(reviewMigration, /grant select on table public\.reviews to (?:public|anon|authenticated)/);
assert.match(reviewMigration, /grant all on table public\.reviews to service_role/);
assert.match(reviewMigration, /pg_publication_tables[\s\S]*?alter publication supabase_realtime drop table public\.reviews/);
assert.doesNotMatch(reviewMigration, /alter publication supabase_realtime add table public\.reviews/);
assert.match(reviewMigration, /alter publication supabase_realtime add table public\.salons/);
assert.match(reviewMigration, /drop policy if exists reviews_customer_insert on public\.reviews/);
assert.match(reviewMigration, /revoke insert on table public\.reviews from public,anon,authenticated/);
assert.match(
  reviewMigration,
  /revoke all on function public\.reply_to_review\(uuid,text\)\s+from public,anon,authenticated/,
);
assert.match(reviewMigration, /v_link\.used_at is not null/);
assert.match(reviewMigration, /with review_summaries as \(/);
const reviewSummaryFunction = reviewMigration.match(
  /create or replace function public\.refresh_salon_review_summary\(\)[\s\S]*?\n\$\$;/,
)?.[0] || "";
assert.ok(reviewSummaryFunction, "review summary trigger function is missing");
assert.ok(
  (reviewSummaryFunction.match(/archived_at is null/g) || []).length >= 2,
  "current and previous salon summary queries must exclude archived reviews",
);
const reviewReconciliation = reviewMigration.match(
  /with review_summaries as \([\s\S]*?\nupdate public\.salons salon/,
)?.[0] || "";
assert.ok(reviewReconciliation, "review summary reconciliation is missing");
assert.ok(
  (reviewReconciliation.match(/review\.archived_at is null/g) || []).length >= 2,
  "rating and count reconciliation must exclude archived reviews",
);
assert.match(reviewMigration, /attempt_count integer not null default 0/);
assert.match(reviewMigration, /lease_expires_at timestamptz/);
assert.match(reviewMigration, /delivery_status='failed'[\s\S]*?delivery_status='processing'/);
assert.match(reviewMigration, /decision_reason='Superseded by a later clear salon reply\.'/);
assert.match(reminderRetryMigration, /attempt_count integer not null default 0/);
assert.match(reminderRetryMigration, /alter column attempt_count set default 1/);
assert.match(reminderRetryMigration, /check\(attempt_count between 1 and 3\)/);
assert.match(reminderRetryMigration, /claim\.attempt_count<3/);
assert.match(reminderRetryMigration, /claim\.terminal_at is null/);
assert.match(reminderRetryMigration, /next_attempt_at=now\(\)\+interval '1 minute'/);
assert.match(reminderRetryMigration, /REMINDER_PERMANENT_FAILURE_REFERENCE:/);
assert.match(reminderRetryMigration, /create or replace function public\.fail_booking_reminder_claim/);
assert.match(reminderRetryMigration, /published_value='"20260807230000"'::jsonb/);
assert.match(reminderRetryMigration, /draft_value='"20260807230000"'::jsonb/);
assert.match(reminderRetryMigration, /grant execute on function public\.fail_booking_reminder_claim\(uuid,integer,text\)\s+to service_role/);
assert.doesNotMatch(
  reminderRetryMigration,
  /grant execute on function public\.fail_booking_reminder_claim\(uuid,integer,text\)\s+to (?:anon|authenticated)/,
);
assert.ok(
  reviewMigration.indexOf("decision_reason='Superseded by a later clear salon reply.'") <
    reviewMigration.indexOf("update public.reviews set salon_reply=v_reply"),
  "a clear retry must invalidate stale queued reply text before publication",
);
const contentModerationFunction = reviewMigration.match(
  /create or replace function public\.admin_moderate_review_content\([\s\S]*?\n\$\$;/,
)?.[0] || "";
assert.ok(contentModerationFunction, "content moderation RPC must exist");
assert.ok(
  contentModerationFunction.indexOf("select * into v_review from public.reviews") <
    contentModerationFunction.indexOf("select * into v_queue from public.review_content_moderation_queue"),
  "content moderation must lock the parent review before the child queue",
);
const salonReplyFunction = reviewMigration.match(
  /create or replace function public\.submit_salon_review_reply\([\s\S]*?\n\$\$;/,
)?.[0] || "";
assert.ok(salonReplyFunction, "salon reply RPC must exist");
assert.ok(
  salonReplyFunction.indexOf("select * into v_review from public.reviews") <
    salonReplyFunction.indexOf("select status into v_queue_status from public.review_reply_moderation_queue"),
  "salon reply submission must lock the parent review before the child queue",
);
const replyModerationFunction = reviewMigration.match(
  /create or replace function public\.admin_moderate_review_reply\([\s\S]*?\n\$\$;/,
)?.[0] || "";
assert.ok(replyModerationFunction, "reply moderation RPC must exist");
assert.ok(
  replyModerationFunction.indexOf("select * into v_review from public.reviews") <
    replyModerationFunction.indexOf("select * into v_queue from public.review_reply_moderation_queue"),
  "reply moderation must lock the parent review before the child queue",
);
assert.ok(
  reviewMigration.indexOf("select * into v_review from public.reviews\n    where id=target_review_id for update") <
    reviewMigration.indexOf("select * into v_queue from public.review_reply_moderation_queue"),
  "reply moderation must lock the review before the queue",
);
assert.match(
  reviewMigration,
  /submit_verified_guest_review\([\s\S]*?p_content_moderation_status text/,
);
assert.match(cleanDatabaseAssertions, /review_content_moderation_queue/);
assert.match(cleanDatabaseAssertions, /review_reply_moderation_queue/);
assert.match(
  cleanDatabaseAssertions,
  /submit_verified_guest_review\(text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb,text,text,text\)/,
);
assert.match(cleanDatabaseAssertions, /admin_moderate_review_content\(uuid,text,text,uuid\)/);
assert.match(cleanDatabaseAssertions, /submit_salon_review_reply\(uuid,text,text,text,text,uuid\)/);
assert.match(cleanDatabaseAssertions, /admin_moderate_review_reply\(uuid,text,text,uuid\)/);
assert.match(cleanDatabaseAssertions, /claim_notification_delivery\(uuid,text,text,text,text,text\)/);
assert.match(cleanDatabaseAssertions, /reviews_customer_insert/);
assert.match(
  cleanDatabaseAssertions,
  /core_table <> 'reviews' and not exists/,
  "the generic policy assertion must allow the explicitly verified service-only reviews table",
);
assert.match(cleanDatabaseAssertions, /Browser roles retain direct review SELECT access/);
assert.match(cleanDatabaseAssertions, /reviews_admin_update/);
assert.match(cleanDatabaseAssertions, /reviews_admin_delete/);
assert.match(cleanDatabaseAssertions, /has_table_privilege\('authenticated','public\.reviews','UPDATE'\)/);
assert.match(cleanDatabaseAssertions, /has_table_privilege\('authenticated','public\.reviews','DELETE'\)/);
assert.match(cleanDatabaseAssertions, /pg_publication_tables/);
assert.match(cleanDatabaseAssertions, /reply_to_review\(uuid,text\)/);
assert.match(cleanDatabaseAssertions, /review_reply_moderation_queue_submitted_by_fkey/);
assert.match(cleanDatabaseAssertions, /attempt_count/);
assert.match(cleanDatabaseAssertions, /lease_expires_at/);
assert.match(cleanDatabaseAssertions, /fail_booking_reminder_claim\(uuid,integer,text\)/);
assert.match(cleanDatabaseAssertions, /booking_reminder_claims_attempt_count_check/);

const adminDataSource = fs.readFileSync("src/app/api/admin/data/route.ts", "utf8");
assert.doesNotMatch(adminDataSource, /overview:\s*allSources\.map/);
assert.match(adminDataSource, /overview:\s*\[\]/);
assert.match(adminDataSource, /overviewSourcePermissions/);
assert.match(adminDataSource, /overviewProjections/);
const overviewPermissionBlock = adminDataSource.match(
  /const overviewSourcePermissions:[\s\S]*?\n\s*};/,
)?.[0] || "";
assert.ok(overviewPermissionBlock, "Overview source permission map is missing.");
const overviewProjectionBlock = adminDataSource.match(
  /const overviewProjections:[\s\S]*?\n\s*};/,
)?.[0] || "";
assert.ok(overviewProjectionBlock, "Overview source projections are missing.");
assert.doesNotMatch(overviewProjectionBlock, /["']\*["']/);
for (const projection of [
  /salons:\s*"id,status,rating_overall,review_count"/,
  /salon_applications:\s*"id,business_name,status,submitted_at"/,
  /customers:\s*"id,created_at"/,
  /bookings:\s*"id,status,appointment_datetime,created_at,estimated_total,deposit_amount,deposit_status,payment_status"/,
  /reviews:\s*"id,rating_overall,dispute_status,created_at"/,
]) assert.match(overviewProjectionBlock, projection);
assert.match(adminDataSource, /access\.is_super_admin \|\| access\.permissions\?\.\[sourcePermission\]/);
for (const forbiddenOverviewSource of [
  "support_tickets",
  "complaints_log",
  "admin_users",
  "billing_events",
  "identity_conflict_queue",
  "review_content_moderation_queue",
  "review_reply_moderation_queue",
]) {
  assert.doesNotMatch(
    overviewPermissionBlock,
    new RegExp(`\\b${forbiddenOverviewSource}\\s*:`),
    `${forbiddenOverviewSource} must not be downloadable through Overview`,
  );
}

const publicSalonPage = fs.readFileSync("src/app/salon/[slug]/page.tsx", "utf8");
assert.doesNotMatch(
  publicSalonPage,
  /from\("(?:styles|stylists|reviews|salon_products|style_materials)"\)\.select\("\*"\)/,
);
assert.match(publicSalonPage, /from\("styles"\)\.select\("id,service_group_id,master_style_id,name,/);
assert.match(publicSalonPage, /from\("stylists"\)\.select\("id,slug,name,specialties,bio,avatar_url,photos,years_experience"\)/);
assert.match(publicSalonPage, /from\("reviews"\)\.select\("id,display_name,review_title,rating_overall,/);
assert.match(publicSalonPage, /from\("salon_products"\)\.select\("id,name,description,price,photo_url"\)/);
const publicReviewProjection = publicSalonPage.match(
  /from\("reviews"\)\.select\("([^"]+)"\)/,
)?.[1] || "";
assert.ok(publicReviewProjection, "public review projection is missing");
for (const privateReviewField of [
  "booking_id",
  "customer_id",
  "moderation_status",
  "moderated_by",
  "moderation_reason",
  "dispute_status",
  "dispute_reason",
  "disputed_by_user_id",
]) {
  assert.equal(
    publicReviewProjection.split(",").includes(privateReviewField),
    false,
    `${privateReviewField} must not be serialized into the public salon profile`,
  );
}

const notificationSource = fs.readFileSync("src/lib/supabaseAdmin.ts", "utf8");
assert.match(notificationSource, /admin\.rpc\("claim_notification_delivery"/);
assert.ok(
  notificationSource.indexOf('admin.rpc("claim_notification_delivery"') <
    notificationSource.indexOf("const response = await task.run()"),
  "a durable notification reservation must be created before provider delivery",
);
assert.match(notificationSource, /\.update\(\{ delivery_status: status/);
assert.match(notificationSource, /getDeliveryFailure:delivery=>/);
assert.match(notificationSource, /delivery\.deliveries\?\.find\(item=>item\.status==="failed"\)/);
assert.match(notificationSource, /bookingReminderDueWindow\(\{now,reminderHours\}\)/);
assert.match(notificationSource, /admin\.rpc\("fail_booking_reminder_claim"/);
assert.ok(
  notificationSource.indexOf("getDeliveryFailure:delivery=>") <
    notificationSource.indexOf("complete:async bookingId=>"),
  "resolved provider failures must be classified before a reminder claim is completed",
);

console.log("Review, image normalization, reminder retry/isolation, reference correlation, and owner-title corrections passed focused behavioral verification.");
