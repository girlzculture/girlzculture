import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const screenshotDirectory = "docs/screenshots/dashboard-workflow/owner";

async function hideLocalDevelopmentChrome(page: import("@playwright/test").Page) {
  await page.locator("nextjs-portal").evaluateAll((portals) => {
    portals.forEach((portal) => {
      (portal as HTMLElement).style.display = "none";
    });
  });
}

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true });
});

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 1000 },
];

for (const viewport of viewports) {
  test(`owner landing and focused editor fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/internal/acceptance/owner-workflows");
    await expect(page.getByRole("heading", { name: "Salon dashboard workflow" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
    const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(size.document).toBeLessThanOrEqual(size.viewport);
    await hideLocalDevelopmentChrome(page);
    await page.screenshot({
      path: `${screenshotDirectory}/owner-landing-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });

    await page.getByRole("button", { name: /Jasmine P\./ }).click();
    await expect(page.getByRole("heading", { name: "Booking for Jasmine P." })).toBeVisible();
    const detailSize = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(detailSize.document).toBeLessThanOrEqual(detailSize.viewport);
    await hideLocalDevelopmentChrome(page);
    await page.screenshot({
      path: `${screenshotDirectory}/owner-detail-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
  });
}

test("filtered booking context survives detail, save feedback, and back", async ({ page }) => {
  await page.goto("/internal/acceptance/owner-workflows");
  await page.getByRole("button", { name: "Confirmed", exact: true }).click();
  await expect(page).toHaveURL(/status=Confirmed/);
  await page.getByRole("button", { name: /Jasmine P\./ }).click();
  await expect(page.getByRole("heading", { name: "Booking for Jasmine P." })).toBeVisible();
  await page.getByRole("button", { name: "Save booking note" }).click();
  await expect(page.getByRole("status")).toContainText("Booking note saved");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/status=Confirmed/);
  await expect(page.getByRole("button", { name: "Confirmed", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Tiffany M\./ })).toHaveCount(0);
});

test("availability landing opens five focused scheduling workspaces", async ({ page }) => {
  await page.goto("/internal/acceptance/owner-workflows");
  const workspaces = [
    "Appointment calendar",
    "Store hours",
    "Bookable time slots",
    "Per-stylist availability",
    "Overrides & blockouts",
  ];
  for (const title of workspaces) {
    await page.getByRole("link", { name: new RegExp(title, "i") }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText("Only this scheduling task is shown")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "Availability & Calendar" })).toBeVisible();
  }
});

test("booking group and search context survive focused detail and back", async ({ page }) => {
  await page.goto("/internal/acceptance/owner-workflows");
  await page.getByRole("button", { name: "Needs Resolution", exact: true }).click();
  await expect(page).toHaveURL(/group=Needs(?:\+|%20)Resolution/);
  await page.getByRole("searchbox", { name: "Search bookings" }).fill("Monique");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=Monique/);
  await expect(page.getByRole("button", { name: /Monique D\./ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Jasmine P\./ })).toHaveCount(0);
  await page.getByRole("button", { name: /Monique D\./ }).click();
  await expect(page.getByRole("heading", { name: "Booking for Monique D." })).toBeVisible();
  await page.getByRole("button", { name: "Save booking note" }).click();
  await expect(page.getByRole("status")).toContainText("Booking note saved");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/group=Needs(?:\+|%20)Resolution/);
  await expect(page).toHaveURL(/q=Monique/);
  await expect(page.getByRole("button", { name: "Needs Resolution", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("searchbox", { name: "Search bookings" })).toHaveValue("Monique");
});
