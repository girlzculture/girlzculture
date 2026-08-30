import assert from "node:assert/strict";
import { setDefaultResultOrder } from "node:dns";
import { resolve4 } from "node:dns/promises";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  assertDeploymentConfig,
  assertDiscoveryPayload,
  assertFeaturedPayload,
  assertTrendingPayload,
  safeResponseHeaders,
  sanitizeText,
  summarizeJsonBody,
} from "./deploy-preview-smoke-core.mjs";

setDefaultResultOrder("ipv4first");

const baseUrl = String(process.env.DEPLOY_PREVIEW_URL || "").replace(/\/$/, "");
const expectedHeadSha = String(process.env.PULL_REQUEST_HEAD_SHA || "").toLowerCase();
const scope = String(process.env.DEPLOY_PREVIEW_SMOKE_SCOPE || "core");
assert(baseUrl.startsWith("https://"), "DEPLOY_PREVIEW_URL must be an HTTPS URL.");
assert.match(
  expectedHeadSha,
  /^[0-9a-f]{40}$/,
  "PULL_REQUEST_HEAD_SHA must be the exact 40-character PR head.",
);
assert(
  scope === "core" || scope === "google-maps",
  "DEPLOY_PREVIEW_SMOKE_SCOPE must be core or google-maps.",
);

const outputDirectory = path.resolve("test-results/deploy-preview");
const statusPath = path.join(
  outputDirectory,
  scope === "core" ? "status.log" : "google-maps-status.log",
);
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(statusPath, "", "utf8");

const harlem = "lat=40.8116&lng=-73.9465&location=Harlem%2C%20NY";

function log(message) {
  const line = `${new Date().toISOString()} ${sanitizeText(message, 2_000)}`;
  console.log(line);
  appendFileSync(statusPath, `${line}\n`, "utf8");
}

function recordFailure(error) {
  const message = sanitizeText(
    error instanceof Error ? `${error.stack || error.message}` : String(error),
    8_000,
  );
  writeFileSync(
    path.join(
      outputDirectory,
      scope === "core" ? "failure.txt" : "google-maps-failure.txt",
    ),
    `${message}\n`,
    "utf8",
  );
  log(`FAILURE: ${message.split("\n")[0]}`);
}

async function resolvePreviewAddress() {
  const hostname = new URL(baseUrl).hostname;
  const addresses = await resolve4(hostname);
  assert(addresses.length, `No IPv4 address resolved for ${hostname}.`);
  log(`Resolved ${hostname} for browser verification.`);
  return { hostname, address: addresses[0] };
}

function screenshotPath(name) {
  return path.join(outputDirectory, `${name}.png`);
}

async function apiJson(pathname, label) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/json" },
  });
  assert(
    response.status >= 200 && response.status < 300,
    `${label} returned HTTP ${response.status}.`,
  );
  assert.match(
    response.headers.get("content-type") || "",
    /application\/json/i,
    `${label} did not return JSON.`,
  );
  assert.equal(
    new URL(response.url).origin,
    new URL(baseUrl).origin,
    `${label} redirected away from the Deploy Preview.`,
  );
  const body = await response.json();
  assert(!body?.error, `${label} returned an error payload.`);
  assert(
    !body?.warning && !(Array.isArray(body?.warnings) && body.warnings.length),
    `${label} returned operational warnings on a successful preview request.`,
  );
  return {
    body,
    evidence: {
      label,
      status: response.status,
      headers: safeResponseHeaders(response.headers),
      body: summarizeJsonBody(body),
    },
  };
}

