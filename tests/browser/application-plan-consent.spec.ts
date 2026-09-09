import { expect, test, type Page } from "@playwright/test";
import { buildAuthStorageKeys } from "../../src/lib/authSessionCore";

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
const planButton = (page: Page, plan: string) => page.getByRole("button", { name: new RegExp(`^${plan}\\b`) });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/destination", (route) => route.fulfill({
    json: { path: "/pending", role: "salon_owner", salon_status: "Pending" },
  }));
});

async function seedApplicant(page: Page) {
  await page.addInitScript(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: buildAuthStorageKeys(providerURL).salon, value: session,
  });
}

const applicationForm = (page: Page) => page.locator("form:visible").filter({
  has: page.getByRole("heading", { name: "Salon Application", exact: true }),
});

async function fillApplication(page: Page) {
  const form = applicationForm(page);
  await expect(form).toHaveCount(1);
  await form.getByLabel("Business / Salon Name").fill("Fixture Salon");
  await form.getByLabel("Owner / Contact Full Name").fill("Fixture Owner");
  await form.getByLabel("Business Email").fill(user.email);
  await form.getByLabel("Phone Number").fill("2125550123");
  await form.getByLabel("Address Line 1").fill("123 Test Street");
  await form.getByLabel("City", { exact: false }).fill("Brooklyn");
  await form.getByLabel("ZIP Code").fill("11201");
  await form.getByLabel("Years in operation").fill("1");
  await form.getByLabel("Number of stylists").fill("1");
  for (const checkbox of await form.getByRole("checkbox").all()) await checkbox.check();
}

for (const query of ["", "?plan=invalid", "?plan="]) {
  test(`signup ${query || "without a plan"} carries no invented choice into the application`, async ({ page }) => {
    let signupPayload: Record<string, unknown> | undefined;
    await page.route("**/api/auth/signup", async (route) => {
      signupPayload = route.request().postDataJSON();
      await route.fulfill({ json: { session } });
    });
    await page.route(`${providerURL}/auth/v1/user`, (route) => route.fulfill({ json: user }));
    await page.goto(`/salon/signup${query}`);
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("local-fixture-password");
    await page.getByLabel("Phone Number").fill("2125550123");
    await page.getByRole("button", { name: "Join Now" }).click();
    await expect(page).toHaveURL(/\/salon\/apply$/);
    expect(signupPayload?.selected_plan).toBeNull();
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
    await page.goto(`/salon/apply${query}`);
    for (const plan of ["Starter", "Growth", "Premium"]) await expect(planButton(page, plan)).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByLabel("Selected application plan")).toHaveCount(0);
    await page.reload();
    await expect(planButton(page, "Starter")).toHaveAttribute("aria-pressed", "false");
    await fillApplication(page);
    await page.getByRole("button", { name: "Submit Application" }).click();
    await expect(applicationForm(page).getByRole("alert")).toHaveText("Please choose a plan before submitting your application.");
    expect(submissions).toHaveLength(0);
    await planButton(page, "Growth").focus();
    await page.keyboard.press("Enter");
    await expect(planButton(page, "Growth")).toHaveAttribute("aria-pressed", "true");
    await expect(applicationForm(page).getByLabel("Business / Salon Name")).toHaveValue("Fixture Salon");
    await page.getByRole("button", { name: "Submit Application" }).click();
    await expect(applicationForm(page).getByRole("alert")).toHaveText("Fixture submission rejected");
    expect(submissions).toHaveLength(1);
    expect(submissions[0].selected_plan).toBe("Growth");
  });
}

for (const [plan, price] of [["Starter", 59], ["Growth", 69], ["Premium", 89]] as const) {
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
    await page.getByRole("link", { name: `Choose ${plan}` }).click();
    await expect(page.getByLabel("Selected application plan")).toContainText(`${plan} · $${price}/month`);
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("local-fixture-password");
    await page.getByLabel("Phone Number").fill("2125550123");
    await page.getByRole("button", { name: "Join Now" }).click();
    await expect(page).toHaveURL(new RegExp(`/salon/apply\\?plan=${plan.toLowerCase()}$`));
    expect(signupPayload?.selected_plan).toBe(plan);
    await expect(planButton(page, plan)).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(planButton(page, plan)).toHaveAttribute("aria-pressed", "true");
    await fillApplication(page);
    await page.getByRole("button", { name: "Submit Application" }).click();
    await expect(page).toHaveURL(/\/salon\/application-submitted$/);
    expect(applicationPayload?.selected_plan).toBe(plan);
  });
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390], [1440, 1000]]) {
  test(`application choices remain unselected and keyboard accessible at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await seedApplicant(page);
    await page.goto("/salon/apply");
    await expect(page.getByRole("heading", { name: "Choose your plan" })).toBeVisible();
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
