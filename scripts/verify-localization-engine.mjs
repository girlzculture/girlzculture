import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [
  ["dynamic locale registry", read("src/app/api/i18n/route.ts"), /supported_locales/],
  ["broad locale seed", read("supabase/migrations/20260721100000_engine_localization_ai_system.sql"), /'ht','Haitian Creole'/],
  ["safe English fallback", read("src/components/i18n/LocaleProvider.tsx"), /ENGLISH_MESSAGES\[key\]\|\|fallback\|\|""/],
  ["persistent locale cookie", read("src/components/i18n/LocaleProvider.tsx"), /gc_locale=/],
  ["account preference", read("src/components/i18n/LocaleProvider.tsx"), /persistAccountLocale/],
  ["right-to-left runtime", read("src/components/i18n/LocaleProvider.tsx"), /document\.documentElement\.dir/],
  ["locale-aware plurals", read("src/components/i18n/LocaleProvider.tsx"), /Intl\.PluralRules/],
  ["visible global selector", read("src/app/layout.tsx"), /<LanguageSelector/],
  ["published-only public translations", read("src/app/api/i18n/route.ts"), /\.eq\("status","Published"\)/],
  ["translation workflow states", read("supabase/migrations/20260720160000_localization_engine.sql"), /'Missing','Draft','Reviewed','Published'/],
  ["human review gate", read("src/app/api/admin/engine/translations/route.ts"), /require explicit human review confirmation/],
  ["admin translation manager", read("src/components/admin/TranslationManager.tsx"), /Review & publish/],
  ["translation import export", read("src/components/admin/TranslationManager.tsx"), /Import drafts/],
  ["translation rollback", read("src/app/api/admin/engine/translations/route.ts"), /action==="rollback"/],
];
const failed = checks.filter(([, text, pattern]) => !pattern.test(text));
if (failed.length) {
  console.error(`Localization verification failed: ${failed.map(([name]) => name).join(", ")}`);
  process.exit(1);
}
console.log(`Localization verification passed (${checks.length} controls).`);
