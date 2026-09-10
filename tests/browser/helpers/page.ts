import { test as base } from "@playwright/test";

// Browser page creation is infrastructure setup, not a user interaction. In
// run #449 WebKit spent 26.9s in newPage(), leaving only 2s for the first click.
// Bound that setup separately while retaining the configured test/action budget.
// The built-in context fixture still owns isolation, tracing and page cleanup.
export const test = base.extend({
  page: [async ({ context }, use) => {
    await use(await context.newPage());
  }, { scope: "test", timeout: 30_000 }],
});
