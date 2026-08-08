import { createServer } from "node:http";

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

const server = createServer((request, response) => {
  const method = request.method || "GET";
  const url = new URL(request.url || "/", `http://${host}:${port}`);

  if (method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (url.pathname === "/health" && method === "GET") {
    json(response, 200, { ok: true, fixture: "girlz-culture-browser-acceptance" });
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
