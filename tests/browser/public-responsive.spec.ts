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

test("homepage promotion rail advances through all eight cards and loops without overflow", async ({
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
  await expect(rail).toHaveAttribute("data-auto-state", "running");
  const seen = new Set<number>();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && seen.size < 8) {
    seen.add(Number(await rail.getAttribute("data-current-index")));
    await page.waitForTimeout(180);
  }
  expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  await expect
    .poll(async () => Number(await rail.getAttribute("data-current-index")), {
      timeout: 3_000,
    })
    .toBe(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
});

test("mobile homepage removes the intro and carousel control row without leaving a gap", async ({
  page,
  isMobile,
}) => {
  test.skip(
    !isMobile && (page.viewportSize()?.width || 2_000) >= 1_024,
    "Phone and tablet-portrait composition.",
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "girlz-culture-mobile-location-prompt-v1",
      JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" }),
    );
  });
  await page.goto("/");
  const intro = page.locator("[data-home-intro]");
  await expect(intro).toBeHidden();
  await expect(
    page.getByText("Automatic movement paused.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Previous promotion" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Next promotion" }),
  ).toBeHidden();

  const headerBox = await page.getByRole("banner").boundingBox();
  const railBox = await page
    .getByRole("region", { name: "Featured Girlz Culture promotions" })
    .boundingBox();
  expect(headerBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect((railBox?.y || 0) - ((headerBox?.y || 0) + (headerBox?.height || 0))).toBeLessThanOrEqual(20);
});

test("mobile promotion swipe pauses temporarily, resumes, and cards fit without overlap", async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width || 2_000) >= 1_024, "Phone and tablet swipe behavior.");
  await page.addInitScript(() => {
    localStorage.setItem(
      "girlz-culture-mobile-location-prompt-v1",
      JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" }),
    );
  });
  await page.goto("/");
  const region = page.getByRole("region", {
    name: "Featured Girlz Culture promotions",
  });
  const rail = region.getByLabel("Promotional cards. Swipe to browse.");
  await expect(region).toHaveAttribute("data-auto-state", "running");
  await rail.evaluate((node) => {
    node.scrollLeft += Math.max(80, node.clientWidth * 0.55);
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(region).toHaveAttribute("data-auto-state", "paused");
  await expect
    .poll(() => region.getAttribute("data-auto-state"), { timeout: 3_500 })
    .toBe("running");

  const layout = await region.locator("[data-promotion-card]").evaluateAll(
    (cards) => ({
      boxes: cards.map((card) => {
        const box = card.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      }),
      viewport: window.innerWidth,
      pageOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    }),
  );
  expect(layout.pageOverflow).toBe(false);
  for (const box of layout.boxes) {
    expect(box.width).toBeLessThan(layout.viewport);
    expect(box.width).toBeGreaterThan(240);
  }
  for (let index = 1; index < layout.boxes.length; index += 1) {
    expect(layout.boxes[index].left).toBeGreaterThan(layout.boxes[index - 1].right);
  }
});

test("promotion rail respects reduced motion and remains manually operable", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "girlz-culture-mobile-location-prompt-v1",
      JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" }),
    );
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const rail = page.getByRole("region", {
    name: "Featured Girlz Culture promotions",
  });
  await expect(rail).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(rail).toHaveAttribute("data-auto-state", "reduced-motion");
  const before = await rail.getAttribute("data-current-index");
  await page.waitForTimeout(1_800);
  expect(await rail.getAttribute("data-current-index")).toBe(before);
});

test("homepage section order editor previews, publishes, and persists keyboard moves", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "One representative Engine interaction run is sufficient.");
  await page.goto("/internal/acceptance/homepage-order");
  await page.getByRole("button", { name: "Move Trending Picks This Week up" }).click();
  await page.getByRole("button", { name: "Move Trending Picks This Week up" }).click();
  await page.getByRole("button", { name: "Move Trending Picks This Week up" }).click();
  await page.getByRole("button", { name: "Preview draft order" }).click();
  const preview = page.getByLabel("Homepage order preview");
  await expect(preview.locator("li").first()).toContainText(
    "Trending Picks This Week",
  );
  await page.getByRole("button", { name: "Save and Publish" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Homepage order published and verified",
  );
  await page.reload();
  await page.getByRole("button", { name: "Preview draft order" }).click();
  await expect(
    page.getByLabel("Homepage order preview").locator("li").first(),
  ).toContainText("Trending Picks This Week");
});

