import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { buildAuthStorageKeys } from '../../src/lib/authSessionCore';
import { customerSupportText } from '../../src/i18n/customer-support-source-catalog';

test.use({ serviceWorkers: 'block' });
const ticketId = '79d996ec-4ec4-408c-8b7c-e82e969b7da9';

for (const locale of ['en', 'fr', 'es', 'wo', 'zh-CN']) {
  test(`P0 customer support draft requires review and preserves the ticket reference in ${locale}`, async ({ page }) => {
    const fixture = await p0OwnerFixture(page, { role: 'customer', seedSession: false, locale });
    await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: buildAuthStorageKeys(fixture.provider).customer, session: fixture.session });
    await page.route(`${fixture.provider}/rest/v1/**`, route => {
      const table = new URL(route.request().url()).pathname.split('/').at(-1);
      if (table === 'customers') return route.fulfill({ json: [{ id: fixture.session.user.id, name: 'Test Customer', email: 'customer@example.test' }] });
      if (table === 'bookings' || table === 'product_orders') return route.fulfill({ json: [] });
      return route.fallback();
    });
    await page.route('**/api/customer/favorites', route => route.fulfill({ json: { salons: [] } }));
    const posts: Record<string, unknown>[] = [];
    await page.route('**/api/support', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { categories: ['Bookings', 'Payments', 'Safety', 'Other'] } });
      posts.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, ticketId } });
    });
    await page.route('**/api/concierge/search', route => route.fulfill({ json: { salons: [], mode: 'deterministic' } }));
    await page.setViewportSize(locale === 'en' ? { width: 1440, height: 1000 } : locale === 'fr' ? { width: 768, height: 1024 } : locale === 'wo' ? { width: 844, height: 390 } : { width: 390, height: 844 });
    await page.goto('/account');
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    const dialog = page.locator('dialog');
    const text = (source: string) => customerSupportText(source, locale);
    const prompt = 'Find a braiding salon in Harlem';
    await dialog.locator('textarea').fill(prompt);
    await dialog.locator('form button[type="submit"], form button:not([type])').last().click();
    await expect(dialog.locator('[aria-label="Assistant conversation"]')).toContainText(prompt);
    await dialog.getByRole('button', { name: text('Ask a person for help'), exact: true }).click();
    const support = dialog.getByRole('region', { name: text('Human support') });
    await expect(support.getByRole('heading', { name: text('Review your support request') })).toBeVisible();
    const message = support.getByRole('textbox', { name: text('Message'), exact: true });
    await expect(message).toHaveValue(new RegExp(prompt));
    expect(posts).toHaveLength(0);
    await support.getByRole('textbox', { name: text('Name'), exact: true }).fill('Test Customer');
    await support.getByRole('textbox', { name: text('Email'), exact: true }).fill('customer@example.test');
    await support.getByRole('combobox', { name: text('Category') }).selectOption('Safety');
    await message.fill('Reviewed safety request; removed private excerpt.');
    await support.getByRole('button', { name: text('Send support request'), exact: true }).click();
    await expect(support.locator('[aria-live="polite"]')).toHaveText(customerSupportText('Your request was received. Reference: {reference}', locale, { reference: ticketId }));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ message: 'Reviewed safety request; removed private excerpt.', category: 'Safety', subject: text('GC Assistant support') });
    expect(JSON.stringify(posts[0])).not.toContain(prompt);
    await expect(message).toHaveValue('');
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await dialog.getByRole('button', { name: text('Discard support draft'), exact: true }).click();
    await expect(message).toHaveCount(0);
    await dialog.locator('header').first().getByRole('button').click();
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    await expect(dialog.locator('[aria-label="Assistant conversation"]')).toHaveCount(0);
  });
}

test('P0 customer support public contact form retains the reviewed draft on an edge failure and never invents a reference', async ({ page }) => {
  await page.route('**/api/support', route => route.fulfill({ status: 502, contentType: 'text/html', headers: { 'x-request-id': ticketId }, body: '<html>private upstream response</html>' }));
  await page.goto('/contact');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Test Customer');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('customer@example.test');
  await page.getByRole('textbox', { name: 'Subject', exact: true }).fill('Booking request');
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Bookings');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Please review my booking request.');
  await page.getByRole('button', { name: 'Send support request', exact: true }).click();
  await expect(page.locator('form [aria-live="polite"]')).toContainText(ticketId);
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Please review my booking request.');
  await expect(page.locator('body')).not.toContainText('private upstream response');
  await expect(page.locator('body')).not.toContainText('Your request was received');
});
