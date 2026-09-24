import {releaseInterfaceLocale,assertDeferredLocale} from './helpers/releaseLocales';
import { expect } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import { expectedAssistantReply } from "./helpers/assistantReply";
import { validateTool } from '../../src/lib/gcAssistantCore';
import { POLICY_DEFAULTS } from '../../src/lib/businessPolicyCore';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

// Service-worker-owned fetches bypass Playwright page.route in WebKit. Keep
// this API-fixture test isolated; real service workers retain their PWA suite.
test.use({ serviceWorkers: 'block' });

for (const [width, height] of [[390, 844], [768, 900], [1440, 900], [844, 390]]) {
  test(`P0 Assistant all skills preserve conversational language switches at ${width}x${height}`, async ({ page }) => {
    const fixture = await p0OwnerFixture(page, { populated: true, locale: 'en' });
    await page.setViewportSize({ width, height });
    const requestLocales: string[] = [];
    const responses = [
      { response_locale: 'wo', clarification: 'Waaw, dinaa tontu ci Wolof.' },
      { response_locale: 'wo', assistant_message: 'Silk Press 120 USD la.' },
      { response_locale: 'en', clarification: 'I will answer in English.' },
      { response_locale: 'en', assistant_message: 'Silk Press costs 120 USD.' },
    ];
    await page.route('**/api/salon/assistant', route => {
      requestLocales.push(route.request().postDataJSON().locale);
      return route.fulfill({ json: responses[requestLocales.length - 1] });
    });
    await page.goto('/salon/dashboard');
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'GC Assistant' });
    for (const [i, text] of ['Please reply in Wolof.', 'How much is Silk Press?', 'Switch to English.', 'And the base price?'].entries()) {
      await dialog.locator('textarea').fill(text);
      await dialog.getByRole('button', { name: 'Ask GC Assistant', exact: true }).click();
      await expect(dialog.locator('article').last()).toContainText(responses[i].clarification || responses[i].assistant_message!);
    }
    expect(requestLocales).toEqual(['en', 'wo', 'wo', 'en']);
    await dialog.getByRole('button', { name: 'Close GC Assistant' }).click();
    await expect(page.getByRole('combobox', { name: 'Select language' })).toHaveValue('en');
    expect(fixture.unexpected).toEqual([]);
  });
}

