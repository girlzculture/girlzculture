const APP_CACHE_PREFIX = "girlz-culture-";
const CACHE = `${APP_CACHE_PREFIX}public-v3`;
const CORE = ["/offline", "/manifest.webmanifest", "/pwa-icon-192.png", "/pwa-icon-512.png"];
const PRIVATE_PATHS = [
  "/account",
  "/admin",
  "/api",
  "/complaint",
  "/forgot-password",
  "/login",
  "/reset-password",
  "/review",
  "/salon/dashboard",
  "/salon/login",
  "/salon/onboarding",
  "/salon/signup",
];
const STATIC_DESTINATIONS = new Set(["font", "image", "script", "style"]);

function pathMatchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPrivateOrSensitive(request, url) {
  if (request.headers.has("authorization") || request.headers.has("range")) return true;
  if (url.pathname.startsWith("/_next/data/") || url.pathname === "/sw.js") return true;
  return PRIVATE_PATHS.some((prefix) => pathMatchesPrefix(url.pathname, prefix));
}

function responseMayBeCached(response) {
  if (!response || !response.ok || response.status !== 200 || response.type === "opaque") return false;
  const cacheControl = response.headers.get("cache-control") || "";
  const vary = response.headers.get("vary") || "";
  return !/\b(?:no-store|private)\b/i.test(cacheControl) && vary.trim() !== "*";
}

async function safelyCache(request, response) {
  if (!responseMayBeCached(response)) return;
  let copy;
  try {
    // Clone synchronously, before cache.put or another consumer can use the body.
    copy = response.clone();
  } catch {
    return;
  }
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, copy);
  } catch {
    // A cache write must never reject the FetchEvent or break navigation.
  }
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    await safelyCache(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match("/offline");
    if (offline) return offline;
    return new Response("You are offline. Reconnect and try again.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function staticResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    await safelyCache(request, response);
    return response;
  } catch {
    return new Response("Resource unavailable while offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE.map((path) => cache.add(new Request(path, { cache: "reload" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(APP_CACHE_PREFIX) && key !== CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data ? event.data.text() : "You have a new Girlz Culture update." }; }
  const title = payload.title || "Girlz Culture";
  const options = {
    body: payload.body || "You have a new update.",
    icon: payload.icon || "/pwa-icon-192.png",
    badge: payload.badge || "/pwa-icon-192.png",
    tag: payload.tag || "girlz-culture-update",
    renotify: true,
    requireInteraction: Boolean(payload.requireInteraction),
    data: { ...(payload.data || {}), url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if ("focus" in client) {
        if ("navigate" in client) await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  }));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivateOrSensitive(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  const isStaticAsset = STATIC_DESTINATIONS.has(request.destination)
    || url.pathname.startsWith("/_next/static/")
    || CORE.includes(url.pathname);
  if (isStaticAsset) event.respondWith(staticResponse(request));
});
