import assert from "node:assert/strict";
import {
  salonCanStartSubscriptionCheckout,
  subscriptionCheckoutBlockMessage,
} from "../src/lib/salonLifecycleCore.ts";
import {
  createScopedJsonApiClient,
  ScopedApiError,
  ScopedSessionProviderError,
} from "../src/lib/scopedApiCore.ts";
import {
  AUTH_STORAGE_SCHEMA_VERSION,
  buildAuthStorageKeys,
  buildLegacyAuthStorageKeys,
  classifySupabaseAuthFailure,
  createScopedRefreshCoordinator,
  scopedStorageEntries,
} from "../src/lib/authSessionCore.ts";
import { deploymentReleaseId } from "../src/lib/deploymentIdentity.ts";
import { secureLoginRequest } from "../src/lib/secureLoginClient.ts";
import { classifyExpectedSecureLoginFailure } from "../src/lib/secureLoginCore.ts";
import { isPromotionCardActive } from "../src/lib/promotionScheduleCore.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const session = (userId, token) => ({ access_token: token, user: { id: userId } });
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const storageKeys = buildAuthStorageKeys(
  "https://project-reference.supabase.co",
);
assert.equal(AUTH_STORAGE_SCHEMA_VERSION, 2);
assert.match(storageKeys.salon, /v2-project-reference-salon$/);
assert.notEqual(storageKeys.admin, storageKeys.salon);
assert.notEqual(storageKeys.customer, storageKeys.salon);
const legacyStorageKeys = buildLegacyAuthStorageKeys(
  "https://project-reference.supabase.co",
);
assert.ok(
  legacyStorageKeys.customer.includes("sb-project-reference-auth-token"),
  "The real Supabase default customer key must be migrated.",
);
assert.ok(legacyStorageKeys.salon.includes("girlz-culture-salon-auth"));
assert.ok(legacyStorageKeys.admin.includes("girlz-culture-admin-auth"));
assert.deepEqual(scopedStorageEntries("salon", storageKeys), [
  storageKeys.salon,
  `${storageKeys.salon}-user`,
  `${storageKeys.salon}-code-verifier`,
]);
assert.equal(
  scopedStorageEntries("salon", storageKeys).includes(storageKeys.admin),
  false,
);
assert.equal(
  classifySupabaseAuthFailure({ status: 403, code: "bad_jwt" }),
  "terminal",
);
assert.equal(
  classifySupabaseAuthFailure({ status: 503, code: "provider_down" }),
  "transient",
);
assert.equal(
  classifySupabaseAuthFailure({ message: "fetch failed" }),
  "transient",
);
assert.equal(
  deploymentReleaseId({
    NODE_ENV: "production",
    COMMIT_REF: "0123456789abcdef",
  }),
  "0123456789abcdef",
);
assert.equal(
  deploymentReleaseId({ NODE_ENV: "production" }),
  "unidentified-production-release",
);

// Approval, billing and publication are separate lifecycle stages.
assert.equal(
  salonCanStartSubscriptionCheckout(
    { status: "Approved", approved_at: "2026-07-26T12:00:00Z" },
    "Approved",
  ),
  true,
);
assert.equal(
  salonCanStartSubscriptionCheckout({ status: "Pending" }, "Pending"),
  false,
);
assert.equal(
  salonCanStartSubscriptionCheckout(
    { status: "Suspended", approved_at: "2026-07-26T12:00:00Z" },
    "Approved",
  ),
  false,
);
assert.match(
  subscriptionCheckoutBlockMessage({ status: "Pending" }, "Pending"),
  /must be approved/i,
);

// Ordinary API work uses the current token and refreshes exactly once only
// after an actual JSON 401 response.
let getSessionCalls = 0;
let refreshCalls = 0;
let fetchCalls = 0;
const rotatingClient = await createScopedJsonApiClient({
  scopeLabel: "salon",
  getSession: async () => {
    getSessionCalls += 1;
    return session(USER_A, "current-token");
  },
  refreshSession: async () => {
    refreshCalls += 1;
    return session(USER_A, "refreshed-token");
  },
  fetcher: async (_target, init) => {
    fetchCalls += 1;
    const authorization = new Headers(init?.headers).get("authorization");
    if (fetchCalls === 1) {
      assert.equal(authorization, "Bearer current-token");
      return json({ error: "Session expired.", code: "AUTHENTICATION_SESSION_FAILURE" }, 401);
    }
    assert.equal(authorization, "Bearer refreshed-token");
    assert.equal(init?.redirect, "manual");
    assert.equal(init?.credentials, "same-origin");
    return json({ ok: true });
  },
});
assert.deepEqual(await rotatingClient.request("/api/salon/workspace"), { ok: true });
assert.equal(refreshCalls, 1);
assert.equal(fetchCalls, 2);
assert.equal(getSessionCalls, 3);

