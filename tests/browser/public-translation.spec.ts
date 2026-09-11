import { expect } from "@playwright/test";
import { test } from "./helpers/hydration";
import { expectHealthyTranslatedPage, recordTranslationErrors, replaceTranslatedText } from "./helpers/translation";

// These tests intercept the localization and waitlist responses. Blocking service
// workers keeps those local fixtures authoritative; actual SW behavior is tested
// separately with the real worker and a disconnected network origin.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "gc_locale", value: "fr", url: baseURL! }]);
  await page.addInitScript(() => localStorage.setItem("girlz-culture-locale", "fr"));
});

for (const path of ["/", "/businesses", "/business/signup", "/business/waitlist?category=nail-studio", "/salons", "/styles", "/login", "/business/login", "/help"]) {
  test(`public source remains English and translation-enabled at ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    // Check the actual server HTML, not only a client effect correcting lang.
    expect(await response!.text()).toMatch(/<html[^>]*lang="en"/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("body")).toHaveAttribute("translate", "yes");
    await expect(page.locator('select[aria-label="Select language"], [data-language-selector-host] select')).toHaveCount(0);
    await expect(page.locator('meta[name="google"][content*="notranslate"], html.notranslate, body.notranslate, html[translate="no"], body[translate="no"]')).toHaveCount(0);
    await expect(page.locator("main")).not.toBeEmpty();
  });
}

test("public SSR ignores spoofed localization headers but internal locale selection remains available", async ({ page, request, context }) => {
  const publicResponse = await request.get("/business/signup", { headers: {
    cookie: "gc_locale=fr", "x-gc-render-path": "/admin", "x-gc-dashboard-surface": "admin",
  } });
  expect(await publicResponse.text()).toMatch(/<html[^>]*lang="en"/);
  const errors = recordTranslationErrors(page);
  await page.route("**/api/i18n?*", (route) => route.fulfill({ json: {
    messages: {}, sourceMessages: new URL(route.request().url()).searchParams.get("locale") === "fr" ? { "Admin Login": "Connexion équipe" } : {},
    coverage: { published: 1, total: 1, incomplete: false },
    locales: [
      { locale: "en", native_name: "English", text_direction: "ltr" },
      { locale: "fr", native_name: "Français", text_direction: "ltr" },
    ],
  } }));
  const internalResponse = await page.goto("/admin/login");
  expect(await internalResponse!.text()).toMatch(/<html[^>]*lang="fr"/);
  const selector = page.locator("[data-language-selector-host] select");
  await expect(selector).toHaveValue("fr");
  await expect(page.locator("h1")).toHaveText("Connexion équipe");
  await selector.selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toHaveText("Admin Login");
  await expect.poll(async () => (await context.cookies()).find(cookie => cookie.name === "gc_locale")?.value).toBe("en");
  await selector.selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  // Real client navigation reuses the root provider: the internal preference
  // remains stored while the new public document returns to source English.
  await page.locator('a[href="/forgot-password"]').click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("body")).toHaveAttribute("translate", "yes");
  await page.goBack();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(selector).toHaveValue("fr");
  await expect(page.locator("h1")).toHaveText("Connexion équipe");
  await page.goto("/businesses");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect((await context.cookies()).find(cookie => cookie.name === "gc_locale")?.value).toBe("fr");
  await expectHealthyTranslatedPage(page, errors);
});

for (const delayScripts of [false, true]) test(`${delayScripts ? "delayed JavaScript: " : ""}translated salon description expands and collapses after its original text nodes are removed`, async ({ page }) => {
  const errors = recordTranslationErrors(page);
  const identity = page.getByRole("region", { name: "Salon identity fixture" });
  const toggle = identity.locator("button[aria-expanded]");
  const description = identity.locator("p").filter({ hasText: "description-word-1 " });
  if (delayScripts) {
    let releaseScripts!: () => void;
    const scriptsReleased = new Promise<void>(resolve => { releaseScripts = resolve; });
    let blockedScripts = 0;
    const scriptPattern = /\/_next\/static\/.*\.js(?:\?|$)/;
    await page.route(scriptPattern, async route => {
      blockedScripts += 1;
      await scriptsReleased;
      await route.continue();
    });
    try {
      // The response can expose visible server HTML before any client code.
      // Withhold JavaScript using an explicit gate, rather than a timer.
      await page.goto("/internal/acceptance/salon-profile", { waitUntil: "commit" });
      await expect(description).toBeVisible();
      await expect.poll(() => blockedScripts).toBeGreaterThan(0);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("[data-translator-probe]")).toHaveCount(0);
      releaseScripts();
      await page.waitForLoadState("load");
    } finally {
      releaseScripts();
      await page.unroute(scriptPattern);
    }
  } else {
    await page.goto("/internal/acceptance/salon-profile");
  }
  // Visibility/load is not a component hydration signal. Prove the actual
  // handler can expand and collapse before removing any React-owned text.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(description).toContainText("description-word-110");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(description).not.toContainText("description-word-110");
  expect(await replaceTranslatedText(description)).toBeGreaterThan(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(description).toContainText("description-word-110");
  expect(await replaceTranslatedText(description)).toBeGreaterThan(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(description).not.toContainText("description-word-110");
  await expect(description).toContainText("…");
  await expectHealthyTranslatedPage(page, errors);
});

test("translated public copy stays intact through form rerenders and client navigation", async ({ page }) => {
  const errors = recordTranslationErrors(page);
  await page.goto("/login");
  const main = page.locator("main");
  // These controls exist in SSR too; only a successful mode change proves
  // CustomerAuth has hydrated before the translator replaces its text nodes.
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByPlaceholder("Your name")).toBeVisible();
  await page.getByRole("button", { name: "Log in", exact: true }).first().click();
  await expect(page.getByPlaceholder("Your name")).toHaveCount(0);
  expect(await replaceTranslatedText(main)).toBeGreaterThan(10);
  const translatedHeading = main.locator("h1").first();
  const translatedText = await translatedHeading.textContent();
  await page.getByRole("button", { name: /Traduit.*Sign up/, exact: false }).first().click();
  await expect(page.getByPlaceholder("Your name")).toBeVisible();
  await page.getByPlaceholder("Your name").fill("Translation test");
  await page.getByPlaceholder("name@example.com").fill("translate@example.test");
  await expect(page.getByPlaceholder("Your name")).toHaveValue("Translation test");
  // A form mutation gives any erroneous global observer time to run, without
  // relying on a sleep or a proprietary translator extension.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await translatedHeading.textContent()).toBe(translatedText);
  expect(translatedText).toContain("Traduit  ");
  await page.locator('form a[href="/salons"]').click();
  await expect(page).toHaveURL(/\/salons$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expectHealthyTranslatedPage(page, errors);
});

test("translated business links and waitlist form retain category identity and submit normally", async ({ page }) => {
  const errors = recordTranslationErrors(page);
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/support", async (route) => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, ticketId: "11111111-1111-4111-8111-111111111111" } });
  });
  // The landing has no state toggle of its own. Mount it through a real client
  // navigation from an interactive waitlist, preserving a document marker.
  await page.goto("/business/waitlist?category=nail-studio");
  await page.locator('[name="business_phone"]').fill("2125550123");
  await expect(page.locator('[name="business_phone"]')).toHaveValue("+1 (212) 555-0123");
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__translationNavigationProbe = "ready"; });
  await page.getByRole("link", { name: "All business types", exact: true }).click();
  await expect(page).toHaveURL(/\/business\/signup$/);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__translationNavigationProbe)).toBe("ready");
  expect(await replaceTranslatedText(page.locator("main"))).toBeGreaterThan(10);
  await page.locator('a[href="/business/waitlist?category=nail-studio"]').click();
  await expect(page).toHaveURL(/\/business\/waitlist\?category=nail-studio$/);
  await page.locator('[name="business_phone"]').fill("2125550123");
  await expect(page.locator('[name="business_phone"]')).toHaveValue("+1 (212) 555-0123");
  await page.locator('[name="business_phone"]').clear();
  await expect(page.locator('[name="business_phone"]')).toHaveValue("");
  expect(await replaceTranslatedText(page.locator("main"))).toBeGreaterThan(5);
  await page.locator('[name="business_name"]').fill("Nail translation studio");
  await page.locator('[name="business_address"]').fill("123 Main Street, New York, NY 10001");
  await page.locator('[name="business_phone"]').fill("2125550123");
  await page.locator('[name="business_email"]').fill("translation@example.test");
  await expect(page.locator('[name="business_type"]')).toHaveValue("Nail Studio");
  await page.locator('button[type="submit"]').click();
  await expect(page.locator(".business-waitlist-success")).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ intent: "business_waitlist", categoryId: "nail-studio", businessName: "Nail translation studio", businessEmail: "translation@example.test" });
  await page.locator('.business-waitlist-success a[href="/business/signup"]').click();
  await expect(page).toHaveURL(/\/business\/signup$/);
  await expectHealthyTranslatedPage(page, errors);
});
