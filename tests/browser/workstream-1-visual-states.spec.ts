import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers/accessibility";

const fixtureRoute = "/internal/acceptance/accessibility-states";
const evidenceDirectory = path.resolve(
  process.cwd(),
  "docs/workstreams/workstream-1/evidence/2026-08-28",
);

const viewportMatrix = [
  { name: "phone-360x800", width: 360, height: 800 },
  { name: "phone-390x844", width: 390, height: 844 },
  { name: "phone-412x915", width: 412, height: 915 },
  { name: "phone-landscape-844x390", width: 844, height: 390 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "tablet-landscape-1024x768", width: 1024, height: 768 },
  { name: "desktop-1366x768", width: 1366, height: 768 },
  { name: "desktop-1440x1000", width: 1440, height: 1000 },
] as const;

async function visit(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `${route} should return a response`).not.toBeNull();
  expect(response!.status(), `${route} should load without an HTTP error`).toBeLessThan(400);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (route === fixtureRoute) {
    await expect(page.getByTestId("acceptance-harness-ready")).toHaveAttribute("data-hydrated", "true");
  }
}

async function preserveScreenshot(
  testInfo: TestInfo,
  filename: string,
  image: Buffer,
) {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(path.join(evidenceDirectory, filename), image);
  await testInfo.attach(filename, { body: image, contentType: "image/png" });
}

async function captureViewport(page: Page, testInfo: TestInfo, filename: string) {
  const image = await page.screenshot({
    animations: "disabled",
    caret: "hide",
    fullPage: false,
  });
  await preserveScreenshot(testInfo, filename, image);
}

async function captureFullPage(page: Page, testInfo: TestInfo, filename: string) {
  const image = await page.screenshot({
    animations: "disabled",
    caret: "hide",
    fullPage: true,
  });
  await preserveScreenshot(testInfo, filename, image);
}

async function captureFixtureSection(
  page: Page,
  testInfo: TestInfo,
  selector: string,
  filename: string,
) {
  const section = page.locator(selector);
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  const image = await section.screenshot({ animations: "disabled", caret: "hide" });
  await preserveScreenshot(testInfo, filename, image);
}

test.describe("Workstream 1 responsive visual acceptance", () => {
  for (const viewport of viewportMatrix) {
    test(`state fixture reflows at ${viewport.name} and records evidence`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await visit(page, fixtureRoute);
      await expect(page.getByRole("heading", { name: "Readability and interaction states" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Welcome back, Janel" })).toBeVisible();
      await expectNoHorizontalOverflow(page, viewport.name);
      await captureViewport(page, testInfo, `workstream-1-${viewport.name}.png`);
    });
  }

  test("public routes record navigation, footer, discovery, salon, stylist fixture, owner, admin report, and legal families", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const featureRoutes = [
      { name: "homepage-nav-footer", route: "/" },
      { name: "discovery", route: "/salons" },
      { name: "salon-profile", route: "/salon/acceptance-salon" },
      { name: "fixture-stylist-profile", route: "/internal/acceptance/stylist-profile" },
      { name: "owner-dashboard", route: "/internal/acceptance/owner-workflows" },
      { name: "admin-report-table", route: "/internal/acceptance/admin-workflows/customers" },
      { name: "legal-policies", route: "/legal" },
    ] as const;
    const evidenceViewports = [
      { name: "narrow-mobile-320x568", width: 320, height: 568, fullPage: false },
      { name: "mobile-390x844", width: 390, height: 844, fullPage: true },
      { name: "phone-landscape-844x390", width: 844, height: 390, fullPage: false },
      { name: "tablet-landscape-1024x768", width: 1024, height: 768, fullPage: false },
      { name: "desktop-1440x1000", width: 1440, height: 1000, fullPage: true },
    ] as const;

    for (const viewport of evidenceViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const feature of featureRoutes) {
        await visit(page, feature.route);
        await expectNoHorizontalOverflow(page, `${feature.name} ${viewport.name}`);
        const filename = `workstream-1-${feature.name}-${viewport.name}.png`;
        if (viewport.fullPage) await captureFullPage(page, testInfo, filename);
        else await captureViewport(page, testInfo, filename);
      }
    }
  });

  test("composite fixture records customer, booking, table, featured, policy, empty, disabled, and loading families", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await visit(page, fixtureRoute);

    const sections = [
      { selector: "#customer-account", name: "fixture-customer-account-empty-completed" },
      { selector: "#salon-stylist", name: "fixture-salon-stylist-selected-unavailable" },
      { selector: "#booking-checkout", name: "fixture-booking-checkout-totals-deposit" },
      { selector: "#admin-finance", name: "fixture-admin-finance-report-table" },
      { selector: "#policy-fixture", name: "fixture-policy" },
      { selector: "#advertising-fixture", name: "fixture-featured-advertising" },
      { selector: "#interaction-fixture", name: "fixture-disabled-loading-toast-alert" },
      { selector: "#validation-fixture", name: "fixture-validation" },
      { selector: "#state-inventory", name: "fixture-state-inventory" },
    ] as const;

    for (const section of sections) {
      await captureFixtureSection(
        page,
        testInfo,
        section.selector,
        `workstream-1-${section.name}-desktop.png`,
      );
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await visit(page, fixtureRoute);
    await captureFixtureSection(
      page,
      testInfo,
      "#admin-finance",
      "workstream-1-fixture-admin-finance-report-table-mobile.png",
    );
  });

  test("modal, validation, toast, error, and selected states remain visible at mobile and desktop widths", async ({ page }, testInfo) => {
    for (const viewport of [
      { name: "mobile", width: 390, height: 844 },
      { name: "desktop", width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await visit(page, fixtureRoute);
      await page.getByTestId("selected-stylist").click();
      await page.getByRole("button", { name: "Show success toast" }).click();
      await page.getByRole("button", { name: "Show error alert" }).click();
      await page.getByRole("button", { name: "Validate fixture" }).click();
      await expect(page.getByTestId("validation-summary")).toBeVisible();
      await expectNoHorizontalOverflow(page, `state errors ${viewport.name}`);
      await captureViewport(page, testInfo, `workstream-1-state-errors-${viewport.name}.png`);

      await page.getByTestId("modal-trigger").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoHorizontalOverflow(page, `modal ${viewport.name}`);
      await captureViewport(page, testInfo, `workstream-1-modal-${viewport.name}.png`);
      await page.keyboard.press("Escape");
    }
  });

  test("320 CSS pixels at 200 percent text size reflows without clipping or two-dimensional scrolling", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await visit(page, fixtureRoute);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect(page.getByRole("heading", { name: "Readability and interaction states" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "320px viewport at 200% text size");
    await page.getByTestId("modal-trigger").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("modal-trigger")).toBeVisible();
    await captureViewport(page, testInfo, "workstream-1-reflow-320px-200-percent.png");
  });
});
