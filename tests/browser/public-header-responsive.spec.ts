import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const routes = [
  { name: "homepage", path: "/" },
  { name: "browse-styles", path: "/styles" },
  { name: "find-salons", path: "/salons" },
  { name: "how-it-works", path: "/how-it-works" },
  { name: "about", path: "/about" },
  { name: "blog", path: "/blog" },
  { name: "salon-profile", path: "/salon/acceptance-salon" },
  { name: "legal", path: "/legal" },
] as const;

const viewports = [
  { width: 1366, height: 768 },
  { width: 1440, height: 1000 },
  { width: 1024, height: 768 },
  { width: 844, height: 390 },
] as const;

const screenshotDirectory = path.join(
  process.cwd(),
  "docs",
  "screenshots",
  "final-correction",
  "header-closure",
);

type LayoutAudit = {
  viewportWidth: number;
  documentWidth: number;
  zones: Array<{
    name: string;
    left: number;
    right: number;
    top: number;
    bottom: number;
  }>;
  zoneChildren: Array<{
    zone: string;
    name: string;
    left: number;
    right: number;
  }>;
  wrappedLabels: string[];
};

function overlaps(
  first: LayoutAudit["zones"][number],
  second: LayoutAudit["zones"][number],
) {
  return (
    first.left < second.right - 0.5 &&
    first.right > second.left + 0.5 &&
    first.top < second.bottom - 0.5 &&
    first.bottom > second.top + 0.5
  );
}

async function auditHeader(page: Page): Promise<LayoutAudit> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const rectFor = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    };
    const visibleHeaders = Array.from(
      document.querySelectorAll<HTMLElement>("[data-public-header]"),
    ).filter(visible);
    if (visibleHeaders.length !== 1) {
      throw new Error(`Expected one visible public header, found ${visibleHeaders.length}.`);
    }
    const [header] = visibleHeaders;
    const zoneElements = Array.from(
      header.querySelectorAll<HTMLElement>("[data-public-header-zone]"),
    ).filter(visible);
    const zones = zoneElements.map((element) => ({
      name: element.dataset.publicHeaderZone || "unknown",
      ...rectFor(element),
    }));
    const zoneChildren = zoneElements.flatMap((zone) =>
      Array.from(zone.children)
        .filter(visible)
        .map((child, index) => ({
          zone: zone.dataset.publicHeaderZone || "unknown",
          name:
            child.getAttribute("aria-label") ||
            child.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ||
            `${child.tagName.toLowerCase()}-${index}`,
          left: child.getBoundingClientRect().left,
          right: child.getBoundingClientRect().right,
        })),
    );
    const textControls = Array.from(
      header.querySelectorAll<HTMLElement>(
        '[data-public-header-zone="navigation"] > a, [data-public-header-zone="actions"] > a[href="/login"]',
      ),
    ).filter(visible);
    const wrappedLabels = textControls.flatMap((element) => {
      const labelNode = Array.from(element.childNodes).find(
        (node) =>
          node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      );
      if (!labelNode) return [];
      const range = document.createRange();
      range.selectNodeContents(labelNode);
      const lineTops = new Set(
        Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => Math.round(rect.top)),
      );
      return lineTops.size > 1
        ? [element.textContent?.trim().replace(/\s+/g, " ") || element.tagName]
        : [];
    });
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      zones,
      zoneChildren,
      wrappedLabels,
    };
  });
}

