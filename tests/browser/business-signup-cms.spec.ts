import { expect, test as coreTest, type Page } from "@playwright/test";
import { test as hydrationTest } from "./helpers/hydration";
import { createBusinessCmsApiFixture } from "./helpers/businessCmsApiFixture";
import { BUSINESS_SIGNUP_CONTENT_LABEL, DEFAULT_BUSINESS_SIGNUP_CONTENT, decodeBusinessSignupContent } from "../../src/lib/businessSignupContent";

type CmsFixture = {
  api: ReturnType<typeof createBusinessCmsApiFixture>;
  publicPage: Page;
  editorUrl: string;
  publicUrl: string;
  readPublished: () => Promise<Record<string, unknown> | null>;
};
const test = hydrationTest.extend<{ cms: CmsFixture }>({
  cms: async ({ page, context, request }, provide) => {
    const scope = crypto.randomUUID();
    const api = createBusinessCmsApiFixture(scope);
    const provider = new URL(process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL || "http://127.0.0.1:3105");
    if (!["127.0.0.1", "localhost"].includes(provider.hostname)) throw new Error("CMS acceptance writes are restricted to the local fixture.");
    const fixtureUrl = new URL(`/__fixtures/business-signup/${scope}`, provider).toString();
    const syncPublic = async (record: unknown) => {
      const response = await request.post(fixtureUrl, { headers: { "x-acceptance-fixture": "business-signup-cms" }, data: { record } });
      expect(response.status()).toBe(200);
    };
    await syncPublic(api.published);
    await page.route("**/api/admin/content", async route => {
      const method = route.request().method();
      expect(["GET", "PUT"]).toContain(method);
      const accessToken = route.request().headers().authorization?.replace(/^Bearer /, "");
      const result = await api.request(method as "GET" | "PUT", method === "PUT" ? route.request().postDataJSON() : undefined, accessToken || "");
      if (result.ok && method === "PUT") await syncPublic(api.published);
      await route.fulfill({ status: result.status, contentType: "application/json", body: await result.text() });
    });
    const publicPage = await context.newPage();
    const publicErrors: string[] = [];
    publicPage.on("pageerror", error => publicErrors.push(error.message));
    const editorUrl = `/internal/acceptance/business-cms?scope=${scope}`;
    const publicUrl = `${editorUrl}&view=published`;
    const readPublished = async () => {
      const response = await request.post(new URL("/rest/v1/rpc/get_public_content_page", provider).toString(), { data: { p_slug: `business-signup-acceptance-${scope}` } });
      expect(response.status()).toBe(200);
      return await response.json() as Record<string, unknown> | null;
    };
    try {
      await provide({ api, publicPage, editorUrl, publicUrl, readPublished });
      expect(api.operationalFailures).toEqual([]);
      expect(publicErrors).toEqual([]);
    } finally {
      await syncPublic(null);
      await publicPage.close();
    }
  },
});

async function openCategory(page: Page, id: string) {
  const entry = page.locator("details").filter({ has: page.getByText(`Stable identity: ${id}`, { exact: true }) });
  if ((await entry.getAttribute("open")) === null) await entry.locator("summary").click();
  return entry;
}

