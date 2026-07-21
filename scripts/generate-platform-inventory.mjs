import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP = path.join(ROOT, "src", "app");
const API = path.join(APP, "api");
const COMPONENTS = path.join(ROOT, "src", "components");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const OUTPUT = path.join(
  ROOT,
  "docs",
  "ENGINE_PLATFORM_INVENTORY_2026-07-21.md",
);

const pageFiles = walk(APP).filter(
  (file) => path.basename(file) === "page.tsx" && !file.includes(`${path.sep}api${path.sep}`),
);
const apiFiles = walk(API).filter((file) => path.basename(file) === "route.ts");
const componentFiles = walk(COMPONENTS).filter((file) => /\.(?:ts|tsx)$/.test(file));
const migrationFiles = walk(MIGRATIONS)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const pageRows = pageFiles
  .map((file) => {
    const route = routeFromFile(file, APP, "page.tsx");
    const profile = pageProfile(route);
    return `| \`${route}\` | \`${relative(file)}\` | ${profile.surface} | ${profile.source} | ${profile.engine} | ${profile.permission} | ${profile.publish} | ${profile.validation} | ${profile.evidence} | ${profile.exception} |`;
  })
  .sort();

const apiRows = apiFiles
  .map((file) => {
    const route = `/api${routeFromFile(file, API, "route.ts")}`;
    const source = fs.readFileSync(file, "utf8");
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
      .filter(
        (method) =>
          new RegExp(`(?:function|const)\\s+${method}\\b|as\\s+${method}\\b`).test(
            source,
          ),
      )
      .join(", ");
    const profile = apiProfile(route, source);
    return `| \`${route}\` | ${methods || "route handler"} | \`${relative(file)}\` | ${profile.data} | ${profile.control} | ${profile.permission} | ${profile.validation} | ${profile.evidence} |`;
  })
  .sort();

const componentRows = componentFiles
  .map((file) => {
    const rel = relative(file);
    const owner = rel.includes("components/admin/")
      ? "Platform admin / Engine"
      : rel.includes("components/salon/")
        ? "Salon owner/team"
        : rel.includes("components/i18n/")
          ? "Localization runtime"
          : rel.includes("components/forms/")
            ? "Shared validated form control"
            : "Shared/public/customer surface";
    return `| \`${rel}\` | ${owner} |`;
  })
  .sort();

const database = collectDatabaseObjects(migrationFiles);
const migrationRows = migrationFiles.map(
  (file, index) =>
    `| ${index + 1} | \`${path.basename(file)}\` | \`${relative(file)}\` |`,
);

const content = `# Girlz Culture Engine platform inventory

Generated from the repository on 2026-07-21 by \`scripts/generate-platform-inventory.mjs\`.

This is a source inventory, not proof that migrations are applied or authenticated/provider behavior is live. Security-critical values remain code/deployment controlled; ordinary content and bounded business settings are routed through Engine or a dedicated permission-controlled admin workspace. The chosen customer-facing term is **Styles & Services**: public/editorial copy may shorten it to **Styles**, while database identifiers retain their existing names to avoid corrupting schema meaning.

## Inventory totals

- Application pages: **${pageFiles.length}**
- API routes: **${apiFiles.length}**
- Components/modules under \`src/components\`: **${componentFiles.length}**
- Ordered SQL migrations: **${migrationFiles.length}**
- Tables/views discovered in migrations: **${database.tables.length}**
- Functions discovered in migrations: **${database.functions.length}**
- RLS policies discovered in migrations: **${database.policies.length}**

## Application page inventory

| Route | Entry point | Surface | Source/control classification | Engine/admin management | Required access | Draft/publish | Validation/dependencies | Test evidence | Deliberate code exception |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${pageRows.join("\n")}

## API inventory

| Route | Methods | Entry point | Data/provider classification | Engine/dedicated control | Required access | Validation/dependency behavior | Test evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
${apiRows.join("\n")}

## Component inventory

| Component/module | Primary owner/surface |
| --- | --- |
${componentRows.join("\n")}

## Database object inventory

### Tables and views

${database.tables.map((name) => `- \`${name}\``).join("\n")}

### Functions and RPCs

${database.functions.map((name) => `- \`${name}\``).join("\n")}

### Row-level security policies

${database.policies.map((name) => `- ${name}`).join("\n")}

## Exact migration order

| Order | Migration | Repository path |
| --- | --- | --- |
${migrationRows.join("\n")}

