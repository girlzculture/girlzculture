import { expect } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import {
  MARKETPLACE_PREVIEW_COOKIE,
  issueMarketplacePreviewGrant,
} from '../../src/lib/marketplacePreviewGrant';

const previewSecret = 'p0-private-preview-acceptance-secret';

for (const width of [390, 768, 1440]) test(`prelaunch public routes fail closed at ${width}px`, async ({ page }, info) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width, height: 900 });
  const directory = `docs/screenshots/p0/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  for (const path of ['/', '/salons', '/styles', '/salon/p0-demo', '/salon/p0-demo/book']) {
    const response = await page.goto(path);
    await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toBeVisible();
    await expect(page.getByText('Customer booking and payment are not available yet.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Join as a founding business', exact: true })).toHaveAttribute('href', '/business/signup');
    expect(response?.headers()['x-robots-tag']).toContain('noindex');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: `${directory}/prelaunch-${path.replaceAll('/', '_') || 'home'}-${width}.png`, fullPage: true, ...screenshotCaret });
  }
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

test('a signed Platform Admin grant opens only the private read-only marketplace preview', async ({ page }) => {
  const originalSecret = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = previewSecret;
  try {
    const grant = await issueMarketplacePreviewGrant('22000000-0000-4000-8000-000000000001');
    await page.context().addCookies([{ name: MARKETPLACE_PREVIEW_COOKIE, value: grant.value, url: 'http://127.0.0.1:3108' }]);
  } finally {
    if (originalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = originalSecret;
  }

  const homepage = await page.goto('/?marketplace_preview=1');
  expect(homepage?.status()).toBe(200);
  await expect(page.locator('main[data-homepage-variant]')).toBeVisible();
  await expect(page.getByText('Private Platform Admin preview.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toHaveCount(0);
  expect(homepage?.headers()['x-robots-tag']).toContain('noindex');

  const profile = await page.goto('/salon/acceptance-salon');
  expect(profile?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Acceptance Salon', exact: true })).toBeVisible();

  const bookingPage = await page.goto('/salon/acceptance-salon/book');
  await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toBeVisible();
  expect(bookingPage?.headers()['x-robots-tag']).toContain('noindex');

  const checkout = await page.request.post('/api/stripe/booking-checkout', {
    data: { salon_id: '11111111-1111-4111-8111-111111111111' },
  });
  expect(checkout.status()).toBe(503);
  expect((await checkout.json()).code).toBe('CUSTOMER_MARKETPLACE_NOT_LIVE');
});
