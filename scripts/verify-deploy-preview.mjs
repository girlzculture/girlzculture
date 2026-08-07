import assert from "node:assert/strict";
import { setDefaultResultOrder } from "node:dns";
import { resolve4 } from "node:dns/promises";
import {
  appendFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

setDefaultResultOrder("ipv4first");

const baseUrl = String(process.env.DEPLOY_PREVIEW_URL || "").replace(/\/$/, "");
assert(baseUrl.startsWith("https://"), "DEPLOY_PREVIEW_URL must be an HTTPS URL.");

const outputDirectory = path.resolve("test-results/deploy-preview");
const statusPath = path.join(outputDirectory, "status.log");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(statusPath, "", "utf8");

const harlem = "lat=40.8116&lng=-73.9465&location=Harlem%2C%20NY";

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  appendFileSync(statusPath, `${line}\n`, "utf8");
}

function recordFailure(error) {
  const message = error instanceof Error ? `${error.stack || error.message}` : String(error);
  writeFileSync(path.join(outputDirectory, "failure.txt"), `${message}\n`, "utf8");
  log(`FAILURE: ${message.split("\n")[0]}`);
}

async function resolvePreviewAddress() {
  const hostname = new URL(baseUrl).hostname;
  const addresses = await resolve4(hostname);
  assert(addresses.length, `No IPv4 address resolved for ${hostname}.`);
  log(`Resolved ${hostname} to IPv4 ${addresses[0]}.`);
  return { hostname, address: addresses[0] };
}

function screenshotPath(name) {
  return path.join(outputDirectory, `${name}.png`);
}