async function verifyApplicationApis() {
  // Probe sequentially so a failed route cannot leave sibling fetches running
  // while Node tears down the verifier and writes its failure evidence.
  const config = await apiJson("/api/config", "Config API");
  const discovery = await apiJson(
    `/api/discovery/salons?${harlem}&radius=15&limit=12&offset=0&sort=distance`,
    "Nearby salon API",
  );
  const featured = await apiJson(
    `/api/discovery/featured?${harlem}&radius=15&limit=12&offset=0&seed=preview-smoke`,
    "Featured salon API",
  );
  const trending = await apiJson(
    `/api/discovery/trending?${harlem}&radius=15&limit=12&offset=0&seed=preview-smoke`,
    "Trending API",
  );

  assertDeploymentConfig(config.body, expectedHeadSha);
  assertDiscoveryPayload(discovery.body, 6);
  assertFeaturedPayload(featured.body);
  assertTrendingPayload(trending.body);

  const slugs = discovery.body.salons.map((salon) => salon.slug);
  assert.equal(new Set(slugs).size, slugs.length, "Discovery API returned duplicate salons.");
  const discoveryIds = new Set(discovery.body.salons.map((salon) => salon.id));
  assert(
    featured.body.salons.every((salon) => discoveryIds.has(salon.id)),
    "Featured API returned a salon outside the verified preview discovery pool.",
  );

  writeFileSync(
    path.join(outputDirectory, "api-probes.json"),
    `${JSON.stringify(
      [config.evidence, discovery.evidence, featured.evidence, trending.evidence],
      null,
      2,
    )}\n`,
    "utf8",
  );
  log(
    `Verified exact release identity, ${discovery.body.salons.length} staging salons, ${featured.body.salons.length} featured placements, and JSON Trending availability.`,
  );
}

