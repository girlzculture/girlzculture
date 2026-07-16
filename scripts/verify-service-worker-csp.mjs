import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const workerSource = readFileSync("public/sw.js", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");

for (const path of ["/api", "/admin", "/account", "/salon/dashboard"]) {
  assert.match(workerSource, new RegExp(path.replace("/", "\\/")), `service worker must bypass ${path}`);
}
assert.match(workerSource, /response\.clone\(\)/, "responses must be cloned before caching");
assert.match(workerSource, /key\.startsWith\(APP_CACHE_PREFIX\)/, "activation must only remove application caches");
assert.match(workerSource, /Promise\.allSettled/, "a single failed precache request must not reject installation");

for (const origin of [
  "https://static.cloudflareinsights.com",
  "https://cloudflareinsights.com",
  "https://maps.googleapis.com",
  "https://maps.gstatic.com",
  "https://*.googleapis.com",
  "https://*.gstatic.com",
  "https://*.google.com",
]) {
  assert.ok(nextConfig.includes(origin), `CSP is missing ${origin}`);
}
assert.doesNotMatch(nextConfig, /script-src[^`\n]*\s\*/, "script-src must not use an unrestricted wildcard");

const handlers = {};
const cacheEntries = new Map([["https://example.test/offline", new Response("offline")]]);
let fetchFails = false;
let cacheWriteCount = 0;
const cache = {
  add: async () => undefined,
  put: async (request, response) => {
    cacheWriteCount += 1;
    const body = await response.text();
    cacheEntries.set(typeof request === "string" ? new URL(request, "https://example.test").href : request.url, new Response(body, { status: response.status, headers: response.headers }));
  },
};
const context = {
  URL,
  Request,
  Response,
  Set,
  Promise,
  caches: {
    open: async () => cache,
    keys: async () => ["girlz-culture-public-v2", "unrelated-cache"],
    delete: async () => true,
    match: async (request) => cacheEntries.get(typeof request === "string" ? new URL(request, "https://example.test").href : request.url),
  },
  fetch: async () => {
    if (fetchFails) throw new Error("offline");
    return new Response("network", { status: 200, headers: { "Cache-Control": "public, max-age=60" } });
  },
  self: {
    location: { origin: "https://example.test" },
    clients: { claim: async () => undefined, matchAll: async () => [] },
    registration: { showNotification: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener: (name, handler) => { handlers[name] = handler; },
  },
};
vm.runInNewContext(workerSource, context, { filename: "public/sw.js" });

async function dispatchFetch(path, { mode = "navigate", method = "GET" } = {}) {
  let responsePromise;
  handlers.fetch({
    request: { url: `https://example.test${path}`, method, mode, destination: "", headers: new Headers() },
    respondWith: (promise) => { responsePromise = promise; },
  });
  return responsePromise;
}

const publicResponse = await dispatchFetch("/styles");
assert.equal(await publicResponse.text(), "network");
assert.equal(cacheWriteCount, 1, "public navigation should cache a cloned response without consuming the returned body");

const privateResponse = await dispatchFetch("/admin");
assert.equal(privateResponse, undefined, "private navigation must bypass the service worker cache");

fetchFails = true;
const offlineResponse = await dispatchFetch("/salons");
assert.equal(await offlineResponse.text(), "offline", "failed public navigation should use the safe offline fallback");

console.log("Verified service-worker response cloning, private-route bypasses, offline containment, cache scoping, and CSP allowlists.");
