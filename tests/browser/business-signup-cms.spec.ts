import { expect, test as coreTest, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test as hydrationTest } from "./helpers/hydration";
import { createBusinessCmsApiFixture } from "./helpers/businessCmsApiFixture";
import { replaceTranslatedText, recordTranslationErrors } from "./helpers/translation";
import { BUSINESS_SIGNUP_CONTENT_LABEL, BUSINESS_SIGNUP_SECTION_TYPES, DEFAULT_BUSINESS_SIGNUP_CONTENT, decodeBusinessSignupContent, type BusinessSignupSectionType } from "../../src/lib/businessSignupContent";

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

async function addSection(page: Page, type: BusinessSignupSectionType, index = 1) {
  await page.getByLabel("New section type", { exact: true }).selectOption(type);
  await page.getByRole("button", { name: "Add page section", exact: true }).click();
  const section = page.locator("[data-business-section-editor]").nth(index - 1);
  const label = `Section ${index}`;
  await section.getByLabel(`${label} heading`, { exact: true }).fill(`Editable ${type} section`);
  await section.getByLabel(`${label} body`, { exact: true }).fill("Real editable copy for independent beauty professionals.");
  const image = async (prefix: string) => {
    await section.getByLabel(`${prefix} existing asset URL`, { exact: true }).fill("/images/business/hair-service.avif");
    await section.getByLabel(`${prefix} alt text`, { exact: true }).fill("A beauty professional at work");
  };
  if (type === "image_text") await image(`${label} image`);
  if (type === "features") {
    await section.getByRole("button", { name: "Add feature", exact: true }).click();
    await section.getByLabel(`${label} feature 1 heading`, { exact: true }).fill("Support for your business");
    await section.getByLabel(`${label} feature 1 body`, { exact: true }).fill("Useful tools in one place.");
  }
  if (type === "stats") {
    await section.getByRole("button", { name: "Add number", exact: true }).click();
    await section.getByLabel(`${label} number 1 value`, { exact: true }).fill("8");
    await section.getByLabel(`${label} number 1 label`, { exact: true }).fill("Business categories");
  }
  if (type === "quote") await section.getByLabel(`${label} quote author`, { exact: true }).fill("Example founder");
  if (type === "cta") {
    await section.getByLabel(`${label} action label`, { exact: true }).fill("Explore businesses");
    await section.getByLabel(`${label} action destination`, { exact: true }).fill("/businesses");
  }
  if (type === "faq") {
    await section.getByRole("button", { name: "Add question", exact: true }).click();
    await section.getByLabel(`${label} question 1`, { exact: true }).fill("Can I choose my category?");
    await section.getByLabel(`${label} answer 1`, { exact: true }).fill("Choose the category that describes your business.");
  }
  if (type === "gallery") {
    await section.getByRole("button", { name: "Add gallery image", exact: true }).click();
    await image(`${label} gallery image 1`);
  }
  if (type === "media") {
    await section.getByLabel(`${label} media type`, { exact: true }).selectOption("image");
    await image(`${label} media`);
  }
  return section;
}

