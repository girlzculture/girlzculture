import { expect, test } from "@playwright/test";

test("configured Google Maps provider renders the real map and salon markers", async ({
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_LIVE_GOOGLE_MAPS !== "true",
    "Set PLAYWRIGHT_LIVE_GOOGLE_MAPS=true only when exercising a configured provider.",
  );

  await page.goto("/internal/acceptance/map-provider");
  const surface = page.locator("[data-google-maps-provider-surface]");
  await expect(surface.locator(".gm-style")).toBeVisible({ timeout: 20_000 });
  await expect(
    surface.getByText(/Google Maps (?:is not configured|rejected|could not)/i),
  ).toHaveCount(0);
  await expect(surface.locator('button[aria-label^="Open "]')).toHaveCount(2, {
    timeout: 10_000,
  });
  await expect(surface.locator("[data-map-salon-summary]")).toContainText(
    "1.5 miles away",
  );
});
