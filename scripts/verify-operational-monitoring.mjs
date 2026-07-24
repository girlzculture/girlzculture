import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const apiRoot = path.join(root, "src", "app", "api");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const routeFiles = walk(apiRoot).filter((file) => file.endsWith("route.ts")).sort();
assert.equal(routeFiles.length, 91, "Update the monitoring inventory when API routes are added or removed.");

for (const file of routeFiles) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const route = `/${relative.replace(/^src\/app\//, "").replace(/\/route\.ts$/, "")}`;
  const originalExports = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)];
  assert.equal(originalExports.length, 0, `${route} bypasses the shared operational wrapper.`);
  assert.doesNotMatch(
    source,
    /console\.(?:error|warn)\s*\(/,
    `${route} can write a raw exception to provider logs.`,
  );
  const wrappedMethods = [...source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) = withOperationalMonitoring/g)].map((match) => match[1]);
  assert.ok(wrappedMethods.length > 0, `${route} has no monitored handler exports.`);
  assert.match(source, /from "@\/lib\/operationalMonitoring"/, `${route} does not import shared monitoring.`);
  for (const method of wrappedMethods) {
    assert.ok(
      source.includes(`routeMonitoringProfile("${route}", "${method}"`),
      `${method} ${route} has stale or incorrect route evidence.`,
    );
  }
}

const inventory = fs.readFileSync(
  path.join(root, "docs", "OPERATIONAL_MONITORING_ROUTE_INVENTORY_2026-07-23.md"),
  "utf8",
);
for (const file of routeFiles) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const route = `/${relative.replace(/^src\/app\//, "").replace(/\/route\.ts$/, "")}`;
  assert.ok(inventory.includes(`\`${route}\``), `${route} is missing from the committed inventory.`);
}

for (const functionName of ["booking-reminders.mjs", "media-cleanup.mjs"]) {
  const source = fs.readFileSync(path.join(root, "netlify", "functions", functionName), "utf8");
  assert.match(source, /monitoredNetlifyFailure/, `${functionName} lacks function-level monitoring.`);
  assert.doesNotMatch(source, /await response\.text\(\).*throw/, `${functionName} could echo an upstream provider body.`);
  assert.ok(inventory.includes(`\`${functionName}\``), `${functionName} is missing from the inventory.`);
}

const serverActions = walk(path.join(root, "src"))
  .filter((file) => /\.(?:ts|tsx)$/.test(file))
  .filter((file) => /^["']use server["'];?/m.test(fs.readFileSync(file, "utf8")));
assert.deepEqual(serverActions, [], "Server actions must be added to the monitoring inventory.");

const core = await import(
  `${pathToFileURL(path.join(root, "src", "lib", "operationalMonitoringCore.ts")).href}?v=${Date.now()}`
);
const platformErrors = await import(
  `${pathToFileURL(path.join(root, "src", "lib", "platformErrors.ts")).href}?v=${Date.now()}`
);

const inventoryRows = new Map(
  [...inventory.matchAll(/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| Covered \|$/gm)]
    .map((match) => [
      match[1],
      {
        methods: match[2].split(",").map((value) => value.trim()),
        classification: match[3].trim(),
      },
    ]),
);
for (const file of routeFiles) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const route = `/${relative.replace(/^src\/app\//, "").replace(/\/route\.ts$/, "")}`;
  const methods = [...source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) = withOperationalMonitoring/g)]
    .map((match) => match[1]);
  const evidence = inventoryRows.get(route);
  assert.ok(evidence, `${route} has no structured inventory evidence.`);
  assert.deepEqual(evidence.methods, methods, `${route} method inventory is stale.`);
  const classifications = [...new Set(methods.map((method) => core.classifyOperationalRoute(route, method)))];
  assert.deepEqual(
    classifications,
    [evidence.classification.replace("public/read-only", "public-read-only")],
    `${route} classification inventory is stale.`,
  );
}

for (const route of [
  "/api/auth/destination",
  "/api/auth/mfa/settings",
  "/api/i18n/preference",
]) {
  assert.equal(
    core.classifyOperationalRoute(route, route.endsWith("destination") ? "POST" : "GET"),
    "protected",
    `${route} must treat authentication/session failures as protected incidents.`,
  );
}

