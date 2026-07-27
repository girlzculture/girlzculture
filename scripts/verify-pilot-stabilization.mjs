import assert from "node:assert/strict";
import {
  salonCanStartSubscriptionCheckout,
  subscriptionCheckoutBlockMessage,
} from "../src/lib/salonLifecycleCore.ts";
import {
  createScopedJsonApiClient,
  ScopedApiError,
} from "../src/lib/scopedApiCore.ts";
import { secureLoginRequest } from "../src/lib/secureLoginClient.ts";
import { isPromotionCardActive } from "../src/lib/homePromotionCore.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const session = (userId, token) => ({ access_token: token, user: { id: userId } });
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

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
assert.equal(getSessionCalls, 2);

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
  "Pilot stabilization verification passed: lifecycle stages are separated; scoped sessions refresh once without cross-account drift; HTML auth redirects are rejected; login transport failures are sanitized; and homepage promotion schedules enforce public visibility.",
);
