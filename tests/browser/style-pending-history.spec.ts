import { expect, test } from "@playwright/test";

test("Browse Styles survives Back while a completed salon search has a pending router commit", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { completedSearch: false, deferredTasks: 0, backUrl: "" };
    Object.assign(window, { pendingStyleHistory: state });
    let holdRouterTasks = false;
    const pendingTasks: (() => void)[] = [];
    const NativeMessageChannel = window.MessageChannel;
    // Keep the real scheduler callbacks, but hold their next turn while Back
    // is delivered. This deterministically exercises the production race:
    // search has changed history, but React has not committed that URL yet.
    window.MessageChannel = class extends NativeMessageChannel {
      constructor() {
        super();
        const port = this.port1;
        const descriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype, "onmessage")!;
        Object.defineProperty(port, "onmessage", {
          set(listener: (event: MessageEvent) => void) {
            descriptor.set!.call(port, (event: MessageEvent) => {
              if (holdRouterTasks) {
                state.deferredTasks += 1;
                pendingTasks.push(() => listener.call(port, event));
              } else {
                listener.call(port, event);
              }
            });
          },
          get() { return descriptor.get!.call(port); },
        });
      }
    };
    window.addEventListener("popstate", () => {
      state.backUrl = location.href;
      setTimeout(() => {
        holdRouterTasks = false;
        pendingTasks.splice(0).forEach((run) => run());
      }, 0);
    });
    const replace = history.replaceState.bind(history);
    history.replaceState = (data, unused, url) => {
      const result = replace(data, unused, url);
      if (!state.completedSearch && String(url).startsWith("/salons?style=Box+Braids&style_id=")) {
        state.completedSearch = true;
        holdRouterTasks = true;
        queueMicrotask(() => history.back());
      }
      return result;
    };
  });
  await page.goto("/internal/acceptance/style-catalog");
  const search = page.getByPlaceholder("Search styles");
  await search.fill("Box");
  await page.getByLabel("Category", { exact: true }).selectOption("Braids");
  await page.getByLabel("Length", { exact: true }).selectOption("Mid-back");
  await page.getByLabel("Price", { exact: true }).selectOption("150-250");
  await page.getByLabel("Sort", { exact: true }).selectOption("a-z");
  const catalogUrl = page.url();
  await page.evaluate(() => window.scrollTo({ top: 240, behavior: "auto" }));
  await page.getByRole("link", { name: /Box Braids/ }).click();
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { pendingStyleHistory: { backUrl: string } }
  ).pendingStyleHistory.backUrl)).toBe(catalogUrl);
  await expect(page).toHaveURL(catalogUrl);
  await expect(search).toBeVisible();
  await expect(search).toHaveValue("Box");
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue("Braids");
  await expect(page.getByLabel("Length", { exact: true })).toHaveValue("Mid-back");
  await expect(page.getByLabel("Price", { exact: true })).toHaveValue("150-250");
  await expect(page.getByLabel("Sort", { exact: true })).toHaveValue("a-z");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  expect(await page.evaluate(() => (
    window as unknown as { pendingStyleHistory: { deferredTasks: number } }
  ).pendingStyleHistory.deferredTasks)).toBeGreaterThan(0);
  await page.reload();
  await expect(page).toHaveURL(catalogUrl);
  await expect(search).toHaveValue("Box");
  await expect(page.getByLabel("Sort", { exact: true })).toHaveValue("a-z");
});
