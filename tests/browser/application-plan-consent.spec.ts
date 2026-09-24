import { expect, type Page } from "@playwright/test";
import { test } from "./helpers/hydration";
import { buildAuthStorageKeys } from "../../src/lib/authSessionCore";
import { BUSINESS_SETUP_OPTIONS } from "../../src/lib/businessOnboarding";
import { SUBSCRIPTION_PLANS, isSoloPlan } from "../../src/lib/plans";
import { applicationForm, applicationDraftFixture, fillApplication, reviewApplication } from "./helpers/application";

// These tests deliberately replace Auth/application requests with isolated
// fixtures. A controlling service worker can bypass Playwright page.route,
// notably after the multi-page WebKit signup journey. Keep fixture ownership
// deterministic; production PWA registration/behavior is unchanged.
test.use({ serviceWorkers: "block" });

// Local session/provider fixtures only. Never submit a production application.
const providerURL = process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL || "http://127.0.0.1:3105";
const user = {
  id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com",
  aud: "authenticated", role: "authenticated", created_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { role: "salon_owner", phone: "2125550123" },
};
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: user.id, exp: expiresAt, role: "authenticated" })).toString("base64url"),
  "local-fixture-signature",
].join(".");
const session = { access_token: token, refresh_token: "local-fixture-refresh", token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user };
const planButton = (page: Page, plan: string) => page.getByRole("button", { name: new RegExp(`^${plan}\\s*\\$`) });

test.beforeEach(async ({ page }) => {
  await applicationDraftFixture(page);
  await page.route("**/api/notifications**", route => route.fulfill({ json: { notifications: [], unread_count: 0 } }));
  await page.route("**/api/admin/submissions/*/location-visit", route => route.fulfill({ json: { location: null } }));
  await page.route("**/api/i18n/preference", route => route.fulfill({ json: { ok: true, locale: route.request().postDataJSON().locale } }));
  await page.route(`${providerURL}/auth/v1/user`, route => route.fulfill({ json: user }));
  await page.route("**/api/auth/destination", (route) => route.fulfill({
    json: { path: "/pending", role: "salon_owner", salon_status: "Pending" },
  }));
});

async function seedApplicant(page: Page) {
  await page.addInitScript(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: buildAuthStorageKeys(providerURL).salon, value: session,
  });
}

test("business setup has no default and omission blocks submission", async ({ page }) => {
  await seedApplicant(page);
  let submissions = 0;
  await page.route("**/api/salon/application", route => { submissions += 1; return route.fulfill({ json: { ok: true } }); });
  await page.goto("/business/apply?plan=growth");
  const choices = applicationForm(page).getByRole("radio");
  await expect(choices).toHaveCount(3);
  for (const choice of await choices.all()) await expect(choice).not.toBeChecked();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect(await choices.first().evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  expect(submissions).toBe(0);
});

for (const [index, option] of BUSINESS_SETUP_OPTIONS.entries()) {
  test(`${option.label} is submitted explicitly and displayed in admin details and history after reload`, async ({ page }) => {
    await seedApplicant(page);
    let saved: Record<string, unknown> | undefined;
    await page.route("**/api/salon/application", async route => {
      saved = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });
    const plan = ["solo_professional", "shared_suite_booth", "mobile_on_location"].includes(option.value) ? "Solo" : "Premium";
    await page.goto(`/business/apply?plan=${SUBSCRIPTION_PLANS[plan].key}`);
    await fillApplication(page, option.value);
    await reviewApplication(page);
    await page.getByRole("button", { name: "Submit Application" }).click();
    await expect(page).toHaveURL(/\/salon\/application-submitted$/);
    expect(saved?.business_setup_type).toBe(option.value);
    expect(saved?.selected_plan).toBe(plan);

    // Render the real admin route against the saved local provider fixture.
    // The clean PostgreSQL test independently verifies actual row/revision writes.
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: buildAuthStorageKeys(providerURL).admin, value: { ...session, user: { ...user, user_metadata: { role: "admin" } } },
    });
    await page.route("**/api/admin/verify", route => route.fulfill({ json: {
      is_super_admin: index % 2 === 0,
      permissions: { submissions: true },
    } }));
    await page.route("**/api/admin/inbox-counts", route => route.fulfill({ json: { support: 0, complaints: 0 } }));
    await page.route("**/api/admin/submissions/setup-fixture", route => route.fulfill({ json: {
      is_super_admin: index % 2 === 0,
      application: { ...saved, id: "setup-fixture", salon_id: "salon-fixture", status: "Submitted",
        revisions: [{ id: "revision-1", revision_number: 1, change_source: "application_submission", created_at: "2026-09-09T12:00:00Z", snapshot: saved }],
      },
    } }));
    await page.goto("/admin/submissions/setup-fixture");
    await expect(page.getByText(`Business setup: ${option.label}`, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(`Business setup: ${option.label}`, { exact: true })).toBeVisible();
    await page.getByText("Submission history", { exact: true }).click();
    await page.getByText(/Revision 1 ·/).click();
    await expect(page.locator("details pre")).toContainText(`"business_setup_type": "${option.value}"`);
    if (index % 2 === 0) {
      await page.getByText("Correct submitted snapshot", { exact: true }).click();
      await expect(page.getByLabel("Business setup", { exact: true })).toHaveValue(option.value);
    }
  });
}