function expectCleanHeader(layout: LayoutAudit, label: string) {
  expect(
    layout.documentWidth,
    `${label}: page exceeds the viewport`,
  ).toBeLessThanOrEqual(layout.viewportWidth + 1);
  for (const zone of layout.zones) {
    expect(zone.left, `${label}: ${zone.name} starts outside the viewport`).toBeGreaterThanOrEqual(-1);
    expect(zone.right, `${label}: ${zone.name} ends outside the viewport`).toBeLessThanOrEqual(layout.viewportWidth + 1);
  }
  for (let index = 0; index < layout.zones.length; index += 1) {
    for (let comparison = index + 1; comparison < layout.zones.length; comparison += 1) {
      expect(
        overlaps(layout.zones[index], layout.zones[comparison]),
        `${label}: ${layout.zones[index].name} overlaps ${layout.zones[comparison].name}`,
      ).toBe(false);
    }
  }
  for (const child of layout.zoneChildren) {
    const zone = layout.zones.find((candidate) => candidate.name === child.zone);
    expect(zone, `${label}: ${child.zone} zone exists`).toBeTruthy();
    expect(child.left, `${label}: ${child.name} escapes ${child.zone} on the left`).toBeGreaterThanOrEqual((zone?.left || 0) - 1);
    expect(child.right, `${label}: ${child.name} escapes ${child.zone} on the right`).toBeLessThanOrEqual((zone?.right || 0) + 1);
  }
  expect(layout.wrappedLabels, `${label}: header labels wrap`).toEqual([]);
}

test.beforeAll(() => {
  mkdirSync(screenshotDirectory, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "girlz-culture-mobile-location-prompt-v1",
      JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" }),
    );
  });
});

test("public header remains collision-free across closure routes and viewports", async ({
  page,
}) => {
  test.setTimeout(180_000);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
      expect(response, `${route.path} returns a response`).not.toBeNull();
      expect(response!.status(), `${route.path} returns a non-server-error response`).toBeLessThan(500);
      const header = page.locator("[data-public-header]:visible");
      await expect(header).toHaveCount(1);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const label = `${route.name} ${viewport.width}x${viewport.height}`;
      expectCleanHeader(await auditHeader(page), label);

      const search = header.locator('[data-public-header-control="search"]');
      if (route.path === "/salons") {
        await expect(search).toHaveCount(0);
      } else {
        await expect(search).toBeVisible();
      }
      if (viewport.width >= 1536) {
        await expect(header.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
        await expect(header.getByRole("button", { name: "Open navigation menu" })).toBeHidden();
      } else {
        await expect(header.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
        await expect(header.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
      }

      await header.screenshot({
        path: path.join(
          screenshotDirectory,
          `${route.name}-${viewport.width}x${viewport.height}.png`,
        ),
        animations: "disabled",
      });
    }
  }
});

test("responsive menus keep every control inside a scrollable viewport panel", async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const menu = page.locator("[data-public-mobile-menu]");
    await expect(menu).toBeVisible();
    const menuAudit = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        overflowY: window.getComputedStyle(element).overflowY,
      };
    });
    expect(menuAudit.left).toBeGreaterThanOrEqual(-1);
    expect(menuAudit.right).toBeLessThanOrEqual(menuAudit.viewportWidth + 1);
    expect(menuAudit.top).toBeGreaterThanOrEqual(-1);
    expect(menuAudit.bottom).toBeLessThanOrEqual(menuAudit.viewportHeight + 1);
    expect(["auto", "scroll"]).toContain(menuAudit.overflowY);

    await expect(menu.getByLabel("Select language")).toBeAttached();
    for (const name of [
      "Browse Styles",
      "Find Salons",
      "How It Works",
      "About Us",
      "Blog",
      "Partner With Us",
      "Log in",
      "Sign up",
    ]) {
      const link = menu.getByRole("link", { name, exact: true });
      await expect(link).toBeAttached();
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
      const unobscured = await link.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const topElement = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return topElement === element || Boolean(topElement && element.contains(topElement));
      });
      expect(unobscured, `${name} is not obscured by page content`).toBe(true);
    }
    await menu.getByRole("link", { name: "Sign up", exact: true }).scrollIntoViewIfNeeded();
    await expect(menu.getByRole("link", { name: "Sign up", exact: true })).toBeVisible();
    await page.screenshot({
      path: path.join(
        screenshotDirectory,
        `menu-open-${viewport.width}x${viewport.height}.png`,
      ),
      animations: "disabled",
    });
  }
});
