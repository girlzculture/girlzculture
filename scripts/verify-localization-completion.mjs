import assert from "node:assert/strict";
import fs from "node:fs";
import { DASHBOARD_SOURCE_MESSAGES } from "../src/i18n/dashboard-source-catalog.ts";
import {
  canGenerateTranslationDraft,
  resolveSourceTranslation,
  translatedMessageFields,
  translationWorkflowState,
} from "../src/lib/localizationCore.ts";

const representative = [
  "Salon Owner Dashboard",
  "Overview",
  "My Page",
  "Styles & Pricing",
  "Availability & Calendar",
  "Bookings & Appointments",
  "Earnings & Payouts",
  "Business Information",
  "Transaction History",
  "No booking conversations yet",
];

for (const locale of ["fr", "es", "wo"]) {
  assert.ok(
    Object.keys(DASHBOARD_SOURCE_MESSAGES[locale]).length >= 60,
    `${locale} must ship a substantial reviewed dashboard baseline.`,
  );
  for (const source of representative) {
    const translated = resolveSourceTranslation(
      source,
      {},
      DASHBOARD_SOURCE_MESSAGES[locale],
    );
    assert.ok(translated, `${locale} translation cannot be blank.`);
    assert.notEqual(
      translated,
      source,
      `${locale} must translate representative dashboard text: ${source}`,
    );
  }
}

assert.equal(
  resolveSourceTranslation(
    "Overview",
    { Overview: "Engine override" },
    DASHBOARD_SOURCE_MESSAGES.fr,
  ),
  "Engine override",
  "Reviewed Engine content must override the bundled baseline.",
);
assert.equal(
  resolveSourceTranslation("  Salon-created service  ", {}, {}),
  "Salon-created service",
  "Missing translations must fall back to clean source text, never a key or blank.",
);

assert.equal(translationWorkflowState({ status: "Missing" }), "Untranslated");
assert.equal(
  translationWorkflowState({ status: "Draft", machine_generated: true }),
  "Generated",
);
assert.equal(translationWorkflowState({ status: "Reviewed" }), "Reviewed");
assert.equal(translationWorkflowState({ status: "Published" }), "Published");
assert.equal(canGenerateTranslationDraft("standard"), true);
for (const impact of ["booking", "billing", "security", "safety", "legal"])
  assert.equal(
    canGenerateTranslationDraft(impact),
    false,
    `${impact} text must not use provider-assisted generation.`,
  );

const now = "2026-07-23T18:00:00.000Z";
assert.deepEqual(
  translatedMessageFields({
    original: " See you tomorrow ",
    translated: " À demain ",
    locale: "fr",
    provider: "openai",
    previewed: true,
    now,
  }),
  {
    body: "See you tomorrow",
    original_body: "See you tomorrow",
    translated_body: "À demain",
    translation_locale: "fr",
    translation_provider: "openai",
    translation_previewed_at: now,
  },
  "Translated messages must preserve the original and record preview evidence.",
);
assert.throws(
  () =>
    translatedMessageFields({
      original: "See you tomorrow",
      translated: "À demain",
      locale: "fr",
      previewed: false,
      now,
    }),
  /Preview the translation/,
);

const selector = fs.readFileSync(
  "src/components/i18n/LanguageSelector.tsx",
  "utf8",
);
assert.doesNotMatch(selector, />\s*Incomplete\s*</);
const migration = fs.readFileSync(
  "supabase/migrations/20260723270000_localization_completion.sql",
  "utf8",
);
assert.match(migration, /original_body/);
assert.match(migration, /translation_previewed_at/);
assert.match(migration, /booking_messages_translation_pair_check/);

console.log(
  "Localization completion verification passed: executable French, Spanish, and Wolof dashboard resolution, Engine override precedence, clean English fallback, four-state workflow mapping, high-impact human-review gates, and original-preserving message previews are covered.",
);

