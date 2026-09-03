import { expect, test, type Page } from "@playwright/test";

const matchedStyleId = "11111111-1111-4111-8111-111111111111";

type SearchBody = {
  query?: string;
  filters?: {
    serviceId?: string | null;
    radiusMiles?: number;
    minimumRating?: number | null;
    maximumPrice?: number | null;
    date?: string | null;
    sort?: string;
    promotionOnly?: boolean;
    page?: number;
    pageSize?: number;
  };
};

function salons(count = 24, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const absoluteIndex = offset + index;
    return {
      id: `founder-salon-${absoluteIndex + 1}`,
      name: absoluteIndex === 0
        ? "Truthful Results Salon"
        : `Founder Salon ${absoluteIndex + 1}`,
      slug: absoluteIndex === 0
        ? "truthful-results-salon"
        : `founder-salon-${absoluteIndex + 1}`,
      address_city: "Brooklyn",
      address_state: "NY",
      borough: "Williamsburg",
      cover_photo_url: null,
      verification_status: absoluteIndex < 2 ? "Verified" : "Pending",
      rating_overall: absoluteIndex === 0
        ? 0
        : absoluteIndex === 1
          ? 4.9
          : 4.6,
      review_count: absoluteIndex === 0
        ? 0
        : absoluteIndex === 1
          ? 982
          : 25 + absoluteIndex,
      latitude: 40.7081 + absoluteIndex * 0.0001,
      longitude: -73.9571,
      // Deliberately cheaper than the match: the card must show the selected
      // Dominican Blowout price, never this unrelated salon-wide minimum.
      starting_price: 20,
      services: [
        {
          id: `unrelated-trim-${absoluteIndex + 1}`,
          name: "Trim (Dusting / Shape-Up)",
        },
        { id: matchedStyleId, name: "Dominican Blowout" },
      ],
      distance_miles: Number((0.2 + absoluteIndex * 0.15).toFixed(2)),
      total_count: count + offset,
      sponsored: absoluteIndex === 0,
      matched_service: {
        id: matchedStyleId,
        name: "Dominican Blowout",
        price: absoluteIndex === 2 ? null : 95,
        original_price: null,
        maximum_displayed_price: 135,
      },
      reliability: {
        completed_appointments: 0,
        cancellation_rate_percent: 0,
        label: "New booking history",
      },
    };
  });
}

async function installDiscoveryFixture(
  page: Page,
  requests: SearchBody[],
  options: { paginated?: boolean; responseGate?: Promise<void> } = {},
) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("founder-discovery-fixture-ready")) {
      sessionStorage.clear();
      sessionStorage.setItem("founder-discovery-fixture-ready", "true");
    }
    localStorage.setItem(
      "girlz-culture-mobile-location-prompt-v1",
      JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" }),
    );
    localStorage.removeItem("girlz-culture-customer-location-v1");
    sessionStorage.removeItem("girlz-culture-customer-location-v1");
  });
  await page.route("**/api/location/resolve", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ location: null }),
    })
  );
  await page.route("**/api/search/suggestions?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ groups: [], no_result: true }),
    })
  );
  await page.route("**/api/discovery/decision-search", async (route) => {
    const request = (route.request().postDataJSON() || {}) as SearchBody;
    requests.push(request);
    await options.responseGate;
    const pageNumber = Number(request.filters?.page || 1);
    const rows = options.paginated
      ? pageNumber === 1
        ? salons(48)
        : salons(12, 48)
      : salons();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        salons: rows,
        summary: "AI generated prose that must not be visible to customers.",
        needs_location: false,
        location_label: "Williamsburg, Brooklyn",
        pagination: {
          page: pageNumber,
          page_size: 48,
          has_more_results: Boolean(options.paginated && pageNumber === 1),
        },
      }),
    });
  });
}

async function openResults(page: Page, expectedCount = 24) {
  await page.goto(
    "/salons?q=Dominican%20Blowout&lat=40.7081&lng=-73.9571&location=Williamsburg%2C%20Brooklyn",
  );
  const cards = page.locator("[data-salon-card]");
  const searchButton = page.locator(
    "[data-discovery-search-sticky] button[type='submit']",
  );
  await expect.poll(async () =>
    (await cards.count()) > 0 || await searchButton.isEnabled()
  ).toBe(true);
  if (await cards.count() === 0) await searchButton.click();
  await expect(cards).toHaveCount(expectedCount);
}

