import { expect } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { untranslatedOwnerCopy } from './helpers/ownerLocaleCoverage';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';

test('P0 Assistant launcher leaves ordinary owner controls unobscured', async ({ page }) => {
  await p0OwnerFixture(page, { populated: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/salon/dashboard/styles');
  const launcher = page.getByRole('button', { name: 'GC Assistant', exact: true });
  await expect(launcher).toBeVisible();
  const overlaps = await launcher.evaluate(button => {
    const a = button.getBoundingClientRect();
    return [...document.querySelectorAll('main button, main input, main select, main a')].filter(node => {
      if (node === button || !node.getClientRects().length) return false;
      const b = node.getBoundingClientRect();
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }).map(node => node.textContent?.trim() || node.getAttribute('aria-label'));
  });
  expect(overlaps).toEqual([]);
});

test('P0 booking composer translates its interface placeholder without changing the draft', async ({ page }) => {
  const fixture = await p0OwnerFixture(page, { populated: true });
  await page.goto(`/salon/dashboard/messages/${fixture.ids.booking}`);
  await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first().selectOption('fr');
  await expect.poll(fixture.accountLocale).toBe('fr');
  const composer = page.locator('#booking-message');
  await composer.fill('  Original Save $180 GCABC12  ');
  await expect(composer).toHaveAttribute('placeholder', DASHBOARD_SOURCE_MESSAGES.fr['Type a private booking message…']);
  await expect(composer).toHaveValue('  Original Save $180 GCABC12  ');
});

for (const locale of ['en', 'fr', 'wo', 'es', 'zh-CN']) for (const width of [390, 768, 1440]) {
test(`P0 populated owner saves, validation, errors and message originals in ${locale} at ${width}px`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const fixture = await p0OwnerFixture(page, { populated: true });
  const t = (source: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source;
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.goto('/salon/dashboard/styles');
  await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first().selectOption(locale);
  await expect.poll(fixture.accountLocale).toBe(locale);
  await page.goto(`/salon/dashboard/styles/${fixture.ids.service}`);
  const description = page.getByLabel(t('Description'), { exact: true });
  const original = 'Save {value1} — $180 GCABC12 https://example.test';
  await description.fill(original);
  const minimum = page.getByLabel(t('Duration minimum (hours)'), { exact: true });
  await minimum.fill('3');
  await page.getByRole('button', { name: t('Save Service'), exact: true }).click();
  await expect(page.getByText(t('Maximum duration must be equal to or greater than minimum duration.'), { exact: true })).toBeVisible();
  expect(fixture.actions.filter(action => action.table === 'styles')).toHaveLength(0);
  await minimum.fill('2');
  fixture.failNextSave();
  await page.getByRole('button', { name: t('Save Service'), exact: true }).click();
  await expect(page.getByText(t("We couldn't save this change. Please try again."), { exact: true })).toBeVisible();
  expect(fixture.records.styles[0].description).not.toBe(original);
  await expect(description).toHaveValue(original);
  await page.getByRole('button', { name: t('Save Service'), exact: true }).click();
  await expect(page.getByText(t('Saved and verified.'), { exact: true })).toBeVisible();
  expect(fixture.records.styles[0].description).toBe(original);
  expect(fixture.records.styles[0].name).toBe('Save');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(description).toHaveValue(original);
  await page.goto(`/salon/dashboard/messages/${fixture.ids.booking}`);
  const composer = page.getByLabel(t('Message'), { exact: true });
  await expect(composer).toHaveAttribute('placeholder', t('Type a private booking message…'));
  const displayed = page.locator('article [data-no-translate]').first();
  if (locale !== 'fr') {
    const originalButton = page.getByRole('button', { name: t('Show original'), exact: true });
    await expect(originalButton).toBeVisible();
    await expect(displayed).toContainText('GCABC12'); await expect(displayed).toContainText('$180');
    await expect(displayed).toContainText('Save');
    await originalButton.click();
  }
  expect(await displayed.textContent()).toBe(fixture.conversationMessages[0].original_body);
  await page.locator('#booking-message').fill(`  ${original}\n  `);
  const beforeSend = fixture.conversationMessages.length;
  await page.getByRole('button', { name: t('Send message'), exact: true }).click();
  await expect.poll(() => fixture.conversationMessages.length).toBe(beforeSend + 1);
  expect(fixture.conversationMessages.at(-1)?.original_body).toBe(`  ${original}\n  `);
  const gallery = `docs/screenshots/p0/${testInfo.project.name}`; await mkdir(gallery, { recursive: true });
  await page.screenshot({ path: `${gallery}/messages-original-${locale}-${width}.png`, fullPage: true, ...screenshotCaret });
  expect(fixture.conversationMessages.at(-1)?.source_locale).toBe(locale);
  expect(await untranslatedOwnerCopy(page, locale)).toEqual([]);
  const audit = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  expect(fixture.unexpected).toEqual([]);
});

}

test('P0 original service names remain unchanged when their text matches an interface translation', async ({ page }) => {
  const fixture = await p0OwnerFixture(page, { populated: true });
  await page.goto('/salon/dashboard/styles');
  await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first().selectOption('fr');
  await expect.poll(fixture.accountLocale).toBe('fr');
  const service = page.getByRole('button').filter({ hasText: '180' });
  await expect(service).toHaveCount(1);
  await expect(service.locator('b').first()).toHaveText('Save');
});

for (const locale of ['en', 'fr', 'wo', 'es', 'zh-CN']) for (const width of [390, 768, 1440]) {
test(`P0 populated owner route audit ${locale} at ${width}px`, async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await p0OwnerFixture(page, { populated: true });
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.goto('/salon/dashboard/my-page/business-policies');
  await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first().selectOption(locale);
  await expect.poll(fixture.accountLocale).toBe(locale);
  const routes = ['', 'my-page', 'styles', `styles/${fixture.ids.service}`, 'stylists', `stylists/${fixture.ids.professional}`, 'products', `products/${fixture.ids.product}`, 'availability', 'availability/calendar', 'availability/hours', 'availability/stylists', 'bookings', `bookings/${fixture.ids.booking}`, 'messages', `messages/${fixture.ids.booking}`, 'reviews', `reviews/${fixture.ids.review}`, 'promotions', 'subscription', 'settings'];
  const gallery = `docs/screenshots/p0/${testInfo.project.name}/populated-${locale}-${width}`;
  await mkdir(gallery, { recursive: true });
  const results = [];
  for (const route of routes) {
    await page.goto(`/salon/dashboard${route ? `/${route}` : ''}`);
    await expect(page.locator('[data-owner-workspace]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const untranslated = await untranslatedOwnerCopy(page, locale);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const audit = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    results.push({ route, untranslated, overflow, violations: audit.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })) });
    await page.screenshot({ path: `${gallery}/${route.replaceAll('/', '-') || 'overview'}.png`, fullPage: true, ...screenshotCaret });
  }
  await writeFile(`${gallery}/audit.json`, JSON.stringify({ results, unexpected: fixture.unexpected }, null, 2));
  expect(fixture.unexpected).toEqual([]);
  expect(results.filter(row => row.untranslated.length || row.overflow || row.violations.length)).toEqual([]);
});
}