test("promotion cards edit, publish, reload, schedule, render GIFs, and keep eligible destinations", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "One representative Content Management browser run is sufficient.");
  const initialCards = Array.from({ length: 8 }, (_, index) => ({
    id: `card-${index + 1}`,
    content_type: "image",
    title: `Promotion ${index + 1}`,
    body: "Original promotion text.",
    cta_label: "Explore",
    href: "/styles",
    media_url: "/images/hero-braids.jpg",
    alt_text: `Promotion ${index + 1}`,
    status: "Active",
  }));
  let savedPage = {
    id: "home-page",
    slug: "home",
    title: "Homepage",
    eyebrow: "REAL SALONS",
    hero_title: "Book with Confidence.",
    hero_subtitle: "Compact desktop introduction.",
    hero_image_url: "/images/hero-braids.jpg",
    background_image_url: "",
    labels: { home_intro_visible: "true" },
    sections: [
      {
        id: "promo-section",
        type: "promo_rail",
        title: "Featured",
        body: "",
        is_visible: true,
        cards: initialCards,
      },
    ],
    status: "Published",
    updated_at: "2026-07-27T10:00:00.000Z",
  };
  let publishedPayload: typeof savedPage | null = null;
  const linkTargets = [
    {
      type: "Salon",
      id: "11111111-1111-4111-8111-111111111111",
      label: "Eligible Salon",
      body: "Brooklyn, New York",
      href: "/salon/eligible-salon",
      media_url: "/images/hero-braids.jpg",
    },
    {
      type: "Campaign",
      id: "22222222-2222-4222-8222-222222222222",
      salon_id: "33333333-3333-4333-8333-333333333333",
      label: "Eligible Paid Campaign",
      body: "Paid placement",
      href: "/salon/campaign-salon?campaign=22222222-2222-4222-8222-222222222222",
      media_url: "/images/hero-braids.jpg",
    },
    {
      type: "Page",
      id: "styles",
      label: "Browse Styles",
      href: "/styles",
    },
  ];
  await page.route("**/api/admin/content", async (route) => {
    if (route.request().method() === "PUT") {
      const requestBody = route.request().postDataJSON() as {
        payload: typeof savedPage;
      };
      savedPage = {
        ...requestBody.payload,
        updated_at: "2026-07-27T12:00:00.000Z",
      };
      publishedPayload = savedPage;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: savedPage }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pages: [savedPage],
        posts: [],
        masterStyles: [],
        serviceCategories: [],
        serviceGroups: [],
        serviceAddons: [],
        linkTargets,
      }),
    });
  });

  await page.goto("/internal/acceptance/content-promotion");
  const publicRail = page.getByRole("region", {
    name: "Featured Girlz Culture promotions",
  });
  await expect(publicRail.locator("[data-promotion-card]")).toHaveCount(8);
  await expect(publicRail).not.toContainText("Expired card must stay hidden");
  await expect(publicRail).not.toContainText("Draft card must stay hidden");
  const gif = publicRail.locator(
    'img[alt="Animated Girlz Culture promotional card"]',
  );
  await expect(gif).toHaveAttribute("src", /^data:image\/gif;base64,/);
  expect(await gif.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(1);
  await expect(
    publicRail.getByRole("link", { name: "Open salon" }),
  ).toHaveAttribute("href", "/salon/eligible-salon");
  await expect(
    publicRail.getByRole("link", { name: "Explore" }).first(),
  ).toHaveAttribute(
    "href",
    "/salon/campaign-salon?campaign=campaign-1",
  );

  await expect(
    page.getByRole("heading", { name: "Page composition" }),
  ).toBeVisible();
  const sources = page.getByLabel("Card source");
  await expect(sources).toHaveCount(8);
  await sources.nth(0).selectOption("salon");
  await page
    .getByLabel("Salon to feature")
    .selectOption("11111111-1111-4111-8111-111111111111");
  await sources.nth(1).selectOption("campaign");
  await page
    .getByLabel("Campaign to feature")
    .selectOption("22222222-2222-4222-8222-222222222222");

  const titles = page.getByLabel("Card title");
  const texts = page.getByLabel("Card text");
  const ctas = page.getByLabel("Call-to-action label");
  const starts = page.getByLabel("Start date and time");
  const ends = page.getByLabel("End date and time");
  const alternatives = page.getByLabel("Alternative text");
  await expect(titles).toHaveCount(8);
  await titles.nth(2).fill("Edited launch card");
  await texts.nth(2).fill("Edited supporting text.");
  await ctas.nth(2).fill("See the look");
  await starts.nth(2).fill("2026-07-27T12:00");
  await ends.nth(2).fill("2026-08-27T12:00");
  await alternatives.nth(2).fill("Client wearing an edited braid style");

  await page.getByRole("button", { name: "Save Page" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Page saved, verified in Supabase",
  );
  expect(publishedPayload).not.toBeNull();
  const persistedPayload = publishedPayload as typeof savedPage | null;
  if (!persistedPayload) throw new Error("The card publication payload was not captured.");
  const persistedCards = persistedPayload.sections[0].cards || [];
  expect(persistedCards).toHaveLength(8);
  expect(persistedCards[0]).toMatchObject({
    content_type: "salon",
    salon_id: "11111111-1111-4111-8111-111111111111",
    href: "/salon/eligible-salon",
  });
  expect(persistedCards[1]).toMatchObject({
    association_type: "campaign",
    campaign_id: "22222222-2222-4222-8222-222222222222",
    href: "/salon/campaign-salon?campaign=22222222-2222-4222-8222-222222222222",
  });
  expect(persistedCards[2]).toMatchObject({
    title: "Edited launch card",
    body: "Edited supporting text.",
    cta_label: "See the look",
    alt_text: "Client wearing an edited braid style",
    starts_at: "2026-07-27T12:00",
    ends_at: "2026-08-27T12:00",
  });
  await page.reload();
  await expect(page.getByLabel("Card title").nth(2)).toHaveValue(
    "Edited launch card",
  );
});

test("first-visit mobile location choice is explicit and dismissible", async ({
  page,
  isMobile,
}) => {
  const viewport = page.viewportSize();
  test.skip(
    !isMobile || !viewport || viewport.width >= viewport.height,
    "Portrait mobile onboarding.",
  );
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
  const viewport = page.viewportSize();
  test.skip(
    !isMobile || !viewport || viewport.width >= viewport.height,
    "Portrait mobile touch-target acceptance.",
  );
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
