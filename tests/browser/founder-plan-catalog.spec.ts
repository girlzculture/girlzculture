import { expect, test } from "@playwright/test";

const comparison = [
  ["Professional salon profile", "Included", "Included", "Included"],
  ["Unlimited stylist profiles", "Included", "Included", "Included"],
  ["Unlimited appointment bookings", "Included", "Included", "Included"],
  ["0% Girlz Culture appointment commission", "Included", "Included", "Included"],
  ["Customer deposits", "Included", "Included", "Included"],
  ["Booking-specific customer chat", "Included", "Included", "Included"],
  ["Appointment reminders", "Standard", "Customizable", "Advanced"],
  ["Marketplace visibility", "Standard", "Standard", "Standard"],
  ["Monthly reporting", "Basic", "Detailed", "Advanced"],
  ["Booking-source tracking", "Summary", "Full", "Full + comparisons"],
  ["Waitlist", "Manual", "Automated", "Automated + targeted"],
  ["Rebooking reminders", "Manual", "Automatic", "Automatic + segmented"],
  ["Customer promotions", "1 active", "Up to 5", "Unlimited, fair use"],
  ["Product listings", "10", "30", "Unlimited, fair use"],
  ["Google Business Profile help", "Guide", "Assisted setup", "Assisted setup + review"],
  ["Advertising discount", "—", "5%", "15%"],
  ["Advertising credit", "—", "$10 quarterly", "$10 monthly"],
  ["Early access to advertising spaces", "—", "—", "48 hours early"],
] as const;

test("plans page publishes the exact founder-approved catalog and application links", async ({
  page,
}) => {
  await page.goto("/plans");

  await expect(page.getByRole("heading", { name: "Starter", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Growth", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premium", exact: true })).toBeVisible();
  await expect(page.getByText(/\$59\s*\/ month/).first()).toBeVisible();
  await expect(page.getByText(/\$69\s*\/ month/).first()).toBeVisible();
  await expect(page.getByText(/\$89\s*\/ month/).first()).toBeVisible();
  await expect(page.getByText("Most Popular", { exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "Choose Starter" })).toHaveAttribute(
    "href",
    "/salon/signup?plan=starter",
  );
  await expect(page.getByRole("link", { name: "Choose Growth" })).toHaveAttribute(
    "href",
    "/salon/signup?plan=growth",
  );
  await expect(page.getByRole("link", { name: "Choose Premium" })).toHaveAttribute(
    "href",
    "/salon/signup?plan=premium",
  );

  const table = page.getByRole("table", {
    name: "Starter, Growth, and Premium salon subscription feature comparison",
  });
  await expect(table.getByRole("columnheader")).toHaveCount(4);
  await expect(table.getByRole("rowheader")).toHaveCount(18);
  for (const [label, starter, growth, premium] of comparison) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const row = table.getByRole("row", { name: new RegExp(escapedLabel, "i") });
    await expect(row).toBeVisible();
    const cells = row.getByRole("cell");
    await expect(cells).toHaveCount(3);
    await expect(cells.nth(0)).toHaveText(starter);
    await expect(cells.nth(1)).toHaveText(growth);
    await expect(cells.nth(2)).toHaveText(premium);
  }

  await expect(page.locator("main")).not.toContainText(
    /Basic \$99\.50|Growth \$129\.50|Premium \$159\.50|Stripe test mode|test-mode billing|Priority search placement|Top search placement|Featured rotation eligibility|Higher featured rotation|Priority campaign eligibility/i,
  );
  await expect(page.locator("main")).toContainText(
    "Choose a plan during your application. You will not be charged until your salon is approved and you subscribe",
  );
  await expect(page.locator("main")).toContainText(
    "Apply first. After approval, activate your selected plan securely through subscriptions",
  );
});

test("each plan CTA carries the normalized selection into salon signup", async ({
  page,
}) => {
  for (const plan of ["Starter", "Growth", "Premium"] as const) {
    await page.goto("/plans");
    await page.getByRole("link", { name: `Choose ${plan}` }).click();
    await expect(page).toHaveURL(
      new RegExp(`/salon/signup\\?plan=${plan.toLowerCase()}$`),
    );
    const selectedPlan = page.getByLabel("Selected application plan");
    await expect(selectedPlan).toHaveAttribute(
      "data-selected-application-plan",
      plan.toLowerCase(),
    );
    await expect(selectedPlan).toContainText(`${plan} ·`);
  }

  await page.goto("/salon/signup?plan=basic");
  const legacySelection = page.getByLabel("Selected application plan");
  await expect(legacySelection).toHaveAttribute(
    "data-selected-application-plan",
    "starter",
  );
  await expect(legacySelection).toContainText("Starter · $59/month");
  await expect(page.getByText("Basic", { exact: true })).toHaveCount(0);
});

test("direct salon signup defaults safely to Starter", async ({ page }) => {
  await page.goto("/salon/signup");

  const selection = page.getByLabel("Selected application plan");
  await expect(selection).toHaveAttribute(
    "data-selected-application-plan",
    "starter",
  );
  await expect(selection).toContainText("Starter · $59/month");
  await expect(page.getByText("Basic", { exact: true })).toHaveCount(0);
});

test("plan comparison remains keyboard-reachable and horizontally usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/plans");

  const scroller = page.getByLabel("Scrollable plan comparison");
  await expect(scroller).toHaveAttribute("tabindex", "0");
  await scroller.focus();
  await expect(scroller).toBeFocused();
  const initial = await scroller.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    overflowX: getComputedStyle(node).overflowX,
    bounds: {
      left: Math.round(node.getBoundingClientRect().left),
      right: Math.round(node.getBoundingClientRect().right),
    },
    pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    overflowingElements: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      })
      .slice(0, 12)
      .map((element) => ({
        element: element.tagName.toLowerCase(),
        className: element.className,
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
      })),
  }));
  expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth);
  expect(initial.pageOverflow, JSON.stringify(initial, null, 2)).toBe(false);

  const finalScrollLeft = await scroller.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
    return node.scrollLeft;
  });
  expect(finalScrollLeft).toBeGreaterThan(0);
  await expect(
    page.getByRole("columnheader", { name: /Premium \$89\/month/ }),
  ).toBeAttached();
  await expect(page.getByRole("rowheader")).toHaveCount(18);
});
