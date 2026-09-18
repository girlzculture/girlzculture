import { expect } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { ownerReleaseLocales } from './helpers/releaseLocales';
import { untranslatedOwnerCopy } from './helpers/ownerLocaleCoverage';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';

// Real service workers have their own suite; they bypass page.route in WebKit.
test.use({ serviceWorkers: 'block' });

for (const [width, height] of [[390, 844], [768, 1024], [844, 390], [1440, 1000]]) {
test(`P0 populated owner legacy and imported catalog order survives refresh at ${width}x${height}`, async ({ page }) => {
  test.setTimeout(60_000);
  const fixture = await p0OwnerFixture(page, { populated: true });
  await page.setViewportSize({ width, height });
  for (const [table, route] of [['styles', 'styles', '180'], ['salon_products', 'products', '25']]) {
    const base = fixture.records[table][0];
    fixture.records[table] = [
      { ...base, id: '33000000-0000-4000-8000-000000000011', name: 'Knotless', sort_order: null },
      { ...base, id: '33000000-0000-4000-8000-000000000012', name: 'Boho', sort_order: null },
      { ...base, id: '33000000-0000-4000-8000-000000000013', name: 'Silk', sort_order: null },
    ];
    await page.goto(`/salon/dashboard/${route}`);
    const names = table === 'styles' ? page.getByRole('article').locator('h3[data-no-translate]') : page.getByRole('article').locator('h2[data-no-translate]');
    await expect(names).toHaveText(['Knotless', 'Boho', 'Silk']);
    await page.reload();
    await expect(names).toHaveText(['Knotless', 'Boho', 'Silk']);
    Object.assign(fixture.records[table][0], { sort_order: 3 });
    Object.assign(fixture.records[table][1], { sort_order: 2 });
    Object.assign(fixture.records[table][2], { sort_order: 1 });
    await page.reload();
    await expect(names).toHaveText(['Silk', 'Boho', 'Knotless']);
  }
  expect(fixture.unexpected).toEqual([]);
});
}

for (const width of [390, 1440]) test(`P0 populated owner service edits survive late Engine defaults at ${width}px`, async ({ page }) => {
  const fixture = await p0OwnerFixture(page, { populated: true });
  let releaseConfig!: () => void;
  let configReady = new Promise<void>(resolve => { releaseConfig = resolve; });
  await page.route('**/api/config?keys=catalog.size_options**', async route => {
    await configReady;
    await route.fulfill({ json: { config: { 'booking.default_buffer_minutes': 60 } } });
  });
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.goto(`/salon/dashboard/styles/${fixture.ids.service}`);
  const description = page.getByLabel('Description', { exact: true });
  await expect(description).toHaveValue('Original service prose — $180 GCABC12');
  await description.fill('Original draft GC123');
  await expect(description).toHaveValue('Original draft GC123');
  const defaultsResponse = page.waitForResponse(response => response.url().includes('/api/config?keys=catalog.size_options'));
  releaseConfig();
  await defaultsResponse;
  await page.getByRole('button', { name: 'Save Service', exact: true }).click();
  await expect(page.getByText('Saved and verified.', { exact: true })).toBeVisible();
  await expect(description).toHaveValue('Original draft GC123');
  expect(fixture.records.styles[0].description).toBe('Original draft GC123');
  expect(fixture.records.styles[0].buffer_minutes).toBe(15);
  await page.reload();
  await expect(description).toHaveValue('Original draft GC123');
  configReady = new Promise<void>(resolve => { releaseConfig = resolve; });
  await page.goto('/salon/dashboard/styles/new');
  await description.fill('New original draft GC123');
  const buffer = page.getByRole('combobox', { name: 'Cleanup buffer', exact: true });
  await buffer.selectOption('30');
  const newDefaults = page.waitForResponse(response => response.url().includes('/api/config?keys=catalog.size_options'));
  releaseConfig();
  await newDefaults;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(description).toHaveValue('New original draft GC123');
  await expect(buffer).toHaveValue('30');
  // An untouched new record still adopts the Engine's configured default.
  await page.reload();
  await expect(buffer).toHaveValue('60');
  await expect(description).toHaveValue('');
});

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

for (const locale of ownerReleaseLocales) for (const width of [390, 768, 1440]) {
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
  const service = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Save', exact: true }) });
  await expect(service).toHaveCount(1);
  await expect(service.getByRole('heading', { name: 'Save', exact: true })).toHaveText('Save');
});

for (const locale of ownerReleaseLocales) for (const width of [390, 768, 1440]) {
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
