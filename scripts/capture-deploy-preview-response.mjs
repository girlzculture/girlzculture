import assert from "node:assert/strict";
import { setDefaultResultOrder } from "node:dns";
import { resolve4 } from "node:dns/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

setDefaultResultOrder("ipv4first");

const baseUrl = String(process.env.DEPLOY_PREVIEW_URL || "").replace(/\/$/, "");
assert(baseUrl.startsWith("https://"), "DEPLOY_PREVIEW_URL must be an HTTPS URL.");

const outputDirectory = path.resolve("test-results/deploy-preview");
mkdirSync(outputDirectory, { recursive: true });

const targets = [
  {
    name: "homepage",
    pathname: "/?lat=40.8116&lng=-73.9465&location=Harlem%2C%20NY",
  },
  { name: "how-it-works", pathname: "/how-it-works" },
  {
    name: "salons",
    pathname:
      "/salons?lat=40.8116&lng=-73.9465&location=Harlem%2C%20NY&q=salons%20near%20me",
  },
  { name: "config-api", pathname: "/api/config" },
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
      consoleMessages.push({ type: message.type(), text: message.text() }),
    );
    page.on("pageerror", (error) =>
      pageErrors.push(error.stack || error.message),
    );

    let response = null;
    let navigationError = "";
    try {
      response = await page.goto(`${baseUrl}${target.pathname}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
    } catch (error) {
      navigationError = error instanceof Error ? error.message : String(error);
    }

    await page.waitForTimeout(1_000).catch(() => {});

    const status = response?.status() || 0;
    const headers = response?.headers() || {};
    const responseBody = response
      ? await response.text().catch((error) =>
          `Unable to read navigation response body: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      : navigationError;
    const pageHtml = await page.content().catch((error) =>
      `Unable to serialize page HTML: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    const visibleText = await page
      .locator("body")
      .innerText()
      .catch((error) =>
        `Unable to read visible page text: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

    const result = {
      name: target.name,
      pathname: target.pathname,
      url: response?.url() || `${baseUrl}${target.pathname}`,
      status,
      statusText: response?.statusText() || "",
      headers,
      resolvedIpv4: addresses[0],
      navigationError,
      consoleMessages,
      pageErrors,
    };
    results.push(result);

    writeFileSync(
      path.join(outputDirectory, `${target.name}-response.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(outputDirectory, `${target.name}-navigation-response.html`),
      responseBody,
      "utf8",
    );
    writeFileSync(
      path.join(outputDirectory, `${target.name}-rendered-page.html`),
      pageHtml,
      "utf8",
    );
    writeFileSync(
      path.join(outputDirectory, `${target.name}-visible-text.txt`),
      `${visibleText}\n`,
      "utf8",
    );
    await page
      .screenshot({
        path: path.join(outputDirectory, `${target.name}-http-response.png`),
        fullPage: true,
        timeout: 30_000,
      })
      .catch(() => {});

    console.log(
      `Captured ${target.name} at ${target.pathname}: HTTP ${status || "no response"}.`,
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
    `One or more deployed routes failed. Diagnostic evidence was captured: ${failures
      .map((result) => `${result.name}=HTTP ${result.status || "none"}`)
      .join(", ")}`,
  );
} finally {
  await browser.close();
}
