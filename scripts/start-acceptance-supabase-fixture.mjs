import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const host = "127.0.0.1";
const port = Number(
  new URL(
    process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL ||
      "http://127.0.0.1:3105",
  ).port || 3105,
);

if (process.env.GIRLZ_CULTURE_ACCEPTANCE_MODE !== "true") {
  throw new Error(
    "The local Supabase fixture is restricted to explicit browser acceptance runs.",
  );
}

const corsHeaders = {
  "access-control-allow-headers":
    "authorization, apikey, content-profile, content-type, prefer, range, x-client-info",
  "access-control-allow-methods": "GET, HEAD, OPTIONS, POST",
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "content-range",
};

function json(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    ...corsHeaders,
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

// Business CMS browser scenarios use unique records, so their simulated
// publication state cannot change the default pages used by parallel tests.
const businessCmsRecords = new Map();
// Favicon publication is global metadata. Its mutable fixture is available only
// in the separate, single-worker favicon runner, never in the shared suite.
const faviconFixtureEnabled = process.env.GIRLZ_CULTURE_FAVICON_FIXTURE === "true";
let brandAssets = [];
const brandImageRequests = [];
const businessCmsScope = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function readFixtureJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 128_000) throw new Error("Acceptance fixture payload is too large");
  }
  return JSON.parse(body || "{}");
}