// Concurrent workspace and notification 401s share one role-scoped refresh.
// Each request retries once with the same refreshed acting account.
const refreshCoordinator = createScopedRefreshCoordinator();
let sharedSalonSession = session(USER_A, "stale-salon-token");
let coalescedRefreshCalls = 0;
const refreshSalon = () =>
  refreshCoordinator.run("salon", async () => {
    coalescedRefreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    sharedSalonSession = session(USER_A, "fresh-salon-token");
    return sharedSalonSession;
  });
const protectedFetcher = async (_target, init) => {
  const authorization = new Headers(init?.headers).get("authorization");
  return authorization === "Bearer stale-salon-token"
    ? json(
        {
          error: "Your session could not be verified.",
          code: "AUTHENTICATION_SESSION_FAILURE",
          request_id: REQUEST_ID,
        },
        401,
        { "x-request-id": REQUEST_ID },
      )
    : json({ ok: true, authorization });
};
const [workspaceClient, notificationClient] = await Promise.all([
  createScopedJsonApiClient({
    scopeLabel: "salon",
    getSession: async () => sharedSalonSession,
    refreshSession: refreshSalon,
    fetcher: protectedFetcher,
  }),
  createScopedJsonApiClient({
    scopeLabel: "salon",
    getSession: async () => sharedSalonSession,
    refreshSession: refreshSalon,
    fetcher: protectedFetcher,
  }),
]);
const [workspaceReady, notificationsReady] = await Promise.all([
  workspaceClient.request("/api/salon/workspace"),
  notificationClient.request("/api/notifications?scope=salon"),
]);
assert.equal(coalescedRefreshCalls, 1);
assert.equal(workspaceReady.authorization, "Bearer fresh-salon-token");
assert.equal(notificationsReady.authorization, "Bearer fresh-salon-token");

// A transient Auth provider failure is retryable and preserves the locally
// available session instead of converting the outage into a sign-out.
const preservedSession = session(USER_A, "preserved-token");
const transientClient = await createScopedJsonApiClient({
  scopeLabel: "salon",
  getSession: async () => preservedSession,
  refreshSession: async () => {
    throw new ScopedSessionProviderError("salon");
  },
  fetcher: async () =>
    json(
      { error: "Your session could not be verified." },
      401,
    ),
});
await assert.rejects(
  () => transientClient.request("/api/salon/workspace"),
  (error) =>
    error instanceof ScopedApiError &&
    error.code === "AUTHENTICATION_PROVIDER_UNAVAILABLE" &&
    error.status === 503 &&
    error.retryable,
);
assert.equal(preservedSession.access_token, "preserved-token");

let forbiddenRefreshes = 0;
const forbiddenClient = await createScopedJsonApiClient({
  scopeLabel: "salon",
  getSession: async () => session(USER_A, "salon-token"),
  refreshSession: async () => {
    forbiddenRefreshes += 1;
    return session(USER_A, "unexpected-refresh");
  },
  fetcher: async () =>
    json(
      {
        error: "You do not have permission to use this feature.",
        code: "FORBIDDEN",
      },
      403,
    ),
});
await assert.rejects(
  () => forbiddenClient.request("/api/salon/restricted"),
  (error) =>
    error instanceof ScopedApiError &&
    error.status === 403 &&
    !error.authenticationFailure,
);
assert.equal(forbiddenRefreshes, 0);

// Admin and salon clients continue to send their own independent identity.
const roleTokens = [];
const roleFetcher = async (_target, init) => {
  roleTokens.push(new Headers(init?.headers).get("authorization"));
  return json({ ok: true });
};
const independentSalon = await createScopedJsonApiClient({
  scopeLabel: "salon",
  getSession: async () => session(USER_A, "salon-only-token"),
  refreshSession: async () => session(USER_A, "salon-only-refresh"),
  fetcher: roleFetcher,
});
const independentAdmin = await createScopedJsonApiClient({
  scopeLabel: "admin",
  getSession: async () => session(USER_B, "admin-only-token"),
  refreshSession: async () => session(USER_B, "admin-only-refresh"),
  fetcher: roleFetcher,
});
await Promise.all([
  independentSalon.request("/api/salon/workspace"),
  independentAdmin.request("/api/admin/settings"),
]);
assert.deepEqual(new Set(roleTokens), new Set([
  "Bearer salon-only-token",
  "Bearer admin-only-token",
]));