const representativeFailures = [
  ["admin/database", 500, "Database query failed", "protected"],
  ["salon/RLS", 400, "new row violates row-level security policy", "protected"],
  ["authentication/session", 401, "Unauthorized", "protected"],
  ["booking", 503, "Booking service unavailable", "provider-backed"],
  ["availability", 504, "Request timed out", "public-read-only"],
  ["storage/media", 502, "Storage provider failed", "provider-backed"],
  ["Stripe", 500, "Stripe request failed", "provider-backed"],
  ["OpenAI", 500, "OpenAI timeout", "provider-backed"],
  ["notifications", 502, "Email delivery failed", "provider-backed"],
  ["client provider bridge", 403, "new row violates row-level security policy", "provider-backed"],
];
for (const [group, status, message, classification] of representativeFailures) {
  assert.equal(
    core.shouldCaptureResponse(status, message, classification),
    true,
    `${group} failure was not classified as an operational event.`,
  );
}

assert.equal(
  core.shouldCaptureResponse(400, "Please choose a valid appointment date.", "protected"),
  false,
  "Expected validation must not create an incident.",
);
assert.equal(
  core.shouldCaptureResponse(404, "Salon not found.", "public-read-only"),
  false,
  "Ordinary public 404 outcomes must not create an incident.",
);
assert.equal(
  core.shouldCaptureResponse(403, "You do not have permission to use this feature.", "protected"),
  false,
  "Permission-safe expected denial must not create an incident.",
);
assert.equal(
  core.shouldCaptureResponse(403, "Unable to load protected data.", "protected"),
  true,
  "A protected route must not disguise an unexpected failure as a permission denial.",
);
assert.equal(core.isPermissionDenialMessage("You do not have access to this booking."), true);
assert.equal(core.isPermissionDenialMessage("Only the salon owner can change this setting."), true);
assert.equal(core.isAuthenticationFailureMessage("Your session has expired. Please sign in again."), true);
assert.equal(
  core.shouldCaptureResponse(400, "Your session has expired. Please sign in again.", "protected"),
  true,
  "Protected session failures must create a low-severity event even if a legacy route returned 400.",
);
assert.equal(
  core.shouldCaptureResponse(429, "Too many requests. Please try again shortly.", "expected-only"),
  false,
  "Rate limiting must not create a high-severity incident.",
);
assert.equal(core.isUnsafeOperationalMessage("PGRST301 row-level security policy"), true);
assert.equal(core.isUnsafeOperationalMessage("23505 duplicate key value"), true);
assert.equal(core.isUnsafeOperationalMessage("Stripe sk_test_example"), true);
assert.equal(core.isUnsafeOperationalMessage("Please choose a salon."), false);
assert.equal(
  core.shouldCaptureProviderResponse(406, "PGRST116", "JSON object requested, multiple (or no) rows returned"),
  false,
  "An expected no-row result must not become a provider incident.",
);
assert.equal(
  core.shouldCaptureProviderResponse(403, "42501", "new row violates row-level security policy"),
  true,
  "An RLS failure must be captured even if a legacy caller ignores the result error.",
);
assert.equal(
  core.shouldCaptureProviderResponse(503, "", "upstream unavailable"),
  true,
  "A provider 5xx must be captured without relying on provider text.",
);
assert.equal(
  core.shouldCaptureProviderResponse(400, "", "Please enter a valid value."),
  false,
  "Ordinary provider-safe validation must not create an incident.",
);
assert.deepEqual(
  core.pickAffectedRecord({ bookingId: "c7f8854e-5219-4521-9038-c1ac4a1d092c", email: "ignored@example.com" }),
  { type: "booking", id: "c7f8854e-5219-4521-9038-c1ac4a1d092c" },
);
assert.equal(core.pickAffectedRecord({ email: "ignored@example.com", message: "private" }), null);
assert.deepEqual(
  core.pickRouteRecord(
    "/api/salon/bookings/[id]/cancel",
    "/api/salon/bookings/3cf2400e-6a3f-4597-bb1d-03aed8349414/cancel",
  ),
  { type: "booking", id: "3cf2400e-6a3f-4597-bb1d-03aed8349414" },
);
const warningBody = core.addOperationalWarnings(
  { ok: true },
  ["d9450343-d446-4709-9ca8-069b3b14702c"],
);
assert.equal(warningBody.ok, true);
assert.equal(
  warningBody.operational_warnings[0].request_id,
  "d9450343-d446-4709-9ca8-069b3b14702c",
);
assert.match(
  warningBody.operational_warnings[0].message,
  /d9450343-d446-4709-9ca8-069b3b14702c/,
);

