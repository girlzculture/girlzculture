import { expect } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { POLICY_DEFAULTS } from '../../src/lib/businessPolicyCore';

test.use({ serviceWorkers: 'block' });
for (const width of [390, 768, 1440]) test(`P0 public policy survives review, replacement and booking confirmation at ${width}px`, async ({ page, request }, info) => {
  const provider = process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL || 'http://127.0.0.1:3105';
  expect(['localhost', '127.0.0.1']).toContain(new URL(provider).hostname);
  const id = randomUUID(); const slug = `p0-policy-${id}`; const originalRevision = id.slice(0, -4) + '0001';
  const seed = (version: number | null) => request.post(`${provider}/__fixtures/p0-public-policy/${id}`, { headers: { 'x-acceptance-fixture': 'p0-public-policy' }, data: { version } });
  expect((await seed(1)).ok()).toBe(true);
  const gallery = `docs/screenshots/p0/${info.project.name}/public-policy-${width}`;
  await mkdir(gallery, { recursive: true });
  let checkoutCalls = 0;
  try {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.route('**/api/booking-availability?**', route => route.fulfill({ json: { slots: [{ value: '13:00', label: '1:00 PM', stylistId: null }], timeZone: 'America/New_York' } }));
    await page.route('**/api/stripe/booking-checkout', route => {
      const payload = route.request().postDataJSON(); checkoutCalls++;
      expect(payload.platform_policy_acknowledged).toBe(true);
      expect(payload.business_policy_acknowledged).toBe(true);
      expect(payload.business_policy_revision_id).toBe(originalRevision);
      expect(payload.salon_id).toBe(id);
      return route.fulfill({ json: { verified: true, booking: { id, public_reference: 'GC123', status: 'Confirmed', appointment_datetime: payload.appointment_datetime, business_policy_revision_id: originalRevision, business_policy_version: 1, business_policy_snapshot: { ...POLICY_DEFAULTS, notes: 'Original business policy GC123' } } } });
    });
    await page.goto(`/salon/${slug}`);
    const publicPolicy = page.locator('#business-policies');
    await expect(publicPolicy).toContainText('P0 Policy Fixture — Business policies');
    await expect(publicPolicy).toContainText('Refund & Service Satisfaction Policy');
    await expect(publicPolicy).toContainText('Cancellation notice (hours): 24');
    await publicPolicy.locator('summary').click();
    await expect(publicPolicy).toContainText('Original business policy GC123');
    expect((await new AxeBuilder({ page }).include('#business-policies').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await publicPolicy.screenshot({ path: `${gallery}/profile.png`, ...screenshotCaret });
    await page.goto(`/salon/${slug}/book`);
    await expect(page.getByRole('heading', { name: 'Book Your Appointment', exact: true })).toBeVisible();
    // The existing desktop design renders all five steps; smaller layouts use
    // the same real panels through Continue.
    if (width < 1280) for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Continue', exact: true }).filter({ visible: true }).click();
    const review = page.locator('#business-policies').filter({ visible: true });
    await expect(review).toContainText('Cancellation notice (hours): 24');
    await review.locator('summary').click();
    await expect(review).toContainText('Version 1');
    await expect(review).toContainText('Original business policy GC123');
    expect(checkoutCalls).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await review.screenshot({ path: `${gallery}/review-before-confirmation.png`, ...screenshotCaret });
    await page.getByPlaceholder('Full Name', { exact: true }).filter({ visible: true }).fill('Fixture Customer');
    await page.getByPlaceholder('name@example.com', { exact: true }).filter({ visible: true }).fill('fixture@example.test');
    await page.getByPlaceholder('+1 (555) 123-4567', { exact: true }).filter({ visible: true }).fill('3055550123');
    const agreements = page.getByRole('checkbox').filter({ visible: true });
    await expect(agreements).toHaveCount(2);
    await expect(agreements.nth(0)).not.toBeChecked();
    await expect(agreements.nth(1)).not.toBeChecked();
    await agreements.nth(0).check();
    await agreements.nth(1).check();
    if (width < 1280) await page.getByRole('button', { name: 'Continue', exact: true }).filter({ visible: true }).click();
    await page.getByRole('button', { name: 'Confirm Booking — No Deposit', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('heading', { name: 'You’re All Set!', exact: true }).filter({ visible: true })).toBeVisible();
    expect(checkoutCalls).toBe(1);
    expect((await seed(2)).ok()).toBe(true);
    const evidence = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Policy recorded for this booking' }) }).filter({ visible: true });
    await evidence.locator(':scope > summary').click();
    await expect(evidence).toContainText('Cancellation notice (hours): 24');
    await expect(evidence).toContainText('Version 1');
    await expect(page.getByRole('link', { name: 'Open your booking conversation', exact: true }).filter({ visible: true })).toHaveAttribute('href', `/account?tab=inbox&booking=${id}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await evidence.screenshot({ path: `${gallery}/confirmed-original-policy.png`, ...screenshotCaret });
    await page.goto(`/salon/${slug}`);
    await expect(page.locator('#business-policies')).toContainText('Cancellation notice (hours): 72');
    await expect(page.locator('#business-policies')).toContainText('Version 2');
  } finally { expect((await seed(null)).ok()).toBe(true); }
});
