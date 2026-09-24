import { expect, type Page } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import { resolveSourceTranslation } from '../../src/lib/localizationCore';

test.use({ serviceWorkers: 'block' });
const logoutLabel = resolveSourceTranslation('Log out of salon account', {}, DASHBOARD_SOURCE_MESSAGES.fr);

test('P0 account locale translates asynchronously mounted interface copy before its next paint', async ({ page }) => {
  const fixture = await p0OwnerFixture(page, { locale: 'zh-CN' });
  await page.goto('/salon/dashboard/earnings');
  await expect(page.getByRole('heading', { name: '财务', exact: true }).first()).toBeVisible();
  // A controlled DOM commit isolates the bridge boundary used by legacy panels:
  // inspect the very next paint, not a later retry after untranslated copy flashes.
  const painted = await page.evaluate(() => new Promise(resolve => {
    const panel = document.createElement('section');
    const title = document.createElement('h2'); title.textContent = 'Transaction ledger';
    const search = document.createElement('input'); search.placeholder = 'Search customer or reference';
    const original = document.createElement('p'); original.setAttribute('translate', 'no'); original.textContent = 'Transaction ledger';
    const draft = document.createElement('textarea'); draft.textContent = 'Transaction ledger';
    panel.append(title, search, original, draft); document.querySelector('main')!.append(panel);
    requestAnimationFrame(() => {
      resolve({ title: title.textContent, placeholder: search.placeholder, original: original.textContent, draft: draft.value });
      panel.remove();
    });
  }));
  expect(painted).toEqual({
    title: resolveSourceTranslation('Transaction ledger', {}, DASHBOARD_SOURCE_MESSAGES['zh-CN']),
    placeholder: resolveSourceTranslation('Search customer or reference', {}, DASHBOARD_SOURCE_MESSAGES['zh-CN']),
    original: 'Transaction ledger', draft: 'Transaction ledger',
  });
  expect(fixture.unexpected).toEqual([]);
});

// Actual sign-in/sign-out client flow, backed by explicit local auth responses.
// Hosted Supabase/MFA acceptance remains a separate external dependency.
async function loginFixture(page: Page, locale = 'en', actorId?: string) {
  const fixture = await p0OwnerFixture(page, { seedSession: false, locale, actorId });
  // Each account switch installs a new fixture actor on the same page. Remove
  // the previous login handlers so WebKit cannot route the final switch to a
  // stale response from the prior actor.
  await page.unroute('**/api/auth/login/start');
  await page.unroute('**/api/auth/destination');
  await page.route(`${fixture.provider}/auth/v1/logout**`, route => route.fulfill({ json: {} }));
  await page.route('**/api/auth/login/start', route => route.fulfill({ json: { session: fixture.session } }));
  await page.route('**/api/auth/destination', route => route.fulfill({ json: { role: 'salon_owner', path: '/salon/dashboard/settings/security' } }));
  return fixture;
}
async function signIn(page: Page) {
  await page.goto('/business/login');
  await page.locator('input[type=email]').fill('p0-browser@example.test');
  await page.locator('#salon-password').fill('isolated-fixture-only');
  await expect(page.locator('input[type=email]')).toHaveValue('p0-browser@example.test');
  await expect(page.locator('#salon-password')).toHaveValue('isolated-fixture-only');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/salon\/dashboard\/settings\/security$/);
  await expect(page.locator('[data-owner-workspace]')).toBeVisible();
}

test('P0 account locale login waits for hydration without losing entered credentials',async({page})=>{
 const fixture=await loginFixture(page);
 let release!:()=>void;
 const scriptsReady=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/_next/static/**/*.js',async route=>{await scriptsReady;await route.continue();});
 try {
  await page.goto('/business/login',{waitUntil:'commit'});
  await expect(page.locator('input[type=email]')).toBeDisabled();
  await expect(page.locator('#salon-password')).toBeDisabled();
  await expect(page.locator('button[type=submit]')).toBeDisabled();
 } finally {release();}
 await page.locator('input[type=email]').fill('p0-browser@example.test');
 await page.locator('#salon-password').fill('isolated-fixture-only');
 await expect(page.locator('input[type=email]')).toHaveValue('p0-browser@example.test');
 await page.locator('button[type=submit]').click();
 await expect(page).toHaveURL(/\/salon\/dashboard\/settings\/security$/);
 await expect(page.locator('[data-owner-workspace]')).toBeVisible();
 expect(fixture.unexpected).toEqual([]);
});

async function signOut(page: Page) {
  // Logout owns its redirect. Do not install another actor or race page.goto
  // against that in-flight navigation after the click promise resolves.
  await Promise.all([
    page.waitForURL(/\/(?:business|salon)\/login(?:[?#].*)?$/, { waitUntil: 'load' }),
    page.getByRole('main').getByRole('button', { name: logoutLabel, exact: true }).click(),
  ]);
  await expect(page.locator('[data-owner-workspace]')).toHaveCount(0);
  await expect(page.locator('input[type=email]')).toBeVisible();
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
  await signOut(page);
  await signIn(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  // A genuinely fresh storage partition must restore account metadata, not a
  // copied cookie or localStorage preference. The fixture mirrors its saved row.
  const device = await browser.newContext({ baseURL: new URL(page.url()).origin, serviceWorkers: 'block' });
  try {
    const second = await device.newPage();
    // The original page already exercises the real sign-in/sign-out flow. For
    // the clean-device assertion, seed the fixture's persisted account row
    // directly so WebKit's provider login transport cannot change the scope
    // being tested: locale isolation across storage partitions.
    const secondOwner = await p0OwnerFixture(second, { locale: owner.accountLocale() });
    await second.goto('/salon/dashboard/settings/security');
    await expect(second.locator('html')).toHaveAttribute('lang', 'fr');
    expect(secondOwner.accountLocale()).toBe('fr');
  } finally { await device.close(); }

  // A different authenticated user in the original storage partition uses their
  // own account preference; the first user's French cache remains non-authority.
  await signOut(page);
  const teammate = await loginFixture(page, 'es', '11000000-0000-4000-8000-000000000002');
  await signIn(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(owner.accountLocale()).toBe('fr');
  expect(teammate.accountLocale()).toBe('es');
  expect(owner.unexpected).toEqual([]);
  expect(teammate.unexpected).toEqual([]);
});
