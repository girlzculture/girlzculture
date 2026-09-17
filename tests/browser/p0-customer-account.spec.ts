import { expect, type Page } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { buildAuthStorageKeys } from '../../src/lib/authSessionCore';

test.use({ serviceWorkers: 'block' });

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }, { width: 844, height: 390 }]) {
  test(`P0 customer account follows a real second-tab sign-in and logout at ${viewport.width}px`, async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    const first = await p0OwnerFixture(page, { role: 'customer', seedSession: false });
    const secondPage = await context.newPage();
    const second = await p0OwnerFixture(secondPage, { role: 'customer', seedSession: false, actorId: '11000000-0000-4000-8000-000000000002' });
    const profile = (secondActor: boolean) => ({ id: (secondActor ? second : first).session.user.id, name: secondActor ? 'Second Customer' : 'First Customer', email: secondActor ? 'second@example.test' : 'first@example.test' });
    async function install(target: Page) {
      await target.route(`${first.provider}/auth/v1/user**`, route => route.fulfill({ json: route.request().headers().authorization === `Bearer ${second.session.access_token}` ? second.session.user : first.session.user }));
      await target.route(`${first.provider}/auth/v1/logout**`, route => route.fulfill({ json: {} }));
      await target.route(`${first.provider}/rest/v1/**`, route => {
        const url = new URL(route.request().url());
        const table = url.pathname.split('/').at(-1);
        const nextActor = url.searchParams.get('id') === `eq.${second.session.user.id}` || url.searchParams.get('customer_id') === `eq.${second.session.user.id}`;
        if (table === 'customers') return route.fulfill({ json: [profile(nextActor)] });
        if (table === 'bookings') return route.fulfill({ json: [{ id: nextActor ? '42000000-0000-4000-8000-000000000002' : '42000000-0000-4000-8000-000000000001', appointment_datetime: '2030-01-01T12:00:00Z', status: 'Confirmed', salon: { name: nextActor ? 'Second Private Business' : 'First Private Business', time_zone: 'America/New_York' }, style: { name: 'Braids' } }] });
        if (table === 'product_orders') return route.fulfill({ json: [] });
        return route.fallback();
      });
      await target.route('**/api/customer/favorites', route => route.fulfill({ json: { salons: [] } }));
      await target.route('**/api/auth/login/start', route => route.fulfill({ json: { session: second.session } }));
      await target.route('**/api/auth/destination', route => route.fulfill({ json: { role: 'customer', path: '/account' } }));
      await target.route('**/api/support', route => route.fulfill({ json: { categories: ['Bookings', 'Other'] } }));
    }
    await install(page); await install(secondPage);
    await page.addInitScript(({ key, session }) => {
      if (!sessionStorage.getItem('customer-account-fixture-seeded')) {
        localStorage.setItem(key, JSON.stringify(session));
        sessionStorage.setItem('customer-account-fixture-seeded', 'true');
      }
    }, { key: buildAuthStorageKeys(first.provider).customer, session: first.session });
    await page.goto('/account');
    await expect(page.getByRole('main')).toContainText('First Private Business');
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    await page.getByRole('button', { name: 'Ask a person for help', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Private first customer draft');

    // Exercise the ordinary sign-in UI and Supabase cross-tab notification, not
    // an artificial React event. Authentication responses are localhost fixtures.
    await secondPage.goto('/login');
    await secondPage.locator('input[type=email]').fill('second@example.test');
    await secondPage.locator('#customer-password').fill('isolated-fixture-only');
    await secondPage.locator('form').getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(secondPage).toHaveURL(/\/account$/);
    await expect(page.getByRole('main')).toContainText('Second Private Business');
    await expect(page.locator('body')).not.toContainText('First Private Business');
    await expect(page.locator('dialog')).not.toBeVisible();
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close customer assistant' }).click();
    await page.reload();
    await expect(page.getByRole('main')).toContainText('Second Private Business');
    await secondPage.getByRole('button', { name: 'Log out of customer account' }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/login(?:\?next=.*)?$/);
    await expect(page.locator('body')).not.toContainText('Second Private Business');
    expect(await page.evaluate(key => localStorage.getItem(key), buildAuthStorageKeys(first.provider).customer)).toBeNull();
    await secondPage.close();
  });
}