async function openPage(page, pathname, screenshotName) {
  log(`Opening ${pathname}`);
  const response = await page.goto(`${baseUrl}${pathname}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  assert(response, `No navigation response for ${pathname}.`);
  assert(response.status() < 400, `${pathname} returned HTTP ${response.status()}.`);
  await page.screenshot({
    path: screenshotPath(`${screenshotName}-initial`),
    fullPage: true,
    timeout: 30_000,
  });
  log(`Opened ${pathname} with HTTP ${response.status()}`);
}

async function assertNoHorizontalOverflow(page, label) {
  const measurements = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert(
    measurements.scrollWidth <= measurements.innerWidth + 1,
    `${label} has horizontal page overflow: ${measurements.scrollWidth}px > ${measurements.innerWidth}px.`,
  );
}

async function assertNoPublicOperationalAlerts(page, label) {
  const alerts = await page
    .locator('[role="alert"]:visible')
    .allInnerTexts()
    .then((items) => items.map((item) => sanitizeText(item, 500)));
  assert.deepEqual(alerts, [], `${label} rendered public operational alerts.`);
  const bodyText = await page.locator("body").innerText();
  const knownFailures = [
    "Nearby salons could not be loaded",
    "Featured salons could not be loaded",
    "Trending Picks could not be loaded",
    "Something went wrong",
  ].filter((message) => bodyText.includes(message));
  assert.deepEqual(
    knownFailures,
    [],
    `${label} rendered public provider-failure copy.`,
  );
}

async function loadImageForVerification(locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: 12_000 });
  return locator.evaluate(async (node) => {
    const image = /** @type {HTMLImageElement} */ (node);
    image.loading = "eager";
    image.scrollIntoView({ block: "center", inline: "center" });
    if (!image.complete) {
      await new Promise((resolve) => {
        const finish = () => resolve(undefined);
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
        setTimeout(finish, 12_000);
      });
    }
    if (image.complete && image.naturalWidth > 0) {
      try {
        await Promise.race([
          image.decode(),
          new Promise((resolve) => setTimeout(resolve, 5_000)),
        ]);
      } catch {
        // The dimensions below remain the authoritative browser result.
      }
    }
    const source = image.currentSrc || image.getAttribute("src") || "";
    const entries = source ? performance.getEntriesByName(source) : [];
    const lastEntry = entries.at(-1);
    const responseStatus =
      lastEntry && "responseStatus" in lastEntry
        ? Number(lastEntry.responseStatus || 0)
        : null;
    return {
      alt: image.getAttribute("alt") || "",
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      responseStatus,
    };
  });
}

async function assertVisibleImagesLoad(page, label) {
  const locator = page.locator("img:visible");
  const total = await locator.count();
  assert(total > 0, `${label} rendered no visible images.`);
  const checked = [];
  for (let index = 0; index < Math.min(total, 20); index += 1) {
    checked.push(await loadImageForVerification(locator.nth(index)));
  }
  const broken = checked.filter(
    (image) =>
      !image.complete ||
      image.naturalWidth < 1 ||
      image.naturalHeight < 1 ||
      (image.responseStatus !== null && image.responseStatus >= 400),
  );
  assert.deepEqual(broken, [], `${label} contains broken visible images.`);
  log(`Verified ${checked.length} loaded images for ${label}.`);
}

async function assertVisibleVideosHealthy(page, label) {
  const videos = await page.locator("video:visible").evaluateAll((nodes) =>
    nodes.map((node) => ({
      readyState: node.readyState,
      networkState: node.networkState,
      errorCode: node.error?.code || null,
    })),
  );
  const failed = videos.filter((video) => video.errorCode !== null);
  assert.deepEqual(failed, [], `${label} contains a failed visible video.`);
}

function isNetlifyPreviewToolingUrl(value) {
  try {
    const url = new URL(value, baseUrl);
    return (
      url.hostname === "app.netlify.com" ||
      url.pathname.startsWith("/.netlify/scripts/cdp")
    );
  } catch {
    return false;
  }
}

async function newPage(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(45_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(sanitizeText(error.message, 1_000)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (
      text.includes("Framing 'https://app.netlify.com/'") &&
      text.includes("Content Security Policy")
    ) {
      log("Ignored Netlify Deploy Preview drawer CSP noise.");
      return;
    }
    if (text.startsWith("Failed to load resource:")) return;
    pageErrors.push(sanitizeText(text, 1_000));
  });
  page.on("response", (response) => {
    if (response.status() < 400 || isNetlifyPreviewToolingUrl(response.url())) return;
    pageErrors.push(
      sanitizeText(
        `HTTP ${response.status()} ${response.request().resourceType()} ${response.url()}`,
        1_000,
      ),
    );
  });
  page.on("requestfailed", (request) => {
    if (isNetlifyPreviewToolingUrl(request.url())) return;
    try {
      const failedUrl = new URL(request.url());
      if (
        request.resourceType() === "fetch" &&
        failedUrl.searchParams.has("_rsc") &&
        request.failure()?.errorText === "net::ERR_ABORTED"
      ) {
        log(`Ignored expected Next.js RSC prefetch cancellation: ${failedUrl.pathname}`);
        return;
      }
    } catch {
      // Preserve unknown failed requests for the assertion below.
    }
    pageErrors.push(
      sanitizeText(
        `REQUEST_FAILED ${request.resourceType()} ${request.url()} ${
          request.failure()?.errorText || "unknown"
        }`,
        1_000,
      ),
    );
  });
  return { context, page, pageErrors };
}

async function stage(name, operation) {
  log(`START ${name}`);
  const result = await operation();
  log(`PASS ${name}`);
  return result;
}

async function waitForManagedHomepage(page) {
  await page.locator('[data-content-source="managed"]').first().waitFor({
    state: "attached",
    timeout: 30_000,
  });
  await page.locator('[data-promotion-source="managed"]').first().waitFor({
    state: "attached",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '[data-home-salon-section="nearby"] [data-salon-card]',
      ).length >= 6,
    undefined,
    { timeout: 30_000 },
  );
  await page
    .locator('[data-home-salon-section="featured"] [data-salon-card]')
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
  const contentSources = await page
    .locator("[data-content-source]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-content-source")));
  assert(
    contentSources.includes("managed"),
    "Homepage did not render managed content from the preview database.",
  );
  assert(
    contentSources.every((source) =>
      ["managed", "editorial-fallback"].includes(String(source)),
    ),
    `Homepage exposed an unknown content provenance: ${contentSources.join(", ")}`,
  );
  const promotionSources = await page
    .locator("[data-promotion-source]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-promotion-source")),
    );
  assert(
    promotionSources.includes("managed"),
    "Homepage did not render a managed preview promotion.",
  );
  assert(
    promotionSources.every((source) =>
      ["managed", "editorial"].includes(String(source)),
    ),
    `Homepage exposed an unknown promotion provenance: ${promotionSources.join(", ")}`,
  );
  await assertNoPublicOperationalAlerts(page, "Homepage");
}

async function verifyGoogleMaps(browser) {
  const { context, page, pageErrors } = await newPage(browser, {
    width: 1440,
    height: 1000,
  });
  try {
    await openPage(
      page,
      `/salons?${harlem}&q=salons%20near%20me`,
      "google-maps-provider",
    );
    await page.locator("[data-salon-card]").first().waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Map", exact: true }).click();
    const mapSurface = page.locator(".gm-style");
    await mapSurface.waitFor({ state: "visible", timeout: 30_000 });
    const marker = mapSurface.locator('button[aria-label^="Open "]').first();
    await marker.waitFor({ state: "visible", timeout: 20_000 });
    const markerText = await marker.innerText();
    assert(
      /From \$|New|★/.test(markerText),
      `Map salon marker is missing decision information: ${markerText}`,
    );
    await page.screenshot({
      path: screenshotPath("google-maps-provider-final"),
      fullPage: true,
      timeout: 30_000,
    });
    assert.deepEqual(pageErrors, [], "Google Maps provider logged browser errors.");
  } finally {
    await context.close();
  }
}

log(`Deploy-preview ${scope} verification target: ${baseUrl}`);
let browser;

try {
  if (scope === "core") {
    await stage("same-origin application APIs", verifyApplicationApis);
  }

  const previewAddress = await stage("preview IPv4 resolution", resolvePreviewAddress);
  browser = await chromium.launch({
    headless: true,
    args: [
      `--host-resolver-rules=MAP ${previewAddress.hostname} ${previewAddress.address},EXCLUDE localhost`,
    ],
  });

  if (scope === "google-maps") {
    await stage("Google Maps provider", () => verifyGoogleMaps(browser));
    log("PASS: Google Maps rendered independently from core database acceptance.");
  } else {
    await stage("desktop managed homepage", async () => {
      const { context, page, pageErrors } = await newPage(browser, {
        width: 1440,
        height: 1000,
      });
      try {
        await openPage(page, `/?${harlem}`, "homepage-desktop");
        await waitForManagedHomepage(page);
        const promotion = page.locator("[data-promotion-card]").first();
        const promotionWidth = await promotion.evaluate(
          (node) => node.getBoundingClientRect().width,
        );
        assert(
          promotionWidth >= 390 && promotionWidth <= 480,
          `Desktop promotion card width ${promotionWidth}px is outside the restored roomy range.`,
        );
        const previousPromotion = page.getByRole("button", {
          name: "Previous promotion",
        });
        if (await previousPromotion.isVisible().catch(() => false)) {
          assert(
            await previousPromotion.locator("svg").isVisible(),
            "Desktop Previous promotion control must show its left arrow.",
          );
          assert(
            await page
              .getByRole("button", { name: "Next promotion" })
              .locator("svg")
              .isVisible(),
            "Desktop Next promotion control must show its right arrow.",
          );
        }
        await assertNoHorizontalOverflow(page, "Desktop homepage");
        await assertVisibleImagesLoad(page, "Desktop homepage");
        await assertVisibleVideosHealthy(page, "Desktop homepage");
        await page.screenshot({
          path: screenshotPath("homepage-desktop-final"),
          fullPage: true,
          timeout: 30_000,
        });
        assert.deepEqual(pageErrors, [], "Desktop homepage logged browser errors.");
      } finally {
        await context.close();
      }
    });

    await stage("mobile managed homepage", async () => {
      const { context, page, pageErrors } = await newPage(browser, {
        width: 390,
        height: 844,
      });
      try {
        await openPage(page, `/?${harlem}`, "homepage-mobile");
        await waitForManagedHomepage(page);
        const promotionWidth = await page
          .locator("[data-promotion-card]")
          .first()
          .evaluate((node) => node.getBoundingClientRect().width);
        assert(
          promotionWidth >= 240 && promotionWidth <= 330,
          `Mobile promotion card width ${promotionWidth}px is outside the readable compact range.`,
        );
        assert(
          !(await page.getByRole("button", { name: "Previous promotion" }).isVisible()),
          "Desktop promotion arrows must remain hidden on mobile.",
        );
        await assertNoHorizontalOverflow(page, "Mobile homepage");
        await assertVisibleImagesLoad(page, "Mobile homepage");
        await page.screenshot({
          path: screenshotPath("homepage-mobile-final"),
          fullPage: true,
          timeout: 30_000,
        });
        assert.deepEqual(pageErrors, [], "Mobile homepage logged browser errors.");
      } finally {
        await context.close();
      }
    });

    await stage("desktop legal index", async () => {
      const { context, page, pageErrors } = await newPage(browser, {
        width: 1440,
        height: 1000,
      });
      try {
        await openPage(page, "/legal", "legal-desktop");
        await page.locator("main").waitFor({ state: "visible" });
        await assertNoHorizontalOverflow(page, "Desktop legal index");
        await assertNoPublicOperationalAlerts(page, "Desktop legal index");
        assert.deepEqual(pageErrors, [], "Legal index logged browser errors.");
      } finally {
        await context.close();
      }
    });

    await stage("mobile How It Works", async () => {
      const { context, page, pageErrors } = await newPage(browser, {
        width: 390,
        height: 844,
      });
      try {
        await openPage(page, "/how-it-works", "how-it-works-mobile");
        const overlap = await page.evaluate(() => {
          const articles = Array.from(document.querySelectorAll("main section article")).slice(0, 5);
          return articles.map((article) => {
            const number = article.querySelector("span.absolute");
            const heading = article.querySelector("h2");
            if (!number || !heading) return { overlap: 0 };
            const left = number.getBoundingClientRect();
            const right = heading.getBoundingClientRect();
            const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
            const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
            return { overlap: width * height };
          });
        });
        assert(
          overlap.every((item) => item.overlap === 0),
          `How It Works step numbers overlap headings: ${JSON.stringify(overlap)}`,
        );
        await assertNoHorizontalOverflow(page, "Mobile How It Works");
        assert.deepEqual(pageErrors, [], "How It Works logged browser errors.");
      } finally {
        await context.close();
      }
    });

    let firstSalonHref = "";
    await stage("desktop Find Salons list", async () => {
      const { context, page, pageErrors } = await newPage(browser, {
        width: 1440,
        height: 1000,
      });
      try {
        await openPage(
          page,
          `/salons?${harlem}&q=salons%20near%20me`,
          "salons-list-desktop",
        );
        const salonCards = page.locator("[data-salon-card]");
        await salonCards.first().waitFor({ timeout: 30_000 });
        await page.waitForFunction(
          () => document.querySelectorAll("[data-salon-card]").length >= 6,
          undefined,
          { timeout: 30_000 },
        );
        firstSalonHref =
          (await salonCards
            .first()
            .locator('a[data-salon-navigation][href^="/salon/"]')
            .first()
            .getAttribute("href")) || "";
        assert.match(firstSalonHref, /^\/salon\/preview-/, "First result is not a staging salon.");
        await assertNoPublicOperationalAlerts(page, "Find Salons");
        await assertNoHorizontalOverflow(page, "Desktop Find Salons list");
        await assertVisibleImagesLoad(page, "Desktop Find Salons list");
        await page.screenshot({
          path: screenshotPath("salons-list-desktop-final"),
          fullPage: true,
          timeout: 30_000,
        });
        assert.deepEqual(pageErrors, [], "Find Salons logged browser errors.");
      } finally {
        await context.close();
      }
    });

    await stage("mobile salon profile media", async () => {
      const { context, page, pageErrors } = await newPage(browser, {
        width: 390,
        height: 844,
      });
      try {
        await openPage(page, firstSalonHref, "salon-profile-mobile");
        await page.locator("main").waitFor({ state: "visible" });
        await assertNoPublicOperationalAlerts(page, "Mobile salon profile");
        await assertNoHorizontalOverflow(page, "Mobile salon profile");
        await assertVisibleImagesLoad(page, "Mobile salon profile");
        await assertVisibleVideosHealthy(page, "Mobile salon profile");
        await page.screenshot({
          path: screenshotPath("salon-profile-mobile-final"),
          fullPage: true,
          timeout: 30_000,
        });
        assert.deepEqual(pageErrors, [], "Salon profile logged browser errors.");
      } finally {
        await context.close();
      }
    });

    log(
      `PASS: exact release ${expectedHeadSha} served JSON APIs, managed homepage content, at least six staging salons, responsive public pages, and no visible operational alerts.`,
    );
  }
} catch (error) {
  recordFailure(error);
  throw error;
} finally {
  if (browser) await browser.close();
}
