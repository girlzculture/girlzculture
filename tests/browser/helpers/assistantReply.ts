import type { Page } from "@playwright/test";
import { presentAssistantResult } from "../../../src/lib/gcAssistantPresentation";
import { localeNames } from "../../../src/i18n/gc-assistant-copy";

/** Node's ICU supports some locales (including Wolof) that browser ICU does
 * not. Keep the strict whole-reply assertion, using the browser's native
 * rendering of the same recorded dates and USD amounts. No wording or facts
 * are omitted, and the application itself is not mocked or reformatted. */
export async function expectedAssistantReply(page: Page, tool: string, result: unknown, locale: string) {
  let expected = presentAssistantResult(tool, result, locale).message;
  const numbers = new Set<number>();
  const dates = new Set<string>();
  function collect(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) numbers.add(value);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) dates.add(value);
    if (value && typeof value === "object") Object.values(value).forEach(collect);
  }
  collect(result);
  const facts = result as { time_zone?: string } | null;
  const input = { numbers: [...numbers], dates: [...dates], locale: localeNames[locale] || "en-US", timeZone: facts?.time_zone || "UTC" };
  const native = await page.evaluate(({ numbers, dates, locale, timeZone }) => ({
    numbers: numbers.map(value => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)),
    dates: dates.map(value => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value))),
  }), input);
  input.numbers.forEach((value, index) => {
    const formatted = new Intl.NumberFormat(input.locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
    expected = expected.replaceAll(formatted, () => native.numbers[index]);
  });
  input.dates.forEach((value, index) => {
    const formatted = new Intl.DateTimeFormat(input.locale, { dateStyle: "medium", timeStyle: "short", timeZone: input.timeZone }).format(new Date(value));
    expected = expected.replaceAll(formatted, () => native.dates[index]);
  });
  return expected;
}
