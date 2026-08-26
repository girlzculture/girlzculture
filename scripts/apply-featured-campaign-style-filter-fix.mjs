import { readFileSync, writeFileSync } from "node:fs";

const path = "supabase/migrations/20260825140000_featured_campaign_owner_controls.sql";
const source = readFileSync(path, "utf8");
const needle = "coalesce(style.is_active,true)";
const occurrences = source.split(needle).length - 1;
if (occurrences !== 2) {
  throw new Error(`Expected exactly two legacy style activity predicates, found ${occurrences}.`);
}
const next = source.split(needle).join("style.archived_at is null");
writeFileSync(path, next);
console.log("Featured campaign discovery now filters active salon services through archived_at.");