test("Business Signup CMS edits draft content, previews it privately, and publishes the retained snapshot", async ({ page, cms }) => {
  test.setTimeout(90_000);
  await page.goto(cms.editorUrl);
  const editor = page.getByTestId("business-signup-content-editor");
  await expect(page.getByRole("heading", { name: "Business Signup Landing Page", exact: true })).toBeVisible();
  for (const name of ["A. Header", "B. Hero", "C. Business Selector", "D. Business Categories", "E. Waitlist", "F. Trust Section"]) await expect(editor.getByRole("group", { name, exact: true })).toBeVisible();
  await cms.publicPage.goto(cms.publicUrl);
  await expect(cms.publicPage.getByRole("heading", { name: DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.heading, exact: true })).toBeVisible();

  await editor.getByLabel("Hero heading", { exact: true }).fill("Build Your Beauty Business");
  await editor.getByLabel("Hero supporting text", { exact: true }).fill("An edited invitation for independent beauty businesses.");
  await editor.getByLabel("Logo mode", { exact: true }).selectOption("image");
  await editor.getByLabel("Logo image existing asset URL", { exact: true }).fill("/images/business/other-service.avif");
  await editor.getByLabel("Logo image alt text", { exact: true }).fill("Edited business identity");
  await editor.getByLabel("Logo size", { exact: true }).selectOption("small");
  await editor.getByLabel("Hero media existing asset URL", { exact: true }).fill("/images/business/facial-service.avif");
  await editor.getByLabel("Hero media alt text", { exact: true }).fill("Edited hero scene");
  await editor.getByLabel("Hero media focal X", { exact: true }).fill("25");
  await editor.getByLabel("Hero media focal Y", { exact: true }).fill("65");
  await editor.getByLabel("Hero overlay", { exact: true }).selectOption("strong");
  await editor.getByLabel("Selector heading", { exact: true }).fill("Find Your Business Type");
  await editor.getByLabel("Selector supporting text", { exact: true }).fill("Choose your independent business category.");
  await openCategory(page, "nail-studio");
  await editor.getByLabel("nail-studio display name", { exact: true }).fill("Nail Artists");
  await editor.getByLabel("nail-studio card image existing asset URL", { exact: true }).fill("/images/business/lashes-service.avif");
  await editor.getByLabel("nail-studio card image alt text", { exact: true }).fill("Edited nail category photo");
  await editor.getByLabel("nail-studio order", { exact: true }).fill("0");
  await openCategory(page, "hair-salon-braiding");
  await editor.getByLabel("hair-salon-braiding order", { exact: true }).fill("7");
  await openCategory(page, "massage-wellness");
  await editor.getByLabel("massage-wellness visible", { exact: true }).uncheck();
  await editor.getByLabel("built-for-you heading", { exact: true }).fill("Built Around Your Business");
  await editor.getByLabel("built-for-you description", { exact: true }).fill("Edited support for independent professionals.");
  await editor.getByLabel("built-for-you icon", { exact: true }).selectOption("heart");
  await editor.getByLabel("built-for-you order", { exact: true }).fill("2");
  await editor.getByLabel("safe-secure order", { exact: true }).fill("0");
  await editor.getByLabel("community order", { exact: true }).fill("1");
  await editor.getByLabel("Waitlist success heading", { exact: true }).fill("Thanks for joining, {businessType}");
  await editor.getByLabel("Waitlist submit label", { exact: true }).fill("Request Early Access");
  await page.getByRole("button", { name: "Preview draft", exact: true }).click();
  const preview = page.getByRole("region", { name: "Unpublished business signup preview", exact: true });
  await expect(preview.getByRole("heading", { name: "Build Your Beauty Business", exact: true })).toBeVisible();
  await expect(preview.locator('[data-business-category="nail-studio"]')).toHaveAttribute("href", "/business/waitlist?category=nail-studio");
  await expect(preview.locator('[data-business-category="massage-wellness"]')).toHaveCount(0);
  expect(cms.api.events).toHaveLength(0);
  await cms.publicPage.reload();
  await expect(cms.publicPage.getByRole("heading", { name: DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.heading, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => cms.api.events.map(event => event.action)).toEqual(["save_draft"]);
  await expect(page.getByRole("button", { name: "Publish page", exact: true })).toBeEnabled();
  expect(cms.api.record.status).toBe("Draft");
  expect(decodeBusinessSignupContent(cms.api.published?.labels).hero.heading).toBe(DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.heading);
  await page.reload();
  await expect(page.getByLabel("Hero heading", { exact: true })).toHaveValue("Build Your Beauty Business");
  await expect(page.getByLabel("Waitlist submit label", { exact: true })).toHaveValue("Request Early Access");
  await cms.publicPage.reload();
  await expect(cms.publicPage.getByRole("heading", { name: DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.heading, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect.poll(() => cms.api.events.map(event => event.action)).toEqual(["save_draft", "publish"]);
  await expect(page.getByRole("button", { name: "Publish page", exact: true })).toBeEnabled();
  expect(decodeBusinessSignupContent(cms.api.published?.labels).hero.heading).toBe("Build Your Beauty Business");
  const published = await cms.readPublished();
  expect(published).toEqual(cms.api.published);
  expect(decodeBusinessSignupContent(published?.labels).hero.heading).toBe("Build Your Beauty Business");
  expect(cms.publicPage.url()).toContain(cms.publicUrl);
  const publishedResponse = await cms.publicPage.reload();
  expect(publishedResponse?.status()).toBe(200);
  await expect(cms.publicPage.getByRole("heading", { name: "Build Your Beauty Business", exact: true })).toBeVisible();
  await expect(cms.publicPage.getByText("An edited invitation for independent beauty businesses.", { exact: true })).toBeVisible();
  await expect(cms.publicPage.getByRole("img", { name: "Edited business identity", exact: true })).toHaveAttribute("src", "/images/business/other-service.avif");
  await expect(cms.publicPage.getByAltText("Edited hero scene", { exact: true })).toHaveAttribute("src", "/images/business/facial-service.avif");
  await expect(cms.publicPage.getByAltText("Edited hero scene", { exact: true })).toHaveCSS("object-position", "25% 65%");
  await expect(cms.publicPage.getByRole("heading", { name: "Find Your Business Type", exact: true })).toBeVisible();
  await expect(cms.publicPage.locator("[data-business-category]").first()).toHaveAttribute("data-business-category", "nail-studio");
  await expect(cms.publicPage.locator('[data-business-category="nail-studio"] img')).toHaveAttribute("src", "/images/business/lashes-service.avif");
  await expect(cms.publicPage.locator('[data-business-category="nail-studio"]')).toContainText("Nail Artists");
  await expect(cms.publicPage.locator('[data-business-category="massage-wellness"]')).toHaveCount(0);
  await expect(cms.publicPage.locator("[data-business-trust]").first()).toHaveAttribute("data-business-trust", "safe-secure");
  await expect(cms.publicPage.getByRole("heading", { name: "Built Around Your Business", exact: true })).toBeVisible();
  await expect(cms.publicPage.locator('[data-business-trust="built-for-you"] svg')).toHaveClass(/lucide-heart/);
  await page.reload();
  await expect(page.getByLabel("Hero heading", { exact: true })).toHaveValue("Build Your Beauty Business");
});

test("Business Signup CMS preserves unsupported live modes in draft and refuses their publication", async ({ page, cms }) => {
  test.setTimeout(60_000);
  await page.goto(cms.editorUrl);
  await openCategory(page, "nail-studio");
  await page.getByLabel("nail-studio destination mode", { exact: true }).selectOption("live_application");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => cms.api.events.length).toBe(1);
  await expect(page.getByRole("button", { name: "Publish page", exact: true })).toBeEnabled();
  await page.reload();
  await openCategory(page, "nail-studio");
  await expect(page.getByLabel("nail-studio destination mode", { exact: true })).toHaveValue("live_application");
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect(page.getByText(/Save failed:.*no registered live application/)).toBeVisible();
  expect(cms.api.events).toHaveLength(1);
  await cms.publicPage.goto(cms.publicUrl);
  await expect(cms.publicPage.locator('[data-business-category="nail-studio"]')).toHaveAttribute("href", "/business/waitlist?category=nail-studio");
  await page.getByLabel("nail-studio destination mode", { exact: true }).selectOption("waitlist");
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect.poll(() => cms.api.events.length).toBe(2);
  await expect(page.getByRole("button", { name: "Publish page", exact: true })).toBeEnabled();
});

test("Business Signup CMS toggles registered Hair mode safely and preserves hidden logo, login and trust controls", async ({ page, cms }) => {
  test.setTimeout(60_000);
  await page.goto(cms.editorUrl);
  await page.getByLabel("Show logo", { exact: true }).uncheck();
  await page.getByLabel("Show login area", { exact: true }).uncheck();
  await page.getByLabel("community visible", { exact: true }).uncheck();
  await openCategory(page, "hair-salon-braiding");
  await page.getByLabel("hair-salon-braiding destination mode", { exact: true }).selectOption("waitlist");
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect.poll(() => cms.api.events.length).toBe(1);
  await expect(page.getByRole("button", { name: "Publish page", exact: true })).toBeEnabled();
  await cms.publicPage.goto(cms.publicUrl);
  await expect(cms.publicPage.locator(".business-wordmark")).toHaveCount(0);
  await expect(cms.publicPage.getByRole("link", { name: "Log In", exact: true })).toHaveCount(0);
  await expect(cms.publicPage.locator('[data-business-trust="community"]')).toHaveCount(0);
  await expect(cms.publicPage.locator('[data-business-category="hair-salon-braiding"]')).toHaveAttribute("href", "/business/waitlist?category=hair-salon-braiding");
  await page.reload();
  await openCategory(page, "hair-salon-braiding");
  await page.getByLabel("hair-salon-braiding destination mode", { exact: true }).selectOption("live_application");
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect.poll(() => cms.api.events.length).toBe(2);
  await expect(page.getByRole("button", { name: "Publish page", exact: true })).toBeEnabled();
  await cms.publicPage.reload();
  await expect(cms.publicPage.locator('[data-business-category="hair-salon-braiding"]')).toHaveAttribute("href", "/business/signup/hair");
});

coreTest("Business Signup CMS route rejects stale revisions and unsafe content without altering its published snapshot", async () => {
  const api = createBusinessCmsApiFixture(crypto.randomUUID());
  const before = api.published;
  const stale = await api.request("PUT", { type: "page", action: "publish", payload: { ...api.record, expected_updated_at: "stale" } });
  expect(stale.status).toBe(409);
  const content = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  content.header.login.href = "javascript:alert(1)";
  const unsafe = await api.request("PUT", { type: "page", action: "publish", payload: { ...api.record, expected_updated_at: api.record.updated_at, labels: { [BUSINESS_SIGNUP_CONTENT_LABEL]: JSON.stringify(content) } } });
  expect(unsafe.status).toBe(400);
  const denied = await api.request("GET", undefined, "synthetic-user-without-content-permission");
  expect(denied.status).toBe(403);
  expect(api.events).toEqual([]);
  expect(api.published).toEqual(before);
});

coreTest("Business Signup CMS route retains its published version across draft save and publishes the edited snapshot", async () => {
  const api = createBusinessCmsApiFixture(crypto.randomUUID());
  const initialRead = await api.request("GET");
  expect(initialRead.status).toBe(200);
  expect((await initialRead.json()).pages).toHaveLength(1);
  const content = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  content.hero.heading = "A new published business heading";
  const draft = await api.request("PUT", { type: "page", action: "save_draft", payload: { ...api.record, expected_updated_at: api.record.updated_at, labels: { [BUSINESS_SIGNUP_CONTENT_LABEL]: JSON.stringify(content) } } });
  expect(draft.status).toBe(200);
  expect(api.record.status).toBe("Draft");
  expect(decodeBusinessSignupContent(api.record.labels).hero.heading).toBe(content.hero.heading);
  expect(decodeBusinessSignupContent(api.published?.labels).hero.heading).toBe(DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.heading);
  const publish = await api.request("PUT", { type: "page", action: "publish", payload: { ...api.record, expected_updated_at: api.record.updated_at } });
  expect(publish.status).toBe(200);
  expect(api.record.status).toBe("Published");
  expect(decodeBusinessSignupContent(api.published?.labels).hero.heading).toBe(content.hero.heading);
  expect(api.events.map(event => event.action)).toEqual(["save_draft", "publish"]);
  expect(api.operationalFailures).toEqual([]);
});
