import { expect, type Locator, type Page } from "@playwright/test";

// Emulate the DOM operation that caused the baseline React removeChild crash:
// native translators replace text nodes with nested elements. This deliberately
// detaches the original Text; changing only nodeValue would miss the regression.
// It tests compatibility, not the quality of a proprietary translation service.
export async function replaceTranslatedText(root: Locator) {
  return root.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!node.textContent?.trim() || !parent ||
        parent.closest('script,style,noscript,textarea,input,select,option,svg,[hidden],[aria-hidden="true"],[contenteditable="true"]') ||
        !parent.getClientRects().length) continue;
      nodes.push(node as Text);
    }
    for (const original of nodes) {
      const outer = document.createElement("font");
      const inner = document.createElement("font");
      outer.dataset.translatorProbe = "true";
      // Double spacing also detects a first-party bridge rewriting translated
      // text back to normalized source during subsequent public DOM mutations.
      inner.textContent = `Traduit  ${original.textContent}`;
      outer.append(inner);
      original.parentNode!.replaceChild(outer, original);
    }
    return nodes.length;
  });
}

export function recordTranslationErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /NotFoundError|removeChild|insertBefore|Minified React error|hydration/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  return errors;
}

export async function expectHealthyTranslatedPage(page: Page, errors: string[]) {
  await expect(page.getByText("This page needs another moment.", { exact: true })).toHaveCount(0);
  expect(errors, "Translator DOM replacement must not crash React or hydration").toEqual([]);
}
