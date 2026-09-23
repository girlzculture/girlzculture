import { expect, type Page } from "@playwright/test";
import { INITIAL_APPLICATION_FIELDS } from "../../../src/lib/applicationProgress";

export const applicationForm = (page: Page) => page.locator("form:visible").filter({ has: page.getByRole("heading", { name: "Business Application", exact: true }) });
export type Draft = { revision: number; payload: Record<string, unknown> };
export async function applicationDraftFixture(page: Page) {
  const state = { draft: null as Draft | null, writes: [] as Record<string, unknown>[], failAfterCommit: false, holdNextWrite: null as null | Promise<void> };
  await page.route("**/api/business/application/progress", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { draft: state.draft } });
    const { revision, ...payload } = route.request().postDataJSON();
    state.writes.push({ revision, ...payload });
    const hold = state.holdNextWrite; state.holdNextWrite = null;
    if (hold) await hold;
    if (revision !== (state.draft?.revision ?? null)) return route.fulfill({ status: 409, json: { error: "This draft changed on another device." } });
    state.draft = { revision: (state.draft?.revision ?? 0) + 1, payload };
    if (state.failAfterCommit) { state.failAfterCommit = false; return route.fulfill({ status: 503, json: { error: "The save response was interrupted. Your edits remain here." } }); }
    return route.fulfill({ json: { draft: state.draft, verified: true } });
  });
  return state;
}
export function completeDraft(overrides: Record<string, string> = {}, plan: string | null = "Growth") {
  return { fields: { ...INITIAL_APPLICATION_FIELDS, operator_type: "team", business_name: "Fixture Salon", owner_name: "Fixture Owner", business_email: "owner@example.com", phone: "2125550123", years_in_operation: "1", stylist_count: "2", location_type: "storefront", street_address: "123 Test Street", city: "Brooklyn", zip_code: "11201", services_offered: "Braids and hair care", price_range: "$60–$150", insurance: "yes", ...overrides }, documents: [], plan, locale: "en", step: 1, entry_mode: "form" };
}
export async function fillApplication(page: Page, setup = "single_location_staffed") {
  const form = applicationForm(page);
  const solo = ["solo_professional", "shared_suite_booth", "mobile_on_location"].includes(setup);
  await expect(form).toHaveCount(1);
  await form.getByLabel(setup === "multi_location" ? "I manage multiple locations" : solo ? "I work on my own" : "I run a business with a team", { exact: true }).check();
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await form.getByLabel("Business Name").fill("Fixture Salon");
  await form.getByLabel("Your full name").fill("Fixture Owner");
  await form.getByLabel("Business Email").fill("owner@example.com");
  await form.getByLabel("Phone Number").fill("2125550123");
  if(solo)await form.getByLabel("Years of experience").fill("1");
  if (!solo) await form.getByLabel("Number of professionals").fill("2");
  if (setup === "multi_location") await form.getByLabel("Number of locations").fill("2");
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await form.locator(`input[name="location"][value="${setup === "shared_suite_booth" ? "chair_suite" : setup === "mobile_on_location" ? "mobile" : "storefront"}"]`).check();
  if (setup === "shared_suite_booth") await form.getByLabel("Host business name").fill("Fixture Host");
  await form.getByLabel("Verification address", { exact: false }).fill("123 Test Street");
  await form.getByLabel("City", { exact: false }).fill("Brooklyn");
  await form.getByLabel("ZIP Code").fill("11201");
  if (setup === "mobile_on_location") {
    await form.getByLabel("Travel radius (miles)").fill("12");
    await form.getByLabel("Travel fee ($)").fill("12.50");
  }
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await form.getByLabel("Services you offer").fill("Braids and hair care");
  await form.getByLabel("Usual price range").fill("$60–$150");
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await form.getByLabel("Do you currently have insurance?").selectOption("yes");
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(form.getByRole("heading", { name: "Your plan", exact: true })).toBeVisible();
}
export async function reviewApplication(page: Page) {
  const form = applicationForm(page);
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(form.getByRole("heading", { name: "Review & submit", exact: true })).toBeVisible();
  for (const checkbox of await form.getByRole("checkbox").all()) await checkbox.check();
  await expect(form.getByRole("button", { name: "Submit Application", exact: true })).toBeEnabled();
}