const server = createServer(async (request, response) => {
  const method = request.method || "GET";
  const url = new URL(request.url || "/", `http://${host}:${port}`);

  if (method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (url.pathname === "/health" && method === "GET") {
    json(response, 200, { ok: true, fixture: "girlz-culture-browser-acceptance", faviconFixtureEnabled });
    return;
  }

  if (url.pathname === "/__fixtures/brand-assets" && faviconFixtureEnabled) {
    if (request.headers["x-acceptance-fixture"] !== "brand-favicon") {
      json(response, 400, { error: "Invalid brand fixture request" });
      return;
    }
    if (method === "GET") {
      json(response, 200, { requests: brandImageRequests });
      return;
    }
    if (method === "POST") {
      try {
        const body = await readFixtureJson(request);
        if (!Array.isArray(body.assets) || body.assets.length > 2 || body.assets.some((asset) =>
          !["favicon", "app_icon"].includes(asset.asset_key)
          || !Number.isSafeInteger(asset.published_version) || asset.published_version < 0
          || typeof asset.published_url !== "string" || asset.published_url.length > 1024)) {
          throw new Error("Invalid brand assets");
        }
        brandAssets = body.assets;
        brandImageRequests.length = 0;
        json(response, 200, { ok: true });
      } catch {
        json(response, 400, { error: "Invalid brand fixture payload" });
      }
      return;
    }
  }

  if (faviconFixtureEnabled && method === "GET" &&
    ["/storage/v1/object/public/platform-brand-assets/favicon.png", "/storage/v1/object/public/platform-brand-assets/app-icon.png"].includes(url.pathname)) {
    brandImageRequests.push({ path: `${url.pathname}${url.search}`, destination: request.headers["sec-fetch-dest"] || null });
    const source = url.pathname.endsWith("/favicon.png") ? "pwa-icon-192.png" : "pwa-icon-512.png";
    const bytes = await readFile(new URL(`../public/${source}`, import.meta.url));
    response.writeHead(200, { ...corsHeaders, "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" });
    response.end(bytes);
    return;
  }

  if (url.pathname.startsWith("/__fixtures/business-signup/") && method === "POST") {
    const scope = url.pathname.slice("/__fixtures/business-signup/".length);
    if (!businessCmsScope.test(scope) || request.headers["x-acceptance-fixture"] !== "business-signup-cms") {
      json(response, 400, { error: "Invalid business CMS fixture scope" });
      return;
    }
    try {
      const body = await readFixtureJson(request);
      if (body.record === null) businessCmsRecords.delete(scope);
      else if (body.record && typeof body.record === "object" && !Array.isArray(body.record)) businessCmsRecords.set(scope, body.record);
      else throw new Error("A published record or null is required");
      json(response, 200, { ok: true });
    } catch {
      json(response, 400, { error: "Invalid business CMS fixture payload" });
    }
    return;
  }

  if (url.pathname === "/auth/v1/settings" && method === "GET") {
    json(response, 200, {
      external: {},
      disable_signup: true,
      mailer_autoconfirm: false,
      phone_autoconfirm: false,
    });
    return;
  }

  if (url.pathname.startsWith("/rest/v1/rpc/") && method === "POST") {
    if (url.pathname === "/rest/v1/rpc/get_public_content_page") {
      try {
        const body = await readFixtureJson(request);
        const slug = String(body.p_slug || "");
        const scope = slug.slice("business-signup-acceptance-".length);
        if (slug.startsWith("business-signup-acceptance-") && businessCmsScope.test(scope)) {
          json(response, 200, businessCmsRecords.get(scope) ?? null);
          return;
        }
      } catch {
        json(response, 400, { error: "Invalid public content fixture request" });
        return;
      }
    }
    if (url.pathname === "/rest/v1/rpc/is_salon_profile_public") {
      json(response, 200, true);
      return;
    }
    json(response, 200, []);
    return;
  }

  if (
    url.pathname.startsWith("/rest/v1/") &&
    (method === "GET" || method === "HEAD")
  ) {
    if (method === "HEAD") {
      response.writeHead(200, {
        ...corsHeaders,
        "cache-control": "no-store",
        "content-range": "*/0",
        "content-type": "application/json; charset=utf-8",
      });
      response.end();
      return;
    }

    const wantsSingle = String(request.headers.accept || "").includes(
      "application/vnd.pgrst.object+json",
    );
    if (url.pathname === "/rest/v1/platform_brand_assets" && faviconFixtureEnabled) {
      // Match the real metadata query; unpublished rows must remain invisible.
      const visible = url.searchParams.get("published_version") === "gt.0"
        ? brandAssets.filter((asset) => asset.published_version > 0) : brandAssets;
      json(response, 200, wantsSingle ? visible[0] || null : visible);
      return;
    }
    if (
      url.pathname === "/rest/v1/salons" &&
      url.searchParams.get("slug") === "eq.acceptance-salon"
    ) {
      const salon = {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Acceptance Salon",
        slug: "acceptance-salon",
        vanity_slug: null,
        description: "A deterministic salon profile used only by the local responsive acceptance suite.",
        description_ai_assisted: false,
        stylist_section_fallback: { mode: "empty" },
        address_street: "123 Acceptance Avenue",
        address_line2: null,
        address_city: "Brooklyn",
        address_state: "NY",
        address_zip: "11201",
        latitude: 40.695,
        longitude: -73.99,
        hours: {},
        languages: ["English"],
        logo_url: null,
        cover_photo_url: null,
        gallery_photos: [],
        verification_status: "Verified",
        rating_overall: 4.9,
        review_count: 12,
        is_closed_override: false,
        closed_override_date: null,
        time_zone: "America/New_York",
        status: "Active",
        is_discoverable: true,
        accepting_bookings: true,
        subscription_tier: "Basic",
        instagram_url: null,
        tiktok_url: null,
        google_business_url: null,
      };
      json(response, 200, wantsSingle ? salon : [salon], {
        "content-range": "0-0/1",
      });
      return;
    }
    json(response, 200, wantsSingle ? null : [], { "content-range": "0-0/0" });
    return;
  }

  json(response, 501, {
    code: "ACCEPTANCE_FIXTURE_UNEXPECTED_REQUEST",
    message: `The read-only browser fixture does not implement ${method} ${url.pathname}.`,
  });
});

server.listen(port, host, () => {
  process.stdout.write(
    `Girlz Culture browser acceptance Supabase fixture listening on http://${host}:${port}\n`,
  );
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
