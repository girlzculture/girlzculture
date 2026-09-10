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
    await page.getByRole("link", { name: "Hair Salon & Braiding", exact: true }).click();
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

test("business cards open the correct flow directly by pointer and keyboard", async ({ page }) => {
  await page.goto("/business/signup");
  const hair = page.getByRole("link", { name: "Hair Salon & Braiding", exact: true });
  await expect(hair).toHaveAttribute("href", "/business/signup/hair");
  await expect(page.locator(".business-category")).toHaveCount(8);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.locator(".business-category button")).toHaveCount(0);
  await expect(page.locator(".business-type-selector")).not.toContainText(/Available Now|Coming Soon/);
  await hair.click({ position: { x: 12, y: 12 } });
  await expect(page).toHaveURL(/\/business\/signup\/hair$/);
  await page.goBack();
  await expect(hair).toBeVisible();
  await page.reload();
  await hair.press("Enter");
  await expect(page).toHaveURL(/\/business\/signup\/hair$/);
  await page.goBack();
  const nails = page.getByRole("link", { name: "Nail Studio", exact: true });
  await nails.press("Enter");
  await expect(page).toHaveURL(/\/business\/waitlist\?category=nail-studio$/);
  await expect(page.getByRole("heading", { name: "Join the Nail Studio Waitlist", exact: true })).toBeVisible();
});

test("business landing keeps the approved copy, eight direct card routes and no extra controls", async ({ page }) => {
  await page.goto("/business/signup");
  const hero = page.locator(".business-hero");
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText("Grow Your Beauty Business");
  await expect(hero.locator(".business-hero-copy > p")).toHaveText("Get discovered by more clients, manage your business all in one place, and be part of a supportive community built for beauty entrepreneurs.");
  await expect(hero.locator(".business-wordmark")).toHaveText("Girlz Culture");
  await expect(hero.getByRole("link", { name: "Log In", exact: true })).toHaveAttribute("href", "/business/login");
  await expect(hero.locator(".business-entry-login > span")).toHaveText("Already have an account?");
  await expect(hero.getByRole("link")).toHaveCount(2);
  await expect(hero.getByRole("button")).toHaveCount(0);
  await expect(hero.locator("svg, ul, ol")).toHaveCount(0);
  await expect(hero).not.toContainText(/Beauty • Business • Community|Join as a Business|More Clients\. More Opportunities\. A Bigger You\.|Get More Bookings|Join a Supportive Community|Tools to Grow Your Brand|Built for Beauty Entrepreneurs|Grow Your Brand|Reach New Clients/);

  const selector = page.locator(".business-type-selector");
  await expect(selector.getByRole("heading")).toHaveText("What’s Your Business?");
  await expect(selector.locator(":scope > p")).toHaveText("Select the category that best fits your business.");
  await expect(selector).not.toContainText(/Choose Your Business Type|Select Your Business Type|Available Now|Coming Soon|Continue/);
  await expect(selector.locator("svg, button, input, [role=radio], [role=checkbox], [role=status]")).toHaveCount(0);
  await expect(selector).not.toContainText(/[→➜➔✓✔]/);
  const destinations = [
    ["Hair Salon & Braiding", "/business/signup/hair"],
    ["Nail Studio", "/business/waitlist?category=nail-studio"],
    ["Massage & Wellness", "/business/waitlist?category=massage-wellness"],
    ["Aesthetics Clinic", "/business/waitlist?category=aesthetics-clinic"],
    ["Tattoo Studio", "/business/waitlist?category=tattoo-studio"],
    ["Lash & Brow Bar", "/business/waitlist?category=lash-brow-bar"],
    ["Barbershop", "/business/waitlist?category=barbershop"],
    ["Other", "/business/waitlist?category=other"],
  ];
  await expect(selector.getByRole("link")).toHaveCount(8);
  await expect(selector.locator(".business-category-name")).toHaveText(destinations.map(([name]) => name));
  for (const [name, href] of destinations) {
    const card = selector.getByRole("link", { name, exact: true });
    await expect(card).toHaveAttribute("href", href);
    await expect(card).toHaveText(name);
    await expect(card.locator(":scope > *")).toHaveCount(2);
    await expect(card.locator("img")).toHaveCount(1);
  }
  const trust = page.getByRole("region", { name: "Built for your business" });
  await expect(trust.getByRole("heading")).toHaveText(["A Platform Built for You", "Safe & Secure", "More Than a Platform"]);
  await expect(trust.locator("p")).toHaveText([
    "Designed for beauty and wellness businesses like yours.",
    "Your data and business information are always protected.",
    "Join a growing community of entrepreneurs, creators, and professionals.",
  ]);
});

test("explicit plans never bleed into a later plain gateway navigation", async ({ page }) => {
  await page.goto("/business/signup?plan=premium");
  await page.getByRole("link", { name: "Hair Salon & Braiding", exact: true }).click();
  await expect(page).toHaveURL(/\/business\/signup\/hair\?plan=premium$/);
  await page.goto("/business/signup");
  await page.getByRole("link", { name: "Hair Salon & Braiding", exact: true }).click();
  await expect(page).toHaveURL(/\/business\/signup\/hair$/);
  await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
});

