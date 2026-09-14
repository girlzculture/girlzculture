import { expect } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { untranslatedOwnerCopy } from './helpers/ownerLocaleCoverage';
import { mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

// Real owner route components, not the illustrative /internal acceptance page.
export const ownerRoutes = [
  '', 'my-page', 'my-page/business', 'my-page/description', 'my-page/address',
  'my-page/social', 'my-page/identity', 'my-page/policies', 'my-page/business-policies',
  'photos', 'photos/cover', 'photos/logo', 'photos/gallery', 'styles', 'styles/new',
  'stylists', 'stylists/new', 'products', 'products/new', 'availability',
  'availability/calendar', 'availability/hours', 'availability/slots', 'availability/stylists',
  'availability/overrides', 'bookings', 'messages', 'reviews', 'earnings', 'promotions',
  'subscription', 'settings', 'settings/account', 'settings/notifications',
  'settings/marketplace', 'settings/team', 'settings/member-new', 'settings/security',
];

for (const width of [390, 768, 1440]) {
  for (const locale of ['en', 'fr', 'wo', 'es', 'zh-CN']) {
    test(`P0 owner route inventory ${locale} at ${width}px`, async ({ page }, testInfo) => {
      test.setTimeout(300_000);
      const fixture = await p0OwnerFixture(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto('/salon/dashboard/my-page/business-policies');
      await expect(page.locator('[data-owner-workspace]')).toBeVisible();
      await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first().selectOption(locale);
      await expect.poll(fixture.accountLocale).toBe(locale);
      const gallery = `docs/screenshots/p0/${testInfo.project.name}/routes-${locale}-${width}`;
      await mkdir(gallery, { recursive: true });
      const results = [];
      for (const route of ownerRoutes) {
        await page.goto(`/salon/dashboard${route ? `/${route}` : ''}`);
        await expect(page.locator('[data-owner-workspace]')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        // Wait for the localization observer's scheduled scan after route mount.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const untranslated = await untranslatedOwnerCopy(page, locale);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        const audit = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        const violations = audit.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }));
        results.push({ route, untranslated, overflow, violations });
        await page.screenshot({ path: `${gallery}/${route.replaceAll('/', '-') || 'overview'}.png`, fullPage: true, ...screenshotCaret });
      }
      await writeFile(`${gallery}/audit.json`, JSON.stringify({ results, unexpected: fixture.unexpected }, null, 2));
      expect(fixture.unexpected, 'Every fixture request must be explicitly accounted for').toEqual([]);
      expect(results.filter(row => row.untranslated.length || row.overflow || row.violations.length), 'Owner route language, reflow and accessibility defects').toEqual([]);
    });
  }
}