for (const type of BUSINESS_SIGNUP_SECTION_TYPES) {
  test(`Business Signup CMS adds, privately previews and publishes the ${type} module`, async ({ page, cms }) => {
    await page.goto(cms.editorUrl);
    const section = await addSection(page, type);
    const id = await section.getAttribute("data-business-section-editor");
    await page.getByRole("button", { name: "Preview draft", exact: true }).click();
    const preview = page.getByRole("region", { name: "Unpublished business signup preview", exact: true });
    await expect(preview.locator(`[data-business-section="${id}"]`)).toContainText(`Editable ${type} section`);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect.poll(() => cms.api.events.map(event => event.action)).toEqual(["save_draft"]);
    await cms.publicPage.goto(cms.publicUrl);
    await expect(cms.publicPage.locator("[data-business-section]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish page", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Publish page", exact: true }).click();
    await expect.poll(() => cms.api.events.map(event => event.action)).toEqual(["save_draft", "publish"]);
    await cms.publicPage.reload();
    const published = cms.publicPage.locator(`[data-business-section="${id}"]`);
    await expect(published).toBeVisible();
    await expect(published).toHaveAttribute("data-section-type", type);
    await expect(published.getByRole("heading", { name: `Editable ${type} section`, exact: true })).toBeVisible();
    if (type === "faq") {
      await published.locator("summary").focus();
      await cms.publicPage.keyboard.press("Enter");
      await expect(published.getByText("Choose the category that describes your business.", { exact: true })).toBeVisible();
    }
    if (type === "cta") await expect(published.getByRole("link", { name: "Explore businesses" })).toHaveAttribute("href", "/businesses");
    const accessibility = await new AxeBuilder({ page: cms.publicPage }).include(".business-onboarding").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.reload();
    await expect(page.locator(`[data-business-section-editor="${id}"]`)).toHaveAttribute("data-section-type", type);
  });
}

test("Business Signup CMS independently replaces all eight category images without changing identity or destinations", async ({ page, cms }) => {
  await page.goto(cms.editorUrl);
  const categories = DEFAULT_BUSINESS_SIGNUP_CONTENT.categories;
  for (const [index, category] of categories.entries()) {
    await openCategory(page, category.id);
    const source = categories[(index + 1) % categories.length].image.src;
    await page.getByLabel(`${category.id} card image existing asset URL`, { exact: true }).fill(source);
    await page.getByLabel(`${category.id} card image alt text`, { exact: true }).fill(`Independently edited ${category.id}`);
  }
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect.poll(() => cms.api.events.length).toBe(1);
  await cms.publicPage.goto(cms.publicUrl);
  for (const [index, category] of categories.entries()) {
    const card = cms.publicPage.locator(`[data-business-category="${category.id}"]`);
    await expect(card.locator("img")).toHaveAttribute("src", categories[(index + 1) % categories.length].image.src);
    await expect(card.locator("img")).toHaveAttribute("alt", `Independently edited ${category.id}`);
    await expect(card).toHaveAttribute("href", category.id === "hair-salon-braiding" ? "/business/signup/hair" : `/business/waitlist?category=${category.id}`);
  }
});

test("Business Signup CMS reorders, places, hides and removes modules and optional hero copy", async ({ page, cms }) => {
  await page.goto(cms.editorUrl);
  await page.getByRole("button", { name: "Add hero text", exact: true }).click();
  await page.getByLabel("Hero additional text 1", { exact: true }).fill("First optional paragraph");
  await page.getByRole("button", { name: "Add hero text", exact: true }).click();
  await page.getByLabel("Hero additional text 2", { exact: true }).fill("Second optional paragraph");
  await page.getByRole("button", { name: "Move hero text 2 up", exact: true }).click();
  await expect(page.getByLabel("Hero additional text 1", { exact: true })).toHaveValue("Second optional paragraph");
  await page.getByLabel("Show hero additional text 2", { exact: true }).uncheck();
  await addSection(page, "text");
  await addSection(page, "quote", 2);
  await page.getByRole("button", { name: "Move section 2 up", exact: true }).click();
  await page.getByLabel("Section 1 placement", { exact: true }).selectOption("after_hero");
  await page.getByLabel("Section 1 quote author", { exact: true }).fill("");
  await page.getByRole("button", { name: "Preview draft", exact: true }).click();
  const preview = page.getByRole("region", { name: "Unpublished business signup preview", exact: true });
  await expect(preview.locator("[data-hero-text]")).toHaveText(["Second optional paragraph"]);
  await expect(preview.locator('[data-section-placement="after_hero"] [data-section-type="quote"]')).toBeVisible();
  await expect(preview.locator('[data-section-placement="after_selector"] [data-section-type="text"]')).toBeVisible();
  await expect(preview.locator("figcaption")).toHaveCount(0);
  expect(await preview.locator(".business-lower").evaluate(element => [...element.children].map(child => child.getAttribute("data-section-placement") || child.className))).toEqual(["after_hero", "business-type-selector", "after_selector", "business-trust"]);
  await page.getByLabel("Show business selector", { exact: true }).uncheck();
  await page.getByLabel("Section 2 enabled", { exact: true }).uncheck();
  await expect(preview.locator(".business-type-selector")).toHaveCount(0);
  await expect(preview.locator("[data-business-section]")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove section 2", exact: true }).click();
  await page.getByRole("button", { name: "Remove hero text 2", exact: true }).click();
  await page.getByRole("button", { name: "Remove hero text 1", exact: true }).click();
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect.poll(() => cms.api.events.length).toBe(1);
  const content = decodeBusinessSignupContent(cms.api.published?.labels);
  expect(content.hero.textBlocks).toEqual([]);
  expect(content.sections).toHaveLength(1);
  expect(content.selector.visible).toBe(false);
  await cms.publicPage.goto(cms.publicUrl);
  await expect(cms.publicPage.locator("[data-business-section]")).toHaveCount(1);
  await expect(cms.publicPage.locator("[data-business-category]")).toHaveCount(0);
});

test("Business Signup CMS keeps long hero copy within mobile bounds and provides an image-logo failure fallback", async ({ page, cms }) => {
  await page.goto(cms.editorUrl);
  await page.getByLabel("Logo mode", { exact: true }).selectOption("image");
  await page.getByLabel("Logo text", { exact: true }).fill("Founder brand");
  await page.getByLabel("Logo image existing asset URL", { exact: true }).fill("/images/business/unavailable-logo.png");
  await page.getByLabel("Logo image alt text", { exact: true }).fill("Founder brand");
  await page.getByRole("button", { name: "Add hero text", exact: true }).click();
  await page.getByLabel("Hero additional text 1", { exact: true }).fill("A".repeat(600));
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect.poll(() => cms.api.events.length).toBe(1);
  await cms.publicPage.setViewportSize({ width: 390, height: 844 });
  const missingLogo = cms.publicPage.waitForResponse(response => new URL(response.url()).pathname === "/images/business/unavailable-logo.png");
  await cms.publicPage.goto(cms.publicUrl);
  expect((await missingLogo).status()).toBe(404);
  await expect(cms.publicPage.locator(".business-logo-fallback")).toHaveText("Founder brand");
  expect(await cms.publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Business Signup CMS preserves versioned sections through schedule, unpublish, archive, restore and audit events", async ({ page, cms }) => {
  await page.goto(cms.editorUrl);
  await addSection(page, "text");
  await page.getByLabel("Schedule date and time", { exact: true }).fill("2099-09-11T12:00");
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect.poll(() => cms.api.events.map(event => event.action)).toEqual(["schedule"]);
  expect(cms.api.record.status).toBe("Scheduled");
  expect(decodeBusinessSignupContent(cms.api.published?.labels).sections).toBeUndefined();
  const scheduled = cms.api.record.scheduled_payload as Record<string, unknown>;
  expect(decodeBusinessSignupContent(scheduled.labels).sections?.[0].heading).toBe("Editable text section");
  await cms.publicPage.goto(cms.publicUrl);
  await expect(cms.publicPage.locator("[data-business-section]")).toHaveCount(0);
  for (const [button, action] of [["Unpublish", "unpublish"], ["Archive", "archive"], ["Restore as draft", "restore"]] as const) {
    const before = cms.api.events.length;
    await expect(page.getByRole("button", { name: button, exact: true })).toBeEnabled();
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect.poll(() => cms.api.events.length).toBe(before + 1);
    expect(cms.api.events.at(-1)?.action).toBe(action);
    expect(await cms.readPublished()).toBeNull();
  }
  await expect(page.getByLabel("Section 1 heading", { exact: true })).toHaveValue("Editable text section");
  await expect(page.getByRole("button", { name: "Publish page", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expect.poll(() => cms.api.events.map(event => event.action)).toEqual(["schedule", "unpublish", "archive", "restore", "publish"]);
  expect(cms.api.events.every(event => event.before.id === event.after.id)).toBe(true);
  await cms.publicPage.reload();
  await expect(cms.publicPage.getByRole("heading", { name: "Editable text section", exact: true })).toBeVisible();
});

test("Business Signup composition survives translated heading replacement while its content changes", async ({ page, cms }) => {
  const errors = recordTranslationErrors(page);
  await page.goto(cms.editorUrl);
  await page.getByRole("button", { name: "Preview draft", exact: true }).click();
  const preview = page.getByRole("region", { name: "Unpublished business signup preview", exact: true });
  expect(await replaceTranslatedText(preview.locator("#business-hero-title"))).toBeGreaterThan(0);
  await page.getByLabel("Hero heading", { exact: true }).fill("New founder heading");
  await expect(preview.getByRole("heading", { name: "New founder heading", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [390, 768, 1440, 1920]) {
  test(`Business Signup CMS editor and private modular preview remain usable at ${width}px`, async ({ page, cms }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(cms.editorUrl);
    await expect(page.getByLabel("Hero heading", { exact: true })).toBeVisible();
    const actions = page.getByTestId("business-signup-cms-form").locator(":scope > .sticky");
    await expect(actions).toHaveCSS("position", "sticky");
    await page.screenshot({ path: testInfo.outputPath(`cms-editor-${width}.png`) });
    const section = await addSection(page, "image_text");
    await section.getByLabel("Section 1 placement", { exact: true }).selectOption("after_hero");
    await page.getByRole("button", { name: "Preview draft", exact: true }).click();
    const preview = page.getByRole("region", { name: "Unpublished business signup preview", exact: true });
    await expect(actions).toHaveCSS("position", "static");
    await expect(preview.getByRole("heading", { name: "Editable image_text section", exact: true })).toBeVisible();
    await preview.evaluate(async element => { await document.fonts.ready; await Promise.all([...element.querySelectorAll("img")].map(image => image.decode().catch(() => {}))); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await preview.screenshot({ path: testInfo.outputPath(`cms-private-preview-${width}.png`) });
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`cms-section-controls-${width}.png`) });
    await expect(page.getByRole("button", { name: "Remove section 1", exact: true })).toBeEnabled();
    expect(cms.api.events).toEqual([]);
  });
}
