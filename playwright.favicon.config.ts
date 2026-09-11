import { defineConfig, devices } from "@playwright/test";

// Global Engine branding requires a separate fixture process. Never reuse the
// ordinary suite's provider or run its tests concurrently with this runner.
const baseURL = "http://127.0.0.1:3104";
const provider = "http://127.0.0.1:3105";
const env = {
  ...process.env,
  GIRLZ_CULTURE_ACCEPTANCE_MODE: "true",
  GIRLZ_CULTURE_FAVICON_FIXTURE: "true",
  NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS: "true",
  NEXT_PUBLIC_SITE_URL: baseURL,
  NEXT_PUBLIC_SUPABASE_URL: provider,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "acceptance-fixture-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "acceptance-fixture-service-role-key",
};

export default defineConfig({
  testDir: "./tests/browser", testMatch: /brand-favicon\.spec\.ts/,
  fullyParallel: false, workers: 1, retries: 0, timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "favicon-playwright-report" }]],
  outputDir: "favicon-test-results",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "node scripts/start-acceptance-supabase-fixture.mjs", url: `${provider}/health`, env, reuseExistingServer: false, timeout: 30_000 },
    { command: process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER === "true"
      ? "npm run start -- -H 127.0.0.1 -p 3104" : "npm run dev -- -H 127.0.0.1 -p 3104",
      url: baseURL, env, reuseExistingServer: false, timeout: 120_000 },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } },
    { name: "firefox", grepInvert: /Chromium browser-owned/, use: { ...devices["Desktop Firefox"] } },
  ],
});
