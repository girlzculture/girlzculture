import { expect, type Page, type Route } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { POLICY_DEFAULTS, type BusinessPolicy } from '../../src/lib/businessPolicyCore';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';

test.use({ serviceWorkers: 'block' });

async function waitForPublicPolicyPopup(page: Page) {
  await page.waitForLoadState('load');
  const main = page.getByRole('main');
  await expect(main).toBeVisible();
  // Preserve document-wide uniqueness after the visible streamed main arrives.
  // A hidden React stream copy must neither satisfy readiness nor be ignored.
  await expect(page.locator('#business-policies')).toHaveCount(1);
  const disclosure = main.locator('#business-policies');
  await expect(disclosure).toBeVisible();
  return disclosure;
}

for (const gatePopupScript of [false, true]) test(gatePopupScript
  ? 'P0 public policy waits for the actual popup script before reading the published revision'
  : 'P0 public policy carries one reviewed owner revision through recovery public link and booking acknowledgement', async ({ page, request }, info) => {
  const provider = process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL || 'http://127.0.0.1:3105';
  expect(['localhost', '127.0.0.1']).toContain(new URL(provider).hostname);
  const id = randomUUID(), slug = `p0-policy-${id}`;
  const originalId = id.slice(0, -4) + '0001', nextId = id.slice(0, -4) + '0002';
  const text = `Owner reviewed policy ${id}: cancellation requires 48 hours; contact this business about its services.`;
  type Revision = { id: string; salon_id: string; policy: BusinessPolicy; version: number | null; source_locale: string; published_at: string | null };
  const original: Revision = { id: originalId, salon_id: id, version: 1, source_locale: 'en', published_at: '2026-09-01T00:00:00Z', policy: { ...POLICY_DEFAULTS, business_policy_text: 'Original connected business policy GC123.' } };
  const revisions: Revision[] = [original];
  let current = originalId, draftAttempts = 0, publishAttempts = 0, checkoutCalls = 0;
  const publishPayloads: Record<string, unknown>[] = [];
  const seed = (revision: Revision | null) => request.post(`${provider}/__fixtures/p0-public-policy/${id}`, {
    headers: { 'x-acceptance-fixture': 'p0-public-policy' },
    data: revision ? { version: revision.version, published_revision: revision } : { version: null },
  });
  const publicRevision = async (revisionId: string) => {
    const response = await request.get(`${provider}/rest/v1/business_policy_revisions?id=eq.${revisionId}`, { headers: { Accept: 'application/vnd.pgrst.object+json' } });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const f = await p0OwnerFixture(page, { populated: true, locale: 'en' });
  Object.assign(f.business, { id, slug, name: 'P0 Policy Fixture', business_policy_revision_id: originalId });
  for (const rows of Object.values(f.records)) for (const record of rows) if ('salon_id' in record) record.salon_id = id;
  expect((await seed(original)).ok()).toBe(true);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/salon/policies', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { revisions, current, public_policy_path: `/salon/${slug}#business-policies` } });
      const body = route.request().postDataJSON();
      if (body.action === 'draft') {
        draftAttempts++;
        expect(body.locale).toBe('en');
        expect(body.policy.business_policy_text).toBe(text);
        expect(body.policy.cancellation_hours).toBe(48);
        if (draftAttempts === 1) return route.fulfill({ status: 503, json: { code: 'POLICY_UNAVAILABLE', request_id: 'CONNECTED-POLICY-SAVE' } });
        expect(draftAttempts).toBe(2);
        const revision: Revision = { ...original, id: nextId, version: null, published_at: null, policy: structuredClone(body.policy), source_locale: body.locale };
        revisions.unshift(revision);
        return route.fulfill({ json: { revision, digest: 'b'.repeat(64), expected_revision: current } });
      }
      expect(body).toEqual({ action: 'publish', revision_id: nextId, digest: 'b'.repeat(64), expected_revision: originalId, confirm: true, platform_rules_acknowledged: true, source_reviewed: true });
      publishPayloads.push(body); publishAttempts++;
      if (publishAttempts === 1) return route.fulfill({ status: 503, json: { code: 'POLICY_UNAVAILABLE', request_id: 'CONNECTED-POLICY-PUBLISH' } });
      expect(publishAttempts).toBe(2);
      const draft = revisions.find(revision => revision.id === body.revision_id)!;
      expect(draft.policy.business_policy_text).toBe(text);
      const published = { ...draft, version: 2, published_at: '2026-09-20T00:00:00Z' };
      // The exact saved draft, not a separately seeded policy, becomes the
      // public server-rendered record only after explicit reviewed publication.
      expect((await seed(published)).ok()).toBe(true);
      Object.assign(draft, published); current = draft.id; f.business.business_policy_revision_id = current;
      return route.fulfill({ json: { revision: draft, verified: true } });
    });
    await page.context().route('**/api/booking-availability?**', route => route.fulfill({ json: { slots: [{ value: '13:00', label: '1:00 PM', stylistId: null }], timeZone: 'America/New_York' } }));
    await page.context().route('**/api/stripe/booking-checkout', route => {
      checkoutCalls++;
      const payload = route.request().postDataJSON();
      expect(payload.salon_id).toBe(id);
      expect(payload.business_policy_revision_id).toBe(nextId);
      expect(payload.platform_policy_acknowledged).toBe(true);
      expect(payload.business_policy_acknowledged).toBe(true);
      const published = revisions.find(revision => revision.id === current)!;
      expect(published.id).toBe(nextId); expect(published.version).toBe(2);
      return route.fulfill({ json: { verified: true, booking: { id: randomUUID(), public_reference: 'GC123', status: 'Confirmed', appointment_datetime: payload.appointment_datetime, business_policy_revision_id: published.id, business_policy_version: published.version, business_policy_snapshot: structuredClone(published.policy) } } });
    });
    await page.goto('/salon/dashboard/my-page/business-policies');
    const editor = page.getByLabel('Business Policy', { exact: true });
    await expect(editor).toHaveValue(original.policy.business_policy_text!);
    await editor.fill(text);
    await page.locator('form').getByText('Booking rules', { exact: true }).click();
    await page.getByLabel('Cancellation notice (hours)', { exact: true }).fill('48');
    await page.getByRole('button', { name: 'Save draft and review', exact: true }).click();
    await expect(page.getByText('CONNECTED-POLICY-SAVE', { exact: true })).toBeVisible();
    await expect(editor).toHaveValue(text);
    await expect(page.getByLabel('Cancellation notice (hours)', { exact: true })).toHaveValue('48');
    expect(revisions).toEqual([original]); expect(current).toBe(originalId);
    expect(await publicRevision(originalId)).toEqual(original);
    await page.screenshot({ path: info.outputPath('policy-connected-failed-save.png'), ...screenshotCaret });
    await page.getByRole('button', { name: 'Save draft and review', exact: true }).click();
    const preview = page.getByRole('heading', { name: 'Review policy draft', exact: true }).locator('..');
    await expect(preview.getByText(text, { exact: true })).toBeVisible();
    await expect(preview).toContainText('Cancellation notice (hours): 48');
    await expect(page.getByText('CONNECTED-POLICY-SAVE', { exact: true })).toHaveCount(0);
    await expect(preview.getByRole('button', { name: 'Confirm and publish', exact: true })).toBeDisabled();
    expect(current).toBe(originalId); expect(publishAttempts).toBe(0);
    await preview.getByRole('checkbox').check();
    await preview.getByRole('button', { name: 'Confirm and publish', exact: true }).click();
    await expect(page.getByText('CONNECTED-POLICY-PUBLISH', { exact: true })).toBeVisible();
    await expect(preview.getByText(text, { exact: true })).toBeVisible();
    await expect(preview.getByRole('checkbox')).toBeChecked();
    expect(current).toBe(originalId); expect(await publicRevision(originalId)).toEqual(original);
    await preview.getByRole('button', { name: 'Confirm and publish', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Business policies published.' })).toBeVisible();
    expect(publishPayloads[1]).toEqual(publishPayloads[0]);
    const published = structuredClone(revisions.find(revision => revision.id === nextId)!);
    expect(await publicRevision(nextId)).toEqual(published);
    await page.reload();
    await expect(editor).toHaveValue(text);
    await expect(page.getByLabel('Cancellation notice (hours)', { exact: true })).toHaveValue('48');
    expect(draftAttempts).toBe(2); expect(publishAttempts).toBe(2); expect(checkoutCalls).toBe(0);
    const link = page.locator(`a[href="/salon/${slug}#business-policies"]`);
    await expect(link).toHaveAttribute('target', '_blank');
    let releaseScript!: () => void, markScriptRequested!: () => void, markScriptFinished!: () => void;
    const scriptGate = new Promise<void>(resolve => { releaseScript = resolve; });
    const scriptRequested = new Promise<void>(resolve => { markScriptRequested = resolve; });
    const scriptFinished = new Promise<void>(resolve => { markScriptFinished = resolve; });
    let heldPage: Page | null = null, scriptContinued = false;
    const scriptPattern = '**/_next/static/chunks/**';
    const holdScript = async (route: Route) => {
      const requestPage = route.request().frame().page();
      if (heldPage || route.request().resourceType() !== 'script' || requestPage === page || new URL(requestPage.url()).pathname !== `/salon/${slug}`) return route.continue();
      heldPage = requestPage; markScriptRequested();
      try { await scriptGate; scriptContinued = true; await route.continue(); }
      finally { markScriptFinished(); }
    };
    if (gatePopupScript) await page.context().route(scriptPattern, holdScript);
    let publicPage!: Page;
    let disclosure: Awaited<ReturnType<typeof waitForPublicPolicyPopup>>;
    try {
      const opened = page.waitForEvent('popup');
      await link.click();
      publicPage = await opened;
      await publicPage.setViewportSize({ width: 390, height: 844 });
      await expect(publicPage).toHaveURL(new RegExp(`/salon/${slug}#business-policies$`));
      if (gatePopupScript) await scriptRequested;
      let ready = false;
      const policyReady = waitForPublicPolicyPopup(publicPage).then(value => { ready = true; return value; });
      if (gatePopupScript) {
        expect(heldPage).toBe(publicPage);
        const readyState = await publicPage.evaluate(() => document.readyState);
        await info.attach('policy-popup-held-script', { body: JSON.stringify({ readyState, scriptContinued, ready }), contentType: 'application/json' });
        expect(readyState).not.toBe('complete');
        expect(scriptContinued).toBe(false);
        expect(ready).toBe(false);
        releaseScript();
      }
      disclosure = await policyReady;
    } finally {
      releaseScript();
      if (heldPage) await scriptFinished;
      if (gatePopupScript) await page.context().unroute(scriptPattern, holdScript);
    }
    await expect(disclosure).toHaveCount(1);
    await expect(disclosure).toContainText('Version 2');
    await disclosure.locator('summary').click();
    await expect(disclosure.getByText(text, { exact: true })).toBeVisible();
    await expect(disclosure).toContainText('Cancellation notice (hours): 48');
    await publicPage.screenshot({ path: info.outputPath('policy-connected-public.png'), ...screenshotCaret });
    await publicPage.getByRole('link', { name: 'Book Appointment', exact: true }).click();
    await expect(publicPage).toHaveURL(new RegExp(`/salon/${slug}/book(?:\\?|$)`));
    await expect(publicPage.getByRole('heading', { name: 'Book Your Appointment', exact: true })).toBeVisible();
    for (let step = 0; step < 3; step++) await publicPage.getByRole('button', { name: 'Continue', exact: true }).filter({ visible: true }).click();
    const bookingPolicy = publicPage.locator('#business-policies').filter({ visible: true });
    await bookingPolicy.locator('summary').click();
    await expect(bookingPolicy.getByText(text, { exact: true })).toBeVisible();
    await expect(bookingPolicy).toContainText('Version 2');
    await expect(bookingPolicy).toContainText('Cancellation notice (hours): 48');
    await publicPage.getByPlaceholder('Full Name', { exact: true }).filter({ visible: true }).fill('Connected Fixture Customer');
    await publicPage.getByPlaceholder('name@example.com', { exact: true }).filter({ visible: true }).fill('connected@example.test');
    await publicPage.getByPlaceholder('+1 (555) 123-4567', { exact: true }).filter({ visible: true }).fill('3055550123');
    const agreements = publicPage.getByRole('checkbox').filter({ visible: true });
    await expect(agreements).toHaveCount(2);
    await expect(agreements.nth(0)).not.toBeChecked(); await expect(agreements.nth(1)).not.toBeChecked();
    expect(checkoutCalls).toBe(0);
    // Platform consent alone must not accept this newly published business
    // revision. Real client validation returns to review without an API call.
    await agreements.nth(1).check();
    await publicPage.getByRole('button', { name: 'Continue', exact: true }).filter({ visible: true }).click();
    await publicPage.getByRole('button', { name: 'Confirm Booking — No Deposit', exact: true }).filter({ visible: true }).click();
    await expect(publicPage.getByText('This confirmation is required', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(agreements.nth(0)).not.toBeChecked(); await expect(agreements.nth(1)).toBeChecked();
    expect(checkoutCalls).toBe(0);
    await agreements.nth(0).check();
    await publicPage.getByRole('button', { name: 'Continue', exact: true }).filter({ visible: true }).click();
    await publicPage.getByRole('button', { name: 'Confirm Booking — No Deposit', exact: true }).filter({ visible: true }).click();
    await expect(publicPage.getByRole('heading', { name: 'You’re All Set!', exact: true }).filter({ visible: true })).toBeVisible();
    expect(checkoutCalls).toBe(1);
    const evidence = publicPage.locator('details').filter({ has: publicPage.locator('summary').filter({ hasText: 'Policy recorded for this booking' }) }).filter({ visible: true });
    await evidence.locator(':scope > summary').click();
    await evidence.locator('#business-policies summary').click();
    await expect(evidence.getByText(text, { exact: true })).toBeVisible();
    await expect(evidence).toContainText('Version 2');
    await expect(evidence).toContainText('Cancellation notice (hours): 48');
    expect(await publicRevision(nextId)).toEqual(published);
    expect(draftAttempts).toBe(2); expect(publishAttempts).toBe(2); expect(f.unexpected).toEqual([]);
    await publicPage.screenshot({ path: info.outputPath('policy-connected-booking-evidence.png'), ...screenshotCaret });
  } finally { expect((await seed(null)).ok()).toBe(true); }
});

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
    // Reopening the policy must finish its scroll before handing focus back.
    // Otherwise the ongoing animation moves the consent control during the
    // next pointer activation (the tablet WebKit CI regression).
    await review.evaluate(policy => {
      policy.querySelector('summary')!.addEventListener('focus', () => {
        const root = document.scrollingElement!;
        const expected = Math.max(0, Math.min(root.scrollHeight - innerHeight, scrollY + policy.getBoundingClientRect().top));
        (policy as HTMLElement).dataset.focusScrollError = String(Math.abs(scrollY - expected));
      }, { once: true });
    });
    await page.getByRole('link', { name: 'Read the full business policy', exact: true }).filter({ visible: true }).click();
    await expect(review.locator('details')).toHaveAttribute('open', '');
    const focusScrollError = await review.getAttribute('data-focus-scroll-error');
    expect(focusScrollError).not.toBeNull();
    expect(Number(focusScrollError)).toBeLessThanOrEqual(2);
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
