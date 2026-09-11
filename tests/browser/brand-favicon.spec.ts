import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { DEFAULT_FAVICON_HREF } from "../../src/lib/brandFavicon";
import { cachedTabIcon, launchFaviconObserver, selectedTabIcon } from "../fixtures/favicon-probe/browser";

const provider = "http://127.0.0.1:3105";
const fixtureHeaders = { "x-acceptance-fixture": "brand-favicon" };
const faviconSource = `${provider}/storage/v1/object/public/platform-brand-assets/favicon.png`;
const appIcon = `${provider}/storage/v1/object/public/platform-brand-assets/app-icon.png`;
type Asset = { asset_key: string; published_url: string; published_version: number };
const published = (version: number): Asset[] => [
  { asset_key: "favicon", published_url: `${faviconSource}?v=old&variant=approved`, published_version: version },
  { asset_key: "app_icon", published_url: appIcon, published_version: 6 },
];
const favicon = (version: number) => `${faviconSource}?v=${version}&variant=approved`;

async function setAssets(request: APIRequestContext, assets: Asset[]) {
  const response = await request.post(`${provider}/__fixtures/brand-assets`, { headers: fixtureHeaders, data: { assets } });
  expect(response.ok()).toBe(true);
}

async function assertPageIcons(page: Page, target: string, expected: string, apple: string) {
  const response = await page.goto(target);
  expect(response?.status()).toBe(200);
  // Parse the actual server response independently of the hydrated document.
  const serverIcons = await page.evaluate((html) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    return [...document.querySelectorAll('link[rel~="icon"]')].map((icon) => icon.getAttribute("href"));
  }, await response!.text());
  expect(serverIcons).toEqual([expected]);
  await expect(page.locator('link[rel~="icon"]')).toHaveCount(1);
  await expect(page.locator('link[rel~="icon"]')).toHaveAttribute("href", expected);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", apple);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
}

test.beforeAll(async ({ request }) => {
  const health = await request.get(`${provider}/health`);
  expect((await health.json()).faviconFixtureEnabled, "Run with playwright.favicon.config.ts and its exclusive local provider").toBe(true);
});
test.beforeEach(async ({ request }) => { await setAssets(request, []); });
test.afterEach(async ({ request }) => { await setAssets(request, []); });

test("server and browser expose one published favicon while app and manifest icons remain independent", async ({ page, request }) => {
  await setAssets(request, published(7));
  for (const route of ["/", "/salons", "/business/signup", "/login"]) {
    await assertPageIcons(page, route, favicon(7), appIcon);
  }
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.icons).toEqual([
    { src: appIcon, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);
  expect(manifest.icons.some((icon: { src: string }) => icon.src.includes("favicon"))).toBe(false);
  const implicit = await request.get("/favicon.ico?legacy-cache-key=1", { maxRedirects: 0 });
  expect(implicit.status()).toBe(307);
  expect(implicit.headers().location).toBe(favicon(7));
  expect(implicit.headers()["cache-control"]).toContain("no-store");
});

test("missing, draft and unsafe favicon publications use the approved fallback without changing app icons", async ({ page, request }) => {
  const scenarios: Asset[][] = [[], published(0), [
    { asset_key: "favicon", published_url: "https://unapproved.invalid/favicon.png", published_version: 9 },
    { asset_key: "app_icon", published_url: appIcon, published_version: 6 },
  ]];
  for (const assets of scenarios) {
    await setAssets(request, assets);
    await assertPageIcons(page, "/", DEFAULT_FAVICON_HREF, assets.length ? appIcon : "/pwa-icon-512.png");
    const implicit = await request.get("/favicon.ico", { maxRedirects: 0 });
    expect(implicit.status()).toBe(307);
    expect(new URL(implicit.headers().location, page.url()).pathname).toBe(DEFAULT_FAVICON_HREF);
    expect(implicit.headers()["cache-control"]).toContain("no-store");
  }
  await setAssets(request, []);
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
    "/pwa-icon-192.png", "/pwa-icon-512.png", "/pwa-maskable-512.png",
  ]);
});

