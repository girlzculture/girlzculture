import { expect, type Locator } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { buildAuthStorageKeys } from '../../src/lib/authSessionCore';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import { POLICY_DEFAULTS } from '../../src/lib/businessPolicyCore';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });

async function clickPolicySummary(summary: Locator) {
  // Finish positioning before clicking. WebKit/Firefox auto-scroll previously
  // lost clicks when a summary started behind the fixed owner navigation.
  await summary.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await summary.click();
}

for (const recipient of ['customer', 'team', 'support'] as const) {
  test(`P0 booking recipient ${recipient} retains welcome, policy and original in all locales`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const fixture = await p0OwnerFixture(page, { populated: true, role: recipient === 'team' ? 'salon_team' : recipient === 'support' ? 'admin' : 'customer', seedSession: recipient === 'team' });
    fixture.business.user_id = '11000000-0000-4000-8000-000000000009';
    const scope = recipient === 'team' ? 'salon' : recipient === 'support' ? 'admin' : 'customer';
    const role = recipient === 'team' ? 'salon' : scope;
    if (scope !== 'salon') await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: buildAuthStorageKeys(fixture.provider)[scope], session: fixture.session });
    const booking = { ...fixture.records.bookings[0], appointment_datetime: String(fixture.records.bookings[0].appointment_datetime), customer_id: fixture.session.user.id, salon: fixture.business, style: { name: 'Save' }, business_policy_revision_id: '55000000-0000-4000-8000-000000000001', business_policy_version: 1, business_policy_source_locale: 'en', business_policy_snapshot: POLICY_DEFAULTS };
    const original = '  Original Save GCABC12 $180 https://example.test  ';
    const translated: Record<string, string> = { en: original, fr: 'Texte Save GCABC12 $180 https://example.test', wo: 'Bataaxal Save GCABC12 $180 https://example.test', es: 'Texto Save GCABC12 $180 https://example.test', 'zh-CN': '消息 Save GCABC12 $180 https://example.test' };
    const message = { id: '44000000-0000-4000-8000-000000000001', booking_id: fixture.ids.booking, body: original, original_body: original, source_locale: 'en', sender_role: recipient === 'customer' ? 'salon' : 'customer', created_at: new Date().toISOString() };
    const messages = [message];
    const posts: Record<string, unknown>[] = [];
    await page.route(`${fixture.provider}/rest/v1/**`, route => {
      const table = new URL(route.request().url()).pathname.split('/').at(-1);
      if (table === 'customers') return route.fulfill({ json: [{ id: fixture.session.user.id, name: 'Save', email: 'customer@example.test' }] });
      if (table === 'bookings') return route.fulfill({ json: [booking] });
      if (table === 'product_orders') return route.fulfill({ json: [] });
      return route.fallback();
    });
    await page.route('**/api/customer/favorites', route => route.fulfill({ json: { salons: [] } }));
    if (recipient === 'team') await page.route('**/api/salon/workspace', route => route.fulfill({ json: { salon: fixture.business, isOwner: false, isTeamMember: true, permissions: { bookings: true }, records: fixture.records } }));
    if (recipient === 'support') {
      await page.route('**/api/admin/verify', route => route.fulfill({ json: { is_super_admin: true } }));
      await page.route('**/api/admin/data?**', route => route.fulfill({ json: { salons: [fixture.business], bookings: [booking] } }));
      await page.route('**/api/admin/inbox-counts', route => route.fulfill({ json: { support: 0, complaints: 0 } }));
      await page.route(`**/api/admin/bookings/${fixture.ids.booking}`, route => route.fulfill({ json: { booking, salon: fixture.business, styles: fixture.records.styles, stylists: fixture.records.stylists, audit: [], admin_time_zone: fixture.business.time_zone } }));
    }
    await page.route('**/api/messages**', route => {
      const request = route.request();
      if (request.method() === 'POST') {
        const input = request.postDataJSON(); posts.push(input);
        if (input.action === 'translate_display') return route.fulfill({ json: { translation: { translated_body: translated[input.locale], reviewed: false } } });
        expect(recipient).not.toBe('support');
        expect(input.booking_id).toBe(fixture.ids.booking);
        const sent = { ...message, id: input.client_request_id, body: input.body, original_body: input.body, source_locale: fixture.accountLocale(), sender_role: role };
        messages.push(sent);
        return route.fulfill({ json: { message: sent } });
      }
      if (new URL(request.url()).searchParams.has('booking_id')) return route.fulfill({ json: { booking, messages, role, welcome: { facts: { reference: 'GCABC12', customer_name: 'Save', business_name: 'Save', service_name: 'Save', appointment_datetime: booking.appointment_datetime, time_zone: fixture.business.time_zone, status: 'Confirmed' } } } });
      return route.fulfill({ json: { threads: [{ booking, messages }], role } });
    });
    const url = recipient === 'customer' ? `/account?tab=inbox&booking=${fixture.ids.booking}` : recipient === 'team' ? `/salon/dashboard/messages/${fixture.ids.booking}` : `/admin/bookings/${fixture.ids.booking}`;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    if (recipient === 'team') await page.locator('summary').filter({ hasText: 'Booking and customer context' }).click();
    await expect(page.getByRole('heading', { name: 'Your booking conversation', exact: true })).toBeVisible();
    const gallery = `docs/screenshots/p0/${testInfo.project.name}/recipient-${recipient}`;
    await mkdir(gallery, { recursive: true });
    for (const locale of ['en', 'fr', 'wo', 'es', 'zh-CN']) {
      const t = (source: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source;
      await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first().selectOption(locale);
      await expect.poll(fixture.accountLocale).toBe(locale);
      await expect(page.getByRole('heading', { name: t('Your booking conversation'), exact: true })).toBeVisible();
      if (recipient === 'support') {
        const originalHeadings = page.getByRole('heading', { name: 'Save', exact: true, level: 2 });
        await expect(originalHeadings).toHaveCount(2);
        await expect(originalHeadings.first()).toBeVisible();
        await expect(originalHeadings.last()).toBeVisible();
        expect(await page.locator('option').filter({ hasText: /^Save$/ }).count()).toBe(2);
      }
      await expect(page.locator('article').filter({ hasText: translated[locale].trim() }).last()).toBeVisible();
      const evidence = page.locator('details').filter({ has: page.locator(':scope > summary').filter({ hasText: t('Policy recorded for this booking') }) }).first();
      await expect(evidence).toHaveJSProperty('open', false);
      await clickPolicySummary(evidence.locator(':scope > summary'));
      await expect(evidence).toHaveJSProperty('open', true);
      await expect(evidence).toContainText(t('Cancellation notice (hours)') + ': 24');
      const fullPolicy = evidence.locator('details');
      await expect(fullPolicy.locator('summary')).toContainText(t('Version') + ' 1');
      await expect(fullPolicy).toHaveJSProperty('open', false);
      await clickPolicySummary(fullPolicy.locator('summary'));
      await expect(fullPolicy).toHaveJSProperty('open', true);
      await expect(fullPolicy).toContainText(t('Rescheduling notice (hours)'));
      await expect(evidence).toContainText(t('Deposits follow platform rules. The remaining balance is due after the service. Contact the business for satisfaction concerns; platform refund and Care protections still apply.'));
      await page.screenshot({ path: `${gallery}/${locale}-translated-policy.png`, fullPage: true, ...screenshotCaret });
      if (locale !== 'en') {
        await page.getByRole('button', { name: t('Show original'), exact: true }).first().click();
        expect(await page.locator('[data-no-translate]').filter({ hasText: original.trim() }).last().textContent()).toBe(original);
      }
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const inbox = page.locator('section').filter({ has: page.getByRole('heading', { name: t('Your booking conversation'), exact: true }) }).last();
        const audit = await new AxeBuilder({ page }).include(await inbox.evaluate(element => { element.setAttribute('data-p0-inbox-audit', 'true'); return '[data-p0-inbox-audit=true]'; })).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(audit.violations).toEqual([]);
        await page.screenshot({ path: `${gallery}/${locale}-${width}.png`, fullPage: true, ...screenshotCaret });
      }
      await clickPolicySummary(fullPolicy.locator('summary'));
      await expect(fullPolicy).toHaveJSProperty('open', false);
      await clickPolicySummary(evidence.locator(':scope > summary'));
      await expect(evidence).toHaveJSProperty('open', false);
    }
    if (recipient === 'support') {
      await expect(page.locator('#booking-message')).toHaveCount(0);
      expect(posts.every(row => row.action === 'translate_display')).toBe(true);
    } else {
      await page.locator('#booking-message').fill('  Unchanged reply Save GCABC12 $180  ');
      await page.locator('#booking-message').locator('..').getByRole('button').click();
      await expect.poll(() => messages.at(-1)?.original_body).toBe('  Unchanged reply Save GCABC12 $180  ');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    }
    expect(message.original_body).toBe(original);
    expect(fixture.unexpected).toEqual([]);
  });
}
