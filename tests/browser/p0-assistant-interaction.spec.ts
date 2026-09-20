import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';

test.use({ serviceWorkers: 'block' });

for (const [width, height] of [[390, 844], [768, 900], [1440, 900], [844, 390]]) {
  test(`P0 Assistant workspace remains usable and preserves the conversation at ${width}x${height}`, async ({ page }) => {
    await p0OwnerFixture(page, { populated: true, locale: 'en' });
    await page.setViewportSize({ width, height });
    await page.goto('/salon/dashboard');
    const assistant = page.getByRole('dialog', { name: 'GC Assistant', exact: true });
    const launcher = page.getByRole('button', { name: 'GC Assistant', exact: true });
    if (width >= 1280) {
      await expect(assistant).toBeVisible();
      await expect(assistant).toHaveAttribute('aria-modal', 'false');
      const workspace = await page.locator('[data-owner-workspace]').boundingBox();
      const panel = await assistant.boundingBox();
      expect(workspace!.x + workspace!.width).toBeLessThanOrEqual(panel!.x);
      await assistant.locator('textarea').fill('Keep this draft across my pages');
      await page.getByRole('navigation', { name: 'Salon owner navigation', exact: true }).getByRole('link', { name: 'Photos', exact: true }).click();
      await expect(page).toHaveURL(/\/salon\/dashboard\/photos$/);
      await expect(assistant).toBeVisible();
      await expect(assistant.locator('textarea')).toHaveValue('Keep this draft across my pages');
    } else {
      await expect(assistant).not.toBeVisible();
      await expect(launcher).toBeVisible();
      await launcher.click();
      await expect(assistant).toHaveAttribute('aria-modal', 'true');
    }
    await assistant.getByRole('button', { name: 'Close GC Assistant', exact: true }).click();
    await expect(assistant).not.toBeVisible();
    await launcher.click();
    await expect(assistant).toBeVisible();
    await expect(assistant.locator('textarea')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test(`P0 Assistant submission is immediate and retry preserves one turn at ${width}x${height}`, async ({ page }) => {
    await p0OwnerFixture(page, { populated: true, locale: 'en' });
    await page.setViewportSize({ width, height });
    const requests: Record<string, unknown>[] = [];
    let release!: () => void;
    const responseGate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/salon/assistant', async route => {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) {
        await responseGate;
        await route.fulfill({ status: 503, json: { code: 'ASSISTANT_UNAVAILABLE', request_id: 'CHAT-RETRY-REFERENCE' } });
      } else {
        await route.fulfill({ json: { response_locale: 'en', reply: 'Silk Press costs 120 USD.' } });
      }
    });
    await page.goto('/salon/dashboard');
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    const assistant = page.getByRole('dialog', { name: 'GC Assistant', exact: true });
    const composer = assistant.locator('textarea');
    const question = 'How much is Silk Press?';
    await composer.fill(question);
    const sent = page.waitForRequest(request => request.url().endsWith('/api/salon/assistant'));
    await composer.press('Enter');
    await sent;
    try {
      // The response is deliberately held: these must happen before it arrives.
      await expect(assistant.locator('article').getByText(question, { exact: true })).toBeVisible();
      await expect(composer).toHaveValue('');
      await expect(assistant.getByLabel('GC Assistant is working', { exact: true })).toBeVisible();
      await composer.fill('Keep my next question');
      await composer.press('Enter');
      await expect(assistant.getByRole('button', { name: 'Ask GC Assistant', exact: true })).toBeDisabled();
      expect(requests).toHaveLength(1);
    } finally { release(); }
    const retry = assistant.getByRole('button', { name: 'Retry message', exact: true });
    await expect(retry).toBeVisible();
    await expect(assistant.getByText('CHAT-RETRY-REFERENCE', { exact: true })).toBeVisible();
    await retry.click();
    await expect(assistant.locator('article').last()).toContainText('Silk Press costs 120 USD.');
    await expect(assistant.locator('article')).toHaveCount(1);
    await expect(composer).toHaveValue('Keep my next question');
    await expect(assistant.getByText('CHAT-RETRY-REFERENCE', { exact: true })).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ request_id: requests[0].request_id, text: question, conversation: [] });
  });
}

test('P0 Assistant respects IME, multiline input and reading earlier replies', async ({ page }) => {
  await p0OwnerFixture(page, { populated: true, locale: 'en' });
  await page.setViewportSize({ width: 390, height: 844 });
  let count = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/salon/assistant', async route => {
    count++;
    if (count === 2) await gate;
    await route.fulfill({ json: { reply: count === 1 ? 'A previous explanation. '.repeat(90) : 'The newest answer.' } });
  });
  await page.goto('/salon/dashboard');
  await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
  const assistant = page.getByRole('dialog', { name: 'GC Assistant', exact: true });
  const composer = assistant.locator('textarea');
  await composer.fill('第一行');
  await composer.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true })));
  await expect(composer).toHaveValue('第一行');
  await composer.press('Shift+Enter');
  await composer.press('End');
  await composer.type('Second line');
  await expect(composer).toHaveValue('第一行\nSecond line');
  expect(count).toBe(0);
  await composer.press('Enter');
  await expect(assistant.locator('article').last()).toContainText('A previous explanation.');
  await composer.fill('My follow-up');
  const sent = page.waitForRequest(request => request.url().endsWith('/api/salon/assistant'));
  await composer.press('Enter');
  await sent;
  const viewport = assistant.locator('[data-assistant-conversation]');
  try {
    await viewport.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
    await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(0);
  } finally { release(); }
  await expect(assistant.locator('article').last()).toContainText('The newest answer.');
  expect(await viewport.evaluate(element => element.scrollTop)).toBe(0);
  expect(count).toBe(2);
});
