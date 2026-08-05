import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  retryTransientAuthOperation,
} from "../src/lib/authSessionCore.ts";
import {
  createScopedJsonApiClient,
  ScopedApiError,
  ScopedSessionProviderError,
} from "../src/lib/scopedApiCore.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const session = (token) => ({ access_token: token, user: { id: USER_ID } });
const json = (body, status = 200) =>
  Response.json(body, { status });

let transientAttempts = 0;
let rawProviderRequests = 0;
const waits = [];
assert.equal(
  await retryTransientAuthOperation(
    async () => {
      transientAttempts += 1;
      rawProviderRequests += 1;
      if (transientAttempts < 3) {
        throw { status: 503, code: "provider_down" };
      }
      return "ready";
    },
    {
      wait: async (delay) => waits.push(delay),
      random: () => 0,
    },
  ),
  "ready",
);
assert.equal(transientAttempts, 3);
assert.equal(
  rawProviderRequests,
  3,
  "One logical refresh must make at most three raw provider requests.",
);
assert.deepEqual(waits, [150, 600]);

let terminalAttempts = 0;
await assert.rejects(
  () => retryTransientAuthOperation(
    async () => {
      terminalAttempts += 1;
      throw { status: 401, code: "bad_jwt" };
    },
    { wait: async () => undefined },
  ),
  (error) => error?.code === "bad_jwt",
);
assert.equal(terminalAttempts, 1);

let reads = 0;
let refreshes = 0;
const crossTabClient = await createScopedJsonApiClient({
  scopeLabel: "salon",
  getSession: async () => {
    reads += 1;
    return session(reads >= 3 ? "newer-cross-tab-token" : "older-token");
  },
  refreshSession: async () => {
    refreshes += 1;
    return session("unnecessary-refresh-token");
  },
  fetcher: async (_target, init) => {
    const authorization = new Headers(init?.headers).get("authorization");
    return authorization === "Bearer older-token"
      ? json({ error: "Session expired." }, 401)
      : json({ ok: true, authorization });
  },
});
assert.deepEqual(await crossTabClient.request("/api/notifications?scope=salon"), {
  ok: true,
  authorization: "Bearer newer-cross-tab-token",
});
assert.equal(refreshes, 0);

let forcedRefreshes = 0;
const expiredTokenClient = await createScopedJsonApiClient({
  scopeLabel: "salon",
  getSession: async () => session("expired-access-token"),
  refreshSession: async () => {
    forcedRefreshes += 1;
    return session("fresh-access-token");
  },
  fetcher: async (_target, init) => {
    const authorization = new Headers(init?.headers).get("authorization");
    return authorization === "Bearer expired-access-token"
      ? json({ error: "Session expired." }, 401)
      : json({ ok: true });
  },
});
assert.deepEqual(await expiredTokenClient.request("/api/notifications?scope=salon"), {
  ok: true,
});
assert.equal(forcedRefreshes, 1);

const preservedSession = session("preserved-access-token");
const unavailableProviderClient = await createScopedJsonApiClient({
  scopeLabel: "salon",
  getSession: async () => preservedSession,
  refreshSession: async () => {
    throw new ScopedSessionProviderError("salon");
  },
  fetcher: async () => json({ error: "Session expired." }, 401),
});
await assert.rejects(
  () => unavailableProviderClient.request("/api/notifications?scope=salon"),
  (error) =>
    error instanceof ScopedApiError &&
    error.code === "AUTHENTICATION_PROVIDER_UNAVAILABLE" &&
    error.retryable,
);
assert.equal(preservedSession.access_token, "preserved-access-token");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const client = read("src/lib/scopedApiClient.ts");
const supabase = read("src/lib/supabase.ts");
const supabaseAdmin = read("src/lib/supabaseAdmin.ts");
const requestSecurity = read("src/lib/requestSecurity.ts");
const operationalMonitoring = read("src/lib/operationalMonitoring.ts");
assert.match(client, /getValidSessionForScope\(scope,\s*30\)/);
assert.match(supabase, /retryTransientAuthOperation\(async \(\) => \{/);
assert.doesNotMatch(
  supabase,
  /shouldRetryTransientAuthTokenResponse|setTimeout\(resolve,\s*180\)/,
  "Low-level token replay would multiply the coordinated retry budget.",
);
assert.match(supabase, /scopedClient\.auth\.getSession\(\)/);
assert.match(supabase, /scopedClient\.auth\.refreshSession\(\)/);
assert.match(
  supabaseAdmin,
  /retryTransientAuthOperation\(async \(\) => \{[\s\S]*?admin\.auth\.getUser\(token\)/,
);
assert.match(
  requestSecurity,
  /AUTHENTICATION_PROVIDER_UNAVAILABLE[\s\S]*?status:\s*503/,
);
assert.match(
  operationalMonitoring,
  /responseError\.code\s*===\s*"AUTHENTICATION_PROVIDER_UNAVAILABLE"/,
);
assert.match(
  operationalMonitoring,
  /authenticationProviderUnavailable[\s\S]*?\?\s*503/,
);
assert.equal(
  [...operationalMonitoring.matchAll(
    /skipProviderCalls:\s*auth(?:entication)?ProviderUnavailable/g,
  )].length,
  2,
  "Both returned and thrown Auth-provider 503 paths must bypass actor lookup and provider persistence.",
);
const platformErrors = read("src/lib/platformErrors.ts");
assert.match(
  platformErrors,
  /providerUnavailable[\s\S]*?admin:\s*undefined[\s\S]*?actorId:\s*null/,
  "Direct monitored failures must also bypass Supabase persistence during an Auth outage.",
);

console.log(
  "Verified client and server token preflight, bounded transient Auth retries, terminal failure isolation, newer cross-tab token reuse, and correct provider-unavailable HTTP semantics.",
);
