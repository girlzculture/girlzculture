import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const globals = read("src/app/globals.css");
const structured = read("src/components/owner/StructuredCatalogEditors.tsx");
const legacyOwner = read("src/components/owner/OwnerDashboardApp.tsx");
const application = read("src/components/SalonApplication.tsx");
const applicationApi = read("src/app/api/salon/application/route.ts");
const bounds = read("supabase/migrations/20260715150000_numeric_input_bounds.sql");

const checks = [
  ["number spinners disabled", /input\[type="number"\][\s\S]*appearance:\s*textfield[\s\S]*::-webkit-inner-spin-button/.test(globals)],
  ["new service prices start blank", /useState<NumericValue>\(""\)/.test(structured)],
  ["clearing a controlled number stays blank", /event\.target\.value === "" \? "" : Number/.test(structured)],
  ["new option prices start blank", /price_add: ""/.test(structured)],
  ["new material prices start blank", /price: ""/.test(structured)],
  ["legacy service fields no longer default to zero", !/defaultValue=\{active\?\.(?:duration_min_hours|duration_max_hours|base_price|years_experience|price)\|\|0\}/.test(legacyOwner)],
  ["phone is a tel input", /name==="phone"\?"tel"/.test(legacyOwner)],
  ["ZIP remains text", /label="ZIP Code"[\s\S]{0,180}value=\{form\.zip_code\}/.test(application)],
  ["server rejects non-finite application counts", /Number\.isFinite\(yearsInOperation\)[\s\S]*Number\.isFinite\(stylistCount\)/.test(applicationApi)],
  ["database pricing and duration bounds", /styles_price_bounds_check[\s\S]*styles_duration_bounds_check[\s\S]*styles_validate_numeric_bounds/.test(bounds)],
];

const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  console.error(`Numeric verification failed: ${failed.map(([name]) => name).join(", ")}`);
  process.exit(1);
}
console.log(`Numeric-input verification passed (${checks.length} controls).`);
