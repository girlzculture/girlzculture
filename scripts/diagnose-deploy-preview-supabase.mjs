import { setDefaultResultOrder } from "node:dns";
import { resolve4 } from "node:dns/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

setDefaultResultOrder("ipv4first");

const baseUrl = String(process.env.DEPLOY_PREVIEW_URL || "").replace(/\/$/, "");
const outputDirectory = path.resolve("test-results/deploy-preview");
mkdirSync(outputDirectory, { recursive: true });

function redact(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sb_(?:publishable|anon)_[A-Za-z0-9._-]+/gi, "[redacted-supabase-key]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .slice(0, 4_000);
}

function decodeJwtPayload(candidate) {
  try {
    const segment = candidate.split(".")[1];
    if (!segment) return null;
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function selectPublicKey(candidates) {
  const publishable = candidates.find((candidate) =>
    /^sb_(?:publishable|anon)_/i.test(candidate),
  );
  if (publishable) return publishable;
  return (
    candidates.find((candidate) => decodeJwtPayload(candidate)?.role === "anon") ||
    ""
  );
}

const diagnostic = {
  target: baseUrl,
  provider_url_found: false,
  public_key_found: false,
  public_key_kind: null,
  bundle_count: 0,
  calls: [],
  diagnostic_error: null,
};

let browser;
try {
  if (!baseUrl.startsWith("https://")) {
    throw new Error("DEPLOY_PREVIEW_URL is missing or invalid.");
  }
  const hostname = new URL(baseUrl).hostname;
  const addresses = await resolve4(hostname);
  if (!addresses.length) throw new Error(`No IPv4 address resolved for ${hostname}.`);

  browser = await chromium.launch({
    headless: true,
    args: [
      `--host-resolver-rules=MAP ${hostname} ${addresses[0]},EXCLUDE localhost`,
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const response = await page.goto(baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  if (!response || response.status() >= 400) {
    throw new Error(`Deploy Preview homepage returned HTTP ${response?.status() || 0}.`);
  }
  await page.waitForTimeout(1_000);

  const bundles = await page.evaluate(async () => {
    const urls = [...new Set(
      Array.from(document.scripts)
        .map((script) => script.src)
        .filter((source) => source && new URL(source).origin === location.origin),
    )];
    const results = [];
    for (const url of urls) {
      try {
        const result = await fetch(url, { cache: "no-store" });
        results.push({ url, status: result.status, text: await result.text() });
      } catch (error) {
        results.push({
          url,
          status: 0,
          text: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  });
  diagnostic.bundle_count = bundles.length;
  const source = bundles.map((bundle) => bundle.text).join("\n");
  const providerUrls = [...new Set(source.match(/https:\/\/[a-z0-9]+\.supabase\.co/gi) || [])];
  const publicKeys = [
    ...new Set([
      ...(source.match(/sb_(?:publishable|anon)_[A-Za-z0-9._-]+/gi) || []),
      ...(source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []),
    ]),
  ];
  const providerUrl = providerUrls[0] || "";
  const publicKey = selectPublicKey(publicKeys);
  diagnostic.provider_url_found = Boolean(providerUrl);
  diagnostic.public_key_found = Boolean(publicKey);
  diagnostic.public_key_kind = publicKey
    ? publicKey.startsWith("sb_")
      ? "publishable"
      : "legacy-anon-jwt"
    : null;

  if (!providerUrl || !publicKey) {
    throw new Error(
      `Unable to recover the public Supabase configuration from ${bundles.length} deployed JavaScript bundles.`,
    );
  }

  const calls = await page.evaluate(
    async ({ providerUrl, publicKey }) => {
      const headers = {
        apikey: publicKey,
        Authorization: `Bearer ${publicKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Profile": "public",
        "Content-Profile": "public",
      };
      const requests = [
        {
          name: "auth-settings",
          url: `${providerUrl}/auth/v1/settings`,
          method: "GET",
        },
        {
          name: "resolve-search-service-query",
          url: `${providerUrl}/rest/v1/rpc/resolve_search_service_query`,
          method: "POST",
          body: { p_query: "salons near me" },
        },
        {
          name: "discover-nearby-salons-ranked",
          url: `${providerUrl}/rest/v1/rpc/discover_nearby_salons_ranked`,
          method: "POST",
          body: {
            origin_latitude: 40.8116,
            origin_longitude: -73.9465,
            radius_miles: 50,
            style_query: null,
            minimum_rating: null,
            minimum_price: null,
            maximum_price: null,
            sort_mode: "distance",
            result_limit: 6,
            result_offset: 0,
          },
        },
        {
          name: "discover-trending-videos",
          url: `${providerUrl}/rest/v1/rpc/discover_trending_videos`,
          method: "POST",
          body: {
            origin_latitude: 40.8116,
            origin_longitude: -73.9465,
            request_radius_miles: 50,
            rotation_seed: "preview-diagnostic",
            result_limit: 12,
            result_offset: 0,
          },
        },
      ];
      const results = [];
      for (const request of requests) {
        try {
          const response = await fetch(request.url, {
            method: request.method,
            headers,
            body: request.body ? JSON.stringify(request.body) : undefined,
            cache: "no-store",
          });
          results.push({
            name: request.name,
            status: response.status,
            content_type: response.headers.get("content-type") || "",
            body: (await response.text()).slice(0, 4_000),
          });
        } catch (error) {
          results.push({
            name: request.name,
            status: 0,
            content_type: "",
            body: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return results;
    },
    { providerUrl, publicKey },
  );

  diagnostic.calls = calls.map((call) => ({
    ...call,
    body: redact(call.body),
  }));
  await context.close();
} catch (error) {
  diagnostic.diagnostic_error = redact(
    error instanceof Error ? error.stack || error.message : String(error),
  );
} finally {
  if (browser) await browser.close();
}

writeFileSync(
  path.join(outputDirectory, "supabase-provider-diagnostic.json"),
  `${JSON.stringify(diagnostic, null, 2)}\n`,
  "utf8",
);

console.log(
  `Saved redacted Supabase preview diagnostics: ${diagnostic.calls
    .map((call) => `${call.name}=HTTP ${call.status}`)
    .join(", ") || diagnostic.diagnostic_error || "no provider calls completed"}`,
);
