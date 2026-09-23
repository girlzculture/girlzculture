import { expect, test } from "@playwright/test";

import expected from "../fixtures/master-build-plan-catalog.json";
const comparison = expected.rows.map(([, label, ...values]) => [label, ...values.map(value => value === true ? "Included" : value)]);

test("plans page publishes the exact founder-approved catalog and application links", async ({
  page,
}) => {
  await page.goto("/plans");

  for (const plan of expected.plans) {
    await expect(page.getByRole("heading", { name: plan.name, exact: true })).toBeVisible();
    const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: plan.name, exact: true }) });
    await expect(card).toContainText(`$${plan.price} / month`);
    await expect(card.getByRole("link", { name: `Choose ${plan.name}` })).toHaveAttribute("href", `/business/signup?plan=${plan.key}`);
  }
  await expect(page.getByText("Most Popular", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "For independent professionals" })).toBeVisible();
  await expect(page.getByRole("region", { name: "For businesses with a team" })).toBeVisible();

  const table = page.getByRole("table", {
    name: "Solo, Solo Pro, Starter, Growth, and Premium business subscription feature comparison",
  });
  await expect(table.getByRole("columnheader")).toHaveCount(6);
  await expect(table.getByRole("rowheader")).toHaveCount(23);
  for (const [label, ...values] of comparison) {
    const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const row = table.getByRole("row", { name: new RegExp(escapedLabel, "i") });
    await expect(row).toBeVisible();
    const cells = row.getByRole("cell");
    await expect(cells).toHaveCount(5);
    for (const [index, value] of values.entries()) await expect(cells.nth(index)).toHaveText(String(value));
  }

  await expect(page.locator("main")).not.toContainText(
    /Basic \$99\.50|Growth \$129\.50|Premium \$159\.50|Stripe test mode|test-mode billing|Priority search placement|Top search placement|Featured rotation eligibility|Higher featured rotation|Priority campaign eligibility/i,
  );
  await expect(page.locator("main")).toContainText(
    "Choose a plan during your application. You will not be charged until your business is approved and you subscribe",
  );
  await expect(page.locator("main")).toContainText(
    "Apply first. Application and approval are available. New-plan billing activation is not yet verified",
  );
});

test("each plan CTA carries the normalized selection through the business gateway", async ({
  page,
}) => {
  for (const { name: plan, key } of expected.plans) {
    await page.goto("/plans");
    await page.getByRole("link", { name: `Choose ${plan}` }).click();
    await expect(page).toHaveURL(
      new RegExp(`/business/signup\\?plan=${key}$`),
    );
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
    await page.getByRole("link", { name: "Hair Salon & Braiding", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/business/signup/hair\\?plan=${key}$`));
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
  }

  await page.goto("/salon/signup?plan=basic");
  await expect(page).toHaveURL(/\/business\/signup\?plan=basic$/);
  await page.getByRole("link", { name: "Hair Salon & Braiding", exact: true }).click();
  await expect(page).toHaveURL(/\/business\/signup\/hair\?plan=starter$/);
  await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
  await expect(page.getByText("Basic", { exact: true })).toHaveCount(0);
});

test("direct business signup does not claim a plan was selected", async ({ page }) => {
  await page.goto("/business/signup");

  const selection = page.getByLabel("Selected application plan");
  await expect(selection).toHaveCount(0);
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
    page.getByRole("columnheader", { name: /Premium \$199\/month/ }),
  ).toBeAttached();
  await expect(page.getByRole("rowheader")).toHaveCount(23);
});
