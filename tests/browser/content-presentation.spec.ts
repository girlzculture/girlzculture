import { expect, test } from "@playwright/test";

test("About is compact and accessible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Transparency", { exact: true })).toHaveCount(0);
  const readMore = page.getByRole("button", { name: /read more/i });
  await expect(readMore).toBeVisible();
  await readMore.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(readMore).toBeFocused();
  await expect(page.getByRole("link", { name: "Legal & Policies" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Legal hub keeps policies on separate shareable routes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/legal");
  await expect(page.getByRole("heading", { level: 1, name: /legal & policies/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /back to home/i })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Girlz Culture was born");
});
