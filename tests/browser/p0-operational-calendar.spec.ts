import {releaseInterfaceLocale,assertDeferredLocale} from './helpers/releaseLocales';
import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import AxeBuilder from '@axe-core/playwright';
import { presentAssistantResult } from "../../src/lib/gcAssistantPresentation";
import { expectedAssistantReply } from "./helpers/assistantReply";
import { validateTool } from '../../src/lib/gcAssistantCore';
import { mkdir } from 'node:fs/promises';

// Match the existing Assistant API-fixture boundary: WebKit service workers
// own fetches and bypass page.route. Real PWA behavior retains its own suite.
test.use({ serviceWorkers: 'block' });

// The failed CI trace moved the viewport by 64px during Review's pointer
// sequence. Guard the correction directly and exercise a native pointer click
// after a 64px reposition. Center the initial target clear of fixed navigation.
// Use native scrolling after Playwright establishes the target is stable.
// A JS scrollTo result can be transient in Firefox: CI observed 779px, then
// the page was back at 604px before the next command. Native wheel input
// avoids subtracting from that stale baseline. No click retry or DOM submit.
for (const viewport of [
  { width: 1440, height: 900 }, { width: 768, height: 900 },
  { width: 390, height: 844 }, { width: 844, height: 390 },
]) {
  test(`P0 operational calendar preserves Review pointer activation after viewport repositioning at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const fixture = await p0OwnerFixture(page, { populated: true, locale: 'en' });
    await page.setViewportSize(viewport);
    // Exercise the CI failure boundary: this font can be requested only after
    // the owner form renders, after navigation has already completed.
    let releaseFont: (() => void) | undefined;
    if (viewport.width === 390) {
      const fontGate = new Promise<void>(resolve => { releaseFont = resolve; });
      await page.route('**/fonts/montserrat/Montserrat-Medium.woff2', async route => {
        await fontGate;
        await route.fulfill({ path: 'public/fonts/montserrat/Montserrat-Medium.woff2', contentType: 'font/woff2' });
      });
    }
    const posts: unknown[] = [];
    async function waitForScroll(top: number) {
      try {
        await page.waitForFunction(target => Math.abs(scrollY - target) < 0.01, top, { polling: 'raf', timeout: 5000 });
      } catch (error) {
        await testInfo.attach('calendar-scroll-position', { body: JSON.stringify(await page.evaluate(target => ({ target, scrollY, documentTop: document.documentElement.scrollTop, bodyTop: document.body.scrollTop, viewport: innerHeight, height: document.documentElement.scrollHeight, behavior: getComputedStyle(document.documentElement).scrollBehavior, focused: document.activeElement?.tagName }), top)), contentType: 'application/json' });
        throw error;
      }
    }
    await page.route('**/api/salon/assistant', route => {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 409, json: { code: 'ASSISTANT_AVAILABILITY_CONFLICT' } });
    });
    await page.addInitScript(() => {
      const events: { type: string; target: string; scrollY: number }[] = [];
      Object.assign(window, { calendarPointerEvents: events });
      for (const type of ['pointerdown', 'pointerup', 'click', 'submit', 'invalid']) {
        document.addEventListener(type, event => {
          const target = event.target as HTMLElement;
          if (target.closest('form')) events.push({ type, target: target.tagName, scrollY });
        }, true);
      }
    });
    try {
      await page.goto('/salon/dashboard/bookings/new', { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Customer name', { exact: true }).fill('Sheila');
      await page.getByRole('combobox', { name: 'Service', exact: true }).selectOption(fixture.ids.service);
      await page.getByRole('combobox', { name: 'Professional', exact: true }).selectOption(fixture.ids.professional);
      await page.getByLabel('Date', { exact: true }).fill('2030-09-24');
      await page.getByLabel('Time', { exact: true }).fill('13:00');
      // Firefox restores the focused native time input's scroll position on
      // layout. End field editing before staging a separate page reposition;
      // ordinary focused-input Review clicks are covered by the preview test.
      await page.getByLabel('Time', { exact: true }).blur();
      const review = page.getByRole('button', { name: 'Review appointment', exact: true });
      await expect(review).toBeEnabled();
      expect(await review.evaluate(button => (button as HTMLButtonElement).form!.checkValidity())).toBe(true);
      await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
      if (releaseFont) {
        expect(await page.evaluate(() => document.fonts.status)).toBe('loading');
        releaseFont();
      }
      // A late font swap anchored the page 23px away from the measured target
      // in CI. Await actual font/layout readiness before measuring the native
      // wheel baseline; keep the exact 64px movement and pointer checks below.
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await review.scrollIntoViewIfNeeded();
      const centered = await review.evaluate(button => {
        const rect = button.getBoundingClientRect();
        const delta = Math.round(Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, scrollY + rect.y + rect.height / 2 - innerHeight / 2)) - scrollY);
        return { previous: scrollY, delta, top: scrollY + delta };
      });
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.mouse.wheel(0, centered.delta);
      await waitForScroll(centered.top);
      const previous = await page.evaluate(() => scrollY);
      expect(previous).toBe(centered.top);
      await page.mouse.wheel(0, -64);
      await waitForScroll(previous - 64);
      expect(await page.evaluate(before => before - scrollY, previous)).toBe(64);
      const point = await review.evaluate(button => {
        const rect = button.getBoundingClientRect();
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, scrollY, hitTag: hit?.tagName ?? null, targetIsReview: button.contains(hit) };
      });
      await testInfo.attach('calendar-scroll-staging', { body: JSON.stringify({ centered, previous, point }), contentType: 'application/json' });
      expect(point.targetIsReview, 'Review must not be covered by fixed navigation').toBe(true);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.up();
      await expect(page.getByRole('status').filter({ hasText: 'That time is unavailable. Choose another time.' })).toBeVisible();
      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({ action: 'tool', tool: 'prepare_manual_appointment', args: { guest_name: 'Sheila', style_id: fixture.ids.service, stylist_id: fixture.ids.professional, date: '2030-09-24', time: '13:00' } });
    } finally {
      releaseFont?.();
      // Diagnostics must not replace the original failure after timeout closes
      // the page. Playwright still retains its trace and screenshot.
      const events = page.isClosed() ? 'page closed before diagnostic collection' : await page.evaluate(() => (window as unknown as { calendarPointerEvents: unknown[] }).calendarPointerEvents).catch(() => 'page closed during diagnostic collection');
      await testInfo.attach('calendar-pointer-events', { body: JSON.stringify({ events, requestCount: posts.length }, null, 2), contentType: 'application/json' });
    }
  });
}

// Browser API and speech fixtures exercise the real components. SQL/server
// suites separately prove persistence and authorization; this is not live AI.
for (const requestedLocale of ['en', 'fr', 'wo', 'es', 'zh-CN']) {
  const locale=releaseInterfaceLocale(requestedLocale);
  test(`P0 operational calendar keeps original record names and supports service searches in ${requestedLocale==='wo'?'stored wo fallback to English':locale}`, async ({ page }) => {
    test.setTimeout(60_000);
    const fixture = await p0OwnerFixture(page, { populated: true, locale: requestedLocale });
    const t = (source: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source;
    fixture.records.styles[0].name = 'Silk Press';
    fixture.records.stylists[0].name = 'Danielle Save';
    fixture.records.bookings[0].appointment_datetime = '2030-09-24T17:00:00.000Z';
    fixture.records.bookings.push({ ...fixture.records.bookings[0], id: '33000000-0000-4000-8000-000000000019', guest_name: 'Manual guest', style_id: null, manual_service_name: 'Custom Save', booking_origin: 'business_added', source: 'phone' });
    await page.setViewportSize({ width: locale === 'en' ? 1440 : locale === 'fr' ? 768 : locale === 'es' ? 844 : 390, height: locale === 'es' ? 390 : 900 });
    await page.goto('/salon/dashboard/availability/calendar');
    await assertDeferredLocale(page,requestedLocale);
    const calendar = page.getByRole('region', { name: t('Appointment calendar'), exact: true });
    await calendar.getByLabel(t('Calendar date'), { exact: true }).fill('2030-09-24');
    const recorded = calendar.locator(`a[href="/salon/dashboard/bookings/${fixture.ids.booking}"]`);
    const manual = calendar.locator('a[href="/salon/dashboard/bookings/33000000-0000-4000-8000-000000000019"]');
    for (const view of ['Day', 'Week', 'Month']) {
      await calendar.getByRole('button', { name: t(view), exact: true }).click();
      await expect(recorded).toContainText('Silk Press · Danielle Save');
      await expect(recorded.locator('b')).toHaveText('Save');
      await expect(manual).toContainText('Custom Save · Danielle Save');
      await expect(calendar).not.toContainText('[object Object]');
    }
    await calendar.getByRole('textbox', { name: t('Filter calendar appointments'), exact: true }).fill('Silk Press');
    await expect(recorded).toBeVisible();
    await expect(manual).toHaveCount(0);
    await page.goto('/salon/dashboard/bookings?group=All');
    await assertDeferredLocale(page,requestedLocale);
    const search = page.getByRole('searchbox', { name: t('Search bookings'), exact: true });
    for (const query of ['Silk Press', 'Danielle Save', 'Custom Save']) {
      await search.fill(query);
      await page.getByRole('button', { name: t('Search'), exact: true }).click();
      await expect(page.getByRole('main').getByText(query, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    }
    expect(fixture.unexpected).toEqual([]);
  });

  test(`P0 operational calendar expanded reads and drafts in ${requestedLocale==='wo'?'stored wo fallback to English':locale}`, async ({ page }) => {
    const fixture = await p0OwnerFixture(page, { populated: true, locale: requestedLocale });
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
    await assertDeferredLocale(page,requestedLocale);
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'GC Assistant' });
    async function ask() { await dialog.locator('textarea').fill('Business request'); await dialog.getByRole('button', { name: t('Ask GC Assistant'), exact: true }).click(); }
    for (const [tool, args, result] of reads) {
      next = { tool, args, result }; await ask();
      await expect(dialog.locator('article').last()).toContainText(await expectedAssistantReply(page, tool, result, locale));
      await expect(dialog.locator('article').last().locator('dl')).toHaveCount(0);
      expect(writes).toBe(0);
      expect(presentAssistantResult(tool, result, locale).message.length).toBeLessThan(900);
    }
    for (const [index, [tool, args]] of drafts.entries()) {
      next = { tool, args }; await ask(); const article = dialog.locator('article').last();
      await expect(article.getByRole('heading', { name: t('Review this draft') })).toBeVisible(); expect(writes).toBe(index);
      await article.getByRole('button', { name: t('Confirm this change'), exact: true }).click();
      await expect(article.getByRole('status')).toHaveText(t('Your change was saved and verified.')); expect(writes).toBe(index + 1);
    }
    expect(fixture.unexpected).toEqual([]);
  });

  test(`P0 operational calendar dashboard preview and persistence in ${requestedLocale==='wo'?'stored wo fallback to English':locale}`, async ({ page }, testInfo) => {
    const fixture = await p0OwnerFixture(page, { populated: true, locale: requestedLocale });
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
    await page.setViewportSize({ width: locale === 'en' ? 1440 : locale === 'fr' ? 768 : locale === 'wo' ? 844 : 390, height: locale === 'wo' ? 390 : 900 });
    await page.goto('/salon/dashboard/bookings/new');
    await assertDeferredLocale(page,requestedLocale);
    await page.getByLabel(t('Customer name'), { exact: true }).fill('Sheila');
    await page.getByRole('combobox', { name: t('Service'), exact: true }).selectOption(fixture.ids.service);
    await page.getByRole('combobox', { name: t('Professional'), exact: true }).selectOption(fixture.ids.professional);
    await page.getByLabel(t('Date'), { exact: true }).fill(date);
    await page.getByLabel(t('Time'), { exact: true }).fill('13:00');
    await expect(page.getByLabel(t('Customer name'), { exact: true })).toHaveValue('Sheila');
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
    await page.screenshot({ path: gallery + '/manual-preview-' + requestedLocale + '.png', fullPage: true });
    await page.getByRole('button', { name: t('Confirm this change'), exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/bookings/${pending!.id}`));
    expect(writes).toBe(1);
    await expect(page.getByText('Sheila', { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: t('Manage business-added appointment') })).toBeVisible();
    expect(writes).toBe(1);
    expect(fixture.unexpected).toEqual([]);
  });

  test(`P0 operational calendar dictated transcript requires preview and confirmation in ${requestedLocale==='wo'?'stored wo fallback to English':locale}`, async ({ page }) => {
    const fixture = await p0OwnerFixture(page, { populated: true, locale: requestedLocale });
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
    await assertDeferredLocale(page,requestedLocale);
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'GC Assistant' });
    await dialog.getByRole('button', { name: t('Start dictation') }).click();
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
    await dialog.getByRole('button', { name: t('Start dictation') }).click();
    await expect(dialog).toContainText(t('Dictation is unavailable in this browser. You can type your request.'));
    await dialog.locator('textarea').fill('Typed fallback remains editable');
    await expect(dialog.locator('textarea')).toHaveValue('Typed fallback remains editable');
    expect(writes).toBe(1); expect(fixture.unexpected).toEqual([]);
  });
}