type RequiredSearchFilters = Required<NonNullable<SearchBody["filters"]>>;

const defaultRequestFilters: RequiredSearchFilters = {
  serviceId: null,
  radiusMiles: 50,
  minimumRating: null,
  maximumPrice: null,
  date: null,
  sort: "distance",
  promotionOnly: false,
  page: 1,
  pageSize: 48,
};

async function waitForNextRequest(
  requests: SearchBody[],
  previousCount: number,
) {
  await expect.poll(() => requests.length).toBeGreaterThan(previousCount);
  return requests.at(-1)!;
}

function canonicalSearchUrl(page: Page) {
  const current = new URL(page.url());
  return {
    pathname: current.pathname,
    entries: [...current.searchParams.entries()],
  };
}

test("explicit service intent never exposes un-enriched SSR booking links", async ({
  page,
}) => {
  const requests: SearchBody[] = [];
  let releaseResponse = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await installDiscoveryFixture(page, requests, { responseGate });

  await page.goto(
    "/internal/acceptance/discovery-state?service_intent=true",
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.locator("[data-salon-card]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Book" })).toHaveCount(0);
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(1);
  expect(requests.at(-1)).toMatchObject({
    query: "Dominican Blowout",
  });
  await expect(page.getByRole("button", { name: "Searching…" })).toBeDisabled();

  releaseResponse();

  await expect(page.locator("[data-salon-card]")).toHaveCount(24);
  const first = page.locator("[data-salon-card]").first();
  await expect(first).toContainText("Dominican Blowout");
  await expect(first).toContainText("From $95");
  await expect(first.getByRole("link", { name: "Book" })).toHaveAttribute(
    "href",
    `/salon/truthful-results-salon/book?style=${matchedStyleId}`,
  );
});

