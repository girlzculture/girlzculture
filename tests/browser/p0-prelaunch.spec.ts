import { expect } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

for (const width of [390, 768, 1440]) test(`prelaunch public routes fail closed at ${width}px`, async ({ page }, info) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width, height: 900 });
  const directory = `docs/screenshots/p0/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  for (const path of ['/', '/salons', '/styles', '/salon/p0-demo', '/salon/p0-demo/book']) {
    const response = await page.goto(path);
    await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toBeVisible();
    await expect(page.getByText('Girlz Culture is onboarding beauty and wellness businesses as we prepare to launch our marketplace. Submit your application to join now.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Join as a business', exact: true })).toHaveAttribute('href', '/business/signup');
    expect(response?.headers()['x-robots-tag']).toContain('noindex');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: `${directory}/prelaunch-${path.replaceAll('/', '_') || 'home'}-${width}.png`, fullPage: true, ...screenshotCaret });
  }
});
test('the unlisted site-access doorway exposes browsing but never transactions', async ({ page }) => {
  test.setTimeout(150_000);
  const entry = await page.goto('/site-access');
  expect(entry?.status()).toBeLessThan(400);
  expect(entry?.headers()['x-robots-tag']).toContain('noindex');
  expect(entry?.headers()['netlify-cdn-cache-control']).toContain('no-store');
  await expect(page.locator('main[data-homepage-variant]')).toBeVisible();
  await expect(page.getByLabel('Marketplace demonstration notice')).toContainText('booking and payment are unavailable');
  await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toHaveCount(0);

  // Next Link prefetches production routes before a click. Speculatively
  // visiting the cookie-clearing exit must never close the demo marketplace.
  const speculativeExit = await page.request.get('/site-access/exit', {
    headers: { 'next-router-prefetch': '1' }, maxRedirects: 0,
  });
  expect(speculativeExit.status()).toBe(204);
  expect(speculativeExit.headers()['set-cookie']).toBeUndefined();
  const firstDiscovery = await page.request.get('/api/discovery/salons?lat=40.7&lng=-74');
  expect(firstDiscovery.status()).toBe(200);

  const salons = await page.goto('/salons');
  expect(salons?.status()).toBeLessThan(400);
  expect(salons?.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.getByLabel('Marketplace demonstration notice')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toHaveCount(0);

  const salon = await page.goto('/salon/acceptance-salon');
  expect(salon?.status()).toBeLessThan(400);
  await expect(page.getByRole('heading', { name: 'Acceptance Salon', exact: true })).toBeVisible();
  await expect(page.getByText('Demo browsing only', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book Appointment', exact: true })).toHaveCount(0);

  const blocked = await page.request.post('/api/stripe/booking-checkout', {
    data: { salon_id: 'p0-demo', style_id: 'p0-style' },
  });
  expect(blocked.status()).toBe(503);
  expect((await blocked.json()).code).toBe('CUSTOMER_MARKETPLACE_NOT_LIVE');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toBeVisible();
  await expect(page.getByLabel('Marketplace demonstration notice')).toHaveCount(0);

  await page.goto('/site-access');
  await page.getByRole('link', { name: 'Exit demonstration', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByLabel('Marketplace demonstration notice')).toHaveCount(0);
  await page.goto('/salons');
  await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toBeVisible();
});
test('direct public API entry points are closed without a launch flag', async ({ request }) => {
  for (const path of ['/api/stripe/booking-checkout', '/api/stripe/commerce-checkout', '/api/stripe/pickup-reservation', '/api/guest/bookings/manage', '/api/concierge']) {
    const response = await request.post(path, { data: { salon_id: 'p0-demo', body: 'Never create a session' } });
    expect(response.status(), path).toBe(503);
    expect((await response.json()).code, path).toBe('CUSTOMER_MARKETPLACE_NOT_LIVE');
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});
test('business signup, owner login and help remain reachable before marketplace launch', async ({ page }) => {
  for (const path of ['/business/signup', '/business/login', '/help', '/terms', '/privacy']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toHaveCount(0);
    await expect(page.locator('main')).toBeVisible();
  }
});
