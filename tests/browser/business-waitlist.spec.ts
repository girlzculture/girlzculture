import { expect, type Page } from "@playwright/test";
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

async function fillContact(page: Page, name = "Nail Studio") {
  await page.getByLabel("Business Name", { exact: true }).fill(name);
  await page.getByLabel("Business Address", { exact: true }).fill("123 Main Street, New York, NY 10001");
  await page.getByLabel("Business Phone Number", { exact: true }).fill("2125550123");
  await page.getByLabel("Business Email", { exact: true }).fill("owner@example.test");
}

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
    await expect(page.getByRole("heading", { name: `Join the ${name} Waitlist` })).toBeVisible();
    await expect(page.getByText("EARLY ACCESS", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Business Name", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Business Address", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Business Phone Number", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Business Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Business Type", { exact: true })).toHaveValue(name);
    await expect(page.getByLabel("Business Type", { exact: true })).toHaveAttribute("readonly", "");
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

test("unknown, missing, duplicate or live waitlist categories return to signup", async ({ page }) => {
  for (const query of ["", "?category=invalid", "?category=hair-salon-braiding", "?category=nail-studio&category=barbershop"]) {
    await page.goto(`/business/waitlist${query}`);
    await expect(page).toHaveURL(/\/business\/signup$/);
    await expect(page.getByRole("heading", { name: "Grow Your Beauty Business" })).toBeVisible();
  }
});

test("waitlist submits its stable category and all required business details through the Partnerships intake", async ({ page }) => {
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/support", async route => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, ticketId: "72ab377b-d37b-4fde-a7e0-d274e5557c5a" } });
  });
  await page.goto("/business/waitlist?category=massage-wellness");
  await fillContact(page, "Calm Studio");
  await page.getByRole("button", { name: "Join the Waitlist", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("You’re on the waitlist");
  await expect(page.getByRole("status")).toContainText("Massage & Wellness");
  await expect(page.getByRole("status")).toContainText("72ab377b-d37b-4fde-a7e0-d274e5557c5a");
  expect(submissions).toEqual([{
    intent: "business_waitlist", categoryId: "massage-wellness", website: "",
    businessName: "Calm Studio", businessAddress: "123 Main Street, New York, NY 10001",
    businessPhone: "+1 (212) 555-0123", businessEmail: "owner@example.test",
  }]);
  await expect(page.getByRole("link", { name: "Explore business types" })).toHaveAttribute("href", "/business/signup");
});

test("waitlist failure retains input, shows only the canonical reference, and supports retry", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/support", route => {
    attempts += 1;
    return route.fulfill(attempts === 1
      ? { status: 503, json: { error: "Private provider diagnostic must not be shown", reference: "GC-WAITLIST-123" } }
      : { json: { ok: true, ticketId: "72ab377b-d37b-4fde-a7e0-d274e5557c5a" } });
  });
  await page.goto("/business/waitlist?category=barbershop");
  await fillContact(page, "Corner Cuts");
  await page.getByRole("button", { name: "Join the Waitlist", exact: true }).click();
  await expect(page.getByRole("form").getByRole("alert")).toContainText("Reference GC-WAITLIST-123");
  await expect(page.getByRole("form").getByRole("alert")).not.toContainText("Private provider");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByLabel("Business Name", { exact: true })).toHaveValue("Corner Cuts");
  await expect(page.getByLabel("Business Address", { exact: true })).toHaveValue("123 Main Street, New York, NY 10001");
  await expect(page.getByLabel("Business Phone Number", { exact: true })).toHaveValue("+1 (212) 555-0123");
  await expect(page.getByLabel("Business Email", { exact: true })).toHaveValue("owner@example.test");
  await expect(page.getByLabel("Business Type", { exact: true })).toHaveValue("Barbershop");
  await page.getByRole("button", { name: "Join the Waitlist", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("You’re on the waitlist");
  expect(attempts).toBe(2);
});

for (const scenario of ["edge HTML", "unconfirmed success", "invalid reference", "rate limit"]) {
  test(`waitlist handles ${scenario} without inventing a successful capture`, async ({ page }) => {
    await page.route("**/api/support", route => route.fulfill(scenario === "edge HTML"
      ? { status: 502, contentType: "text/html", body: "<h1>Private edge diagnostic</h1>" }
      : scenario === "rate limit" ? { status: 429, json: { error: "rate limited" } }
        : scenario === "invalid reference" ? { json: { ok: true, ticketId: "invented-success" } }
        : { json: { ok: true } }));
    await page.goto("/business/waitlist?category=nail-studio");
    await fillContact(page);
    await page.getByRole("button", { name: "Join the Waitlist", exact: true }).click();
    await expect(page.getByRole("form").getByRole("alert")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Private edge diagnostic");
    await expect(page.getByRole("status")).toHaveCount(0);
  });
}

test("waitlist requires every contact field and rejects invalid phone or email before sending", async ({ page }) => {
  const submissions: unknown[] = [];
  await page.route("**/api/support", async route => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, ticketId: "72ab377b-d37b-4fde-a7e0-d274e5557c5a" } });
  });
  await page.goto("/business/waitlist?category=nail-studio");
  for (const label of ["Business Name", "Business Address", "Business Phone Number", "Business Email"]) {
    await fillContact(page);
    const field = page.getByLabel(label, { exact: true });
    await field.fill("");
    await page.getByRole("button", { name: "Join the Waitlist", exact: true }).click();
    expect(await field.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    expect(submissions).toHaveLength(0);
  }
  for (const [label, value] of [["Business Phone Number", "123"], ["Business Email", "owner@example"]]) {
    await fillContact(page);
    const field = page.getByLabel(label, { exact: true });
    await field.fill(value);
    await page.getByRole("button", { name: "Join the Waitlist", exact: true }).click();
    expect(await field.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
    expect(submissions).toHaveLength(0);
  }
  await fillContact(page);
  await page.getByRole("button", { name: "Join the Waitlist", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(submissions).toHaveLength(1);
});

for (const [width, height] of [[390, 844], [430, 932], [768, 1024], [834, 1194], [1024, 768], [1366, 768], [1440, 900], [1920, 1080]]) {
  test(`waitlist is readable and accessible at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto("/business/waitlist?category=massage-wellness");
    await expect(page.getByRole("heading", { name: "Join the Massage & Wellness Waitlist" })).toBeVisible();
    await expect.poll(() => page.locator(".business-photo img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth >= 480)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const button = page.getByRole("button", { name: "Join the Waitlist", exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`business-waitlist-${width}x${height}.png`), fullPage: true });
  });
}