test("public results keep real signals and align the matched service, price and Book URL", async ({
  page,
}) => {
  const requests: SearchBody[] = [];
  await installDiscoveryFixture(page, requests);
  await openResults(page);

  const results = page.locator("#salon-results");
  const first = results.locator("[data-salon-card]").first();
  const reviewed = results.locator("[data-salon-card]").nth(1);
  const unknownMatchedPrice = results.locator("[data-salon-card]").nth(2);

  await expect(first).toContainText("Dominican Blowout");
  await expect(first).toContainText("From $95");
  await expect(first).not.toContainText("From $20");
  await expect(first.getByText("Verified", { exact: true })).toBeVisible();
  await expect(first.getByText("Sponsored", { exact: true })).toBeVisible();
  await expect(first.getByText("New", { exact: true })).toHaveCount(0);
  await expect(first).not.toContainText("New booking history");
  await expect(reviewed).toContainText("4.9");
  await expect(reviewed).toContainText("(982)");
  await expect(unknownMatchedPrice).toContainText("Dominican Blowout");
  await expect(unknownMatchedPrice).not.toContainText("From $20");
  await expect(first.getByRole("link", { name: "Book" })).toHaveAttribute(
    "href",
    `/salon/truthful-results-salon/book?style=${matchedStyleId}`,
  );

  await expect(page.getByText("AI generated prose", { exact: false })).toBeHidden();
  await expect(results.getByText("AI", { exact: true })).toHaveCount(0);
  await expect(results.getByText("AI-assisted", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Search updated: 24 matching salons.");

  await page.getByRole("button", { name: "Filter" }).click();
  const dialog = page.getByRole("dialog", { name: "Filter" });
  await dialog.getByLabel("Distance").selectOption("25");
  await dialog.getByLabel("Rating").selectOption("4.5");
  await dialog.getByLabel("Maximum price").selectOption("150");
  await dialog.getByLabel("Sort").selectOption("price_low");
  await dialog.getByLabel("Availability date").fill("2027-01-15");
  await dialog.getByLabel("Active offers only").check();
  await dialog.getByRole("button", { name: "Apply filters" }).click();

  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(2);
  expect(requests.at(-1)).toMatchObject({
    query: "Dominican Blowout",
  });
  expect(requests.at(-1)?.filters).toEqual({
      serviceId: null,
      radiusMiles: 25,
      minimumRating: 4.5,
      maximumPrice: 150,
      date: "2027-01-15",
      sort: "price_low",
      promotionOnly: true,
      page: 1,
      pageSize: 48,
  });
  await expect(page).toHaveURL(/radius=25/);
  await expect(page).toHaveURL(/rating=4\.5/);
  await expect(page).toHaveURL(/max_price=150/);
  await expect(page).toHaveURL(/date=2027-01-15/);
  await expect(page).toHaveURL(/sort=price_low/);
  await expect(page).toHaveURL(/offers=true/);

  await page.reload();
  await expect(page.locator("[data-salon-card]")).toHaveCount(24);
  await page.getByRole("button", { name: /Filter/ }).click();
  const restoredDialog = page.getByRole("dialog", { name: "Filter" });
  await expect(restoredDialog.getByLabel("Distance")).toHaveValue("25");
  await expect(restoredDialog.getByLabel("Rating")).toHaveValue("4.5");
  await expect(restoredDialog.getByLabel("Maximum price")).toHaveValue("150");
  await expect(restoredDialog.getByLabel("Sort")).toHaveValue("price_low");
  await expect(restoredDialog.getByLabel("Availability date")).toHaveValue("2027-01-15");
  await expect(restoredDialog.getByLabel("Active offers only")).toBeChecked();
  await restoredDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Map" }).click();
  await expect(page).toHaveURL(/view=map/);
  await expect(page.getByRole("button", { name: "Map" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "List" }).click();
  await expect(page).not.toHaveURL(/view=map/);
  await page.goBack();
  await expect(page).toHaveURL(/view=map/);
  await expect(page.getByRole("button", { name: "Map" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goBack();
  await expect(page).not.toHaveURL(/view=map/);
  await expect(page.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goForward();
  await expect(page).toHaveURL(/view=map/);
  await expect(page.getByRole("button", { name: "Map" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goForward();
  await expect(page).not.toHaveURL(/view=map/);
  await expect(page.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("each discovery filter serializes independently, honors supported boundaries, and clears cleanly", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const requests: SearchBody[] = [];
  await installDiscoveryFixture(page, requests);
  await openResults(page);

  const cases: Array<{
    name: string;
    control: string;
    value: string;
    expected: Partial<typeof defaultRequestFilters>;
    urlKey?: string;
    urlValue?: string;
    checkbox?: boolean;
  }> = [
    {
      name: "minimum distance boundary",
      control: "Distance",
      value: "5",
      expected: { radiusMiles: 5 },
      urlKey: "radius",
      urlValue: "5",
    },
    {
      name: "maximum distance boundary",
      control: "Distance",
      value: "100",
      expected: { radiusMiles: 100 },
      urlKey: "radius",
      urlValue: "100",
    },
    {
      name: "minimum supported rating threshold",
      control: "Rating",
      value: "3.9",
      expected: { minimumRating: 3.9 },
      urlKey: "rating",
      urlValue: "3.9",
    },
    {
      name: "maximum supported rating threshold",
      control: "Rating",
      value: "4.8",
      expected: { minimumRating: 4.8 },
      urlKey: "rating",
      urlValue: "4.8",
    },
    {
      name: "minimum maximum-price boundary",
      control: "Maximum price",
      value: "60",
      expected: { maximumPrice: 60 },
      urlKey: "max_price",
      urlValue: "60",
    },
    {
      name: "maximum maximum-price boundary",
      control: "Maximum price",
      value: "250",
      expected: { maximumPrice: 250 },
      urlKey: "max_price",
      urlValue: "250",
    },
    {
      name: "availability date",
      control: "Availability date",
      value: "2027-01-15",
      expected: { date: "2027-01-15" },
      urlKey: "date",
      urlValue: "2027-01-15",
    },
    {
      name: "active offers",
      control: "Active offers only",
      value: "true",
      expected: { promotionOnly: true },
      urlKey: "offers",
      urlValue: "true",
      checkbox: true,
    },
    {
      name: "nearest sort",
      control: "Sort",
      value: "distance",
      expected: { sort: "distance" },
    },
    {
      name: "best-rated sort",
      control: "Sort",
      value: "rating",
      expected: { sort: "rating" },
      urlKey: "sort",
      urlValue: "rating",
    },
    {
      name: "lowest-price sort",
      control: "Sort",
      value: "price_low",
      expected: { sort: "price_low" },
      urlKey: "sort",
      urlValue: "price_low",
    },
    {
      name: "highest-price sort",
      control: "Sort",
      value: "price_high",
      expected: { sort: "price_high" },
      urlKey: "sort",
      urlValue: "price_high",
    },
  ];

  for (const filterCase of cases) {
    await test.step(filterCase.name, async () => {
      await page.getByRole("button", { name: /Filter/ }).click();
      const dialog = page.getByRole("dialog", { name: "Filter" });
      const control = dialog.getByLabel(filterCase.control);
      if (filterCase.checkbox) await control.check();
      else if (filterCase.control === "Availability date") {
        await control.fill(filterCase.value);
      } else {
        await control.selectOption(filterCase.value);
      }

      const beforeApply = requests.length;
      await dialog.getByRole("button", { name: "Apply filters" }).click();
      const applied = await waitForNextRequest(requests, beforeApply);
      await expect(
        page.locator("[data-discovery-search-sticky] button[type='submit']"),
      ).toBeEnabled();
      expect(applied.query).toBe("Dominican Blowout");
      expect(applied.filters).toEqual({
        ...defaultRequestFilters,
        ...filterCase.expected,
      });
      if (filterCase.urlKey) {
        await expect.poll(() =>
          new URL(page.url()).searchParams.get(filterCase.urlKey!)
        ).toBe(filterCase.urlValue);
      }

      await page.getByRole("button", { name: /Filter/ }).click();
      const clearDialog = page.getByRole("dialog", { name: "Filter" });
      const beforeClear = requests.length;
      await clearDialog.getByRole("button", { name: "Clear filters" }).click();
      const cleared = await waitForNextRequest(requests, beforeClear);
      await expect(
        page.locator("[data-discovery-search-sticky] button[type='submit']"),
      ).toBeEnabled();
      expect(cleared.query).toBe("Dominican Blowout");
      expect(cleared.filters).toEqual(defaultRequestFilters);
      const filterKeys = [
        "radius",
        "rating",
        "max_price",
        "date",
        "sort",
        "offers",
      ];
      await expect.poll(() => {
        const clearedUrl = new URL(page.url());
        return filterKeys.filter((key) => clearedUrl.searchParams.has(key));
      }).toEqual([]);
    });
  }
});

test("homepage and header searches produce the same canonical URL by button and Enter", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const requests: SearchBody[] = [];
  await installDiscoveryFixture(page, requests);

  const surfaces = [
    {
      name: "homepage",
      path: "/",
      form: () => page.locator("[data-home-search] form[role='search']"),
      inputRole: "combobox" as const,
      inputName: "e.g., Knotless Braids",
    },
    {
      name: "header",
      path: "/how-it-works",
      form: () => page.locator("[data-public-header] form[role='search']"),
      inputRole: "searchbox" as const,
      inputName: "Search",
    },
  ];

  for (const surface of surfaces) {
    for (const activation of ["button", "Enter"] as const) {
      await test.step(`${surface.name} by ${activation}`, async () => {
        await page.goto(surface.path);
        await page.evaluate(() =>
          sessionStorage.removeItem("girlz-culture-salon-search-v2")
        );
        const form = surface.form();
        const input = form.getByRole(surface.inputRole, {
          name: surface.inputName,
        });
        await input.fill("  Dominican Blowout  ");
        if (activation === "button") {
          await form.getByRole("button", { name: "Search", exact: true }).click();
        } else {
          await input.press("Enter");
        }
        await expect.poll(() => canonicalSearchUrl(page)).toEqual({
          pathname: "/salons",
          entries: [["q", "Dominican Blowout"]],
        });
      });
    }
  }
});

test("search loads every result page and preserves the expanded result set", async ({
  page,
}) => {
  const requests: SearchBody[] = [];
  await installDiscoveryFixture(page, requests, { paginated: true });
  await openResults(page, 48);
  const loadMore = page.getByRole("button", { name: "Load more salons" });
  await expect(loadMore).toBeVisible();
  await loadMore.click();

  await expect(page.locator("[data-salon-card]")).toHaveCount(60);
  await expect.poll(() => requests.at(-1)?.filters?.page).toBe(2);
  await expect(loadMore).toHaveCount(0);

  await page.reload();
  await expect(page.locator("[data-salon-card]")).toHaveCount(60);
  await expect(page.getByRole("button", { name: "Load more salons" })).toHaveCount(0);
});

test("a failed replacement search clears stale cards before the response and keeps them cleared", async ({
  page,
}) => {
  const requests: SearchBody[] = [];
  await installDiscoveryFixture(page, requests);
  await openResults(page);
  const cards = page.locator("[data-salon-card]");
  await expect(cards).toHaveCount(24);

  await page.unroute("**/api/discovery/decision-search");
  let releaseFailure = () => {};
  const failureGate = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  let failedRequestCount = 0;
  await page.route("**/api/discovery/decision-search", async (route) => {
    failedRequestCount += 1;
    await failureGate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Search is temporarily unavailable." }),
    });
  });

  const sticky = page.locator("[data-discovery-search-sticky]");
  await sticky.getByRole("textbox", { name: "Search salons" }).fill(
    "Knotless Braids",
  );
  await sticky.getByRole("button", { name: "Search" }).click();
  await expect.poll(() => failedRequestCount).toBe(1);
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("Truthful Results Salon", { exact: true })).toHaveCount(0);

  releaseFailure();
  await expect(page.getByText("Search is temporarily unavailable.", {
    exact: true,
  })).toBeVisible();
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("Truthful Results Salon", { exact: true })).toHaveCount(0);
});

test("salon profile trust copy follows authoritative verification status", async ({
  page,
}) => {
  await page.goto("/internal/acceptance/salon-profile");
  const unverified = page.getByRole("region", {
    name: "Unverified salon trust",
    exact: true,
  });
  const verified = page.getByRole("region", {
    name: "Verified salon trust",
    exact: true,
  });

  for (const unsafeLabel of [
    "Verified",
    "Identity checked",
    "License confirmed",
    "Girlz Culture Approved",
    "Vetted Professional",
    "Certified Salon",
    "Background Checked",
    "Trusted Professional",
    "Transparent Pricing · Verified",
  ]) {
    await expect(unverified.getByText(unsafeLabel, { exact: true })).toHaveCount(
      0,
    );
  }
  await expect(unverified.getByText("Pricing shown upfront")).toBeVisible();
  await expect(unverified.getByText("Appointment timing")).toBeVisible();
  await expect(unverified.getByText("Current availability")).toBeVisible();
  await expect(
    unverified.locator('[data-trust-kind="verification"]'),
  ).toHaveCount(0);
  await expect(unverified.locator('[data-trust-kind="pricing"]')).toHaveCount(1);
  await expect(
    unverified.locator('[data-trust-kind="scheduling"]'),
  ).toHaveCount(1);
  await expect(
    unverified.locator('[data-trust-kind="availability"]'),
  ).toHaveCount(1);
  await expect(verified.getByText("Verified", { exact: true })).toBeVisible();
  await expect(verified.locator('[data-trust-kind="verification"]')).toHaveCount(
    1,
  );
  await expect(verified.locator('[data-trust-kind="pricing"]')).toHaveCount(1);
  await expect(
    verified.locator('[data-trust-kind="scheduling"]'),
  ).toHaveCount(1);
  await expect(
    verified.locator('[data-trust-kind="availability"]'),
  ).toHaveCount(1);
});

test("salon profile header and reviews preserve unverified, empty, and published states", async ({
  page,
}) => {
  await page.goto("/internal/acceptance/salon-profile");

  const unverifiedHeader = page.getByRole("region", {
    name: "Unverified public salon header",
  });
  await expect(
    unverifiedHeader.locator("[data-salon-verification-badge]"),
  ).toHaveCount(0);
  await expect(
    unverifiedHeader.getByText("Salon Profile", { exact: true }),
  ).toHaveCount(0);
  await expect(unverifiedHeader.getByText("Open today", { exact: true })).toBeVisible();

  const verifiedHeader = page.getByRole("region", {
    name: "Verified public salon header",
  });
  await expect(
    verifiedHeader.locator("[data-salon-verification-badge]"),
  ).toHaveText("Verified Salon");

  const emptyReviews = page.getByRole("region", {
    name: "Empty salon reviews",
  });
  await expect(emptyReviews.locator("p")).toHaveCount(1);
  await expect(emptyReviews.locator("p")).toHaveText("No reviews yet");

  const publishedReview = page.getByRole("region", {
    name: "Published salon review and reply",
  });
  await expect(publishedReview.getByText("Keisha R.", { exact: true })).toBeVisible();
  await expect(
    publishedReview.getByText("Beautiful, on-time result", { exact: true }),
  ).toBeVisible();
  await expect(publishedReview).toContainText(
    "The finished style matched the service I booked and the appointment started on time.",
  );
  await expect(publishedReview).toContainText(
    "Salon reply: Thank you, Keisha. We appreciate your visit and look forward to seeing you again.",
  );
});

test("sticky salon search remains contained and clear of public chrome at every required viewport", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const requests: SearchBody[] = [];
  await installDiscoveryFixture(page, requests);
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openResults(page);
    const sticky = page.locator("[data-discovery-search-sticky]");
    const header = page.locator("[data-public-header]");
    const bottomNav = page.getByRole("navigation", {
      name: "Customer navigation",
    });
    const settledStickyTops: number[] = [];

    for (const requestedY of [0, 180, 900, 2_400]) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "auto" }), requestedY);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      const layout = await page.evaluate(() => {
        const stickyNode = document.querySelector(
          "[data-discovery-search-sticky]",
        ) as HTMLElement | null;
        const controlsNode = document.querySelector(
          "[data-discovery-sticky-controls]",
        ) as HTMLElement | null;
        const headerNode = document.querySelector(
          "[data-public-header]",
        ) as HTMLElement | null;
        const bottomNode = document.querySelector(
          'nav[aria-label="Customer navigation"]',
        ) as HTMLElement | null;
        const stickyBox = stickyNode?.getBoundingClientRect() || null;
        const controlsBox = controlsNode?.getBoundingClientRect() || null;
        const rect = (node: HTMLElement | null) => {
          if (!node || getComputedStyle(node).display === "none") return null;
          const box = node.getBoundingClientRect();
          return {
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            left: box.left,
            width: box.width,
            height: box.height,
          };
        };
        return {
          sticky: rect(stickyNode),
          controls: rect(controlsNode),
          header: rect(headerNode),
          bottom: rect(bottomNode),
          viewport: { width: window.innerWidth, height: window.innerHeight },
          scrollY: window.scrollY,
          maximumScrollY: Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight,
          ),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          controlsInsideSticky: Boolean(
            stickyBox &&
              controlsBox &&
              controlsBox.top >= stickyBox.top - 1 &&
              controlsBox.right <= stickyBox.right + 1 &&
              controlsBox.bottom <= stickyBox.bottom + 1 &&
              controlsBox.left >= stickyBox.left - 1,
          ),
          interactiveControlsInsideSticky: stickyBox
            ? [...(controlsNode?.querySelectorAll<HTMLElement>(
                "input, button, [role='combobox']",
              ) || [])].every((control) => {
                const box = control.getBoundingClientRect();
                return (
                  box.top >= stickyBox.top - 1 &&
                  box.right <= stickyBox.right + 1 &&
                  box.bottom <= stickyBox.bottom + 1 &&
                  box.left >= stickyBox.left - 1
                );
              })
            : false,
          salonContentAboveSticky: stickyBox
            ? stickyBox.top > 1 &&
              [...document.querySelectorAll<HTMLElement>("[data-salon-card]")]
                .some((card) => {
                  const cardBox = card.getBoundingClientRect();
                  return cardBox.bottom > 0 && cardBox.top < stickyBox.top;
                })
            : false,
        };
      });

      expect(layout.sticky, `${viewport.width}x${viewport.height} sticky search exists`).not.toBeNull();
      expect(layout.controls, `${viewport.width}x${viewport.height} location and filter controls exist`).not.toBeNull();
      expect(
        layout.controlsInsideSticky,
        `${viewport.width}x${viewport.height} location and filter controls stay inside the sticky cluster`,
      ).toBe(true);
      expect(
        layout.interactiveControlsInsideSticky,
        `${viewport.width}x${viewport.height} interactive location/filter controls do not escape the sticky cluster`,
      ).toBe(true);
      expect(layout.overflow, `${viewport.width}x${viewport.height} has no horizontal overflow`).toBe(false);
      expect(
        layout.salonContentAboveSticky,
        `${viewport.width}x${viewport.height} has no salon content in the area above the sticky search`,
      ).toBe(false);
      expect(layout.sticky!.left).toBeGreaterThanOrEqual(-1);
      expect(layout.sticky!.right).toBeLessThanOrEqual(layout.viewport.width + 1);
      expect(layout.sticky!.top).toBeGreaterThanOrEqual(-1);
      expect(layout.sticky!.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
      expect(
        Math.abs(
          layout.scrollY - Math.min(requestedY, layout.maximumScrollY),
        ),
        `${viewport.width}x${viewport.height} reaches the requested scroll position`,
      ).toBeLessThanOrEqual(12);

      if (requestedY >= 900 && layout.scrollY >= 300) {
        expect(
          layout.sticky!.top,
          `${viewport.width}x${viewport.height} sticky search stays flush without an unintended top gap`,
        ).toBeLessThanOrEqual(1);
        settledStickyTops.push(layout.sticky!.top);
      }

      if (layout.header && layout.header.bottom > 0 && layout.header.top < layout.viewport.height) {
        expect(
          layout.sticky!.top >= layout.header.bottom - 1 ||
            layout.sticky!.bottom <= layout.header.top + 1,
          `${viewport.width}x${viewport.height} search does not overlap the visible header`,
        ).toBe(true);
      }
      if (layout.bottom) {
        expect(
          layout.sticky!.bottom <= layout.bottom.top + 1 ||
            layout.sticky!.top >= layout.bottom.bottom - 1,
          `${viewport.width}x${viewport.height} search does not overlap bottom navigation`,
        ).toBe(true);
      }
    }

    if (settledStickyTops.length > 1) {
      expect(
        Math.max(...settledStickyTops) - Math.min(...settledStickyTops),
        `${viewport.width}x${viewport.height} sticky top remains stable through deep scrolling`,
      ).toBeLessThanOrEqual(1);
    }

    await expect(sticky.getByPlaceholder("Search")).toBeVisible();
    await expect(sticky.getByRole("button", { name: /Search|Searching/ })).toBeVisible();
    if (
      viewport.width < 768 ||
      (viewport.width <= 1023 && viewport.height <= 600)
    ) await expect(bottomNav).toBeVisible();
    else await expect(bottomNav).toBeHidden();

    if (viewport.width <= 1023 && viewport.height <= 600) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
      const bottomClearance = await page.evaluate(() => {
        const cards = [...document.querySelectorAll<HTMLElement>("[data-salon-card]")];
        const finalCard = cards.at(-1)?.getBoundingClientRect() || null;
        const navigation = document
          .querySelector<HTMLElement>('nav[aria-label="Customer navigation"]')
          ?.getBoundingClientRect() || null;
        return {
          finalCardBottom: finalCard?.bottom ?? null,
          navigationTop: navigation?.top ?? null,
        };
      });
      expect(bottomClearance.finalCardBottom).not.toBeNull();
      expect(bottomClearance.navigationTop).not.toBeNull();
      expect(
        bottomClearance.finalCardBottom!,
        `${viewport.width}x${viewport.height} final result remains above bottom navigation at maximum scroll`,
      ).toBeLessThanOrEqual(bottomClearance.navigationTop! + 1);
    }
    await expect(header).toHaveCount(1);
  }
});