// Scripted API contracts exercise the real drawer and confirmation flow. They
// are NOT provider natural-language acceptance. SQL and server tests separately
// prove permission checks, atomic authoritative writes and idempotency.
for (const requestedLocale of ['en', 'fr', 'wo', 'es', 'zh-CN']) {
  const locale=releaseInterfaceLocale(requestedLocale);
  test(`P0 Assistant all skills and governed fallback in ${requestedLocale==='wo'?'stored wo fallback to English':locale}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const fixture = await p0OwnerFixture(page, { populated: true, locale: requestedLocale });
    const t = (value: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[value] || value;
    await page.setViewportSize({ width: 390, height: 844 });
    const gallery = `docs/screenshots/p0/${testInfo.project.name}/skills-${requestedLocale}`;
    await mkdir(gallery, { recursive: true });
    const hours = Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => [day, { open: '09:00', close: day === 'Wednesday' ? '16:00' : '19:00', closed: day === 'Sunday' }]));
    const range = { start: '2027-01-05T18:00:00Z', end: '2027-01-05T21:00:00Z' };
    const requests: Record<string, unknown>[] = [];
    const mutations: string[] = [];
    let next: Record<string, unknown> = {};
    let pending: Record<string, unknown> | null = null;
    await page.route('**/api/salon/assistant', async route => {
      const input = route.request().postDataJSON(); requests.push(input);
      expect(input.locale).toBe(locale);
      if (input.action === 'confirm') {
        expect(pending).not.toBeNull();
        expect(input).toMatchObject({ request_id: pending!.id, digest: pending!.digest, confirm: true });
        if (pending!.tool === 'prepare_business_policy_update') expect(input.policy_reviewed).toBe(true);
        const args = pending!.arguments as Record<string, unknown>;
        if (pending!.tool === 'prepare_business_profile_update') fixture.business.hours = Object.fromEntries(Object.entries(args.hours as object).map(([day, value]) => [day.slice(0, 3), value]));
        if (pending!.tool === 'prepare_availability_block') fixture.records.salon_blockouts.push({ id: input.request_id, ...args });
        if (pending!.tool === 'prepare_service') fixture.records.styles.push({ id: input.request_id, salon_id: fixture.business.id, ...(pending!.execution_payload as object) });
        if (pending!.tool === 'prepare_customer_message') fixture.conversationMessages.push({ id: input.request_id, booking_id: fixture.ids.booking, sender_role: 'salon', body: String(args.body), original_body: String(args.body), source_locale: locale, created_at: new Date().toISOString() });
        if (pending!.tool === 'prepare_business_policy_update') {
          fixture.revisions.push({ id: input.request_id, version: 1, policy: args.policy as typeof POLICY_DEFAULTS, source_locale: locale, published_at: new Date().toISOString(), created_at: new Date().toISOString() });
          fixture.business.business_policy_revision_id = input.request_id;
        }
        mutations.push(String(pending!.tool));
        return route.fulfill({ json: { verified: true, replayed: false, result: pending!.execution_payload, warnings: [] } });
      }
      if (next.unavailable) return route.fulfill({ status: 503, json: { code: 'ASSISTANT_UNAVAILABLE', request_id: 'P0-PROVIDER-FIXTURE' } });
      if (next.navigate || next.clarification) return route.fulfill({ json: next });
      const contract = validateTool(next.tool, next.args);
      pending = { id: input.request_id, tool: contract.tool, arguments: contract.args, execution_payload: next.payload || {}, before_summary: {}, result: next.result || null, risk_class: contract.risk, digest: 'a'.repeat(64), confirmed_at: null };
      return route.fulfill({ json: { request: pending, preview_required: contract.risk >= 3 } });
    });
    await page.goto('/salon/dashboard/my-page/business-policies');
    await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first().selectOption(locale);
    await assertDeferredLocale(page,requestedLocale);
    await expect.poll(fixture.accountLocale).toBe(locale);
    await page.screenshot({ path: `${gallery}/closed.png`, ...screenshotCaret });
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'GC Assistant' });
    async function ask(text: string) {
      await dialog.locator('textarea').fill(text);
      await dialog.getByRole('button', { name: t('Ask GC Assistant'), exact: true }).click();
    }
    const bookingQuestions: Record<string, string> = { en: 'What bookings do I have tomorrow?', fr: 'Quels rendez-vous ai-je demain ?', wo: 'Yan rendez-vous laa am ëllëg ?', es: '¿Qué citas tengo mañana?', 'zh-CN': '我明天有哪些预约？' };
    const reads = [
      { tool: 'get_bookings', args: range, result: { bookings: [fixture.records.bookings[0]], time_zone: fixture.business.time_zone } },
      { tool: 'get_business_summary', args: range, result: { bookings: 1, by_status: { Confirmed: 1 } } },
      { tool: 'get_availability', args: { style_id: fixture.ids.service, stylist_id: null, date: '2027-01-05' }, result: { date: '2027-01-05', time_zone: fixture.business.time_zone, slots: [{ time: '13:00', professional_name: 'Save', stylist_id: fixture.ids.professional }] } },
      { tool: 'get_business_profile', args: {}, result: { name: 'Save', description: fixture.business.description } },
      { tool: 'get_services_and_prices', args: { query: 'Save' }, result: { services: fixture.records.styles, total: 1 } },
      { tool: 'get_business_policies', args: {}, result: { policy: POLICY_DEFAULTS, version: 1 } },
    ];
    for (const read of reads) {
      next = read;
      await ask(bookingQuestions[locale]);
      await expect(dialog.locator('article').last()).toContainText(await expectedAssistantReply(page, read.tool, read.result, locale));
      await expect(dialog.locator('article').last().locator('dl')).toHaveCount(0);
      expect(mutations).toHaveLength(0);
    }
    await page.screenshot({ path: `${gallery}/conversation.png`, ...screenshotCaret });
    next = { clarification: t('What would you like help with?') };
    await dialog.getByText(t('Conversation options'), { exact: true }).click();
    const conversationOptions = dialog.locator('details').filter({ has: page.getByText(t('Conversation options'), { exact: true }) });
    await expect(conversationOptions).toHaveJSProperty('open', true);
    await dialog.getByRole('button', { name: t('Set up with GC Assistant'), exact: true }).click();
    await expect(dialog.locator('article').last()).toContainText(t('What would you like help with?'));
    const skills = [
      { tool: 'prepare_business_profile_update', args: { field: 'hours', text: null, hours }, payload: { hours: Object.fromEntries(Object.entries(hours).map(([day, value]) => [day.slice(0, 3), value])) }, text: 'I work Monday to Saturday 9 to 7, but Wednesday I close at 4.' },
      { tool: 'prepare_availability_block', args: { ...range, time_zone: fixture.business.time_zone, stylist_id: null, reason: 'Original appointment' }, payload: { time_zone: fixture.business.time_zone, all_professionals: true }, text: 'Block Tuesday 1–4.' },
      { tool: 'prepare_service', args: { master_style_id: fixture.ids.master, name: 'Medium knotless braids', price: 180, duration_hours: 4, requested_deposit: null, length_addons: [{ name: 'Waist', price: 40 }] }, payload: { name: 'Medium knotless braids', base_price: 180, duration_min_hours: 4, duration_max_hours: 4, is_draft: true, category_id: fixture.ids.category, service_group_id: fixture.ids.group }, text: 'Add medium knotless braids for $180, four hours; waist length adds $40. Use platform deposit rules.' },
      { tool: 'prepare_customer_message', args: { booking_id: fixture.ids.booking, body: '  Save, you can come at 3. GCABC12 $180  ' }, payload: { customer_name: 'Save', public_reference: 'GCABC12', time_zone: fixture.business.time_zone }, text: 'Draft a message to Save about GCABC12.' },
      { tool: 'prepare_business_policy_update', args: { policy: { ...POLICY_DEFAULTS, cancellation_hours: 24 } }, payload: {}, text: 'Set my cancellation window to 24 hours.' },
    ];
    for (const skill of skills) {
      next = skill;
      const before = JSON.stringify({ business: fixture.business, records: fixture.records, messages: fixture.conversationMessages, revisions: fixture.revisions });
      await ask(skill.text);
      const article = dialog.locator('article').last();
      await expect(article.getByRole('heading', { name: t('Review this draft') })).toBeVisible();
      expect(JSON.stringify({ business: fixture.business, records: fixture.records, messages: fixture.conversationMessages, revisions: fixture.revisions })).toBe(before);
      const risk = validateTool(skill.tool, skill.args).risk;
      const confirm = article.getByRole('button', { name: t(risk === 4 ? 'Confirm this public action' : 'Confirm this change') });
      if (skill.tool === 'prepare_business_policy_update') { await expect(confirm).toBeDisabled(); await article.getByRole('checkbox').check(); }
      await confirm.scrollIntoViewIfNeeded();
      const audit = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(audit.violations).toEqual([]);
      await page.screenshot({ path: `${gallery}/${skill.tool}-preview.png`, ...screenshotCaret });
      await confirm.click();
      await expect(article.getByRole('status')).toHaveText(t('Your change was saved and verified.'));
    }
    expect(mutations).toEqual(skills.map(skill => skill.tool));
    expect(fixture.business.hours).toMatchObject({ Wed: { close: '16:00' }, Sat: { close: '19:00' } });
    expect(fixture.records.salon_blockouts).toHaveLength(1);
    expect(fixture.records.styles.at(-1)).toMatchObject({ name: 'Medium knotless braids', base_price: 180, is_draft: true });
    expect(fixture.conversationMessages.at(-1)?.original_body).toBe('  Save, you can come at 3. GCABC12 $180  ');
    expect(fixture.revisions.at(-1)?.policy.cancellation_hours).toBe(24);
    await page.screenshot({ path: `${gallery}/confirmed.png`, ...screenshotCaret });
    next = { navigate: 'subscription' };
    await ask('Change my subscription charge and refund this booking.');
    await expect(dialog.locator('article').last().getByRole('link')).toHaveAttribute('href', '/salon/dashboard/subscription');
    expect(mutations).toHaveLength(5);
    await page.screenshot({ path: `${gallery}/class-five-controlled-workflow.png`, ...screenshotCaret });
    next = { unavailable: true };
    await ask(bookingQuestions[locale]);
    await expect(dialog.getByRole('status', { name: t('GC Assistant status'), exact: true })).toHaveText(t('GC Assistant could not reach its AI service. The dashboard and read-only quick actions are still available.'));
    await expect(dialog.getByText('P0-PROVIDER-FIXTURE', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${gallery}/provider-unavailable.png`, ...screenshotCaret });
    next = reads[3];
    await dialog.getByRole('button', { name: t('My business profile'), exact: true }).click();
    await expect(dialog.locator('article').last()).toContainText(fixture.business.description);
    const dimensions = [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 1180, height: 820 }];
    await page.setViewportSize(dimensions[['en', 'fr', 'wo', 'es', 'zh-CN'].indexOf(locale)]);
    // Resizing retains the open disclosure; clicking it again would close it.
    await expect(conversationOptions).toHaveJSProperty('open', true);
    await dialog.getByRole('button', { name: t('New conversation'), exact: true }).click();
    await expect(dialog.locator('article')).toHaveCount(0);
    next = { navigate: 'photos' };
    await ask('Help me with photos.');
    await expect(dialog.locator('article').last().getByRole('link')).toHaveAttribute('href', '/salon/dashboard/photos');
    expect(requests.at(-1)).toMatchObject({ action: 'plan', page: 'my-page', previous_request_ids: [], conversation: [] });
    await expect(dialog.locator('article').last().getByRole('link')).toContainText(t('Photos'));
    const contextAudit = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(contextAudit.violations).toEqual([]);
    await dialog.getByRole('button', { name: t('Close GC Assistant') }).click();
    await expect(page.getByRole('button', { name: 'GC Assistant', exact: true })).toBeFocused();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByLabel(t('Cancellation notice (hours)'), { exact: true })).toHaveValue('24');
    expect(fixture.unexpected).toEqual([]);
    expect(requests.filter(row => row.action === 'confirm')).toHaveLength(5);
  });
}
