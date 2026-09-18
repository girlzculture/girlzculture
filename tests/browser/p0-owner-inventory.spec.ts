import { expect } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { ownerReleaseLocales } from './helpers/releaseLocales';
import { untranslatedOwnerCopy } from './helpers/ownerLocaleCoverage';
import { mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';

// Keep every request inside the local page.route fixture in WebKit.
test.use({ serviceWorkers: 'block' });

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
  for (const locale of ownerReleaseLocales) {
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
        if (route === 'settings/member-new') {
          // The team editor loads its own authorized data after the workspace
          // mounts. Animation frames alone cannot wait for that response or
          // the following localization scan; assert the actual form is ready.
          const heading = DASHBOARD_SOURCE_MESSAGES[locale]?.['Add User'] || 'Add User';
          await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        }
        // Wait for the localization observer's scheduled scan after route mount.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (route === 'availability') {
          const source = "Manage your team's schedule in {value0}.";
          const expected = (DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source).replace('{value0}', 'America/New York');
          await expect(page.getByText(expected, { exact: true })).toBeVisible();
        }
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
