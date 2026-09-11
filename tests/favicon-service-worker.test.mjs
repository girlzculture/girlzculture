import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function workerHarness(initialEntries = []) {
  const listeners = new Map();
  const entries = new Map(initialEntries.map((entry) => [entry, new Request(`https://girlzculture.test${entry}`)]));
  const deleted = [];
  const cache = {
    async keys() { return [...entries.values()]; },
    async delete(request) { const path = new URL(request.url).pathname; deleted.push(path); entries.delete(path); return true; },
    async match(request) { return entries.get(new URL(request.url).pathname) ? new Response("cached") : undefined; },
    async put(request) { entries.set(new URL(request.url).pathname, request); },
    async add() {},
  };
  const caches = {
    async keys() { return ["girlz-culture-public-v3", "girlz-culture-public-v4"]; },
    async delete(key) { deleted.push(key); return true; },
    async open() { return cache; },
    async match(request) { return cache.match(request); },
  };
  const self = {
    location: { origin: "https://girlzculture.test" },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  runInNewContext(source, { self, caches, fetch: async () => new Response("network"), Request, Response, URL, Promise, Set });
  return { listeners, cache, caches, deleted };
}

test("activation removes old favicon cache entries but keeps PWA assets", async () => {
  const harness = workerHarness(["/favicon.ico?favicon.framework=1", "/pwa-icon-192.png", "/manifest.webmanifest"]);
  let promise;
  harness.listeners.get("activate")({ waitUntil(value) { promise = value; } });
  await promise;
  assert.ok(harness.deleted.includes("girlz-culture-public-v3"));
  assert.ok(harness.deleted.includes("/favicon.ico"));
  assert.equal(harness.deleted.includes("/pwa-icon-192.png"), false);
  assert.equal(harness.deleted.includes("/manifest.webmanifest"), false);
});

test("legacy favicon requests bypass the cache-first fetch handler", () => {
  const harness = workerHarness(["/favicon.ico"]);
  let responded = false;
  harness.listeners.get("fetch")({
    request: new Request("https://girlzculture.test/favicon.ico?old=1"),
    respondWith() { responded = true; },
  });
  assert.equal(responded, false);
});

test("ordinary image requests remain cache-first eligible", () => {
  const harness = workerHarness(["/pwa-icon-192.png"]);
  let responded = false;
  harness.listeners.get("fetch")({
    request: new Request("https://girlzculture.test/pwa-icon-192.png", { headers: { "sec-fetch-dest": "image" } }),
    respondWith() { responded = true; },
  });
  assert.equal(responded, true);
});
