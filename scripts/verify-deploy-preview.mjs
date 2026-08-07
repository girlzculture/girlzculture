import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = String(process.env.DEPLOY_PREVIEW_URL || "").replace(/\/$/, "");
assert(baseUrl.startsWith("https://"), "DEPLOY_PREVIEW_URL must be an HTTPS URL.");

const outputDirectory = path.resolve("test-results/deploy-preview");
mkdirSync(outputDirectory, { recursive: true });

const harlem = "lat=40.8116&lng=-73.9465&location=Harlem%2C%20NY";

async function waitForPreview() {
  let lastMessage = "No response received.";
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "Girlz-Culture-Preview-Acceptance" },
      });
      if (response.ok) return;
      lastMessage = `HTTP ${response.status}`;
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Netlify Deploy Preview did not become ready: ${lastMessage}`);
}

function screenshotPath(name) {
  return path.join(outputDirectory, `${name}.png`);
}

async function openPage(page, pathname) {
  const response = await page.goto(`${baseUrl}${pathname}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  assert(response, `No navigation response for ${pathname}.`);
  assert(
    response.status() < 400,
    `${pathname} returned HTTP ${response.status()}.`,
  );
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
  await page.waitForTimeout(1_200);
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

async function assertVisibleImagesLoad(page, label) {
  const images = await page.locator("img:visible").evaluateAll((nodes) =>
    nodes.slice(0, 20).map((node) => ({
      alt: node.getAttribute("alt") || "",
      source: node.currentSrc || node.getAttribute("src") || "",
      complete: node.complete,
      naturalWidth: node.naturalWidth,
      naturalHeight: node.naturalHeight,
    })),
  );
  assert(images.length > 0, `${label} rendered no visible images.`);
  const broken = images.filter(
    (image) => !image.complete || image.naturalWidth < 1 || image.naturalHeight < 1,
  );
  assert.deepEqual(broken, [], `${label} contains broken visible images.`);
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

async function newPage(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  return { context, page, pageErrors };
}

await waitForPreview();
const browser = await chromium.launch({ headless: true });

try {
  {
    const { context, page, pageErrors } = await newPage(browser, {
      width: 1440,
      height: 1000,
    });
    await openPage(page, `/?${harlem}`);
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
    await assert.doesNotReject(() => previousPromotion.waitFor({ state: "visible" }));
    await assert.doesNotReject(() => nextPromotion.waitFor({ state: "visible" }));
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
    await page.screenshot({ path: screenshotPath("homepage-desktop"), fullPage: true });
    assert.deepEqual(pageErrors, [], "Desktop homepage logged browser errors.");
    await context.close();
  }

  {
    const { context, page, pageErrors } = await newPage(browser, {
      width: 390,
      height: 844,
    });
    await openPage(page, `/?${harlem}`);
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
    await page.screenshot({ path: screenshotPath("homepage-mobile"), fullPage: true });
    assert.deepEqual(pageErrors, [], "Mobile homepage logged browser errors.");
    await context.close();
  }

  {
    const { context, page, pageErrors } = await newPage(browser, {
      width: 390,
      height: 844,
    });
    await openPage(page, "/how-it-works");
    const overlap = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll("main section article")).slice(0, 5);
      return articles.map((article) => {
        const number = article.querySelector("span.absolute");
        const heading = article.querySelector("h2");
        if (!number || !heading) return { overlap: 0, title: heading?.textContent || "" };
        const left = number.getBoundingClientRect();
        const right = heading.getBoundingClientRect();
        const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
        const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
        return { overlap: width * height, title: heading.textContent || "" };
      });
    });
    assert(
      overlap.every((item) => item.overlap === 0),
      `How It Works step numbers overlap headings: ${JSON.stringify(overlap)}`,
    );
    await assertNoHorizontalOverflow(page, "Mobile How It Works");
    await page.screenshot({
      path: screenshotPath("how-it-works-mobile"),
      fullPage: true,
    });
    assert.deepEqual(pageErrors, [], "How It Works logged browser errors.");
    await context.close();
  }

  let firstSalonHref = "";
  {
    const { context, page, pageErrors } = await newPage(browser, {
      width: 1440,
      height: 1000,
    });
    await openPage(page, `/salons?${harlem}&q=salons%20near%20me`);
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
      path: screenshotPath("salons-list-desktop"),
      fullPage: true,
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
    const mapFailure = await page
      .locator("body")
      .innerText()
      .then((text) =>
        text
          .split("\n")
          .find((line) =>
            /Google Maps|You can still use List view|map coordinates/i.test(line),
          ) || "",
      );
    assert(
      await page.locator(".gm-style").isVisible().catch(() => false),
      `The deployed Find Salons map did not render. ${mapFailure}`,
    );
    const marker = page.locator('button[aria-label^="Open "]').first();
    await marker.waitFor({ state: "visible", timeout: 20_000 });
    const markerText = await marker.innerText();
    assert(
      /From \$|New|★/.test(markerText),
      `Map salon marker is missing decision information: ${markerText}`,
    );
    await page.screenshot({
      path: screenshotPath("salons-map-desktop"),
      fullPage: true,
    });
    assert.deepEqual(pageErrors, [], "Find Salons logged browser errors.");
    await context.close();
  }

  {
    const { context, page, pageErrors } = await newPage(browser, {
      width: 390,
      height: 844,
    });
    await openPage(page, firstSalonHref);
    await assertNoHorizontalOverflow(page, "Mobile salon profile");
    await assertVisibleImagesLoad(page, "Mobile salon profile");
    await assertVisibleVideosHealthy(page, "Mobile salon profile");
    await page.screenshot({
      path: screenshotPath("salon-profile-mobile"),
      fullPage: true,
    });
    assert.deepEqual(pageErrors, [], "Salon profile logged browser errors.");
    await context.close();
  }

  console.log(
    `Verified the real Netlify Deploy Preview at ${baseUrl}: restored navigation, responsive homepage sizing, non-overlapping How It Works cards, one Find Salons search, live salon data, working Google Map markers, and healthy visible media.`,
  );
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser.close();
}