// A refresh can never silently switch the acting account.
const mismatchClient = await createScopedJsonApiClient({
  scopeLabel: "admin",
  getSession: async () => session(USER_A, "admin-token"),
  refreshSession: async () => session(USER_B, "other-account-token"),
  fetcher: async () => json({ error: "Expired" }, 401),
});
await assert.rejects(
  () => mismatchClient.request("/api/admin/settings"),
  (error) =>
    error instanceof ScopedApiError &&
    error.code === "AUTHENTICATION_SESSION_FAILURE" &&
    /account changed/i.test(error.message),
);

// HTML redirects are rejected as transport failures instead of being parsed
// as JSON or shown to the administrator.
const htmlClient = await createScopedJsonApiClient({
  scopeLabel: "admin",
  getSession: async () => session(USER_A, "admin-token"),
  refreshSession: async () => session(USER_A, "admin-refresh"),
  fetcher: async () =>
    new Response("<!doctype html><title>Login</title>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
});
await assert.rejects(
  () => htmlClient.request("/api/admin/engine"),
  (error) =>
    error instanceof ScopedApiError &&
    error.code === "NON_JSON_API_RESPONSE",
);

// Secure login explicitly forwards same-origin cookies, refuses redirects and
// provides a useful network error without exposing provider details.
let loginInit;
const loginResult = await secureLoginRequest(
  "/api/auth/login/start",
  { role: "salon", email: "owner@example.test", password: "secret" },
  async (_target, init) => {
    loginInit = init;
    return json({
      requires_mfa: true,
      challenge_id: REQUEST_ID,
      channel: "email",
      destination: "o***@example.test",
    });
  },
);
assert.equal(loginResult.challenge_id, REQUEST_ID);
assert.equal(loginInit.credentials, "same-origin");
assert.equal(loginInit.redirect, "manual");
assert.equal(new Headers(loginInit.headers).get("accept"), "application/json");

await assert.rejects(
  () =>
    secureLoginRequest("/api/auth/login/start", {}, async () =>
      new Response("<html>Moved</html>", {
        status: 302,
        headers: { location: "/login", "content-type": "text/html" },
      }),
    ),
  /changed during an update/i,
);
await assert.rejects(
  () =>
    secureLoginRequest("/api/auth/login/start", {}, async () => {
      throw new TypeError("provider details must not escape");
    }),
  /couldn't reach the secure sign-in service/i,
);
assert.deepEqual(
  classifyExpectedSecureLoginFailure(
    new Error("Email or password is incorrect."),
  ),
  { status: 401, message: "Email or password is incorrect." },
);
assert.deepEqual(
  classifyExpectedSecureLoginFailure(
    new Error("This is not a salon-owner account."),
  ),
  { status: 403, message: "This is not a salon-owner account." },
);
assert.deepEqual(
  classifyExpectedSecureLoginFailure(
    new Error("Enter the six-digit verification code."),
  ),
  { status: 400, message: "Enter the six-digit verification code." },
);
assert.equal(
  classifyExpectedSecureLoginFailure(
    new Error("connection to the authentication database failed"),
  ),
  null,
);

// Homepage promotion scheduling is deterministic. Draft, archived, future and
// expired cards cannot leak onto the public rail.
const promotionNow = Date.parse("2026-08-03T15:00:00Z");
assert.equal(isPromotionCardActive({ status: "Active" }, promotionNow), true);
assert.equal(isPromotionCardActive({ status: "Draft" }, promotionNow), false);
assert.equal(
  isPromotionCardActive(
    { status: "Active", starts_at: "2026-08-04T00:00:00Z" },
    promotionNow,
  ),
  false,
);
assert.equal(
  isPromotionCardActive(
    { status: "Active", ends_at: "2026-08-03T14:59:59Z" },
    promotionNow,
  ),
  false,
);

console.log(
  "Pilot stabilization verification passed: lifecycle stages are separated; auth storage is project/version/role-scoped; simultaneous protected requests coalesce one refresh; terminal and transient Auth failures are distinguished; admin/salon sessions remain independent; HTML auth redirects are rejected; deployment releases are identifiable; login transport failures are sanitized; and homepage promotion schedules enforce public visibility.",
);
