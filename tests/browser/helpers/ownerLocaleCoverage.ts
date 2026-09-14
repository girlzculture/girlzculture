import { expect, type Page } from '@playwright/test';
import inventory from '../../../docs/owner-translation-inventory.json';
import allowlist from '../../../docs/owner-translation-allowlist.json';
import { DASHBOARD_SOURCE_MESSAGES } from '../../../src/i18n/dashboard-source-catalog';
import { resolveSourceTranslation } from '../../../src/lib/localizationCore';

/** Assert rendered source-copy coverage, not just a selector or translated title.
 * Database prose must have an explicit original-content boundary. */
export async function untranslatedOwnerCopy(page: Page, locale: string) {
  if (locale === 'en') return [];
  const sourceCopy = new Set(Object.values(inventory.entries).map(entry => entry.source));
  const allowed = new Set(allowlist.entries.map(entry => entry.source));
  const catalog = DASHBOARD_SOURCE_MESSAGES[locale] || {};
  const translatedCopy = new Set(Object.values(catalog));
  const visible = await page.evaluate(() => {
    const result = new Set<string>();
    const excluded = (element: Element) => element.closest('[data-no-translate], [translate="no"], script, style, option, input, textarea, code, pre');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.parentElement || excluded(node.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      if (!Array.from(range.getClientRects()).some(rect => rect.width && rect.height)) continue;
      const value = node.textContent?.replace(/\s+/g, ' ').trim();
      if (value) result.add(value);
      // React splits a template across text nodes. Inspect the assembled text
      // too, without sweeping original user content into an interface check.
      const parent = node.parentElement;
      if (!parent.children.length) {
        const joined = parent.textContent?.replace(/\s+/g, ' ').trim();
        if (joined) result.add(joined);
      }
    }
    for (const element of document.querySelectorAll('[aria-label], [placeholder], [title]')) {
      if (!element.getClientRects().length || element.closest('[data-no-translate], [translate="no"]')) continue;
      for (const attribute of ['aria-label', 'placeholder', 'title']) {
        const value = element.getAttribute(attribute)?.replace(/\s+/g, ' ').trim();
        if (value) result.add(value);
      }
    }
    for (const select of document.querySelectorAll('select')) {
      if (!select.getClientRects().length || select.closest('[data-no-translate], [translate="no"]')) continue;
      for (const option of select.options) if (!option.matches('[data-no-translate], [translate="no"]')) result.add(option.text.trim());
    }
    return [...result];
  });
  return visible.filter(text => !allowed.has(text) && !translatedCopy.has(text) && (
    (sourceCopy.has(text) && catalog[text] !== text)
    || resolveSourceTranslation(text, {}, catalog) !== text
  ));
}
export async function expectOwnerLocaleCoverage(page: Page, locale: string) {
  expect(await untranslatedOwnerCopy(page, locale), `Unexpected owner English source copy in ${locale}`).toEqual([]);
}
