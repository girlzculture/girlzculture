import assert from "node:assert/strict";
import { setDefaultResultOrder } from "node:dns";
import { resolve4 } from "node:dns/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  safeResponseHeaders,
  sanitizeText,
  sanitizeUrl,
  summarizeJsonBody,
} from "./deploy-preview-smoke-core.mjs";

setDefaultResultOrder("ipv4first");

const baseUrl = String(process.env.DEPLOY_PREVIEW_URL || "").replace(/\/$/, "");
assert(baseUrl.startsWith("https://"), "DEPLOY_PREVIEW_URL must be an HTTPS URL.");

const outputDirectory = path.resolve("test-results/deploy-preview");
mkdirSync(outputDirectory, { recursive: true });

const harlem = "lat=40.8116&lng=-73.9465&location=Harlem%2C%20NY";
const targets = [
  { name: "homepage", pathname: `/?${harlem}`, kind: "page" },
  { name: "how-it-works", pathname: "/how-it-works", kind: "page" },
  { name: "legal", pathname: "/legal", kind: "page" },
  {
    name: "salons",
    pathname: `/salons?${harlem}&q=salons%20near%20me`,
    kind: "page",
  },
  { name: "config-api", pathname: "/api/config", kind: "api" },
  {
    name: "discovery-api",
    pathname: `/api/discovery/salons?${harlem}&radius=15&limit=12&offset=0&sort=distance`,
    kind: "api",
  },
  {
    name: "featured-api",
    pathname: `/api/discovery/featured?${harlem}&radius=15&limit=12&offset=0&seed=preview-smoke`,
    kind: "api",
  },
  {
    name: "trending-api",
    pathname: `/api/discovery/trending?${harlem}&radius=15&limit=12&offset=0&seed=preview-smoke`,
    kind: "api",
  },
];

const hostname = new URL(baseUrl).hostname;
const addresses = await resolve4(hostname);
assert(addresses.length, `No IPv4 address resolved for ${hostname}.`);

const browser = await chromium.launch({
  headless: true,
  args: [
    `--host-resolver-rules=MAP ${hostname} ${addresses[0]},EXCLUDE localhost`,
  ],
});

const results = [];

try {
  for (const target of targets) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const consoleMessages = [];
    const pageErrors = [];
    page.on("console", (message) =>
      consoleMessages.push({
        type: message.type(),
        text: sanitizeText(message.text(), 1_000),
      }),
    );
    page.on("pageerror", (error) =>
      pageErrors.push(sanitizeText(error.message, 1_000)),
    );

    let response = null;
    let navigationError = "";
    try {
      response = await page.goto(`${baseUrl}${target.pathname}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
    } catch (error) {
      navigationError = sanitizeText(
        error instanceof Error ? error.message : String(error),
        1_000,
      );
    }

    const status = response?.status() || 0;
    const contentType = response?.headers()["content-type"] || "";
    let bodySummary = { kind: "unavailable" };
    if (response) {
      const body = await response.text().catch((error) =>
        sanitizeText(
          error instanceof Error ? error.message : String(error),
          1_000,
        ),
      );
      if (/application\/json/i.test(contentType)) {
        try {
          bodySummary = summarizeJsonBody(JSON.parse(body));
        } catch {
          bodySummary = { kind: "invalid-json", excerpt: sanitizeText(body, 1_000) };
        }
      } else {
        bodySummary = {
          kind: "html",
          byte_length: Buffer.byteLength(body),
        };
      }
    }

    const visibleTextExcerpt =
      target.kind === "page"
        ? await page
            .locator("body")
            .innerText()
            .then((value) => sanitizeText(value, 2_000))
            .catch((error) =>
              sanitizeText(
                error instanceof Error ? error.message : String(error),
                1_000,
              ),
            )
        : "";

    const result = {
      name: target.name,
      pathname: sanitizeUrl(target.pathname, baseUrl),
      url: sanitizeUrl(response?.url() || `${baseUrl}${target.pathname}`, baseUrl),
      status,
      statusText: sanitizeText(response?.statusText() || "", 200),
      headers: safeResponseHeaders(response?.headers() || {}),
      navigationError,
      bodySummary,
      visibleTextExcerpt,
      consoleMessages: consoleMessages.slice(0, 50),
      pageErrors: pageErrors.slice(0, 50),
    };
    results.push(result);

    writeFileSync(
      path.join(outputDirectory, `${target.name}-response.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    if (target.kind === "page") {
      await page
        .screenshot({
          path: path.join(outputDirectory, `${target.name}-http-response.png`),
          fullPage: true,
          timeout: 30_000,
        })
        .catch(() => {});
    }

    console.log(
      `Captured minimized ${target.name} evidence: HTTP ${status || "no response"}.`,
    );
    await context.close();
  }

  writeFileSync(
    path.join(outputDirectory, "route-summary.json"),
    `${JSON.stringify(results, null, 2)}\n`,
    "utf8",
  );

  const failures = results.filter(
    (result) => result.status < 200 || result.status >= 400,
  );
  assert.deepEqual(
    failures,
    [],
    `One or more deployed routes failed. Minimized evidence was captured: ${failures
      .map((result) => `${result.name}=HTTP ${result.status || "none"}`)
      .join(", ")}`,
  );
} finally {
  await browser.close();
}
