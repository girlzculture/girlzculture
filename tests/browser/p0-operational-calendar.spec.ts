import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import AxeBuilder from '@axe-core/playwright';
import { validateTool } from '../../src/lib/gcAssistantCore';
import { mkdir } from 'node:fs/promises';

// Match the existing Assistant API-fixture boundary: WebKit service workers
// own fetches and bypass page.route. Real PWA behavior retains its own suite.
test.use({ serviceWorkers: 'block' });

// Browser API and speech fixtures exercise the real components. SQL/server
// suites separately prove persistence and authorization; this is not live AI.
for (const locale of ['en', 'fr', 'wo', 'es', 'zh-CN']) {
  test(`P0 operational calendar expanded reads and drafts in ${locale}`, async ({ page }) => {
    const fixture = await p0OwnerFixture(page, { populated: true, locale });
    const t = (source: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source;
    const range = { start: '2030-09-24T13:00:00Z', end: '2030-09-24T23:00:00Z' };
    const reads = [
      ['get_customers', range, { customers: [{ name: 'Sheila' }] }],
      ['get_professionals', { query: '' }, { professionals: [{ name: 'Danielle' }] }],
      ['get_products', { query: '' }, { products: [{ name: 'Conditioner', price: 25 }] }],
      ['get_booking_messages', { booking_id: fixture.ids.booking }, { messages: [{ original_body: 'Private original', sender_role: 'salon' }] }],
      ['get_reviews', range, { reviews: [{ rating_overall: 5, written_review: 'Original review' }] }],
      ['get_promotions', {}, { promotions: [{ title: 'Autumn', promotion_type: 'percentage' }] }],
      ['get_plan_status', {}, { subscription: { tier: 'Premium', status: 'active' } }],
      ['get_profile_completion', {}, { profile_completion: 85 }],
      ['get_earnings_summary', range, { completed_booking_value: 180 }],
      ['get_upcoming_appointments', range, { bookings: [{ guest_name: 'Sheila' }] }],
      ['get_calendar_gaps', { date: '2030-09-24', stylist_id: null }, { gaps: [{ ...range, professional_name: 'Danielle' }] }],
    ] as const;
    const hours = Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => [day, { closed: false, open: '09:00', close: '18:00' }]));
    const drafts = [
      ['prepare_business_hours', { hours }],
      ['prepare_service_edit', { style_id: fixture.ids.service, name: 'Edited original', price: 180, duration_hours: 2, buffer_minutes: 15 }],
      ['prepare_professional_draft', { id: null, name: 'Danielle', bio: 'Original bio', specialties: [], years_experience: 5 }],
      ['prepare_product_draft', { id: null, name: 'Conditioner', description: 'Original product', price: 25 }],
      ['prepare_promotion_draft', { id: null, title: 'Autumn', description: 'Original offer', promotion_type: 'percentage', discount_value: 10, ...range, time_zone: fixture.business.time_zone }],
      ['prepare_booking_note', { booking_id: fixture.ids.booking, note: 'Private original note' }],
      ['prepare_manual_reschedule', { booking_id: fixture.ids.booking, date: '2030-09-24', time: '13:00', stylist_id: null }],
      ['prepare_manual_cancellation', { booking_id: fixture.ids.booking, reason: 'Customer called' }],
    ] as const;
    let next: { tool: string; args: unknown; result?: unknown }; let pending: Record<string, unknown>;
    let writes = 0;
    await page.route('**/api/salon/assistant', route => {
      const input = route.request().postDataJSON();
      if (input.action === 'confirm') { expect(input.request_id).toBe(pending.id); expect(input.digest).toBe(pending.digest); writes++; return route.fulfill({ json: { verified: true, result: pending.arguments } }); }
      const contract = validateTool(next.tool, next.args);
      pending = { id: input.request_id, digest: 'c'.repeat(64), tool: next.tool, arguments: next.args, execution_payload: {}, before_summary: {}, result: next.result, risk_class: contract.risk };
      return route.fulfill({ json: { request: pending, preview_required: contract.risk >= 3 } });
    });
    await page.goto('/salon/dashboard');
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'GC Assistant' });
    async function ask() { await dialog.locator('textarea').fill('Business request'); await dialog.getByRole('button', { name: t('Ask GC Assistant'), exact: true }).click(); }
    for (const [tool, args, result] of reads) {
      next = { tool, args, result }; await ask();
      await expect(dialog.locator('article').last().getByRole('status')).toHaveText(t('Current business information'));
      await expect(dialog.locator('article').last().locator('dl')).not.toHaveCount(0);
      expect(writes).toBe(0);
      const last = dialog.locator('article').last();
      if (tool === 'get_plan_status') await expect(last).toContainText(t('Active'));
      if (tool === 'get_booking_messages') await expect(last).toContainText(t('Business'));
      if (tool === 'get_promotions') await expect(last).toContainText(t('Percentage discount'));
    }
    for (const [index, [tool, args]] of drafts.entries()) {
      next = { tool, args }; await ask(); const article = dialog.locator('article').last();
      await expect(article.getByRole('heading', { name: t('Review this draft') })).toBeVisible(); expect(writes).toBe(index);
      await article.getByRole('button', { name: t('Confirm this change'), exact: true }).click();
      await expect(article.getByRole('status')).toHaveText(t('Your change was saved and verified.')); expect(writes).toBe(index + 1);
    }
    expect(fixture.unexpected).toEqual([]);
  });

  test(`P0 operational calendar dashboard preview and persistence in ${locale}`, async ({ page }, testInfo) => {
    const fixture = await p0OwnerFixture(page, { populated: true, locale });
    const t = (source: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source;
    const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    let pending: Record<string, unknown> | null = null;
    let writes = 0; let conflict = true;
    await page.route('**/api/salon/assistant', async route => {
      const input = route.request().postDataJSON();
      expect(input.locale).toBe(locale);
      if (input.action === 'tool') {
        expect(input.tool).toBe('prepare_manual_appointment');
        expect(input.args).toMatchObject({ guest_name: 'Sheila', style_id: fixture.ids.service, stylist_id: fixture.ids.professional, duration_minutes: null, source: 'phone', date, time: '13:00' });
        if (conflict) { conflict = false; return route.fulfill({ status: 409, json: { code: 'ASSISTANT_AVAILABILITY_CONFLICT' } }); }
        pending = { id: input.request_id, digest: 'a'.repeat(64), arguments: input.args, execution_payload: { duration_minutes: 120, buffer_minutes: 15, professional_name: 'Save', service_name: 'Save', appointment_datetime: `${date}T17:00:00Z`, payment_status: 'Not collected by Girlz Culture', time_zone: fixture.business.time_zone } };
        return route.fulfill({ json: { request: pending, preview_required: true } });
      }
      expect(input).toMatchObject({ action: 'confirm', request_id: pending!.id, digest: pending!.digest, confirm: true });
      writes++;
      const booking = { ...pending!.arguments as object, ...pending!.execution_payload as object, id: input.request_id, salon_id: fixture.business.id, booking_origin: 'business_added', status: 'Confirmed', manual_service_name: 'Save', deposit_amount: 0, estimated_total: 0, duration_hours: 2, customer_id: null };
      fixture.records.bookings.push(booking);
      return route.fulfill({ json: { verified: true, result: booking } });
    });
    await page.setViewportSize({ width: locale === 'en' ? 1440 : locale === 'fr' ? 768 : 390, height: 900 });
    await page.goto('/salon/dashboard/bookings/new');
    await page.getByLabel(t('Customer name'), { exact: true }).fill('Sheila');
    await page.getByRole('combobox', { name: t('Service'), exact: true }).selectOption(fixture.ids.service);
    await page.getByRole('combobox', { name: t('Professional'), exact: true }).selectOption(fixture.ids.professional);
    await page.getByLabel(t('Date'), { exact: true }).fill(date);
    await page.getByLabel(t('Time'), { exact: true }).fill('13:00');
    await page.getByRole('button', { name: t('Review appointment'), exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: t('That time is unavailable. Choose another time.') })).toBeVisible();
    expect(writes).toBe(0);
    await page.getByRole('button', { name: t('Review appointment'), exact: true }).click();
    await expect(page.getByRole('heading', { name: t('Review this draft') })).toBeVisible();
    expect(writes).toBe(0);
    await expect(page.getByText(t('Not collected by Girlz Culture'), { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const gallery = 'docs/screenshots/p0/' + testInfo.project.name + '/operations';
    await mkdir(gallery, { recursive: true });
    await page.screenshot({ path: gallery + '/manual-preview-' + locale + '.png', fullPage: true });
    await page.getByRole('button', { name: t('Confirm this change'), exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/bookings/${pending!.id}`));
    expect(writes).toBe(1);
    await expect(page.getByText('Sheila', { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: t('Manage business-added appointment') })).toBeVisible();
    expect(writes).toBe(1);
    expect(fixture.unexpected).toEqual([]);
  });

  test(`P0 operational calendar dictated transcript requires preview and confirmation in ${locale}`, async ({ page }) => {
    const fixture = await p0OwnerFixture(page, { populated: true, locale });
    const t = (source: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source;
    await page.addInitScript(() => {
      class Speech {
        lang = ''; onresult: ((event: unknown) => void) | null = null; onend: (() => void) | null = null;
        start() { (window as unknown as { fixtureSpeech: Speech }).fixtureSpeech = this; }
        stop() { this.onend?.(); } abort() { this.onend?.(); }
      }
      Object.assign(window, { SpeechRecognition: Speech });
    });
    const posts: Record<string, unknown>[] = []; let writes = 0;
    await page.route('**/api/salon/assistant', route => {
      const input = route.request().postDataJSON(); posts.push(input);
      if (input.action === 'confirm') { writes++; return route.fulfill({ json: { verified: true, result: { booking_origin: 'business_added', customer_name: 'Sheila' } } }); }
      expect(input.text).toBe('Sheila — reviewed transcript');
      return route.fulfill({ json: { request: { id: input.request_id, digest: 'b'.repeat(64), tool: 'prepare_manual_appointment', arguments: { guest_name: 'Sheila', source: 'phone' }, execution_payload: { duration_minutes: 120, payment_status: 'Not collected by Girlz Culture' }, before_summary: {}, risk_class: 3 }, preview_required: true } });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/salon/dashboard');
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'GC Assistant' });
    await dialog.getByRole('button', { name: t('Dictate a request') }).click();
    const language = await page.evaluate(() => {
      const speech = (window as unknown as { fixtureSpeech: { lang: string; onresult: (event: unknown) => void; onend: () => void } }).fixtureSpeech;
      speech.onresult({ results: [{ isFinal: true, 0: { transcript: 'Sheila spoken draft' } }] }); speech.onend(); return speech.lang;
    });
    expect(language).toBe(({ en: 'en-US', fr: 'fr-FR', wo: 'wo-SN', es: 'es-ES', 'zh-CN': 'zh-CN' } as Record<string, string>)[locale]);
    await expect(dialog.locator('textarea')).toHaveValue('Sheila spoken draft');
    expect(posts).toHaveLength(0); expect(writes).toBe(0);
    await dialog.locator('textarea').fill('Sheila — reviewed transcript');
    await dialog.getByRole('button', { name: t('Ask GC Assistant'), exact: true }).click();
    await expect(dialog.getByRole('heading', { name: t('Review this draft') })).toBeVisible();
    expect(writes).toBe(0);
    await dialog.getByRole('button', { name: t('Confirm this change'), exact: true }).click();
    await expect(dialog.locator('article').last()).toContainText(t('Your change was saved and verified.'));
    expect(writes).toBe(1);
    await page.evaluate(() => { Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined }); });
    await dialog.getByRole('button', { name: t('Dictate a request') }).click();
    await expect(dialog).toContainText(t('Dictation is unavailable in this browser. You can type your request.'));
    await dialog.locator('textarea').fill('Typed fallback remains editable');
    await expect(dialog.locator('textarea')).toHaveValue('Typed fallback remains editable');
    expect(writes).toBe(1); expect(fixture.unexpected).toEqual([]);
  });
}
