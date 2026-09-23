import {releaseInterfaceLocale,assertDeferredLocale} from './helpers/releaseLocales';
import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';

test.use({ serviceWorkers: 'block' });

// Synthetic voices verify controls and lifecycle only. They do not establish
// installed device voices, microphone accuracy or native pronunciation quality.
for (const [requestedLocale, width, height] of [
  ['en', 390, 844], ['fr', 820, 1180], ['es', 1440, 900], ['wo', 844, 390], ['zh-CN', 1180, 820],
] as const) {
  const locale=releaseInterfaceLocale(requestedLocale);
  test(`P0 Assistant spoken controls and text fallback in ${requestedLocale==='wo'?'stored wo fallback to English without a device voice':locale}`, async ({ page }) => {
    test.setTimeout(90000);
    await p0OwnerFixture(page, { populated: true, locale: requestedLocale });
    await page.setViewportSize({ width, height });
    await page.addInitScript((missingVoice) => {
      const calls: string[] = [];
      Object.defineProperty(window, '__speechCalls', { value: calls });
      class Utterance { text: string; constructor(text: string) { this.text = text; } }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        getVoices: () => (missingVoice?[]:['en-US', 'fr-FR', 'es-ES', 'zh-CN']).map(lang => ({ lang, localService: true })),
        speak: (utterance: { lang: string }) => calls.push(`speak:${utterance.lang}`),
        pause: () => calls.push('pause'), resume: () => calls.push('resume'), cancel: () => calls.push('cancel'),
      } });
    },requestedLocale==='wo');
    await page.route('**/api/salon/assistant', route => route.fulfill({ json: { clarification: 'Silk Press — $120' } }));
    await page.goto('/salon/dashboard/my-page/business-policies');
    await page.locator('select').filter({ has: page.locator('option[value="zh-CN"]') }).first().selectOption(locale);
    await assertDeferredLocale(page,requestedLocale);
    const t = (text: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[text] || text;
    await page.getByRole('button', { name: 'GC Assistant', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'GC Assistant' });
    await dialog.locator('textarea').fill('Silk Press?');
    await dialog.getByRole('button', { name: t('Ask GC Assistant'), exact: true }).click();
    await expect(dialog.locator('article').last()).toContainText('Silk Press — $120');
    const calls = () => page.evaluate(() => (window as unknown as { __speechCalls: string[] }).__speechCalls);
    expect(await calls()).toEqual([]);
    await dialog.getByRole('button', { name: t('Read aloud'), exact: true }).click();
    if (requestedLocale === 'wo') {
      await expect(dialog.getByRole('status').filter({ hasText: t('No on-device voice is available for this language. You can continue reading the answer.') })).toBeVisible();
      expect(await calls()).toEqual([]);
    } else {
      await dialog.getByRole('button', { name: t('Pause audio'), exact: true }).click();
      await dialog.getByRole('button', { name: t('Resume audio'), exact: true }).click();
      await dialog.getByRole('button', { name: t('Stop audio'), exact: true }).click();
      expect(await calls()).toEqual([`speak:${({ en: 'en-US', fr: 'fr-FR', es: 'es-ES', 'zh-CN': 'zh-CN' } as Record<string,string>)[locale]}`, 'pause', 'resume', 'cancel']);
      await dialog.getByRole('button', { name: t('Read aloud'), exact: true }).click();
      await dialog.getByRole('button', { name: t('Close GC Assistant'), exact: true }).click();
      await expect.poll(async () => (await calls()).at(-1)).toBe('cancel');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
