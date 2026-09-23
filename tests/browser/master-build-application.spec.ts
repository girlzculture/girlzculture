import { expect } from "@playwright/test";
import { test } from "./helpers/hydration";
import { buildAuthStorageKeys } from "../../src/lib/authSessionCore";
import { applicationDraftFixture, applicationForm, completeDraft } from "./helpers/application";
import { masterBuildMessages } from "../../src/i18n/master-build-source-catalog";

test.use({ serviceWorkers: "block" });
const provider = process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL || "http://127.0.0.1:3105";
const user = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { role: "salon_owner", locale: "en" } };
const session = { user, access_token: [Buffer.from('{"alg":"HS256"}').toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url"), "fixture"].join("."), refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600 };
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({key,value}) => sessionStorage.setItem(key, JSON.stringify(value)), { key: buildAuthStorageKeys(provider).salon, value: session });
  await page.route("**/api/i18n/preference", route => route.fulfill({ json: { ok: true, locale: route.request().postDataJSON().locale } }));
  await page.route(`${provider}/auth/v1/user`, route => route.fulfill({ json: user }));
});

test("Master application restores server progress after refresh without replacing newer input after a slow save", async ({ page }) => {
  const state = await applicationDraftFixture(page);
  state.draft = { revision: 3, payload: completeDraft() };
  await page.goto("/business/apply");
  const name = applicationForm(page).getByLabel("Business Name");
  await expect(name).toHaveValue("Fixture Salon");
  await expect(page).toHaveURL(/plan=growth/);
  let release!: () => void;
  state.holdNextWrite = new Promise<void>(resolve => { release = resolve; });
  await name.fill("First edit");
  await expect.poll(() => state.writes.length).toBe(1);
  await name.fill("Newer edit");
  release();
  await expect.poll(() => (state.draft?.payload.fields as Record<string,string>)?.business_name).toBe("Newer edit");
  await expect(name).toHaveValue("Newer edit");
  await expect(page.getByRole("status")).toContainText("Progress saved.");
  expect(state.writes.map(row=>row.revision)).toEqual([3,4]);
  await page.reload();
  await expect(name).toHaveValue("Newer edit");
});

test("Master application reads back an interrupted committed save and preserves edits on exact retry", async ({ page }) => {
  const state = await applicationDraftFixture(page);
  state.draft = { revision: 4, payload: completeDraft() };
  await page.goto("/business/apply");
  const name = applicationForm(page).getByLabel("Business Name");
  await expect(name).toHaveValue("Fixture Salon");
  state.failAfterCommit = true;
  await name.fill("Committed before response failed");
  await expect(applicationForm(page).getByRole("alert")).toContainText("save response was interrupted");
  await name.fill("Retained newer edits");
  await page.getByRole("button", { name: "Retry saving my edits" }).click();
  await expect(page.getByRole("status")).toContainText("Progress saved.");
  await expect(name).toHaveValue("Retained newer edits");
  expect(state.writes.map(row=>row.revision)).toEqual([4,5]);
  expect((state.draft?.payload.fields as Record<string,string>).business_name).toBe("Retained newer edits");
});

test("Master application refuses a concurrent device overwrite and explicitly restores the newer saved draft", async ({ page }) => {
  const state = await applicationDraftFixture(page);
  state.draft = { revision: 2, payload: completeDraft() };
  await page.goto("/business/apply");
  const name = applicationForm(page).getByLabel("Business Name");
  await expect(name).toHaveValue("Fixture Salon");
  state.draft = { revision: 3, payload: completeDraft({ business_name: "Other device saved this" }) };
  await name.fill("Local unsaved change");
  await expect(applicationForm(page).getByRole("alert")).toContainText("changed on another device");
  await expect(name).toHaveValue("Local unsaved change");
  expect(state.draft.revision).toBe(3);
  expect(state.writes).toHaveLength(1);
  await page.getByRole("button", { name: "Discard these edits and load the saved draft" }).click();
  await expect(name).toHaveValue("Other device saved this");
  await expect(page.getByRole("status")).toContainText("Progress saved.");
  expect(state.writes).toHaveLength(1);
});

test("Master application waits for the authenticated draft before exposing editable fields", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/business/application/progress", async route => {
    await wait;
    return route.fulfill({ json: { draft: { revision: 1, payload: completeDraft() } } });
  });
  await page.goto("/business/apply");
  await expect(page.getByRole("status")).toContainText("Loading your saved application");
  await expect(page.getByLabel("Business Name")).toHaveCount(0);
  release();
  await expect(applicationForm(page).getByLabel("Business Name")).toHaveValue("Fixture Salon");
});

