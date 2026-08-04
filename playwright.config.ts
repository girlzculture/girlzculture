import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3104";
const acceptanceSupabaseURL =
  process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL || "http://127.0.0.1:3105";
const useProductionServer =
  process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER === "true";

const acceptanceEnvironment = {
  ...process.env,
  GIRLZ_CULTURE_ACCEPTANCE_MODE: "true",
  NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS: "true",
  NEXT_PUBLIC_SITE_URL: baseURL,
  NEXT_PUBLIC_SUPABASE_URL: acceptanceSupabaseURL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "acceptance-fixture-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "acceptance-fixture-service-role-key",
};

const publicResponsiveSpec = /public-responsive\.spec\.ts/;
const crossBrowserSmoke =
  /homepage shell has no overflow|promotion rail respects reduced motion/;
const portraitMobileChecks =
  /homepage shell has no overflow|homepage removes the intro|mobile promotion swipe|primary mobile controls|mobile public navigation/;
const narrowPhoneChecks =
  /homepage shell has no overflow|compact phone salon cards|mobile promotion swipe|pilot public and authentication routes/;
const phoneLandscapeChecks =
  /homepage shell has no overflow|phone and tablet landscape layouts|mobile promotion swipe|mobile public navigation/;
const tabletChecks =
  /homepage shell has no overflow|homepage removes the intro|mobile promotion swipe/;
const tabletLandscapeChecks =
  /homepage shell has no overflow|homepage removes the intro|phone and tablet landscape layouts|mobile promotion swipe/;

function acceptanceClientHeaders(lastOctet: number) {
  return {
    // The production limiter keys public location resolution by the visitor's
    // proxy-provided address. CI runs every isolated browser project through
    // one localhost proxy, so give each simulated visitor class a distinct
    // reserved TEST-NET address instead of exhausting one visitor's budget.
    extraHTTPHeaders: { "x-forwarded-for": `192.0.2.${lastOctet}` },
  };
}

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node scripts/start-acceptance-supabase-fixture.mjs",
      url: `${acceptanceSupabaseURL}/health`,
      env: acceptanceEnvironment,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: useProductionServer
        ? "npm run start -- -H 127.0.0.1 -p 3104"
        : "npm run dev -- -H 127.0.0.1 -p 3104",
      url: baseURL,
      env: acceptanceEnvironment,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...acceptanceClientHeaders(10) },
    },
    {
      name: "firefox",
      testMatch: publicResponsiveSpec,
      grep: crossBrowserSmoke,
      use: { ...devices["Desktop Firefox"], ...acceptanceClientHeaders(11) },
    },
    {
      name: "webkit",
      testMatch: publicResponsiveSpec,
      grep: crossBrowserSmoke,
      use: { ...devices["Desktop Safari"], ...acceptanceClientHeaders(12) },
    },
    {
      name: "iphone",
      testMatch: publicResponsiveSpec,
      grep: portraitMobileChecks,
      use: { ...devices["iPhone 14"], ...acceptanceClientHeaders(13) },
    },
    {
      name: "android",
      testMatch: publicResponsiveSpec,
      grep: portraitMobileChecks,
      use: { ...devices["Pixel 7"], ...acceptanceClientHeaders(14) },
    },
    {
      name: "narrow-phone",
      testMatch: publicResponsiveSpec,
      grep: narrowPhoneChecks,
      use: {
        ...acceptanceClientHeaders(15),
        viewport: { width: 320, height: 568 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "phone-landscape",
      testMatch: publicResponsiveSpec,
      grep: phoneLandscapeChecks,
      use: {
        ...acceptanceClientHeaders(16),
        viewport: { width: 844, height: 390 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "tablet",
      testMatch: publicResponsiveSpec,
      grep: tabletChecks,
      use: {
        ...acceptanceClientHeaders(17),
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
      },
    },
    {
      name: "tablet-landscape",
      testMatch: publicResponsiveSpec,
      grep: tabletLandscapeChecks,
      use: {
        ...acceptanceClientHeaders(18),
        viewport: { width: 1180, height: 820 },
        hasTouch: true,
      },
    },
  ],
});