test("submission workspace denies unassigned admins before loading its embedded record", async ({ page }) => {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: buildAuthStorageKeys(providerURL).admin,
    value: { ...session, user: { ...user, user_metadata: { role: "admin" } } },
  });
  await page.route("**/api/admin/verify", route => route.fulfill({ json: {
    is_super_admin: false, permissions: { customers: true },
  } }));
  let recordReads = 0;
  await page.route("**/api/admin/submissions/setup-fixture", route => {
    recordReads += 1;
    return route.fulfill({ status: 403, json: { error: "Submission permission required" } });
  });
  await page.goto("/admin/submissions/setup-fixture");
  await expect(page.getByRole("heading", { name: "Access not assigned", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open an assigned section", exact: true })).toHaveAttribute("href", "/admin/customers");
  expect(recordReads).toBe(0);
});

for (const plan of [null, "Solo", "Solo Pro", "Starter", "Growth", "Premium"] as const) {
  test(`confirmed business login restores ${plan || "no selection"} into the application`, async ({ page }) => {
    const path = plan ? `/business/apply?plan=${SUBSCRIPTION_PLANS[plan].key}` : "/business/apply";
    await page.route("**/api/auth/destination", route => route.fulfill({ json: { path, role: "salon_owner", salon_status: "Pending" } }));
    await page.route("**/api/auth/login/start", route => route.fulfill({ json: { session } }));
    await page.route(`${providerURL}/auth/v1/user`, route => route.fulfill({ json: user }));
    await page.goto("/business/login");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("local-fixture-password");
    await page.getByRole("button", { name: "Continue securely" }).click();
    await expect(page).toHaveURL(new RegExp(`${path.replace("?", "\\?")}$`));
    await fillApplication(page, plan && isSoloPlan(plan) ? "solo_professional" : "single_location_staffed");
    for (const choice of plan && isSoloPlan(plan) ? ["Solo", "Solo Pro"] : ["Starter", "Growth", "Premium"]) {
      await expect(planButton(page, choice)).toHaveAttribute("aria-pressed", String(choice === plan));
    }
  });
}

for (const query of ["", "?plan=invalid", "?plan="]) {
  test(`signup ${query || "without a plan"} carries no invented choice into the application`, async ({ page }) => {
    let signupPayload: Record<string, unknown> | undefined;
    await page.route("**/api/auth/signup", async (route) => {
      signupPayload = route.request().postDataJSON();
      await route.fulfill({ json: { session } });
    });
    await page.route(`${providerURL}/auth/v1/user`, (route) => route.fulfill({ json: user }));
    await page.goto(`/business/signup${query}`);
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
    await page.getByRole("link", { name: "Hair Salon & Braiding", exact: true }).click();
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("local-fixture-password");
    await page.getByLabel("Phone Number").fill("2125550123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/business\/apply$/);
    expect(signupPayload?.selected_plan).toBeNull();
    await fillApplication(page);
    for (const plan of ["Starter", "Growth", "Premium"]) await expect(planButton(page, plan)).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
  });

  test(`direct application ${query || "without a plan"} requires an explicit choice`, async ({ page }) => {
    await seedApplicant(page);
    const submissions: Record<string, unknown>[] = [];
    await page.route("**/api/salon/application", async (route) => {
      submissions.push(route.request().postDataJSON());
      await route.fulfill({ status: 400, json: { error: "Fixture submission rejected" } });
    });
    await page.goto(`/business/apply${query}`);
    await fillApplication(page);
    await expect(page.getByRole("status")).toContainText("Progress saved.");
    for (const plan of ["Starter", "Growth", "Premium"]) await expect(planButton(page, plan)).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
    await page.reload();
    await expect(planButton(page, "Starter")).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(applicationForm(page).getByRole("alert")).toHaveText("Choose a plan for your business setup.");
    expect(submissions).toHaveLength(0);
    await planButton(page, "Growth").focus();
    await page.keyboard.press("Enter");
    await expect(planButton(page, "Growth")).toHaveAttribute("aria-pressed", "true");
    await reviewApplication(page);
    await expect(applicationForm(page).locator("dl")).toContainText("Fixture Salon");
    await page.getByRole("button", { name: "Submit Application" }).click();
    await expect(applicationForm(page).getByRole("alert")).toHaveText("Fixture submission rejected");
    expect(submissions).toHaveLength(1);
    expect(submissions[0].selected_plan).toBe("Growth");
  });
}

for (const [plan, price] of [["Solo", 69], ["Solo Pro", 99], ["Starter", 99], ["Growth", 149], ["Premium", 199]] as const) {
  test(`explicit ${plan} survives plans → signup → application → refresh → submission`, async ({ page }) => {
    let signupPayload: Record<string, unknown> | undefined;
    let applicationPayload: Record<string, unknown> | undefined;
    await page.route("**/api/auth/signup", async (route) => {
      signupPayload = route.request().postDataJSON();
      await route.fulfill({ json: { session } });
    });
    await page.route(`${providerURL}/auth/v1/user`, (route) => route.fulfill({ json: user }));
    await page.route("**/api/salon/application", async (route) => {
      applicationPayload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto("/plans");
    await page.getByRole("link", { name: `Choose ${plan}`, exact: true }).click();
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
    await page.getByRole("link", { name: "Hair Salon & Braiding", exact: true }).click();
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("local-fixture-password");
    await page.getByLabel("Phone Number").fill("2125550123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect.poll(() => signupPayload?.selected_plan, { message: "The isolated signup adapter must receive the selected plan" }).toBe(plan);
    await expect(page).toHaveURL(new RegExp(`/business/apply\\?plan=${SUBSCRIPTION_PLANS[plan].key}$`));
    expect(signupPayload?.selected_plan).toBe(plan);
    await fillApplication(page, isSoloPlan(plan) ? "solo_professional" : "single_location_staffed");
    await expect(page.getByRole("status")).toContainText("Progress saved.");
    await expect(planButton(page, plan)).toContainText(`$${price}/month`);
    await expect(planButton(page, plan)).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(planButton(page, plan)).toHaveAttribute("aria-pressed", "true");
    await reviewApplication(page);
    await page.getByRole("button", { name: "Submit Application" }).click();
    await expect(page).toHaveURL(/\/salon\/application-submitted$/);
    expect(applicationPayload?.selected_plan).toBe(plan);
  });
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390], [1440, 1000]]) {
  test(`application choices remain unselected and keyboard accessible at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await seedApplicant(page);
    await page.goto("/business/apply");
    await fillApplication(page);
    await expect(page.getByRole("heading", { name: "Your plan", exact: true })).toBeVisible();
    for (const plan of ["Starter", "Growth", "Premium"]) {
      const button = planButton(page, plan);
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await button.focus();
      await expect(button).toBeFocused();
      await expect(button).toBeInViewport();
      expect(await button.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      const bounds = await button.boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    await page.keyboard.press("Space");
    await expect(planButton(page, "Premium")).toHaveAttribute("aria-pressed", "true");
  });
}
