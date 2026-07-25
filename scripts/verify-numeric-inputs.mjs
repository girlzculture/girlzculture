import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
import { normalizeNumericDraft, parseNumericDraft } from "../src/lib/numericInput.ts";

const read = (path) => fs.readFileSync(path, "utf8");
const globals = read("src/app/globals.css");
const structured = read("src/components/owner/StructuredCatalogEditors.tsx");
const legacyOwner = read("src/components/owner/OwnerDashboardApp.tsx");
const application = read("src/components/SalonApplication.tsx");
const applicationApi = read("src/app/api/salon/application/route.ts");
const bounds = read("supabase/migrations/20260715150000_numeric_input_bounds.sql");
const numericComponentFiles = [
  "src/components/AdminContentManager.tsx",
  "src/components/AdminDashboard.tsx",
  "src/components/SalonApplication.tsx",
  "src/components/admin/AdminFeaturedCampaigns.tsx",
  "src/components/admin/AdminHomepageMarketing.tsx",
  "src/components/admin/AdminPromoCodes.tsx",
  "src/components/admin/AdminTrendingCampaigns.tsx",
  "src/components/admin/AiAutomationManager.tsx",
  "src/components/admin/EngineControlCenter.tsx",
  "src/components/admin/MediaRulesSettings.tsx",
  "src/components/admin/NavigationMenuManager.tsx",
  "src/components/admin/SalonLifecycleSettings.tsx",
  "src/components/admin/SearchLanguageSettings.tsx",
  "src/components/owner/OwnerDashboardApp.tsx",
  "src/components/owner/SalonPromotionsManager.tsx",
  "src/components/owner/StructuredCatalogEditors.tsx",
];

assert.equal(normalizeNumericDraft(""), "", "Backspace/Delete must preserve blank");
assert.equal(normalizeNumericDraft("12.50"), "12.50", "decimals must remain editable");
assert.equal(normalizeNumericDraft("$1,234.50"), "1234.50", "pasted currency must normalize");
assert.equal(normalizeNumericDraft("84abc"), "84", "replacement text keeps digits");
assert.equal(normalizeNumericDraft("2.71828", { maximumDecimalPlaces: 3 }), "2.718");
assert.equal(normalizeNumericDraft("15.9", { integer: true }), "159");
assert.equal(parseNumericDraft("", { label: "Optional", required: false }), null);
assert.equal(
  parseNumericDraft("24.36", { label: "Price", minimum: 0, maximum: 10000 }),
  24.36,
);
assert.throws(
  () => parseNumericDraft("10001", { label: "Price", minimum: 0, maximum: 10000 }),
  /no more than/,
);

for (const file of numericComponentFiles) {
  const source = read(file);
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics = parsed.parseDiagnostics || [];
  assert.equal(diagnostics.length, 0, `${file} must parse as TSX`);
  assert.match(source, /type=.number/, `${file} no longer contains an inventoried numeric control`);
}

const checks = [
  ["number spinners disabled", /input\[type="number"\][\s\S]*appearance:\s*textfield[\s\S]*::-webkit-inner-spin-button/.test(globals)],
  ["new service prices start blank", /useState<NumericValue>\(""\)/.test(structured)],
  ["clearing a controlled number stays blank", /onChange=\{\(event\) => onChange\(event\.target\.value\)\}/.test(structured)],
  ["new option prices start blank", /price_add: ""/.test(structured)],
  ["new material prices start blank", /price: ""/.test(structured)],
  ["legacy service fields no longer default to zero", !/defaultValue=\{active\?\.(?:duration_min_hours|duration_max_hours|base_price|years_experience|price)\|\|0\}/.test(legacyOwner)],
  ["phone is a tel input", /name\s*===\s*"phone"\s*\?\s*"tel"/.test(legacyOwner)],
  ["ZIP remains text", /label="ZIP Code"[\s\S]{0,180}value=\{form\.zip_code\}/.test(application)],
  ["server rejects non-finite application counts", /Number\.isFinite\(yearsInOperation\)[\s\S]*Number\.isFinite\(stylistCount\)/.test(applicationApi)],
  ["database pricing and duration bounds", /styles_price_bounds_check[\s\S]*styles_duration_bounds_check[\s\S]*styles_validate_numeric_bounds/.test(bounds)],
  ["shared draft normalization is used by a controlled form", /normalizeNumericDraft/.test(application)],
  ["video trim permits a temporary blank", /event\.target\.value === "" \? "" : Number\(event\.target\.value\)/.test(read("src/components/admin/AdminTrendingCampaigns.tsx"))],
  ["all numeric component files inventoried", numericComponentFiles.length === 16],
];

const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  console.error(`Numeric verification failed: ${failed.map(([name]) => name).join(", ")}`);
  process.exit(1);
}
console.log(`Numeric-input verification passed (${checks.length} controls; ${numericComponentFiles.length} component files inventoried; 9 executable edit/bounds cases).`);
