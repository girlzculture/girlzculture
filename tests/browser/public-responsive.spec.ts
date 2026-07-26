import { expect, test } from "@playwright/test";

test("homepage shell has no overflow, broken images, console failures, or raw errors", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(horizontalOverflow).toBe(false);
  const brokenImages = await page.locator("img").evaluateAll((nodes) =>
    nodes
      .filter(
        (node) =>
          (node as HTMLImageElement).complete &&
          (node as HTMLImageElement).naturalWidth === 0,
      )
      .map((node) => (node as HTMLImageElement).src),
  );
  expect(brokenImages).toEqual([]);
  await expect(page.locator("body")).not.toContainText(
    /Cannot read properties|Unexpected token|permission denied|row-level security/i,
  );
  expect(consoleErrors).toEqual([]);
});

test("first-visit mobile location choice is explicit and dismissible", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile-only onboarding.");
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find salons near you" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Allow Girlz Culture to use your location to show nearby salons.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use my location" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose city or ZIP code" }).click();
  await expect(page.getByPlaceholder("Choose city or ZIP code")).toBeVisible();
  await page.getByRole("button", { name: "Close location prompt" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Find salons near you" }),
  ).toHaveCount(0);
});
