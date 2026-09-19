import { expect, type Page } from '@playwright/test';
import { test } from './helpers/hydration';
import { createStoredCustomerLocation } from '../../src/lib/location';

test.use({ serviceWorkers: 'block' });

const salons = Array.from({ length: 4 }, (_, index) => ({
  id: 'loading-layout-salon-' + index,
  name: 'Example Hair Studio ' + (index + 1),
  slug: 'acceptance-salon',
  address_city: 'Example city', address_state: 'NY', borough: null,
  cover_photo_url: '/images/salon-warm.jpg', verification_status: null,
  rating_overall: 0, review_count: 0, latitude: 40.71, longitude: -74,
  starting_price: 75, services: [], distance_miles: 0.6, total_count: 4,
}));

async function locationFixture(page: Page) {
  await page.addInitScript(stored => {
    localStorage.setItem('girlz-culture-customer-location-v1', JSON.stringify(stored));
    localStorage.setItem('girlz-culture-mobile-location-prompt-v1', JSON.stringify({ dismissedAt: Date.now(), outcome: 'dismissed' }));
  }, createStoredCustomerLocation({ lat: 40.71, lng: -74, label: 'Example city', source: 'explicit' }));
}

for (const width of [320, 390, 768, 1440]) {
  test('Public salon loading rows retain compact card layout at ' + width + 'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await locationFixture(page);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let nearbyReads = 0, featuredReads = 0;
    await page.route('**/api/discovery/salons?*', async route => {
      nearbyReads++;
      await gate;
      await route.fulfill({ json: { salons, total: salons.length } });
    });
    await page.route('**/api/discovery/featured?*', async route => {
      featuredReads++;
      await gate;
      await route.fulfill({ json: { salons, total: salons.length } });
    });
    await page.goto('/site-access');
    await expect.poll(() => nearbyReads > 0 && featuredReads > 0).toBe(true);
    const sections = page.locator('[data-home-salon-section]');
    const measured: number[] = [];
    for (const section of await sections.all()) {
      const loading = section.getByRole('status');
      await expect(loading).toBeVisible();
      const boxes = await loading.locator(':scope > div').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        return { top: box.top, width: box.width };
      }));
      expect(boxes.length).toBeGreaterThan(1);
      expect(Math.max(...boxes.map(box => box.top)) - Math.min(...boxes.map(box => box.top))).toBeLessThanOrEqual(1);
      if (width < 640) expect(boxes[0].width).toBeLessThan(width * 0.6);
      measured.push(boxes[0].width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('public-loading-' + width + '.png'), fullPage: false });
    release();
    let index = 0;
    for (const section of await sections.all()) {
      await expect(section.getByRole('status')).toHaveCount(0);
      const cards = section.locator('[data-salon-card]');
      await expect(cards).toHaveCount(4);
      const box = await cards.first().boundingBox();
      expect(Math.abs(box!.width - measured[index++])).toBeLessThanOrEqual(2);
      await expect(cards.first().getByRole('link', { name: 'View Example Hair Studio 1', exact: true })).toHaveAttribute('href', '/salon/acceptance-salon');
      await expect(cards.first().getByText('From', { exact: false })).toContainText('$75');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('public-loaded-' + width + '.png'), fullPage: false });
  });
}

test('Public featured loading retains the full results grid and actual destinations', async ({ page, context, baseURL }, info) => {
  await context.addCookies([{ name: 'gc_site_access', value: 'marketplace-demo', url: baseURL! }]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await locationFixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  await page.route('**/api/discovery/featured?*', async route => {
    reads++;
    await gate;
    await route.fulfill({ json: { salons, total: salons.length } });
  });
  await page.goto('/featured');
  await expect.poll(() => reads).toBe(1);
  const section = page.locator('[data-home-salon-section="featured"]');
  const loading = section.getByRole('status', { name: 'Loading featured salons', exact: true });
  const boxes = await loading.locator(':scope > div').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { top: box.top, width: box.width };
  }));
  expect(boxes).toHaveLength(8);
  expect(boxes[4].top).toBeGreaterThan(boxes[0].top);
  expect(Math.abs(boxes[3].top - boxes[0].top)).toBeLessThanOrEqual(1);
  release();
  await expect(loading).toHaveCount(0);
  const cards = section.locator('[data-salon-card]');
  await expect(cards).toHaveCount(4);
  expect(Math.abs((await cards.first().boundingBox())!.width - boxes[0].width)).toBeLessThanOrEqual(2);
  await expect(cards.first().getByRole('link', { name: 'Book', exact: true })).toHaveAttribute('href', '/salon/acceptance-salon/book');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('featured-results-loaded.png') });
});

test('Public salon loading rows preserve empty and failed discovery recovery', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await locationFixture(page);
  let nearbyReads = 0;
  await page.route('**/api/discovery/salons?*', async route => {
    nearbyReads++;
    await route.fulfill(nearbyReads === 1
      ? { status: 503, json: { error: 'Nearby salons could not be loaded.' } }
      : { json: { salons: [], total: 0 } });
  });
  await page.route('**/api/discovery/featured?*', route => route.fulfill({ json: {
    salons: [], total: 0,
    promo: { title: 'Own a business? Get featured here.', body: 'Put your salon in front of nearby clients with a clearly labeled featured placement.', href: '/partner' },
  } }));
  await page.goto('/site-access');
  const nearby = page.locator('[data-home-salon-section="nearby"]');
  await expect(nearby.getByRole('alert')).toContainText('Nearby salons could not be loaded.');
  await expect(nearby.getByRole('status')).toHaveCount(0);
  expect(nearbyReads).toBe(1);
  await nearby.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(nearby.getByRole('heading', { name: 'No salons are nearby yet', exact: true })).toBeVisible();
  await expect(nearby.getByRole('link', { name: 'Open Find Salons', exact: true })).toHaveAttribute('href', /\/salons\?lat=40.71&lng=-74/);
  expect(nearbyReads).toBe(2);
  const featured = page.locator('[data-home-salon-section="featured"]').first();
  await expect(featured.getByRole('link', { name: /Own a business\?/ })).toHaveAttribute('href', '/partner');
  await expect(page.locator('[data-salon-card]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('public-empty-discovery.png') });
});
