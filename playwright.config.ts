import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3104";
const acceptancePort = new URL(baseURL).port || "3104";
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
  PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL: acceptanceSupabaseURL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "acceptance-fixture-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "acceptance-fixture-service-role-key",
  // General public-site tests model a founder-opened marketplace. The separate
  // software-launch suite exercises the actual closed launch configuration.
  CUSTOMER_MARKETPLACE_LIVE: "true",
};

const publicResponsiveSpec = /public-responsive\.spec\.ts/;
const crossBrowserSmoke =
  /homepage shell has no overflow|promotion rail respects reduced motion|business cards open the correct flow directly|P0 owner core language flow|P0 operational calendar/;
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

export default defineConfig({
  testDir: "./tests/browser",
  // The software-launch suite starts its own server with discovery closed.
  testIgnore: /p0-prelaunch\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  // Normal CI runs the full expanded collection with two workers. Independent
  // release-candidate shards keep their existing single-worker allocation.
  workers: process.env.PLAYWRIGHT_CI_WORKERS === "2" ? 2 : process.env.CI ? 1 : undefined,
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
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: useProductionServer
        ? `npm run start -- -H 127.0.0.1 -p ${acceptancePort}`
        : `npm run dev -- -H 127.0.0.1 -p ${acceptancePort}`,
      url: baseURL,
      env: acceptanceEnvironment,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testMatch: [publicResponsiveSpec, /business-onboarding\.spec\.ts/, /p0-owner\.spec\.ts/, /p0-operational-calendar\.spec\.ts/],
      grep: crossBrowserSmoke,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testMatch: [publicResponsiveSpec, /business-morning-brief\.spec\.ts/, /google-business-profile\.spec\.ts/, /appointment-waitlist\.spec\.ts/, /subscription-recorded-price\.spec\.ts/, /founder-plan-catalog\.spec\.ts/, /application-plan-consent\.spec\.ts/, /business-onboarding\.spec\.ts/, /p0-owner\.spec\.ts/, /p0-owner-inventory\.spec\.ts/, /p0-owner-populated\.spec\.ts/, /p0-assistant-skills\.spec\.ts/, /p0-assistant-speech\.spec\.ts/, /p0-assistant-memory\.spec\.ts/, /p0-assistant-interaction\.spec\.ts/, /dashboard-redesign\.spec\.ts/, /dashboard-overview-calendar\.spec\.ts/, /business-finances\.spec\.ts/, /business-finance-tabs\.spec\.ts/, /business-client-cards\.spec\.ts/, /business-client-links\.spec\.ts/, /business-bookings\.spec\.ts/, /business-reviews\.spec\.ts/, /business-messages\.spec\.ts/, /business-communications\.spec\.ts/, /business-substitution\.spec\.ts/, /business-catalog\.spec\.ts/, /business-products\.spec\.ts/, /business-inventory\.spec\.ts/, /business-team\.spec\.ts/, /business-service-assignments\.spec\.ts/, /public-service-assignments\.spec\.ts/, /business-deposits\.spec\.ts/, /protected-booking-price\.spec\.ts/, /p0-locale-lifecycle\.spec\.ts/, /p0-booking-recipients\.spec\.ts/, /p0-public-policy\.spec\.ts/, /p0-operational-calendar\.spec\.ts/, /p0-customer-support\.spec\.ts/, /p0-customer-account\.spec\.ts/],
      grep: /Morning brief|Google Business Profile|Appointment waitlist|subscription reporting|plans page publishes|each plan CTA|direct business signup|plan comparison|explicit (Starter|Growth|Premium) survives|Business communications|Business substitution|Business messages|Business reviews|Business bookings|Returning guest link|Business inventory|Business products|Service assignments|Public service assignments|Business team|Business catalog|Private client record|client field restrictions|Deposit rules|Attendance change|Published offer preserves|Business finance|front desk logging|Dashboard redesign|P0 customer account|P0 customer support|homepage shell has no overflow|promotion rail respects reduced motion|business cards open the correct flow directly|P0 owner core language flow|P0 policy publication|P0 owner route inventory|P0 populated owner|P0 booking composer|P0 original service|P0 Assistant launcher|P0 Assistant all skills|P0 Assistant spoken controls|P0 Assistant memory|P0 Assistant submission|P0 Assistant workspace|P0 Assistant respects|P0 account locale|P0 booking recipient|P0 public policy|P0 operational calendar/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "iphone",
      testMatch: publicResponsiveSpec,
      grep: portraitMobileChecks,
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "android",
      testMatch: publicResponsiveSpec,
      grep: portraitMobileChecks,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "narrow-phone",
      testMatch: publicResponsiveSpec,
      grep: narrowPhoneChecks,
      use: {
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
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
      },
    },
    {
      name: "tablet-landscape",
      testMatch: publicResponsiveSpec,
      grep: tabletLandscapeChecks,
      use: {
        viewport: { width: 1180, height: 820 },
        hasTouch: true,
      },
    },
  ],
});