async function openPage(page, pathname, screenshotName) {
  log(`Opening ${pathname}`);
  const response = await page.goto(`${baseUrl}${pathname}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  assert(response, `No navigation response for ${pathname}.`);
  assert(response.status() < 400, `${pathname} returned HTTP ${response.status()}.`);
  await page.waitForTimeout(1_500);
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
      source,
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
  assert.deepEqual(
    broken,
    [],
    `${label} contains images that still fail after being brought into view: ${JSON.stringify(broken)}`,
  );
  log(`Verified ${checked.length} loaded images for ${label}.`);
}

async function assertVisibleVideosHealthy(page, label) {
  const videos = await page.locator("video:visible").evaluateAll((nodes) =>
    nodes.map((node) => ({
      source: node.currentSrc || node.getAttribute("src") || "",
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
  page.on("pageerror", (error) => pageErrors.push(error.message));
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
    // Chromium's generic resource message omits the URL. The response and
    // requestfailed listeners below record the exact failing resource instead.
    if (text.startsWith("Failed to load resource:")) return;
    pageErrors.push(text);
  });
  page.on("response", (response) => {
    if (response.status() < 400 || isNetlifyPreviewToolingUrl(response.url()))
      return;
    pageErrors.push(
      `HTTP ${response.status()} ${response.request().resourceType()} ${response.url()}`,
    );
  });
  page.on("requestfailed", (request) => {
    if (isNetlifyPreviewToolingUrl(request.url())) return;
    pageErrors.push(
      `REQUEST_FAILED ${request.resourceType()} ${request.url()} ${
        request.failure()?.errorText || "unknown"
      }`,
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

log(`Deploy-preview verification target: ${baseUrl}`);
let browser;

try {
  const previewAddress = await stage("preview IPv4 resolution", resolvePreviewAddress);
  browser = await chromium.launch({
    headless: true,
    args: [
      `--host-resolver-rules=MAP ${previewAddress.hostname} ${previewAddress.address},EXCLUDE localhost`,
    ],
  });

  await stage("desktop homepage", async () => {
    const { context, page, pageErrors } = await newPage(browser, {
      width: 1440,
      height: 1000,
    });
    try {
      await openPage(page, `/?${harlem}`, "homepage-desktop");
      await page.locator("[data-promotion-card]").first().waitFor({ timeout: 20_000 });
      const promotionWidth = await page
        .locator("[data-promotion-card]")
        .first()
        .evaluate((node) => node.getBoundingClientRect().width);
      assert(
        promotionWidth >= 390 && promotionWidth <= 480,
        `Desktop promotion card width ${promotionWidth}px is outside the restored roomy range.`,
      );
      const previousPromotion = page.getByRole("button", {
        name: "Previous promotion",
      });
      const nextPromotion = page.getByRole("button", { name: "Next promotion" });
      await previousPromotion.waitFor({ state: "visible" });
      await nextPromotion.waitFor({ state: "visible" });
      assert(
        await previousPromotion.locator("svg").isVisible(),
        "Desktop Previous promotion control must show its left arrow.",
      );
      assert(
        await nextPromotion.locator("svg").isVisible(),
        "Desktop Next promotion control must show its right arrow.",
      );
      const bodyText = await page.locator("body").innerText();
      assert(!bodyText.includes("Previous nearby salons"));
      assert(!bodyText.includes("Next nearby salons"));
      assert(!bodyText.includes("New on Girlz Culture"));
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

  await stage("mobile homepage", async () => {
    const { context, page, pageErrors } = await newPage(browser, {
      width: 390,
      height: 844,
    });
    try {
      await openPage(page, `/?${harlem}`, "homepage-mobile");
      await page.locator("[data-promotion-card]").first().waitFor({ timeout: 20_000 });
      const promotionWidth = await page
        .locator("[data-promotion-card]")
        .first()
        .evaluate((node) => node.getBoundingClientRect().width);
      assert(
        promotionWidth >= 260 && promotionWidth <= 330,
        `Mobile promotion card width ${promotionWidth}px is not moderately compact.`,
      );
      assert(
        !(await page.getByRole("button", { name: "Previous promotion" }).isVisible()),
        "Desktop promotion arrows must remain hidden on mobile, where swipe is available.",
      );
      const firstSalonCard = page.locator('[data-card-variant="compact"]').first();
      if (await firstSalonCard.count()) {
        const cardWidth = await firstSalonCard.evaluate(
          (node) => node.getBoundingClientRect().width,
        );
        assert(
          cardWidth >= 150 && cardWidth <= 215,
          `Mobile salon card width ${cardWidth}px is outside the readable compact range.`,
        );
      }
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
          if (!number || !heading)
            return { overlap: 0, title: heading?.textContent || "" };
          const left = number.getBoundingClientRect();
          const right = heading.getBoundingClientRect();
          const width = Math.max(
            0,
            Math.min(left.right, right.right) - Math.max(left.left, right.left),
          );
          const height = Math.max(
            0,
            Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
          );
          return { overlap: width * height, title: heading.textContent || "" };
        });
      });
      assert(
        overlap.every((item) => item.overlap === 0),
        `How It Works step numbers overlap headings: ${JSON.stringify(overlap)}`,
      );
      await assertNoHorizontalOverflow(page, "Mobile How It Works");
      await page.screenshot({
        path: screenshotPath("how-it-works-mobile-final"),
        fullPage: true,
        timeout: 30_000,
      });
      assert.deepEqual(pageErrors, [], "How It Works logged browser errors.");
    } finally {
      await context.close();
    }
  });

  let firstSalonHref = "";
  await stage("desktop Find Salons list and map", async () => {
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
      const searchInputs = page.locator('input[placeholder="Search"]:visible');
      assert.equal(
        await searchInputs.count(),
        1,
        "Find Salons must expose one unified visible Search input.",
      );
      const salonCards = page.locator("[data-salon-card]");
      await salonCards.first().waitFor({ timeout: 30_000 });
      firstSalonHref =
        (await salonCards
          .first()
          .locator('a[data-salon-navigation][href^="/salon/"]')
          .first()
          .getAttribute("href")) || "";
      assert(firstSalonHref, "The first salon result did not expose a profile link.");
      await assertNoHorizontalOverflow(page, "Desktop Find Salons list");
      await assertVisibleImagesLoad(page, "Desktop Find Salons list");
      await page.screenshot({
        path: screenshotPath("salons-list-desktop-final"),
        fullPage: true,
        timeout: 30_000,
      });

      await page.getByRole("button", { name: "Map", exact: true }).click();
      await page.waitForFunction(
        () =>
          Boolean(document.querySelector(".gm-style")) ||
          /Google Maps|You can still use List view|map coordinates/i.test(
            document.body.innerText,
          ),
        undefined,
        { timeout: 30_000 },
      );
      const mapMessage = await page
        .locator("body")
        .innerText()
        .then(
          (text) =>
            text
              .split("\n")
              .find((line) =>
                /Google Maps|You can still use List view|map coordinates/i.test(line),
              ) || "",
        );
      assert(
        await page.locator(".gm-style").isVisible().catch(() => false),
        `The deployed Find Salons map did not render. ${mapMessage}`,
      );
      const marker = page.locator('button[aria-label^="Open "]').first();
      await marker.waitFor({ state: "visible", timeout: 20_000 });
      const markerText = await marker.innerText();
      assert(
        /From \$|New|★/.test(markerText),
        `Map salon marker is missing decision information: ${markerText}`,
      );
      await page.screenshot({
        path: screenshotPath("salons-map-desktop-final"),
        fullPage: true,
        timeout: 30_000,
      });
      assert.deepEqual(pageErrors, [], "Find Salons logged browser errors.");
    } finally {
      await context.close();
    }
  });

  await stage("mobile salon profile media", async () => {
    assert(firstSalonHref, "No salon profile was selected from Find Salons.");
    const { context, page, pageErrors } = await newPage(browser, {
      width: 390,
      height: 844,
    });
    try {
      await openPage(page, firstSalonHref, "salon-profile-mobile");
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
    `PASS: verified the real Netlify Deploy Preview at ${baseUrl}: restored navigation, responsive homepage sizing, non-overlapping How It Works cards, one Find Salons search, live salon data, working Google Map markers, and healthy visible media.`,
  );
} catch (error) {
  recordFailure(error);
  throw error;
} finally {
  if (browser) await browser.close();
}
