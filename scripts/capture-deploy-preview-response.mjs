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

const targetPath = "/?lat=40.8116&lng=-73.9465&location=Harlem%2C%20NY";
const hostname = new URL(baseUrl).hostname;
const addresses = await resolve4(hostname);
assert(addresses.length, `No IPv4 address resolved for ${hostname}.`);

const browser = await chromium.launch({
  headless: true,
  args: [
    `--host-resolver-rules=MAP ${hostname} ${addresses[0]},EXCLUDE localhost`,
  ],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  page.on("console", (message) =>
    consoleMessages.push({ type: message.type(), text: message.text() }),
  );
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));

  const response = await page.goto(`${baseUrl}${targetPath}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  assert(response, `No navigation response for ${targetPath}.`);

  await page.waitForTimeout(1_500);

  const status = response.status();
  const headers = response.headers();
  const responseBody = await response.text().catch((error) =>
    `Unable to read navigation response body: ${error instanceof Error ? error.message : String(error)}`,
  );
  const pageHtml = await page.content().catch((error) =>
    `Unable to serialize page HTML: ${error instanceof Error ? error.message : String(error)}`,
  );
  const visibleText = await page.locator("body").innerText().catch((error) =>
    `Unable to read visible page text: ${error instanceof Error ? error.message : String(error)}`,
  );

  writeFileSync(
    path.join(outputDirectory, "homepage-response.json"),
    `${JSON.stringify(
      {
        url: response.url(),
        status,
        statusText: response.statusText(),
        headers,
        resolvedIpv4: addresses[0],
        consoleMessages,
        pageErrors,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(outputDirectory, "homepage-navigation-response.html"),
    responseBody,
    "utf8",
  );
  writeFileSync(
    path.join(outputDirectory, "homepage-rendered-page.html"),
    pageHtml,
    "utf8",
  );
  writeFileSync(
    path.join(outputDirectory, "homepage-visible-text.txt"),
    `${visibleText}\n`,
    "utf8",
  );
  await page.screenshot({
    path: path.join(outputDirectory, "homepage-http-response.png"),
    fullPage: true,
    timeout: 30_000,
  });

  console.log(
    `Captured deploy-preview homepage HTTP ${status}; diagnostic evidence is in test-results/deploy-preview.`,
  );
  assert(
    status < 400,
    `Deploy-preview homepage returned HTTP ${status}. Diagnostic evidence was captured before stopping.`,
  );
  await context.close();
} finally {
  await browser.close();
}
