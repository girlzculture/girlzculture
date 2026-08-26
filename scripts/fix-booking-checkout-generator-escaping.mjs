import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/apply-booking-checkout-hold-safety.mjs";
const source = readFileSync(path, "utf8");
const marker = 'const adminPath = "src/app/api/admin/bookings/route.ts";';
const index = source.indexOf(marker);
if (index < 0) throw new Error("Checkout patch generator marker not found.");

const prefix = source.slice(0, index);
const generatedCodeSection = source
  .slice(index)
  .replace(/(?<!\\)\$\{/g, "\\${");

const next = prefix + generatedCodeSection;
if (next === source) {
  console.log("Checkout patch generator escaping is already correct.");
  process.exit(0);
}

writeFileSync(path, next);
console.log("Checkout patch generator template expressions escaped.");
