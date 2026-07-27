import { expect, test } from "@playwright/test";

const pilotPublicRoutes = [
  "/",
  "/salons",
  "/styles",
  "/how-it-works",
  "/partner",
  "/about",
  "/blog",
  "/testimonials",
  "/help",
  "/contact",
  "/login",
  "/salon/login",
  "/admin/login",
];

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

test("homepage promotion rail shows eight compact cards and pauses after manual navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "girlz-culture-mobile-location-prompt-v1",
      JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" }),
    );
  });
  await page.goto("/");
  const rail = page.getByRole("region", {
    name: "Featured Girlz Culture promotions",
  });
  await expect(rail).toBeVisible();
  await expect(rail.locator("[data-promotion-card]")).toHaveCount(8);
  await rail.getByRole("button", { name: "Next promotion" }).click();
  await expect(rail.getByText("Automatic movement paused.")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
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

test("pilot public and authentication routes remain readable at responsive widths and increased text", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const route of pilotPublicRoutes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /Cannot read properties|Unexpected token|permission denied|row-level security|Application error/i,
    );
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "125%";
    });
    const metrics = await page.evaluate(() => ({
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    }));
    expect(metrics.overflow, `${route} has page-level horizontal overflow`).toBe(false);
  }
});

test("primary mobile controls provide usable touch targets", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile touch-target acceptance.");
  await page.addInitScript(() => {
    localStorage.setItem(
      "girlz-culture-mobile-location-prompt-v1",
      JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" }),
    );
  });
  await page.goto("/");

  const controls = [
    page.getByRole("button", { name: "Open navigation menu" }),
    page
      .getByRole("region", { name: "Salons Near You" })
      .getByRole("link", { name: "Choose a search location" })
      .first(),
    page.getByRole("navigation", { name: "Customer navigation" }).getByRole("link", {
      name: "Home",
    }),
  ];
  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box, "Primary mobile control has no measurable box").not.toBeNull();
    expect(
      Math.min(box?.width ?? 0, box?.height ?? 0),
      "Primary mobile control is smaller than 40 CSS pixels",
    ).toBeGreaterThanOrEqual(40);
  }
});

test("mobile public navigation closes with Escape, outside click, and destination selection", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile navigation behavior.");
  await page.addInitScript(() => {
    localStorage.setItem(
      "girlz-culture-mobile-location-prompt-v1",
      JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" }),
    );
  });
  await page.goto("/");
  const open = page.getByRole("button", { name: "Open navigation menu" });
  await open.click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);
  await expect(open).toBeFocused();

  await open.click();
  await page.locator("main").click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);

  await open.click();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Browse Styles" }).click();
  await expect(page).toHaveURL(/\/styles$/);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);
});
