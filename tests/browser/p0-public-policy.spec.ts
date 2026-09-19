import { expect } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { POLICY_DEFAULTS } from '../../src/lib/businessPolicyCore';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';

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
    // Navigation load can precede React moving streamed markup out of hidden
    // S:0. Require one visible policy and no retained duplicate before reading it.
    await expect(publicPolicy.filter({ visible: true })).toHaveCount(1);
    await expect(publicPolicy).toHaveCount(1);
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
    await review.locator('summary').click();
    await page.getByRole('link', { name: 'Read the full business policy', exact: true }).filter({ visible: true }).click();
    await expect(review.locator('details')).toHaveAttribute('open', '');
    await expect(page.getByPlaceholder('Full Name', { exact: true }).filter({ visible: true })).toHaveValue('Fixture Customer');
    await expect(page.getByPlaceholder('name@example.com', { exact: true }).filter({ visible: true })).toHaveValue('fixture@example.test');
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
    await expect(publicPolicy.filter({ visible: true })).toHaveCount(1);
    await expect(publicPolicy).toHaveCount(1);
    await expect(page.locator('#business-policies')).toContainText('Cancellation notice (hours): 72');
    await expect(page.locator('#business-policies')).toContainText('Version 2');
  } finally { expect((await seed(null)).ok()).toBe(true); }
});

for (const [width, height, locale] of [[390, 844, 'en'], [768, 900, 'fr'], [1440, 900, 'es'], [844, 390, 'zh-CN']] as const) {
  test(`P0 public policy editor preserves current terms, confirms readback and links the published page in ${locale}`, async ({ page }, info) => {
    await p0OwnerFixture(page, { populated: true, locale });
    await page.setViewportSize({ width, height });
    const t = (text: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[text] || text;
    const original = { id: 'published-old', policy: { ...POLICY_DEFAULTS, business_policy_text: 'Our actual published terms GC123.' }, version: 1, source_locale: 'en', published_at: '2026-09-01T00:00:00Z' };
    const revisions = [...Array.from({ length: 30 }, (_, i) => ({ ...original, id: `draft-${i}`, published_at: null as string | null, version: null as number | null })), original];
    let current = original.id;
    let saves = 0, publishes = 0, holdReadback = false;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/salon/policies', async route => {
      if (route.request().method() === 'GET') {
        if (holdReadback) await gate;
        return route.fulfill({ json: { revisions, current, public_policy_path: '/fixture-studio#business-policies' } });
      }
      const body = route.request().postDataJSON();
      if (body.action === 'draft') {
        saves++;
        const revision = { ...original, id: `new-${saves}`, policy: body.policy, source_locale: body.locale, version: null, published_at: null };
        revisions.unshift(revision);
        return route.fulfill({ json: { revision, digest: 'a'.repeat(64), expected_revision: current } });
      }
      expect(body.action).toBe('publish');
      expect(body.source_reviewed).toBe(true);
      const revision = revisions.find(row => row.id === body.revision_id)!;
      expect(revision.policy.business_policy_text).toBe('Updated own-business terms GC123, 48 hours.');
      publishes++;
      revision.published_at = '2026-09-20T00:00:00Z'; revision.version = 2; current = revision.id;
      holdReadback = true;
      return route.fulfill({ json: { revision, verified: true } });
    });
    await page.goto('/salon/dashboard/my-page/business-policies');
    const editor = page.getByLabel(t('Business Policy'), { exact: true });
    await expect(editor).toHaveValue(original.policy.business_policy_text);
    const link = page.locator('a[href="/fixture-studio#business-policies"]');
    await expect(link).toBeVisible();
    await editor.fill('Updated own-business terms GC123, 48 hours.');
    await page.locator('form').getByText(t('Booking rules'), { exact: true }).click();
    await page.getByLabel(t('Cancellation notice (hours)'), { exact: true }).fill('48');
    await page.getByRole('button', { name: t('Save draft and review'), exact: true }).click();
    await page.getByRole('button', { name: t('Keep editing'), exact: true }).click();
    await expect(editor).toHaveValue('Updated own-business terms GC123, 48 hours.');
    await page.getByRole('button', { name: t('Save draft and review'), exact: true }).click();
    await page.getByRole('checkbox').check();
    const readback = page.waitForRequest(request => request.url().endsWith('/api/salon/policies') && request.method() === 'GET');
    await page.getByRole('button', { name: t('Confirm and publish'), exact: true }).click();
    await readback;
    try {
      await expect(page.getByRole('status').filter({ hasText: t('Business policies published.') })).toHaveCount(0);
      await expect(page.getByRole('button', { name: t('Publishing…'), exact: true })).toBeDisabled();
    } finally { release(); }
    await expect(page.getByRole('status').filter({ hasText: t('Business policies published.') })).toBeVisible();
    expect(publishes).toBe(1); expect(saves).toBe(2);
    await page.reload();
    await expect(editor).toHaveValue('Updated own-business terms GC123, 48 hours.');
    await expect(page.getByLabel(t('Cancellation notice (hours)'), { exact: true })).toHaveValue('48');
    await expect(link).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: `${t('Version')} 1` })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`policy-current-${locale}.png`), fullPage: true, ...screenshotCaret });
  });
}

test('P0 public policy editor cannot replace an unavailable current revision and recovers through reload', async ({ page }) => {
  await p0OwnerFixture(page, { populated: true, locale: 'en' });
  let missing = true, posts = 0, failSave = true;
  await page.route('**/api/salon/policies', route => {
    if (route.request().method() !== 'GET') {
      posts++;
      if (failSave) return route.fulfill({ status: 500, json: { code: 'POLICY_UNAVAILABLE', request_id: 'POLICY-SAVE-REFERENCE' } });
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { revision: { id: 'retry-draft', policy: body.policy, source_locale: 'en', published_at: null, version: null }, digest: 'a'.repeat(64), expected_revision: 'published' } });
    }
    return route.fulfill({ json: { current: 'published', revisions: missing ? [] : [{ id: 'published', policy: { ...POLICY_DEFAULTS, business_policy_text: 'Recovered existing policy' }, published_at: '2026-09-01', version: 1, source_locale: 'en' }] } });
  });
  await page.goto('/salon/dashboard/my-page/business-policies');
  await expect(page.getByRole('status').filter({ hasText: 'Business policies are temporarily unavailable.' })).toBeVisible();
  await expect(page.getByLabel('Business Policy', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save draft and review', exact: true })).toBeDisabled();
  expect(posts).toBe(0);
  missing = false;
  await page.getByRole('button', { name: 'Retry loading policies', exact: true }).click();
  await expect(page.getByLabel('Business Policy', { exact: true })).toHaveValue('Recovered existing policy');
  await expect(page.getByRole('button', { name: 'Save draft and review', exact: true })).toBeEnabled();
  await page.getByLabel('Business Policy', { exact: true }).fill('Keep this draft after the failed save GC123.');
  await page.getByRole('button', { name: 'Save draft and review', exact: true }).click();
  await expect(page.getByText('POLICY-SAVE-REFERENCE', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Business Policy', { exact: true })).toHaveValue('Keep this draft after the failed save GC123.');
  failSave = false;
  await page.getByRole('button', { name: 'Save draft and review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review policy draft', exact: true })).toBeVisible();
  await expect(page.getByText('Keep this draft after the failed save GC123.', { exact: true })).toBeVisible();
  await expect(page.getByText('POLICY-SAVE-REFERENCE', { exact: true })).toHaveCount(0);
  expect(posts).toBe(2);
});
