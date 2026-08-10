import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const screenshotDirectory = "docs/screenshots/dashboard-workflow/platform-admin";

const fixtures = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "412x915", width: 412, height: 915 },
  { name: "844x390", width: 844, height: 390 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1440x1000", width: 1440, height: 1000 },
] as const;

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true });
});

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectDesktopSidebarHasNoOverlap(page: Page) {
  const layout = await page.locator("aside").evaluate((aside) => {
    const navigation = aside.querySelector("nav");
    const support = aside.querySelector<HTMLAnchorElement>('a[href="/contact"]')?.parentElement;
    if (!navigation || !support) return null;
    const navigationBox = navigation.getBoundingClientRect();
    const supportBox = support.getBoundingClientRect();
    return {
      navigationBottom: navigationBox.bottom,
      supportTop: supportBox.top,
      supportBottom: supportBox.bottom,
      viewportHeight: window.innerHeight,
    };
  });
  expect(layout).not.toBeNull();
  expect(layout!.navigationBottom).toBeLessThanOrEqual(layout!.supportTop + 1);
  expect(layout!.supportBottom).toBeLessThanOrEqual(layout!.viewportHeight + 1);
}

for (const viewport of fixtures) {
  test(`platform-admin customer landing and detail preserve context on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(
      "/internal/acceptance/admin-workflows/customers?q=janel&status=active",
    );
    await expect(page.locator("[data-admin-record-landing]")).toBeVisible();
    await expect(page.getByText("Janel Smith", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (viewport.width >= 1024) await expectDesktopSidebarHasNoOverlap(page);

    const recordLink = page.getByRole("link", { name: /Janel Smith/i }).first();
    await expect(recordLink).toHaveAttribute(
      "href",
      /\/admin\/customers\/customer-1\?return=.*q%3Djanel.*status%3Dactive/,
    );
    await page.screenshot({
      path: `${screenshotDirectory}/admin-customers-${viewport.name}.png`,
      fullPage: true,
    });

    const returnPath = encodeURIComponent(
      "/internal/acceptance/admin-workflows/customers?q=janel&status=active",
    );
    await page.goto(
      `/internal/acceptance/admin-workflows/customers/customer-1?return=${returnPath}`,
    );
    await expect(page.locator("[data-admin-focused-workspace]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Janel Smith" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reviews", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Support & complaints" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Favorites & account activity" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: `${screenshotDirectory}/admin-customer-detail-${viewport.name}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: /Back to customers/i }).click();
    await expect(page).toHaveURL(/customers\?q=janel&status=active$/);
    await expect(page.getByText("Janel Smith", { exact: true })).toBeVisible();
  });
}

test("platform-admin record landings are compact and link to focused workspaces", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const scenarios = [
    ["bookings", "Booking queue", /\/admin\/bookings\/booking-1/],
    ["reviews", "Reviews & Moderation", /\/admin\/reviews\/review-1/],
    ["quality", "Best-Performing Partners", /\/admin\/quality\/salon-1/],
    ["subscriptions", "Subscription records", /\/admin\/subscriptions\/subscription-1/],
    ["marketing", "Campaign workspaces", /\/admin\/marketing\/featured/],
    ["settings", "Settings workspaces", /\/admin\/settings\/time-zone/],
  ] as const;

  for (const [section, heading, href] of scenarios) {
    await page.goto(`/internal/acceptance/admin-workflows/${section}`);
    await expect(page.locator("[data-admin-record-landing]")).toBeVisible();
    await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") || ""));
    expect(hrefs).toEqual(expect.arrayContaining([expect.stringMatching(href)]));
    await expectNoHorizontalOverflow(page);
  }
});

test("platform-admin review detail is a focused evidence workspace", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto(
    "/internal/acceptance/admin-workflows/reviews/review-2?return=%2Finternal%2Facceptance%2Fadmin-workflows%2Freviews%3Fstatus%3Ddisputed",
  );
  await expect(page.locator("[data-admin-focused-workspace]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Moderation decision" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("admin-review-detail-tablet.png"),
    fullPage: true,
  });
});

test("platform-admin complaint, subscription, and admin-member records expose linked evidence", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 834, height: 1112 });

  await page.goto("/internal/acceptance/admin-workflows/complaints/complaint-1");
  await expect(page.locator("[data-admin-focused-workspace]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Service quality complaint" }).first()).toBeVisible();
  await expect(page.getByText("Verified", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ownership and response" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("admin-complaint-detail-tablet.png"), fullPage: true });

  await page.goto("/internal/acceptance/admin-workflows/subscriptions/subscription-1");
  await expect(page.getByRole("heading", { name: "Plan-change history" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Provider-confirmed events" })).toBeVisible();
  await expect(page.getByText("Basic → Growth", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("admin-subscription-detail-tablet.png"), fullPage: true });

  await page.goto("/internal/acceptance/admin-workflows/settings/member-admin-1");
  await expect(page.getByRole("heading", { name: "Jane Admin" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Security audit" })).toBeVisible();
  await expect(page.getByText("admin permissions updated", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("admin-member-detail-tablet.png"), fullPage: true });
});

test("platform-admin mobile landings use cards and never require a desktop table", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const scenarios = [
    ["submissions", "Harlem Braid House"],
    ["bookings", "GC-260807-1001"],
    ["reviews", "Janel S."],
    ["quality", "Best-Performing Partners"],
    ["support", "Appointment question"],
    ["complaints", "Service quality complaint"],
    ["subscriptions", "The Braid Lounge"],
    ["marketing", "Campaign workspaces"],
    ["engine", "Errors & incidents"],
    ["settings", "Settings workspaces"],
  ] as const;

  for (const [section, evidence] of scenarios) {
    await page.goto(`/internal/acceptance/admin-workflows/${section}`);
    await expect(page.locator("[data-admin-record-landing]")).toBeVisible();
    await expect(page.getByPlaceholder("Search platform records")).toHaveCount(0);
    await expect(
      page.getByText(evidence, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await page.goto(
    "/internal/acceptance/admin-workflows/subscriptions?state=New%20York&plan=Growth&status=active",
  );
  await expect(page.locator("table").filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText(/Open subscription record/)).toBeVisible();
  await expect(page.getByRole("link", { name: /The Braid Lounge/ })).toHaveAttribute(
    "href",
    /\/admin\/subscriptions\/subscription-1\?return=.*state%3DNew%2BYork.*plan%3DGrowth.*status%3Dactive/,
  );
  await page.screenshot({
    path: testInfo.outputPath("admin-subscriptions-mobile-cards.png"),
    fullPage: true,
  });
});

test("platform-admin list scroll is saved for focused links and restored after return", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const route = "/internal/acceptance/admin-workflows/customers";
  await page.goto(route);
  await expect(page.locator("[data-admin-record-landing]")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 720));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

  const saved = await page.evaluate(() => {
    const anchor = document.querySelector<HTMLAnchorElement>(
      'a[href^="/admin/customers/customer-fixture-"]',
    );
    if (!anchor) return null;
    anchor.addEventListener("click", (event) => event.preventDefault(), { once: true });
    anchor.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
    );
    return window.sessionStorage.getItem(
      "girlz-culture:admin-list-scroll:/admin/customers",
    );
  });
  expect(Number(saved)).toBeGreaterThan(500);

  await page.evaluate((path) => {
    window.sessionStorage.setItem(
      `girlz-culture:admin-list-scroll:${path}`,
      "720",
    );
  }, route);
  await page.reload();
  await expect(page.locator("[data-admin-record-landing]")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
});
