import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [
  ["four launch locales", read("src/i18n/catalog.ts"), /\["en", "es", "fr", "wo"\]/],
  ["safe English fallback", read("src/components/i18n/LocaleProvider.tsx"), /ENGLISH_MESSAGES\[key\]\|\|fallback\|\|""/],
  ["persistent locale cookie", read("src/components/i18n/LocaleProvider.tsx"), /gc_locale=/],
  ["visible global selector", read("src/app/layout.tsx"), /<LanguageSelector/],
  ["published-only public translations", read("src/app/api/i18n/route.ts"), /\.eq\("status","Published"\)/],
  ["translation workflow states", read("supabase/migrations/20260720160000_localization_engine.sql"), /'Missing','Draft','Reviewed','Published'/],
  ["human review gate", read("src/app/api/admin/engine/translations/route.ts"), /require explicit human review confirmation/],
  ["admin translation manager", read("src/components/admin/TranslationManager.tsx"), /Review & publish/],
];
const failed = checks.filter(([, text, pattern]) => !pattern.test(text));
if (failed.length) {
  console.error(`Localization verification failed: ${failed.map(([name]) => name).join(", ")}`);
  process.exit(1);
}
console.log(`Localization verification passed (${checks.length} controls).`);