for (const [locale, column] of [["fr",1], ["es",2], ["zh-CN",3]] as const) {
  test(`Master application ?lang=${locale} completes all topics, preserves authored text and resumes in the chosen language`, async ({ page }) => {
    const copy = masterBuildMessages(column);
    const t = (source: string) => copy[source] || source;
    const state = await applicationDraftFixture(page);
    state.draft = { revision: 1, payload: completeDraft() };
    let persistedLocale = "en";
    await page.route("**/api/i18n/preference", route => {
      persistedLocale = route.request().postDataJSON().locale;
      return route.fulfill({ json: { ok: true, locale: persistedLocale } });
    });
    await page.route(`${provider}/auth/v1/user`, route => route.fulfill({ json: { ...user, user_metadata: { ...user.user_metadata, locale: persistedLocale } } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/business/apply?lang=${locale}`);
    const form = page.locator("form").filter({has:page.getByRole("heading",{name:t("Business Application"),exact:true})});
    await expect(page.locator("html")).toHaveAttribute("lang",locale);
    await expect(form.getByLabel(t("Business Name"))).toHaveValue("Fixture Salon");
    await expect.poll(()=>persistedLocale).toBe(locale);
    await form.getByRole("button",{name:t("Back"),exact:true}).click();
    await expect(form.getByLabel(t("I run a business with a team"),{exact:true})).toBeChecked();
    for (const topic of ["How you work", "About you", "Location", "Services", "Licenses & documents", "Your plan"]) {
      await expect(form.getByRole("heading",{name:t(topic),exact:true})).toBeVisible();
      await form.getByRole("button",{name:t("Continue"),exact:true}).click();
    }
    await expect(form.getByRole("heading",{name:t("Review & submit"),exact:true})).toBeVisible();
    await expect(form.locator("dl")).toContainText("Fixture Salon");
    await expect(form.locator("dl")).toContainText("Braids and hair care");
    for (const label of ["I confirm the information is accurate and I’m authorized to represent this business.","I agree to the Terms of Service and Partner Agreement.","I confirm I have permission and rights for any photos I upload now or during setup."]) await form.getByLabel(t(label),{exact:true}).check();
    await expect(form.getByRole("status")).toHaveText(t("Progress saved. You can return on another device."));
    await page.goto("/business/apply");
    await expect(page.locator("html")).toHaveAttribute("lang",locale);
    await expect(form.getByRole("heading",{name:t("Review & submit"),exact:true})).toBeVisible();
    expect(state.draft?.payload.locale).toBe(locale);
    // Consents are intentionally not pre-consented by autosave or AI.
    for (const checkbox of await form.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

test("Master application photo document uses the private verified upload path and resumes without losing it", async ({ page }) => {
  const state = await applicationDraftFixture(page);
  state.draft = { revision: 1, payload: {...completeDraft(), step:4} };
  const path = `${user.id}/documents/fixture-license.png`;
  const calls: string[] = [];
  await page.route("**/api/salon/application/documents/prepare", route => {
    calls.push("prepare"); expect(route.request().postDataJSON().mime_type).toBe("image/png");
    return route.fulfill({ json: { upload_id:"11111111-1111-4111-8111-111111111112", bucket:"application-documents", path, token:"fixture-signed-upload" } });
  });
  await page.route(`${provider}/storage/v1/object/upload/sign/**`, route => { calls.push("upload"); return route.fulfill({ json: { Key:path } }); });
  await page.route("**/api/salon/application/documents/finalize", route => { calls.push("finalize"); expect(route.request().postDataJSON().path).toBe(path); return route.fulfill({json:{uploaded:true,path}}); });
  await page.goto("/business/apply");
  await applicationForm(page).locator('input[type="file"]').setInputFiles({name:"license.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCWQAAAAASUVORK5CYII=","base64")});
  await expect(page.getByText("Private document 1",{exact:true})).toBeVisible();
  await expect.poll(()=>state.draft?.payload.documents).toEqual([path]);
  await expect(applicationForm(page).getByRole("status")).toContainText("Progress saved.");
  expect(calls).toEqual(["prepare","upload","finalize"]);
  await page.reload();
  await expect(page.getByText("Private document 1",{exact:true})).toBeVisible();
});
