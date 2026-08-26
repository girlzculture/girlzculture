import { readFileSync, writeFileSync } from "node:fs";

const path = "supabase/migrations/20260825140000_featured_campaign_owner_controls.sql";
let source = readFileSync(path, "utf8");

const marker = `create or replace function public.resolve_homepage_promotion_target(\n  p_target_type text,\n  p_target_id uuid\n)`;
const replacement = `-- The earlier promotion migration defines this function with a different\n-- RETURNS TABLE shape. PostgreSQL cannot replace an existing function when\n-- only its OUT columns change, so drop that exact signature before recreating\n-- it transactionally below.\ndrop function if exists public.resolve_homepage_promotion_target(text, uuid);\n\n${marker}`;

const first = source.indexOf(marker);
if (first < 0) throw new Error("Featured target function marker was not found.");
if (source.indexOf(marker, first + marker.length) >= 0) {
  throw new Error("Featured target function marker was not unique.");
}
source = source.slice(0, first) + replacement + source.slice(first + marker.length);

writeFileSync(path, source);
console.log("Featured target return-type migration patch applied.");
