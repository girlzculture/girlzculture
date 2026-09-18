import { expect } from "@playwright/test";
import { test } from "./helpers/hydration";
import { p0OwnerFixture } from "./helpers/p0OwnerFixture";
import { expectOwnerLocaleCoverage } from "./helpers/ownerLocaleCoverage";
import { DASHBOARD_SOURCE_MESSAGES } from "../../src/i18n/dashboard-source-catalog";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { screenshotCaret } from "./helpers/hydration";

// WebKit service-worker fetches bypass page.route. This suite owns an explicit
// local API fixture; the dedicated PWA suite exercises real service workers.
test.use({ serviceWorkers: 'block' });

for (const width of [390, 768, 1440]) test(`P0 owner core language flow translates complete scheduling sentences at ${width}px`, async ({ page }, info) => {
  const fixture = await p0OwnerFixture(page);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.goto('/salon/dashboard/availability');
  await expect(page.locator('[data-owner-workspace]')).toBeVisible();
  const source = 'Choose one scheduling workspace. Appointments are shown in {value0}.';
  const gallery = `docs/screenshots/p0/${info.project.name}`;
  await mkdir(gallery, { recursive: true });
  for (const locale of ['en', 'fr', 'wo', 'es', 'zh-CN']) {
    await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first().selectOption(locale);
    await expect.poll(fixture.accountLocale).toBe(locale);
    const expected = (DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source).replace('{value0}', 'America/New York');
    await expect(page.getByText(expected, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `${gallery}/specific-availability-${locale}-${width}.png`, ...screenshotCaret });
  }
  expect(fixture.unexpected).toEqual([]);
});

test("P0 owner core language flow retains account preference and original business text", async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await p0OwnerFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/salon/dashboard/my-page/business-policies");
  await expect(page.getByRole("heading", { name: "Your Business Policies", exact: true })).toBeVisible();
  for (const locale of ["fr", "wo", "es", "zh-CN", "en"]) {
    const t = (text: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[text] || text;
    const selector = page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first();
    await selector.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect.poll(fixture.accountLocale).toBe(locale);
    await expect(page.getByRole('heading', { name: t('Your Business Policies'), exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'GC Assistant' });
    await dialog.getByRole('button', { name: t('My business profile'), exact: true }).click();
    const reply = dialog.locator('article').last().locator('[data-no-translate]').last();
    await expect(reply).toContainText('Original owner description');
    await expect(reply).toContainText(/\bSave\b/);
    await expect(dialog.locator('article').last().locator('dl')).toHaveCount(0);
    await dialog.getByRole('button', { name: t('Close GC Assistant') }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { name: t('Your Business Policies'), exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(fixture.unexpected).toEqual([]);
});

for (const width of [390, 768, 1440]) {
  test(`P0 policy publication and Assistant review at ${width}px in every locale`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const fixture = await p0OwnerFixture(page, { planning: true });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('/salon/dashboard/my-page/business-policies');
    await expect(page.getByRole('heading', { name: 'Your Business Policies', exact: true })).toBeVisible();
    const gallery = `docs/screenshots/p0/${testInfo.project.name}`;
    await mkdir(gallery, { recursive: true });
    for (const locale of ['en', 'fr', 'wo', 'es', 'zh-CN']) {
      const t = (text: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[text] || text;
      await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first().selectOption(locale);
      await expect.poll(fixture.accountLocale).toBe(locale);
      await page.locator('form').getByText(t('Booking rules'), { exact: true }).click();
      const cancellation = page.getByLabel(t('Cancellation notice (hours)'), { exact: true });
      await cancellation.fill('-1');
      const actionCount = fixture.actions.length;
      await page.getByRole('button', { name: t('Save draft and review'), exact: true }).click();
      await expect.poll(() => cancellation.evaluate((node: HTMLInputElement) => node.validationMessage)).toBe(t('Enter a value within the allowed range.'));
      expect(fixture.actions).toHaveLength(actionCount);
      await cancellation.fill('24');
      const notes = page.getByLabel(t('Business Policy'), { exact: true });
      await notes.fill('Original policy — Save, $180, GC123');
      await page.getByRole('button', { name: t('Save draft and review'), exact: true }).click();
      await expect(page.getByRole('heading', { name: t('Review policy draft'), exact: true })).toBeVisible();
      const publish = page.getByRole('button', { name: t('Confirm and publish'), exact: true });
      await expect(publish).toBeDisabled();
      expect(fixture.revisions.filter(row => row.published_at)).toHaveLength(['en', 'fr', 'wo', 'es', 'zh-CN'].indexOf(locale));
      await page.getByRole('checkbox').check();
      await publish.click();
      await expect(page.getByRole('status').filter({ hasText: t('Business policies published.') })).toBeVisible();
      await expect(notes).toHaveValue('Original policy — Save, $180, GC123');
      await expectOwnerLocaleCoverage(page, locale);
      const audit = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(audit.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${gallery}/policies-${locale}-${width}.png`, fullPage: true, ...screenshotCaret });
      await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'GC Assistant' });
      await dialog.locator('textarea').fill('Aidez-moi à modifier ma présentation.');
      await dialog.getByRole('button', { name: t('Ask GC Assistant'), exact: true }).click();
      await expect(dialog.getByRole('heading', { name: t('Review this draft'), exact: true }).last()).toBeVisible();
      await page.screenshot({ path: `${gallery}/assistant-preview-${locale}-${width}.png`, ...screenshotCaret });
      const pending = fixture.actions.filter(action => action.action === 'confirm').length;
      expect(pending).toBe(['en', 'fr', 'wo', 'es', 'zh-CN'].indexOf(locale));
      await dialog.getByRole('button', { name: t('Confirm this public action'), exact: true }).click();
      await expect(dialog.getByRole('status').filter({ hasText: t('Your change was saved and verified.') }).last()).toBeVisible();
      expect(fixture.business.description).toBe('Texte original vérifié — $180');
      await page.screenshot({ path: `${gallery}/assistant-confirmed-${locale}-${width}.png`, ...screenshotCaret });
      await dialog.getByRole('button', { name: t('Close GC Assistant'), exact: true }).click();
    }
    expect(fixture.unexpected).toEqual([]);
  });
}