for (const [width, height] of [[390, 844], [430, 932], [768, 1024], [834, 1194], [1024, 768], [1366, 768], [1440, 900], [1920, 1080]]) {
  test(`business landing is readable, accessible and keeps the approved full-bleed composition at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const failedMedia: string[] = [];
    page.on("response", response => { if (/\.(?:jpe?g|png|gif|webp|avif|mp4|webm)|_next\/image/.test(response.url()) && response.status() >= 400) failedMedia.push(response.url()); });
    await page.goto("/business/signup");
    await expect(page.locator(".business-hero-panel")).toHaveCount(0);
    await expect(page.locator(".business-hero-media")).toHaveCount(1);
    await expect(page.locator(".business-hero-media img")).toHaveCount(1);
    await expect(page.locator(".business-hero-media video")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
    const card = page.getByRole("link", { name: "Hair Salon & Braiding", exact: true });
    const dimensions = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".business-onboarding")!;
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--business-teal-light)";
      main.appendChild(probe);
      const brand = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const hero = document.querySelector<HTMLElement>(".business-hero")!;
      const media = document.querySelector<HTMLElement>(".business-hero-media")!;
      const selector = document.querySelector<HTMLElement>(".business-type-selector")!;
      const image = media.querySelector("img")!;
      const bounds = (element: Element) => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height }; };
      return {
        width: document.documentElement.scrollWidth, viewport: innerWidth, brand,
        accent: getComputedStyle(document.querySelector(".business-hero-copy h1 > span")!).color,
        hero: bounds(hero), media: bounds(media), image: bounds(image), selector: bounds(selector),
        gradients: [hero, media].flatMap(element => [getComputedStyle(element).backgroundImage, getComputedStyle(element, "::before").backgroundImage, getComputedStyle(element, "::after").backgroundImage]).join(" "),
        selectorBackground: getComputedStyle(selector).backgroundColor,
        mediaRadius: getComputedStyle(media).borderRadius,
      };
    });
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.accent).toBe(dimensions.brand);
    expect(dimensions.gradients).toContain("gradient");
    expect(dimensions.selectorBackground).toBe("rgb(255, 255, 255)");
    expect(dimensions.hero.left).toBeCloseTo(0);
    expect(dimensions.hero.right).toBeCloseTo(width);
    expect(dimensions.media).toEqual(dimensions.hero);
    expect(dimensions.image).toEqual(dimensions.hero);
    expect(dimensions.mediaRadius).toBe("0px");
    expect(dimensions.hero.height).toBeGreaterThanOrEqual(260);
    expect(dimensions.selector.top - dimensions.hero.bottom).toBeLessThanOrEqual(48);
    expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator(".business-category img")).toHaveCount(8);
    await expect.poll(() => page.locator(".business-photo img").evaluateAll(images => images.length === 9 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await expect(page.locator(".business-hero-copy ul")).toHaveCount(0);
    await expect(page.locator(".business-hero-copy")).not.toContainText(/Get More Bookings|Grow Your Brand|Reach New Clients|Join a Supportive Community/);
    const cards = await page.locator(".business-category").evaluateAll(elements => elements.map(element => {
      const card = element.getBoundingClientRect();
      const image = element.querySelector("img")!;
      const frame = image.getBoundingClientRect();
      return { width: card.width, height: card.height, imageHeight: frame.height, naturalWidth: image.naturalWidth, left: card.left, right: card.right, top: card.top };
    }));
    for (const geometry of cards) {
      expect(geometry.width).toBeGreaterThanOrEqual(44);
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.naturalWidth).toBeGreaterThanOrEqual(480);
      expect(geometry.imageHeight / geometry.height).toBeGreaterThan(.55);
      expect(geometry.height - geometry.imageHeight).toBeLessThan(76);
    }
    const rows = new Set(cards.map(card => Math.round(card.top)));
    if (width <= 430) expect(rows.size).toBe(4);
    if (width >= 1366) expect(rows.size).toBe(1);
    if (width <= 430) for (const row of rows) expect(cards.filter(card => Math.round(card.top) === row)).toHaveLength(2);
    await expect(page.locator(".business-trust")).toBeVisible();
    expect(failedMedia).toEqual([]);
    const audit = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`business-signup-${width}x${height}.png`), fullPage: true, ...screenshotCaret });
  });
}

test("reduced motion keeps the image fallback without video requests", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const videos: string[] = [];
  page.on("request", request => { if (request.resourceType() === "media") videos.push(request.url()); });
  await page.goto("/business/signup");
  const heroImage = page.locator(".business-hero-media img");
  await expect(heroImage).toHaveCount(1);
  await expect(heroImage).toHaveAttribute("src", "/images/business/business-signup-hero.avif");
  await expect.poll(() => heroImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator(".business-hero-media video")).toHaveCount(0);
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
