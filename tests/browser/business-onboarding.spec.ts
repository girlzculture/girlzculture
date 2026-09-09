import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, screenshotCaret } from "./helpers/hydration";

for (const query of ["", "?plan=garbage", "?plan=", "?plan=%20%20", "?plan=pro", "?plan=starter&plan=growth"]) {
  test(`fresh business gateway ${query || "without query"} never invents a plan`, async ({ page }) => {
    await page.goto(`/business/signup${query}`);
    await expect(page.getByRole("heading", { name: "Grow Your Beauty Business", exact: true })).toBeVisible();
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Starter");
    expect(new URL(page.url()).search).toBe(query);
    await page.getByRole("radio", { name: /Hair Salon & Braiding/ }).check();
    await page.getByRole("button", { name: "Continue with Hair Salon & Braiding" }).click();
    await expect(page).toHaveURL(/\/business\/signup\/hair$/);
    await expect(page.getByRole("heading", { name: "Create Your Business Account" })).toBeVisible();
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Starter");
  });
}

for (const [legacy, canonical] of [["signup", "signup"], ["login", "login"], ["apply", "apply"]]) {
  test(`legacy ${legacy} returns a permanent canonical redirect with its query intact`, async ({ request }) => {
    for (const query of ["", "?plan=starter", "?plan=growth", "?plan=premium", "?plan=basic", "?plan=invalid"]) {
      const response = await request.get(`/salon/${legacy}${query}`, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      const location = new URL(response.headers().location, response.url());
      expect(location.pathname + location.search).toBe(`/business/${canonical}${query}`);
    }
  });
}

test("legacy fresh browser entry resolves without a plan and canonical login links back to the gateway", async ({ page }) => {
  await page.goto("/salon/signup");
  await expect(page).toHaveURL(/\/business\/signup$/);
  await expect(page.locator("main")).not.toContainText("Starter");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://girlzculture.com/business/signup");
  await page.goto("/salon/login");
  await expect(page).toHaveURL(/\/business\/login$/);
  await expect(page.getByRole("heading", { name: "Business login" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Need an account?" })).toHaveAttribute("href", "/business/signup");
});

test("only Hair Salon & Braiding can continue; unavailable categories cannot submit", async ({ page }) => {
  await page.goto("/business/signup");
  const continueButton = page.getByRole("button", { name: "Continue with Hair Salon & Braiding" });
  await expect(continueButton).toBeDisabled();
  for (const category of ["Nail Studio", "Massage & Wellness", "Aesthetics Clinic", "Tattoo Studio", "Lash & Brow Bar", "Barbershop", "Other"]) {
    const input = page.getByRole("radio", { name: new RegExp(`^${category}`) });
    await expect(input).toBeDisabled();
    await input.evaluate((element: HTMLInputElement) => element.click());
    await expect(input).not.toBeChecked();
    await expect(continueButton).toBeDisabled();
  }
  const hair = page.getByRole("radio", { name: /Hair Salon & Braiding/ });
  await hair.focus();
  await expect(hair).toBeFocused();
  await page.keyboard.press("Space");
  await expect(hair).toBeChecked();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page).toHaveURL(/\/business\/signup\/hair$/);
});

test("explicit plans never bleed into a later plain gateway navigation", async ({ page }) => {
  await page.goto("/business/signup?plan=premium");
  await page.getByRole("radio", { name: /Hair Salon & Braiding/ }).check();
  await page.getByRole("button", { name: "Continue with Hair Salon & Braiding" }).click();
  await expect(page).toHaveURL(/\/business\/signup\/hair\?plan=premium$/);
  await page.goto("/business/signup");
  await page.getByRole("radio", { name: /Hair Salon & Braiding/ }).check();
  await page.getByRole("button", { name: "Continue with Hair Salon & Braiding" }).click();
  await expect(page).toHaveURL(/\/business\/signup\/hair$/);
  await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
});

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390], [1440, 1000], [1920, 1080]]) {
  test(`business landing is readable, accessible and uses the CTA teal at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const failedMedia: string[] = [];
    page.on("response", response => { if (/\.(?:jpg|webp|mp4|webm)|_next\/image/.test(response.url()) && response.status() >= 400) failedMedia.push(response.url()); });
    await page.goto("/business/signup");
    await expect(page.locator(".business-hero-panel")).toHaveCount(4);
    await expect(page.locator(".business-hero-panel video")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
    await page.getByRole("radio", { name: /Hair Salon & Braiding/ }).check();
    const button = page.getByRole("button", { name: "Continue with Hair Salon & Braiding" });
    const dimensions = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".business-onboarding")!;
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--gc-magenta)";
      main.appendChild(probe);
      const brand = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { width: document.documentElement.scrollWidth, viewport: innerWidth, brand, background: getComputedStyle(main).backgroundImage, cta: getComputedStyle(document.querySelector(".business-continue")!).backgroundColor };
    });
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.cta).toBe(dimensions.brand);
    expect(dimensions.background).toContain("gradient");
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator(".business-category img")).toHaveCount(8);
    await expect.poll(() => page.locator(".business-photo img").evaluateAll(images => images.length === 12 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    const trust = await page.locator(".business-trust").boundingBox();
    expect((await button.boundingBox())!.y).toBeGreaterThan(trust!.y + trust!.height);
    expect(failedMedia).toEqual([]);
    const audit = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`business-signup-${width}x${height}.png`), fullPage: true, ...screenshotCaret });
  });
}

test("reduced motion keeps the approved poster composition without video requests", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const videos: string[] = [];
  page.on("request", request => { if (request.resourceType() === "media") videos.push(request.url()); });
  await page.goto("/business/signup");
  await expect(page.locator(".business-hero-panel img")).toHaveCount(4);
  expect(videos).toEqual([]);
});

test("service worker clears old versions and cannot resurrect cached onboarding HTML", async ({ page, context }) => {
  await page.goto("/robots.txt");
  await page.evaluate(async () => {
    const old = await caches.open("girlz-culture-public-v3");
    await old.put("/business/signup", new Response("Selected application plan Starter", { headers: { "content-type": "text/html" } }));
    await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain("girlz-culture-public-v3");
  await page.goto("/business/signup?plan=starter");
  await page.goto("/business/signup");
  await expect(page.locator("main")).not.toContainText("Starter");
  const onboardingKeys = await page.evaluate(async () => {
    const cache = await caches.open("girlz-culture-public-v4");
    const keys = await cache.keys();
    for (const path of ["/business/signup", "/business/signup/hair", "/business/login", "/business/apply", "/salon/apply"]) {
      await cache.put(path, new Response("Selected application plan Starter", { headers: { "content-type": "text/html" } }));
    }
    return keys.filter(key => new URL(key.url).pathname.startsWith("/business")).map(key => key.url);
  });
  expect(onboardingKeys).toEqual([]);
  // Development deliberately unregisters workers during React mounting. Register
  // after hydration so this test exercises the shipped worker in either mode.
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.goto("/uncached-public-offline-check", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Selected application plan");
    await expect(page.goto("/business/signup", { waitUntil: "domcontentloaded" })).rejects.toThrow();
  } finally { await context.setOffline(false); }
});
