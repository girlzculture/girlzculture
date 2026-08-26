import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

copyFileSync(
  "scripts/templates/featured-campaign-route.ts.txt",
  "src/app/api/admin/featured-campaigns/route.ts",
);
copyFileSync(
  "scripts/templates/AdminFeaturedCampaignsV2.tsx.txt",
  "src/components/admin/AdminFeaturedCampaigns.tsx",
);

const entitlementPath = "src/lib/marketingEntitlements.ts";
let entitlement = readFileSync(entitlementPath, "utf8");
entitlement = entitlement.replace("  endsAt: string;", "  endsAt: string | null;");
entitlement = entitlement.replace(
  "if (!credit || credit.status !== \"Credited\" || new Date(credit.valid_from) > new Date(startsAt) || (credit.valid_until && new Date(credit.valid_until) < new Date(endsAt))) rejectRequest(\"Choose a verified platform credit that covers the full campaign period.\");",
  "if (!credit || credit.status !== \"Credited\" || new Date(credit.valid_from) > new Date(startsAt) || (endsAt ? Boolean(credit.valid_until && new Date(credit.valid_until) < new Date(endsAt)) : Boolean(credit.valid_until))) rejectRequest(\"Choose a verified platform credit that covers the full campaign period.\");",
);
entitlement = entitlement.replace(
  "if (evidence.metadata?.campaign_valid_until && new Date(evidence.metadata.campaign_valid_until) < new Date(endsAt)) rejectRequest(\"The Stripe evidence does not cover the full campaign period.\");",
  "if (!endsAt && evidence.metadata?.campaign_valid_until) rejectRequest(\"Finite Stripe evidence cannot fund an indefinite campaign.\");\n  if (endsAt && evidence.metadata?.campaign_valid_until && new Date(evidence.metadata.campaign_valid_until) < new Date(endsAt)) rejectRequest(\"The Stripe evidence does not cover the full campaign period.\");",
);
writeFileSync(entitlementPath, entitlement);

const migrationPath =
  "supabase/migrations/20260825140000_featured_campaign_owner_controls.sql";
let migration = readFileSync(migrationPath, "utf8");
const replacements = [
  ["  entitlement_id uuid;", "  v_entitlement_id uuid;"],
  ["    entitlement_id := existing.entitlement_id;", "    v_entitlement_id := existing.entitlement_id;"],
  ["    entitlement_id := null;", "    v_entitlement_id := null;"],
  ["    if entitlement_id is not null then", "    if v_entitlement_id is not null then"],
  ["      where id = entitlement_id;", "      where id = v_entitlement_id;"],
  ["      if not found or entitlement_row.source <> 'platform_credit' then entitlement_id := null; end if;", "      if not found or entitlement_row.source <> 'platform_credit' then v_entitlement_id := null; end if;"],
  ["    if entitlement_id is null then", "    if v_entitlement_id is null then"],
  ["      ) returning id into entitlement_id;", "      ) returning id into v_entitlement_id;"],
  ["      where id = entitlement_id;", "      where id = v_entitlement_id;"],
  ["      returning id into entitlement_id;", "      returning id into v_entitlement_id;"],
  ["      entitlement_id is null", "      v_entitlement_id is null"],
  ["        where entitlement.id = entitlement_id", "        where entitlement.id = v_entitlement_id"],
  ["      entitlement_id,\n      placement_basis,", "      entitlement_id,\n      placement_basis,"],
  ["      v_entitlement_id,\n      normalized_basis,", "      v_entitlement_id,\n      normalized_basis,"],
  ["    set entitlement_id = entitlement_id,", "    set entitlement_id = v_entitlement_id,"],
];
for (const [before, after] of replacements) {
  migration = migration.replaceAll(before, after);
}
// The insert values previously used the same ambiguous identifier as the table
// column. Replace only the first values occurrence after the insert column list.
const insertAnchor = `    ) values (\n      p_salon_id,\n      entitlement_id,\n      normalized_basis,`;
if (migration.includes(insertAnchor)) {
  migration = migration.replace(
    insertAnchor,
    `    ) values (\n      p_salon_id,\n      v_entitlement_id,\n      normalized_basis,`,
  );
}
writeFileSync(migrationPath, migration);

console.log(
  "Featured Salon owner controls, nullable entitlement windows, and unambiguous migration variables applied.",
);
