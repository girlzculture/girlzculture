import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test, screenshotCaret } from "./helpers/hydration";

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("girlz-culture-mobile-location-prompt-v1", JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" }));
  });
});

for (const viewport of viewports) {
  test(`Businesses offers truthful accessible categories and navigation at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/businesses");
    await expect(page.getByRole("heading", { name: "Find your next beauty destination." })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://girlzculture.com/businesses");
    const categories = page.locator("[data-business-category]");
    await expect(categories).toHaveCount(8);
    const upcoming = page.locator('[data-discovery-state="coming_soon"]');
    await expect(upcoming).toHaveCount(7);
    for (const card of await upcoming.all()) {
      await expect(card.getByText("Coming soon", { exact: true })).toBeVisible();
      await expect(card.getByText("Discovery is not available yet.", { exact: true })).toBeVisible();
      await expect(card.getByRole("link")).toHaveCount(0);
      await expect(card.getByRole("button")).toHaveCount(0);
    }
    const hair = page.locator('[data-business-category="hair-salon-braiding"]').getByRole("link");
    await expect(hair).toHaveAttribute("href", "/salons");
    await expect(page.locator('main a[href*="/business/waitlist"], main a[href*="/business/signup/hair"]')).toHaveCount(0);
    for (const photo of await categories.locator("img").all()) {
      await photo.scrollIntoViewIfNeeded();
      await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const hairBounds = await hair.boundingBox();
    expect(hairBounds!.width).toBeGreaterThanOrEqual(44);
    expect(hairBounds!.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => scrollTo(0, 0));
    const audit = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`businesses-${viewport.width}.png`), fullPage: true, ...screenshotCaret });

    if (viewport.width >= 1536) {
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await expect(nav.getByRole("link", { name: "Businesses", exact: true })).toHaveAttribute("href", "/businesses");
      await expect(nav.getByRole("link", { name: "Browse Styles", exact: true })).toHaveAttribute("href", "/styles");
      await expect(page.getByLabel("Select language")).toHaveCount(0);
    } else {
      await page.getByRole("button", { name: "Open navigation menu" }).click();
      const menu = page.getByRole("navigation", { name: "Mobile navigation" });
      await expect(menu.getByRole("link", { name: "Businesses", exact: true })).toHaveAttribute("href", "/businesses");
      await expect(menu.getByRole("link", { name: "Browse Styles", exact: true })).toHaveAttribute("href", "/styles");
      await expect(menu.getByLabel("Select language")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`businesses-navigation-${viewport.width}.png`), ...screenshotCaret });
      await menu.getByRole("link", { name: "Businesses", exact: true }).click();
      await expect(menu).toHaveCount(0);
      if (viewport.width < 768) await expect(page.getByRole("navigation", { name: "Customer navigation" }).getByRole("link", { name: "Businesses", exact: true })).toHaveAttribute("href", "/businesses");
    }
  });
}

test("Businesses keeps salon discovery, Browse Styles and browser history connected", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/styles");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Businesses", exact: true }).click();
  await expect(page).toHaveURL(/\/businesses$/);
  const hair = page.locator('[data-business-category="hair-salon-braiding"]').getByRole("link");
  await hair.focus();
  await expect(hair).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/salons$/);
  await expect(page.getByRole("heading", { name: "Find salons", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/businesses$/);
  await expect(page.locator('[data-discovery-state="coming_soon"]')).toHaveCount(7);
  await page.goForward();
  await expect(page).toHaveURL(/\/salons$/);
  await page.goBack();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Browse Styles", exact: true }).click();
  await expect(page).toHaveURL(/\/styles$/);
  await expect(page.getByPlaceholder("Search styles")).toBeVisible();
});

test("mobile Businesses navigation preserves keyboard closing and destination selection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/businesses");
  const trigger = page.getByRole("button", { name: "Open navigation menu" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(menu.getByRole("link", { name: "Browse Styles", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("link", { name: "Businesses", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("link", { name: "Browse Styles", exact: true }).click();
  await expect(page).toHaveURL(/\/styles$/);
  await expect(menu).toHaveCount(0);
  await page.getByRole("navigation", { name: "Customer navigation" }).getByRole("link", { name: "Businesses", exact: true }).click();
  await expect(page).toHaveURL(/\/businesses$/);
});
