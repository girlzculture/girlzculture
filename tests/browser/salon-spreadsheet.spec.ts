import { expect, test } from "@playwright/test";

test("salon spreadsheet controls remain usable without page overflow", async ({
  page,
}) => {
  await page.goto("/internal/acceptance/salon-spreadsheet");

  await expect(
    page.getByRole("heading", { name: "Styles & Pricing" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download Template" }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: /Import & Save/ }),
  ).toHaveCount(2);

  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
});

test("the direct save action stays disabled until a file is selected", async ({
  page,
}) => {
  await page.goto("/internal/acceptance/salon-spreadsheet");
  const importButtons = page.getByRole("button", { name: /Import & Save/ });
  await expect(importButtons.nth(0)).toBeDisabled();
  await expect(importButtons.nth(1)).toBeDisabled();
});
