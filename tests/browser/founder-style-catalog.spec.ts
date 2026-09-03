import { expect, test } from "@playwright/test";

const route = "/internal/acceptance/style-catalog";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.removeItem("girlz-culture-style-catalog-v1");
    sessionStorage.removeItem("girlz-culture-style-catalog-v2");
  });
});

test("Browse Styles filters the complete passed catalog with truthful structured controls", async ({
  page,
}) => {
  await page.goto(route);
  const cards = page.locator("[data-style-card]");
  const search = page.getByPlaceholder("Search styles");

  await expect(cards).toHaveCount(31);
  await expect(page.getByRole("button", { name: "More filters" })).toHaveCount(0);
  await expect(page.getByLabel("Maintenance")).toHaveCount(0);
  await expect(
    cards.filter({ hasText: "Box Braids" }).getByText("Braids", { exact: true }),
  ).toHaveCount(0);

  await search.fill("Rare Crown Style");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Rare Crown Style");
  await expect(page).toHaveURL(/q=Rare\+Crown\+Style/);

  await search.fill("bohemian braids");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Boho / Goddess Braids");

  await search.fill("boho godess brads");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Boho / Goddess Braids");

  await page.getByLabel("Length").selectOption({ label: "Waist" });
  await page.getByLabel("Category").selectOption({ label: "Braids" });
  await page.getByLabel("Price").selectOption("150-250");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Boho / Goddess Braids");

  await page.getByRole("button", { name: "View all" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByLabel("Category")).toHaveValue("");
  await expect(page.getByLabel("Length")).toHaveValue("");
  await expect(page.getByLabel("Price")).toHaveValue("any");
  await expect(page.getByLabel("Sort")).toHaveValue("popularity");
  await expect(cards).toHaveCount(31);

  const supportedLengths = [
    { label: "Shoulder", count: 29 },
    { label: "Mid-back", count: 14 },
    { label: "Waist", count: 3 },
  ];
  for (const supportedLength of supportedLengths) {
    await test.step(`filters the complete catalog by ${supportedLength.label} length`, async () => {
      await page.getByLabel("Length").selectOption({
        label: supportedLength.label,
      });
      await expect(cards).toHaveCount(supportedLength.count);
      await expect(page).toHaveURL(
        new RegExp(`length=${supportedLength.label.replace("-", "(?:-|%2D)")}`),
      );
    });
  }
  await page.getByLabel("Length").selectOption("");
  await expect(cards).toHaveCount(31);

  await page.getByLabel("Price").selectOption("under-150");
  await expect(cards).toHaveCount(26);
  await expect(cards.getByText("Unknown Price Locs", { exact: true })).toHaveCount(0);

  await page.getByLabel("Price").selectOption("150-250");
  await expect(cards).toHaveCount(3);
  await expect(cards.getByText("Box Braids", { exact: true })).toBeVisible();
  await expect(cards.getByText("Boho / Goddess Braids", { exact: true })).toBeVisible();

  await page.getByLabel("Price").selectOption("over-250");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Zoë Twists");
});

test("Browse Styles chips, sorting, URL state, and Back/Forward stay synchronized", async ({
  page,
}) => {
  await page.goto(`${route}?ref=founder`);
  const cards = page.locator("[data-style-card]");

  const chip = page.getByRole("button", { name: "Catalog Fixture Style 01" });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(1);
  await expect(page).toHaveURL(/q=Catalog\+Fixture\+Style\+01/);
  await expect(page).toHaveURL(/ref=founder/);

  await page.getByRole("button", { name: "View all" }).click();
  await page.getByLabel("Sort").selectOption("a-z");
  await expect(cards.first()).toContainText("Boho / Goddess Braids");

  await page.getByLabel("Category").selectOption({ label: "Braids" });
  await expect(page).toHaveURL(/category=Braids/);
  await page.getByLabel("Price").selectOption("150-250");
  await expect(page).toHaveURL(/price=150-250/);

  await page.goBack();
  await expect(page.getByLabel("Category")).toHaveValue("Braids");
  await expect(page.getByLabel("Price")).toHaveValue("any");
  await expect(page).not.toHaveURL(/price=150-250/);

  await page.goForward();
  await expect(page.getByLabel("Category")).toHaveValue("Braids");
  await expect(page.getByLabel("Price")).toHaveValue("150-250");
  await expect(page).toHaveURL(/price=150-250/);
});

test("Browse Styles keeps horizontally scrollable filters inside the mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);

  const documentWidths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));

  expect(documentWidths.scroll).toBe(documentWidths.client);
  await expect(page.locator("[data-style-card]").first()).toBeVisible();
});
