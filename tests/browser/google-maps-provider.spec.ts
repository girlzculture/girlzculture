import { expect, test } from "@playwright/test";

test("configured Google Maps provider renders the real map and salon markers", async ({
  page,
}) => {
  expect(
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()),
    "Real Google Maps acceptance requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. In CI, configure GOOGLE_MAPS_TEST_BROWSER_KEY with http://127.0.0.1:3104/* authorized; missing configuration is a failure, never a skip.",
  ).toBe(true);

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
