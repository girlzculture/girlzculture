import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const requiredViewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 1000 },
] as const;

const screenshotDirectory = path.join(process.cwd(), "docs", "screenshots", "final-correction");

async function expectNoPageOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} has horizontal overflow`).toBeLessThanOrEqual(1);
}

test.beforeAll(() => {
  mkdirSync(screenshotDirectory, { recursive: true });
});

test("required launch viewports remain readable without page overflow", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "girlz-culture-mobile-location-prompt-v1",
      JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" }),
    );
  });

  for (const viewport of requiredViewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: "Featured Girlz Culture promotions" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Featured Girlz Culture promotions" })
        .locator("[data-promotion-card]"),
    ).toHaveCount(8);
    await expectNoPageOverflow(page, `${viewport.width}x${viewport.height}`);
    await page.screenshot({
      path: path.join(
        screenshotDirectory,
        `homepage-${viewport.width}x${viewport.height}.png`,
      ),
      animations: "disabled",
      caret: "initial",
    });
  }
});

test("mobile About, footer, legal hub, and discovery layouts have acceptance screenshots", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about");
  await expect(page.getByText("Girlz Culture connects you with skilled beauty professionals serving your community.", { exact: true })).toBeVisible();
  const readMore = page.getByRole("button", { name: /read more/i });
  await expect(readMore).toBeVisible();
  await expectNoPageOverflow(page, "mobile About");
  await page.screenshot({
    path: path.join(screenshotDirectory, "about-mobile-390x844.png"),
    animations: "disabled",
    caret: "initial",
  });

  await readMore.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, "about-read-more-mobile-390x844.png"),
    animations: "disabled",
    caret: "initial",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(readMore).toBeFocused();

  const publicFooter = page.locator("footer.gc-brand-footer");
  await publicFooter.scrollIntoViewIfNeeded();
  await expect(page.getByRole("link", { name: "Legal & Policies" })).toBeVisible();
  const footerTrailingGap = await publicFooter.evaluate((footer) =>
    Math.max(0, document.documentElement.scrollHeight - ((footer as HTMLElement).offsetTop + (footer as HTMLElement).offsetHeight)),
  );
  expect(footerTrailingGap, "mobile footer has excessive trailing whitespace").toBeLessThanOrEqual(8);
  await page.screenshot({
    path: path.join(screenshotDirectory, "footer-mobile-390x844.png"),
    animations: "disabled",
    caret: "initial",
  });

  await page.goto("/legal");
  await expect(
    page.getByRole("heading", { level: 1, name: /legal & policies/i }),
  ).toBeVisible();
  await expectNoPageOverflow(page, "mobile Legal hub");
  await page.screenshot({
    path: path.join(screenshotDirectory, "legal-mobile-390x844.png"),
    animations: "disabled",
    caret: "initial",
  });

  await page.goto(
    "/internal/acceptance/discovery-state?lat=40.8116&lng=-73.9465&location=Harlem%2C%20NY",
  );
  await expect(page.getByText("Near Harlem, NY", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /load more/i })).toHaveCount(0);
  await expectNoPageOverflow(page, "mobile discovery");
  await page.screenshot({
    path: path.join(screenshotDirectory, "discovery-mobile-390x844.png"),
    animations: "disabled",
    caret: "initial",
  });

  await page.goto("/internal/acceptance/map-summary");
  const mapSummary = page.locator("[data-map-salon-summary]");
  await expect(mapSummary).toBeVisible();
  await expect(mapSummary).toContainText("1.5 miles away");
  await expect(mapSummary.getByRole("link", { name: "View", exact: true })).toHaveAttribute(
    "href",
    "/salon/the-braid-lounge",
  );
  await expectNoPageOverflow(page, "mobile map summary");
  await page.screenshot({
    path: path.join(screenshotDirectory, "map-summary-mobile-390x844.png"),
    animations: "disabled",
    caret: "initial",
  });
});