const matchingReference = "8dd7e107-7610-4f2e-a10f-a4034a3f42ad";
const nextFailure = platformErrors.safeFailure("The operation failed.", matchingReference);
const nextBody = await nextFailure.json();
assert.equal(nextFailure.headers.get("x-request-id"), matchingReference);
assert.equal(nextBody.request_id, matchingReference);
assert.match(nextBody.error, new RegExp(matchingReference));
assert.equal(nextFailure.headers.get("cache-control"), "private, no-store");

const monitoring = await import(
  `${pathToFileURL(path.join(root, "netlify", "functions", "_monitoring.mjs")).href}?v=${Date.now()}`
);
const previousUrl = process.env.SUPABASE_URL;
const previousPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const capturedLogs = [];
const originalConsoleError = console.error;
console.error = (...values) => capturedLogs.push(values);
const netlifyFailure = await monitoring.monitoredNetlifyFailure({
  request: new Request("https://example.test/.netlify/functions/booking-reminders"),
  error: new Error("Provider failed with Bearer top-secret-token, sk_test_not-a-real-key, and test@example.com"),
  feature: "booking-notifications",
  action: "booking-reminders",
  safeMessage: "Scheduled booking reminders could not be processed.",
  provider: "test-provider",
  metadata: {
    nested: {
      password: "must-never-be-stored",
      contact: "private@example.com",
    },
  },
});
console.error = originalConsoleError;
if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
if (previousPublicUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousPublicUrl;
if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;

const netlifyBody = await netlifyFailure.json();
const netlifyReference = netlifyFailure.headers.get("x-request-id");
assert.match(netlifyReference || "", /^[0-9a-f-]{36}$/);
assert.equal(netlifyBody.request_id, netlifyReference);
assert.match(netlifyBody.error, new RegExp(netlifyReference));
const serializedLogs = JSON.stringify(capturedLogs);
assert.doesNotMatch(
  serializedLogs,
  /top-secret-token|sk_test_not-a-real-key|test@example\.com|must-never-be-stored|private@example\.com/,
);
assert.match(serializedLogs, /\[redacted\]|\[email redacted\]/);

const monitoringMigration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260721150000_platform_error_monitoring.sql"),
  "utf8",
);
for (const evidence of [
  "fingerprint=v_fingerprint and environment=v_environment and release=v_release",
  "occurrence_count=occurrence_count+1",
  "first_occurred_at",
  "last_occurred_at=now()",
  "platform_error_occurrences",
]) {
  assert.ok(monitoringMigration.includes(evidence), `Deduplication evidence missing: ${evidence}`);
}

