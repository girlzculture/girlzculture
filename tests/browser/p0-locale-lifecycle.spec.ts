import { expect, type Page } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import { resolveSourceTranslation } from '../../src/lib/localizationCore';

test.use({ serviceWorkers: 'block' });
const logoutLabel = resolveSourceTranslation('Log out of salon account', {}, DASHBOARD_SOURCE_MESSAGES.fr);

// Actual sign-in/sign-out client flow, backed by explicit local auth responses.
// Hosted Supabase/MFA acceptance remains a separate external dependency.
async function loginFixture(page: Page, locale = 'en', actorId?: string) {
  const fixture = await p0OwnerFixture(page, { seedSession: false, locale, actorId });
  await page.route(`${fixture.provider}/auth/v1/logout**`, route => route.fulfill({ json: {} }));
  await page.route('**/api/auth/login/start', route => route.fulfill({ json: { session: fixture.session } }));
  await page.route('**/api/auth/destination', route => route.fulfill({ json: { role: 'salon_owner', path: '/salon/dashboard/settings/security' } }));
  return fixture;
}
async function signIn(page: Page) {
  await page.goto('/business/login');
  await page.locator('input[type=email]').fill('p0-browser@example.test');
  await page.locator('#salon-password').fill('isolated-fixture-only');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/salon\/dashboard\/settings\/security$/);
  await expect(page.locator('[data-owner-workspace]')).toBeVisible();
}

test('P0 account locale survives sign-out/sign-in and a clean device without leaking to another user', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const owner = await loginFixture(page);
  await signIn(page);
  const selector = page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first();
  await selector.selectOption('fr');
  await expect.poll(owner.accountLocale).toBe('fr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.getByRole('main').getByRole('button', { name: logoutLabel, exact: true }).click();
  await expect(page).toHaveURL(/\/(?:business|salon)\/login/);
  await expect(page.locator('[data-owner-workspace]')).toHaveCount(0);
  await signIn(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  // A genuinely fresh storage partition must restore account metadata, not a
  // copied cookie or localStorage preference. The fixture mirrors its saved row.
  const device = await browser.newContext({ baseURL: new URL(page.url()).origin, serviceWorkers: 'block' });
  try {
    const second = await device.newPage();
    await loginFixture(second, owner.accountLocale());
    await signIn(second);
    await expect(second.locator('html')).toHaveAttribute('lang', 'fr');
  } finally { await device.close(); }

  // A different authenticated user in the original storage partition uses their
  // own account preference; the first user's French cache remains non-authority.
  await page.getByRole('main').getByRole('button', { name: logoutLabel, exact: true }).click();
  const teammate = await loginFixture(page, 'es', '11000000-0000-4000-8000-000000000002');
  await signIn(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(owner.accountLocale()).toBe('fr');
  expect(teammate.accountLocale()).toBe('es');
  expect(owner.unexpected).toEqual([]);
  expect(teammate.unexpected).toEqual([]);
});