## Protected values deliberately left outside Engine

- Supabase, Stripe, notification, Maps, AI-provider, signing and service-role credentials: deployment secrets; never sent to the browser or stored in public configuration.
- RLS policies, permission keys, database functions, booking overlap constraints and financial ledger invariants: reviewed engineering migrations; Engine shows status but cannot alter them.
- Stripe transaction history, invoices, refunds, completed bookings, disputes and audit/security events: immutable or retention-protected records; dedicated workflows change status or redact/anonymize eligible identity data.
- Arbitrary HTML, JavaScript, SQL and executable AI tools/prompts: intentionally unsupported. Engine uses bounded schemas, approved component variants, provider/model allowlists, human review and deterministic fallback.
- US-only legal/address/currency boundaries: changing country or currency requires reviewed payments, tax, identity, address and legal work rather than a casual setting.
`;

fs.writeFileSync(OUTPUT, content);
console.log(
  `Generated ${relative(OUTPUT)} (${pageFiles.length} pages, ${apiFiles.length} APIs, ${componentFiles.length} components, ${migrationFiles.length} migrations).`,
);

function pageProfile(route) {
  if (route === "/careers")
    return profile(
      "Hidden editorial page",
      "Code retained; no public navigation",
      "Not exposed until founder approval",
      "Not applicable",
      "Not applicable",
      "Route remains directly reachable for development",
      "Manual route smoke",
      "Hidden by product decision",
    );
  if (route.startsWith("/admin"))
    return profile(
      "Platform administration",
      "Database-backed and security-protected",
      "Engine or dedicated admin workspace",
      "Admin session plus section permission",
      "Engine settings/content use draft-review-publish; operational records use audited actions",
      "Server authorization, typed input, dependency preview where destructive",
      "verify:engine, verify:records, verify:admin-security",
      "Secrets/RLS remain protected engineering controls",
    );
  if (route.startsWith("/salon/dashboard"))
    return profile(
      "Salon workspace",
      "Database-backed salon/team records",
      "Platform rules in Engine; salon owns its records",
      "Salon owner/team permission",
      "Immediate audited salon-record updates",
      "Server salon membership, feature gate and ownership validation",
      "verify:lifecycle, verify:hardening, verify:records",
      "Billing and retained history use dedicated workflows",
    );
  if (
    route.startsWith("/salon/login") ||
    route.startsWith("/salon/signup") ||
    route.startsWith("/salon/apply") ||
    route.startsWith("/salon/onboarding") ||
    route.startsWith("/pending") ||
    route.startsWith("/salon/application-submitted")
  )
    return profile(
      "Salon identity/onboarding",
      "Canonical identity plus lifecycle data",
      "Salon Setup & Lifecycle; Service Catalog & Taxonomies",
      "Guest or canonical salon-owner session",
      "Application decision and activation are audited lifecycle states",
      "Normalized identity, US address, setup gates, admin approval",
      "verify:identity, verify:lifecycle",
      "Auth and activation invariants are not casual settings",
    );
  if (route === "/account" || route.startsWith("/review/"))
    return profile(
      "Customer account",
      "Database-backed customer-owned records",
      "Trust/quality and notification rules in Engine",
      "Customer session and booking ownership",
      "Operational record state; reviews enter moderation lifecycle",
      "Server ownership and completed-booking validation",
      "verify:hardening, verify:media",
      "Booking/payment history is retained",
    );
  if (
    route === "/login" ||
    route === "/forgot-password" ||
    route === "/reset-password"
  )
    return profile(
      "Authentication",
      "Supabase Auth plus canonical server identity",
      "Users, Roles & Permissions status only",
      "Guest/auth challenge",
      "Not applicable",
      "Rate limiting, generic errors, signed/expiring challenges",
      "verify:identity, verify:admin-security",
      "Secrets and security wording remain reviewed code",
    );
  if (route.startsWith("/salon/[slug]"))
    return profile(
      "Public salon/booking",
      "Database-backed eligible salon records",
      "Catalog, booking, trust, media and discovery Engine areas",
      "Public; checkout requires validated customer details",
      "Salon data updates after ownership validation; Engine settings publish",
      "Lifecycle eligibility, RLS/server checks, booking conflicts",
      "verify:connected-discovery, verify:hardening, verify:billing",
      "Financial and overlap invariants remain protected",
    );
  const editorial = [
    "/about",
    "/press",
    "/testimonials",
    "/help",
    "/how-it-works",
    "/partner",
    "/plans",
    "/blog",
    "/blog/[slug]",
    "/[page]",
  ].includes(route);
  return profile(
    editorial ? "Public editorial/content" : "Public discovery/support",
    editorial
      ? "Database-backed CMS with safe fallback"
      : "Database-backed records plus bounded Engine settings",
    editorial
      ? "Pages & Page Sections / Navigation / Content Management"
      : "Relevant Engine category and dedicated admin workspace",
    "Public",
    editorial ? "Draft, preview, publish, archive and restore" : "Published settings/eligible records",
    "Sanitized links/content; public reads limited to published/eligible data",
    "verify:engine-governance, verify:connected-discovery, browser smoke",
    route === "/offline"
      ? "Offline fallback is a code/PWA integrity surface"
      : "Security/provider invariants remain protected",
  );
}

function apiProfile(route, source) {
  const evidence = [];
  if (/stripe/.test(route)) evidence.push("verify:billing");
  if (/i18n|translations/.test(route)) evidence.push("verify:i18n");
  if (/engine/.test(route)) evidence.push("verify:engine-expansion");
  if (/identity|auth/.test(route)) evidence.push("verify:identity");
  if (/media|trending|featured/.test(route)) evidence.push("verify:media");
  if (/booking|availability/.test(route)) evidence.push("verify:hardening");
  if (/records|test-data/.test(route)) evidence.push("verify:records");
  const authorization = route.startsWith("/api/admin")
    ? "Admin bearer session plus explicit permission"
    : route.startsWith("/api/salon")
      ? "Salon bearer session plus salon membership/team permission"
      : route.startsWith("/api/stripe/webhook") || route.includes("reminders")
        ? "Verified provider signature or server secret"
        : route.startsWith("/api/auth")
          ? "Guest challenge or authenticated identity"
          : "Public/owner scope validated per operation";
  const control = route.startsWith("/api/admin/engine")
    ? "Engine control center"
    : route.startsWith("/api/admin")
      ? "Dedicated admin workspace"
      : route.startsWith("/api/salon")
        ? "Salon dashboard under Engine policy"
        : route.startsWith("/api/stripe")
          ? "Stripe provider plus Engine presentation"
          : "Public/customer/salon workflow";
  const provider = route.startsWith("/api/stripe")
    ? "Stripe/provider-backed financial operation"
    : route.includes("geocode")
      ? "Maps/geocoding provider-backed"
      : route.includes("ai")
        ? "Provider-neutral AI, disabled fail-closed"
        : "Supabase/database-backed operation";
  const checks = [];
  if (/cleanText|sanitize|validate|parse|zod/i.test(source)) checks.push("typed/sanitized input");
  if (/dependency|preview|archive|reassign|confirmation/i.test(source))
    checks.push("dependency/confirmation handling");
  if (/requireAdminPermission|requireSalon|auth\.getUser|Authorization/i.test(source))
    checks.push("server authorization");
  if (/rateLimit|honeypot/i.test(source)) checks.push("abuse protection");
  return {
    data: provider,
    control,
    permission: authorization,
    validation: checks.join(", ") || "route-specific bounds and safe errors",
    evidence: evidence.length ? [...new Set(evidence)].join(", ") : "TypeScript/lint/build and route smoke where public",
  };
}

function profile(
  surface,
  source,
  engine,
  permission,
  publish,
  validation,
  evidence,
  exception,
) {
  return { surface, source, engine, permission, publish, validation, evidence, exception };
}

function collectDatabaseObjects(files) {
  const tables = new Set();
  const functions = new Set();
  const policies = new Set();
  for (const file of files) {
    const sql = fs.readFileSync(file, "utf8");
    for (const match of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?(?:table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-zA-Z0-9_]+)"?/gi,
    ))
      tables.add(match[1]);
    for (const match of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/gi,
    ))
      functions.add(match[1]);
    for (const match of sql.matchAll(
      /create\s+policy\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+on\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/gi,
    ))
      policies.add(`\`${match[1] || match[2]}\` on \`${match[3]}\``);
  }
  return {
    tables: [...tables].sort(),
    functions: [...functions].sort(),
    policies: [...policies].sort(),
  };
}

function routeFromFile(file, base, leaf) {
  const rel = path.relative(base, file).split(path.sep).join("/");
  const withoutLeaf = rel === leaf ? "" : rel.slice(0, -(leaf.length + 1));
  return withoutLeaf ? `/${withoutLeaf}` : "/";
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
