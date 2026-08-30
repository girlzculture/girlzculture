import { setDefaultResultOrder } from "node:dns";
import { resolve4 } from "node:dns/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  safeResponseHeaders,
  sanitizeText,
  summarizeJsonBody,
} from "./deploy-preview-smoke-core.mjs";

setDefaultResultOrder("ipv4first");

const baseUrl = String(process.env.DEPLOY_PREVIEW_URL || "").replace(/\/$/, "");
const outputDirectory = path.resolve("test-results/deploy-preview");
mkdirSync(outputDirectory, { recursive: true });

const harlem = "lat=40.8116&lng=-73.9465&location=Harlem%2C%20NY";
const probes = [
  { name: "config", pathname: "/api/config" },
  {
    name: "nearby-salons",
    pathname: `/api/discovery/salons?${harlem}&radius=15&limit=12&offset=0&sort=distance`,
  },
  {
    name: "featured-salons",
    pathname: `/api/discovery/featured?${harlem}&radius=15&limit=12&offset=0&seed=preview-diagnostic`,
  },
  {
    name: "trending-picks",
    pathname: `/api/discovery/trending?${harlem}&radius=15&limit=12&offset=0&seed=preview-diagnostic`,
  },
];

const diagnostic = {
  target_kind: "netlify-deploy-preview",
  preview_dns_available: false,
  public_supabase_url_present: false,
  public_supabase_key_present: false,
  deployed_bundle_count: 0,
  app_api_probes: [],
  diagnostic_error: null,
};

async function appProbe(pathname) {
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json" },
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let bodySummary;
    try {
      bodySummary = summarizeJsonBody(JSON.parse(text));
    } catch {
      bodySummary = { kind: "invalid-json", excerpt: sanitizeText(text, 1_000) };
    }
    return {
      status: response.status,
      content_type: contentType,
      headers: safeResponseHeaders(response.headers),
      body: bodySummary,
    };
  } catch (error) {
    return {
      status: 0,
      content_type: "",
      headers: {},
      body: {
        kind: "request-failure",
        error: sanitizeText(
          error instanceof Error ? error.message : String(error),
          1_000,
        ),
      },
    };
  }
}

let browser;
try {
  if (!baseUrl.startsWith("https://")) {
    throw new Error("DEPLOY_PREVIEW_URL is missing or invalid.");
  }
  const hostname = new URL(baseUrl).hostname;
  const addresses = await resolve4(hostname);
  if (!addresses.length) throw new Error("Deploy Preview DNS returned no IPv4 address.");
  diagnostic.preview_dns_available = true;

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

  const bundleConfiguration = await page.evaluate(async () => {
    const urls = [
      ...new Set(
        Array.from(document.scripts)
          .map((script) => script.src)
          .filter(
            (source) => source && new URL(source).origin === location.origin,
          ),
      ),
    ];
    let providerUrlPresent = false;
    let publicKeyPresent = false;
    for (const url of urls) {
      try {
        const result = await fetch(url, { cache: "no-store" });
        const text = await result.text();
        providerUrlPresent ||= /https:\/\/[a-z0-9]+\.supabase\.co/i.test(text);
        publicKeyPresent ||=
          /sb_(?:publishable|anon)_[A-Za-z0-9._~-]+/i.test(text) ||
          /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text);
      } catch {
        // A failed bundle is already observable through the application probes.
      }
    }
    return {
      bundleCount: urls.length,
      providerUrlPresent,
      publicKeyPresent,
    };
  });
  diagnostic.deployed_bundle_count = bundleConfiguration.bundleCount;
  diagnostic.public_supabase_url_present = bundleConfiguration.providerUrlPresent;
  diagnostic.public_supabase_key_present = bundleConfiguration.publicKeyPresent;
  await context.close();

  diagnostic.app_api_probes = await Promise.all(
    probes.map(async (probe) => ({
      name: probe.name,
      ...(await appProbe(probe.pathname)),
    })),
  );
} catch (error) {
  diagnostic.diagnostic_error = sanitizeText(
    error instanceof Error ? error.message : String(error),
    2_000,
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
  `Saved minimized same-origin preview diagnostics: ${diagnostic.app_api_probes
    .map((probe) => `${probe.name}=HTTP ${probe.status}`)
    .join(", ") || diagnostic.diagnostic_error || "no app API probes completed"}`,
);
