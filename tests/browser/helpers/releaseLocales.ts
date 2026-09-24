// Founder-approved release scope. Wolof stays in the source coverage report
// with its missing translations; it is explicitly deferred, never marked passed.
export const ownerReleaseLocales = ['en', 'fr', 'es', 'zh-CN'] as const;

import {expect,type Page} from '@playwright/test';

// Retain the legacy stored-preference cases as explicit fallback regressions.
// These prove deferral behavior, not working Wolof interface/provider support.
export const releaseInterfaceLocale=(requested:string)=>requested==='wo'?'en':requested;
export async function assertDeferredLocale(page:Page,requested:string){
  if(requested!=='wo')return;
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('select option[value="wo"]')).toHaveCount(0);
}
