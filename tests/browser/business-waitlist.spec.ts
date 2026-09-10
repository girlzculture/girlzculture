import { expect } from "@playwright/test";
import { test } from "./helpers/hydration";
import AxeBuilder from "@axe-core/playwright";

const categories = [
  ["Nail Studio", "nail-studio"],
  ["Massage & Wellness", "massage-wellness"],
  ["Aesthetics Clinic", "aesthetics-clinic"],
  ["Tattoo Studio", "tattoo-studio"],
  ["Lash & Brow Bar", "lash-brow-bar"],
  ["Barbershop", "barbershop"],
  ["Other", "other"],
] as const;

test("Hair card opens the live account/application flow immediately", async ({ page }) => {
  await page.goto("/business/signup");
  const card = page.getByRole("link", { name: "Hair Salon & Braiding", exact: true });
  await expect(card).toHaveAttribute("href", "/business/signup/hair");
  await card.click();
  await expect(page).toHaveURL(/\/business\/signup\/hair$/);
  await expect(page.getByRole("heading", { name: "Create Your Business Account" })).toBeVisible();
  await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
});

for (const [name, slug] of categories) {
  test(`${name} card opens its category waitlist`, async ({ page }) => {
    await page.goto("/business/signup?plan=premium");
    const card = page.getByRole("link", { name, exact: true });
    await expect(card).toHaveAttribute("href", `/business/waitlist?category=${slug}`);
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/business/waitlist\\?category=${slug}$`));
    await expect(page.getByRole("heading", { name: `Join the ${name} waitlist` })).toBeVisible();
    await expect(page.getByLabel("Business name", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
  });
}

test("partner redirects permanently to business signup and preserves query intent", async ({ request }) => {
  for (const query of ["", "?plan=growth", "?plan=invalid", "?utm_source=qr&plan=premium"]) {
    const response = await request.get(`/partner${query}`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    const target = new URL(response.headers().location, response.url());
    expect(target.pathname + target.search).toBe(`/business/signup${query}`);
  }
});

test("public business entry CTAs bypass the retired partner page", async ({ page }) => {
  for (const route of ["/", "/about", "/login"]) {
    await page.goto(route);
    await expect(page.locator('a[href="/business/signup"]').first()).toBeAttached();
    await expect(page.locator('a[href="/partner"], a[href^="/partner?"], a[href^="/partner#"], a[href^="/partner/"]')).toHaveCount(0);
  }
});

test("unknown, missing, duplicate or live waitlist categories return to signup", async ({ page }) => {
  for (const query of ["", "?category=invalid", "?category=hair-salon-braiding", "?category=nail-studio&category=barbershop"]) {
    await page.goto(`/business/waitlist${query}`);
    await expect(page).toHaveURL(/\/business\/signup$/);
    await expect(page.getByRole("heading", { name: "Grow Your Beauty Business" })).toBeVisible();
  }
});

test("waitlist saves category and minimum contact details through the Partnerships intake", async ({ page }) => {
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/support", async route => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, ticketId: "72ab377b-d37b-4fde-a7e0-d274e5557c5a" } });
  });
  await page.goto("/business/waitlist?category=massage-wellness");
  await page.getByLabel("Business name", { exact: true }).fill("Calm Studio");
  await page.getByLabel("Email address", { exact: true }).fill("owner@example.test");
  await page.getByRole("button", { name: "Join the waitlist", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("You’re on the waitlist");
  await expect(page.getByRole("status")).toContainText("Massage & Wellness");
  await expect(page.getByRole("status")).toContainText("72ab377b-d37b-4fde-a7e0-d274e5557c5a");
  expect(submissions).toEqual([{
    name: "Calm Studio", email: "owner@example.test", website: "",
    category: "Partnerships", subject: "Business waitlist — Massage & Wellness",
    message: "Business category: Massage & Wellness (massage-wellness)\nBusiness name: Calm Studio\nPlease email me when this business category opens on Girlz Culture.",
  }]);
  await expect(page.getByRole("link", { name: "Explore business types" })).toHaveAttribute("href", "/business/signup");
});

test("waitlist failure retains input, shows only the canonical reference, and supports retry", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/support", route => {
    attempts += 1;
    return route.fulfill(attempts === 1
      ? { status: 503, json: { error: "Private provider diagnostic must not be shown", reference: "GC-WAITLIST-123" } }
      : { json: { ok: true, ticketId: "confirmed-waitlist-record" } });
  });
  await page.goto("/business/waitlist?category=barbershop");
  await page.getByLabel("Business name", { exact: true }).fill("Corner Cuts");
  await page.getByLabel("Email address", { exact: true }).fill("owner@example.test");
  await page.getByRole("button", { name: "Join the waitlist", exact: true }).click();
  await expect(page.getByRole("form").getByRole("alert")).toContainText("Reference GC-WAITLIST-123");
  await expect(page.getByRole("form").getByRole("alert")).not.toContainText("Private provider");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue("Corner Cuts");
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("owner@example.test");
  await page.getByRole("button", { name: "Join the waitlist", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("You’re on the waitlist");
  expect(attempts).toBe(2);
});

for (const scenario of ["edge HTML", "unconfirmed success", "rate limit"]) {
  test(`waitlist handles ${scenario} without inventing a successful capture`, async ({ page }) => {
    await page.route("**/api/support", route => route.fulfill(scenario === "edge HTML"
      ? { status: 502, contentType: "text/html", body: "<h1>Private edge diagnostic</h1>" }
      : scenario === "rate limit" ? { status: 429, json: { error: "rate limited" } }
        : { json: { ok: true } }));
    await page.goto("/business/waitlist?category=nail-studio");
    await page.getByLabel("Business name", { exact: true }).fill("Nail Studio");
    await page.getByLabel("Email address", { exact: true }).fill("owner@example.test");
    await page.getByRole("button", { name: "Join the waitlist", exact: true }).click();
    await expect(page.getByRole("form").getByRole("alert")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Private edge diagnostic");
    await expect(page.getByRole("status")).toHaveCount(0);
  });
}

for (const [width, height] of [[390, 844], [430, 932], [768, 1024], [1024, 1366], [1440, 1000]]) {
  test(`waitlist is readable and accessible at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto("/business/waitlist?category=massage-wellness");
    await expect(page.getByRole("heading", { name: "Join the Massage & Wellness waitlist" })).toBeVisible();
    await expect.poll(() => page.locator(".business-photo img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth >= 480)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const button = page.getByRole("button", { name: "Join the waitlist", exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`business-waitlist-${width}x${height}.png`), fullPage: true });
  });
}
