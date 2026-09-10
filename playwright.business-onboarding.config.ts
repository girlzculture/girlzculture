import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// The normal WebKit project intentionally runs a cross-browser smoke subset.
// This focused gate exercises every onboarding case on the CI WebKit build.
export default defineConfig({
  ...base,
  projects: [{
    name: "webkit-business-onboarding",
    testMatch: /business-onboarding\.spec\.ts/,
    use: { ...devices["Desktop Safari"] },
  }],
});