test("fresh private contexts and ordinary reloads request the published icon without favicon interception", async ({ browser, request, baseURL }) => {
  await setAssets(request, published(11));
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await assertPageIcons(page, `${baseURL}/?favicon-private=1`, favicon(11), appIcon);
    // Provider-side HTTP evidence observes the browser's genuine image request;
    // neither page.route nor a direct icon fetch can create this observation.
    await expect.poll(async () => {
      const response = await request.get(`${provider}/__fixtures/brand-assets`, { headers: fixtureHeaders });
      return (await response.json()).requests.map((entry: { path: string }) => entry.path);
    }).toContain(new URL(favicon(11)).pathname + new URL(favicon(11)).search);
    await page.reload();
    await expect(page.locator('link[rel~="icon"]')).toHaveCount(1);
    await expect(page.locator('link[rel~="icon"]')).toHaveAttribute("href", favicon(11));
    await setAssets(request, published(12));
    await page.reload();
    await expect(page.locator('link[rel~="icon"]')).toHaveAttribute("href", favicon(12));
  } finally {
    await context.close();
  }
});

test("Chromium browser-owned tab and cache follow fallback, publication, normal reload, hard refresh, restore and incognito", async ({ request, baseURL }, testInfo) => {
  const observer = await launchFaviconObserver();
  const { context } = observer;
  const worker = observer.worker;
  const evidence: object[] = [];
  const record = async (page: Page, name: string, expected: string, incognito = false) => {
    await expect.poll(async () => (await selectedTabIcon(worker, page.url()))?.favicon).toBe(new URL(expected, baseURL).href);
    const tab = await selectedTabIcon(worker, page.url());
    expect(tab?.incognito).toBe(incognito);
    const bitmap = await cachedTabIcon(worker, page.url());
    expect(bitmap.status).toBe(200);
    expect(bitmap.bytes.length).toBeGreaterThan(100);
    const bytes = Buffer.from(bitmap.bytes);
    await testInfo.attach(`${name}-browser-cached-favicon`, { body: bytes, contentType: "image/png" });
    evidence.push({ step: name, source: "chrome.tabs.Tab.favIconUrl and Chrome favicon cache", ...tab, bitmapSha256: createHash("sha256").update(bytes).digest("hex") });
    return createHash("sha256").update(bytes).digest("hex");
  };
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(`${baseURL}/?favicon-browser-owned=1`);
    const fallbackBitmap = await record(page, "fallback", DEFAULT_FAVICON_HREF);
    await setAssets(request, published(7));
    await page.reload();
    const publishedBitmap = await record(page, "published", favicon(7));
    expect(publishedBitmap).not.toBe(fallbackBitmap);
    await page.reload();
    await record(page, "normal-reload", favicon(7));
    const cdp = await context.newCDPSession(page);
    await Promise.all([page.waitForEvent("load"), cdp.send("Page.reload", { ignoreCache: true })]);
    await cdp.detach();
    await record(page, "hard-refresh", favicon(7));
    await setAssets(request, published(8));
    await page.reload();
    await record(page, "republished-version", favicon(8));
    // Engine restore creates a new published version even for identical bytes.
    await setAssets(request, published(9));
    await page.reload();
    await record(page, "restored-version", favicon(9));
    // A separate private context verifies a fresh incognito session. Chromium's
    // browser-owned native proof above remains isolated to the normal profile;
    // this private check intentionally asserts the server-selected metadata and
    // genuine provider request without modifying browser extension settings.
    const privateContext = await context.browser()!.newContext();
    try {
      const privatePage = await privateContext.newPage();
      await privatePage.goto(`${baseURL}/?favicon-browser-private=1`);
      await expect(privatePage.locator('link[rel~="icon"]')).toHaveAttribute("href", favicon(9));
      await expect.poll(async () => {
        const response = await request.get(`${provider}/__fixtures/brand-assets`, { headers: fixtureHeaders });
        return (await response.json()).requests.map((entry: { path: string }) => entry.path);
      }).toContain(new URL(favicon(9)).pathname + new URL(favicon(9)).search);
    } finally {
      await privateContext.close();
    }
  } finally {
    await testInfo.attach("browser-owned-favicon-evidence", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
    await context.close();
  }
});