const providerEntryPoints = [
  ["src/lib/supabaseAdmin.ts", /global:\s*\{\s*fetch:\s*monitoredSupabaseFetch\s*\}/, /noteOperationalFailure/],
  ["src/lib/stripeServer.ts", /STRIPE_PROVIDER_FAILURE/, /provider:\s*"stripe"/],
  ["src/lib/beautyConciergeServer.ts", /capturePlatformError/, /warningReferences/],
  ["src/lib/aiAutomationServer.ts", /if\s*\([^)]*Error\)\s*throw/, /usageError/],
  ["src/lib/webPushServer.ts", /capturePlatformError/, /warningReferences/],
  ["src/lib/geocodingServer.ts", /GEOCODING_PROVIDER_FAILED_/, /marketError/],
  ["src/lib/teamInvite.ts", /SUPABASE_AUTH_INVITATION_FAILED/, /auditIdentityEvent/],
  ["src/lib/secureLoginServer.ts", /recordLoginAttempt/, /if\s*\(error\)\s*throw error/],
  ["src/lib/identityServer.ts", /auditIdentityEvent/, /if\s*\(error\)\s*throw error/],
  ["src/lib/identityDeletionServer.ts", /prepare_identity_deletion/, /throw/],
  ["src/lib/promoCodes.ts", /PROMO_RESERVATION_DATABASE_FAILURE/, /countError/],
  ["src/lib/engineConfigServer.ts", /capturePlatformError/, /fallback_used/],
  ["src/lib/content.ts", /reportPublicContentFailure/, /capturePlatformError/],
  ["src/lib/publicPageMonitoring.ts", /capturePublicPageFailure/, /capturePlatformError/],
  ["src/lib/discoveryServer.ts", /getSupabaseAdmin/, /discover_nearby_salons_ranked/],
  ["src/lib/bookingAvailabilityServer.ts", /getSupabaseAdmin/, /booking_checkout_intents/],
  ["src/lib/bookingRescheduleServer.ts", /capturePlatformError/, /Promise\.allSettled/],
  ["src/lib/supabase.ts", /protected destination route owns server-side incident monitoring/, /catch\s*\{/],
];
for (const [relative, firstEvidence, secondEvidence] of providerEntryPoints) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  assert.match(source, firstEvidence, `${relative} lacks its first provider-monitoring control.`);
  assert.match(source, secondEvidence, `${relative} lacks its second provider-monitoring control.`);
  assert.ok(inventory.includes(`\`${relative}\``), `${relative} is missing from provider inventory evidence.`);
  if (!relative.endsWith("platformErrors.ts")) {
    assert.doesNotMatch(
      source,
      /console\.(?:error|warn)\s*\(/,
      `${relative} must not log a raw provider or database failure.`,
    );
  }
}
const stripeSource = fs.readFileSync(path.join(root, "src/lib/stripeServer.ts"), "utf8");
assert.doesNotMatch(stripeSource, /data\.error\?\.message/, "Stripe provider text must never be thrown.");
const notificationsSource = fs.readFileSync(path.join(root, "src/lib/supabaseAdmin.ts"), "utf8");
assert.doesNotMatch(notificationsSource, /await response\.text\(/, "Email/SMS provider bodies must never be retained.");
const pushSource = fs.readFileSync(path.join(root, "src/lib/webPushServer.ts"), "utf8");
assert.doesNotMatch(pushSource, /await response\.text\(/, "Web Push provider bodies must never be retained.");
const browserSupabaseSource = fs.readFileSync(path.join(root, "src/lib/supabase.ts"), "utf8");
assert.match(browserSupabaseSource, /\/api\/monitor\/client-provider/);
assert.match(browserSupabaseSource, /request_id:\s*reference/);
assert.match(browserSupabaseSource, /shouldCaptureProviderResponse/);
const clientBridgeSource = fs.readFileSync(path.join(root, "src/app/api/monitor/client-provider/route.ts"), "utf8");
assert.match(clientBridgeSource, /ALLOWED_PROVIDERS/);
assert.match(clientBridgeSource, /X-Request-ID/);
assert.doesNotMatch(
  clientBridgeSource,
  /body\.(?:message|error|payload|token|cookie|email|phone|card)/,
  "The client-provider bridge must not accept raw errors, payloads, secrets, contacts, or card data.",
);
for (const file of walk(path.join(root, "src")).filter((value) => /\.(?:ts|tsx)$/.test(value))) {
  if (file.endsWith(`${path.sep}platformErrors.ts`)) continue;
  const source = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(
    source,
    /console\.(?:error|warn)\s*\(/,
    `${path.relative(root, file)} can expose a raw error outside the sanitizer.`,
  );
}

console.log(
  `Operational monitoring verification passed: ${routeFiles.length} API routes, 2 Netlify functions, 0 server actions, ${providerEntryPoints.length} provider entry points, representative failures across ${representativeFailures.length} protected feature groups.`,
);
