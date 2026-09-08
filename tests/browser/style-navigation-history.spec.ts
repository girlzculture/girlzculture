import { createServer } from "node:http";
import { expect, test, type Page } from "@playwright/test";

const catalogPath = "/internal/acceptance/style-catalog";
const styleId = "11111111-1111-4111-8111-111111111111";

async function streamingSearch(page: Page) {
  // Exercise a real browser fetch with HTTP 200 headers and an unfinished JSON
  // body. A fulfilled Playwright response cannot reproduce abort-during-read.
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    response.write('{"salons":');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  let releaseLocation!: () => void;
  const locationReady = new Promise<void>((resolve) => { releaseLocation = resolve; });
  await page.route("**/api/location/resolve", async (route) => {
    await locationReady;
    await route.fulfill({ json: { location: null } });
  });
  await page.route("**/api/discovery/decision-search", (route) =>
    route.continue({ url: `http://127.0.0.1:${port}/decision-search` }),
  );
  await page.addInitScript(() => {
    const state = { reading: false, aborted: false };
    Object.assign(window, { streamingSearchState: state });
    const readJson = Response.prototype.json;
    Response.prototype.json = function () {
      if (!this.url.includes("decision-search")) return readJson.call(this);
      state.reading = true;
      // Observe the native read and rethrow its original error. The application's
      // response parser and abort handling execute without being replaced.
      return readJson.call(this).catch((error) => {
        state.aborted = error.name === "AbortError";
        throw error;
      });
    };
  });
  return {
    releaseLocation,
    async dispose() {
      releaseLocation();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function expectCatalogFilters(page: Page) {
  const search = page.getByPlaceholder("Search styles");
  await expect(search).toBeVisible();
  await expect(search).toHaveValue("Box");
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue("Braids");
  await expect(page.getByLabel("Length", { exact: true })).toHaveValue("Mid-back");
  await expect(page.getByLabel("Price", { exact: true })).toHaveValue("150-250");
  await expect(page.getByLabel("Sort", { exact: true })).toHaveValue("a-z");
  await expect(page.locator("[data-style-card]")).toHaveCount(1);
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 1440, height: 1000 },
]) {
  test(`Browse Styles preserves URL, filters and scroll after an aborted salon response at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const fixture = await streamingSearch(page);
    try {
      await page.goto(`${catalogPath}?ref=return-check`);
      await page.getByPlaceholder("Search styles").fill("Box");
      await page.getByLabel("Category", { exact: true }).selectOption("Braids");
      await page.getByLabel("Length", { exact: true }).selectOption("Mid-back");
      await page.getByLabel("Price", { exact: true }).selectOption("150-250");
      await page.getByLabel("Sort", { exact: true }).selectOption("a-z");
      const catalogUrl = page.url();
      expect(Object.fromEntries(new URL(catalogUrl).searchParams)).toEqual({
        ref: "return-check", q: "Box", category: "Braids", length: "Mid-back",
        price: "150-250", sort: "a-z",
      });
      await page.evaluate(() => window.scrollTo({ top: 240, behavior: "auto" }));
      await page.getByRole("link", { name: /Box Braids/ }).click();
      await expect(page).toHaveURL(new RegExp(`style_id=${styleId}`));
      await expect(page.getByRole("heading", { name: "Find salons", exact: true })).toBeVisible();
      const savedScroll = await page.evaluate(() => JSON.parse(
        sessionStorage.getItem("girlz-culture-style-catalog-v2") || "null",
      )?.scrollY as number);
      expect(savedScroll).toBeGreaterThan(0);

      // Resolve location only after the salon route mounts, so its initial
      // search remains in flight across Back even in development Strict Mode.
      fixture.releaseLocation();
      await expect.poll(() => page.evaluate(() => (
        window as unknown as { streamingSearchState: { reading: boolean } }
      ).streamingSearchState.reading)).toBe(true);
      await page.goBack();
      await expect.poll(() => page.evaluate(() => (
        window as unknown as { streamingSearchState: { aborted: boolean } }
      ).streamingSearchState.aborted)).toBe(true);
      await expect(page).toHaveURL(catalogUrl);
      await expectCatalogFilters(page);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(savedScroll, 0);

      await page.reload();
      await expect(page).toHaveURL(catalogUrl);
      await expectCatalogFilters(page);
      await page.goForward();
      await expect(page).toHaveURL(new RegExp(`style_id=${styleId}`));
      await page.goBack();
      await expect(page).toHaveURL(catalogUrl);
      await expectCatalogFilters(page);
    } finally {
      await fixture.dispose();
    }
  });
}
