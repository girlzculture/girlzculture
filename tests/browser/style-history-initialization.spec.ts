import { expect, test, type Page } from "@playwright/test";

type EarlyControl = "search" | "category";

async function interactDuringInitialCommit(page: Page, control: EarlyControl) {
  await page.addInitScript((earlyControl) => {
    const state = { scheduled: false, beforeRouterWrapper: false };
    Object.assign(window, { earlyStyleInteraction: state });
    const replace = window.history.replaceState.bind(window.history);
    const observeInitialCommit: History["replaceState"] = (data, unused, url) => {
      const result = replace(data, unused, url);
      // Next writes its initial route metadata in an insertion effect, then
      // installs its history wrapper in a passive effect. Exercise a real
      // control event between those phases; never alter Next's metadata.
      if (data?.__NA && !state.scheduled) {
        state.scheduled = true;
        queueMicrotask(() => {
          state.beforeRouterWrapper = window.history.replaceState === observeInitialCommit;
          const selector = earlyControl === "search"
            ? 'input[placeholder="Search styles"]'
            : 'select[aria-label="Category"]';
          const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
          if (!element) throw new Error("The catalog control must exist during hydration.");
          element.focus();
          const prototype = earlyControl === "search" ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
          const value = earlyControl === "search" ? "Box" : "Braids";
          Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
          element.dispatchEvent(new Event(earlyControl === "search" ? "input" : "change", { bubbles: true }));
        });
      }
      return result;
    };
    window.history.replaceState = observeInitialCommit;
  }, control);
}

for (const control of ["search", "category"] as const) {
  test(`Browse Styles restores an early ${control} selection made before router history initialization`, async ({ page }) => {
    await interactDuringInitialCommit(page, control);
    await page.goto("/internal/acceptance/style-catalog");
    const field = control === "search"
      ? page.getByPlaceholder("Search styles")
      : page.getByLabel("Category", { exact: true });
    const value = control === "search" ? "Box" : "Braids";
    await expect(field).toHaveValue(value);
    await expect(page).toHaveURL(control === "search" ? /\?q=Box$/ : /\?category=Braids$/);
    expect(await page.evaluate(() => (
      window as unknown as { earlyStyleInteraction: { beforeRouterWrapper: boolean } }
    ).earlyStyleInteraction.beforeRouterWrapper)).toBe(true);
    expect(await page.evaluate(() => history.state)).not.toBeNull();

    const catalogUrl = page.url();
    await page.evaluate(() => window.scrollTo({ top: 240, behavior: "auto" }));
    await page.getByRole("link", { name: /Box Braids/ }).click();
    await expect(page).toHaveURL(/style_id=11111111-1111-4111-8111-111111111111/);
    const savedScroll = await page.evaluate(() => JSON.parse(
      sessionStorage.getItem("girlz-culture-style-catalog-v2") || "null",
    )?.scrollY as number);
    expect(savedScroll).toBeGreaterThan(0);
    await page.goBack();
    await expect(page).toHaveURL(catalogUrl);
    await expect(field).toBeVisible();
    await expect(field).toHaveValue(value);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(savedScroll, 0);
    await page.reload();
    await expect(page).toHaveURL(catalogUrl);
    await expect(field).toHaveValue(value);
  });
}
