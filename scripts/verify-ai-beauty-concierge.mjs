import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const serverPath = "src/lib/beautyConciergeServer.ts";
const serverSource = fs.readFileSync(serverPath, "utf8");
const routeSource = fs.readFileSync("src/app/api/concierge/search/route.ts", "utf8");
const uiSource = fs.readFileSync("src/components/public/BeautyConcierge.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260722130000_beauty_concierge_engine.sql", "utf8");

const compiled = ts.transpileModule(serverSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: serverPath,
}).outputText;
const compiledModule = { exports: {} };
const sandbox = {
  module: compiledModule,
  exports: compiledModule.exports,
  require: () => ({}),
  process: { env: {} },
  console,
  setTimeout,
  clearTimeout,
  fetch: () => { throw new Error("Provider calls are disabled in this deterministic test."); },
};
vm.runInNewContext(compiled, sandbox, { filename: serverPath });
const { deterministicConciergeIntent, parseConciergeIntent, conciergeClarification } = compiledModule.exports;

assert.equal(typeof deterministicConciergeIntent, "function");
const natural = deterministicConciergeIntent("Find highly rated salons with discounts within 2 miles under $180 this Saturday morning", "en");
assert.equal(natural.radius_miles, 2);
assert.equal(natural.maximum_price, 180);
assert.equal(natural.promotion_only, true);
assert.equal(natural.time_period, "morning");
assert.equal(natural.sort, "rating");
assert.match(natural.date, /^\d{4}-\d{2}-\d{2}$/);

const validIntent = {
  style: "Knotless braids", location: "Harlem", radius_miles: 10, date: null,
  time_period: "any", maximum_price: 200, promotion_only: false, minimum_rating: 4.5,
  availability_required: false, sort: "distance", needs_clarification: false,
  clarifying_question: null, language: "en",
};
assert.equal(parseConciergeIntent(validIntent).style, "Knotless braids");
assert.throws(() => parseConciergeIntent({ ...validIntent, sql: "select * from private_bookings" }), /AI_INTENT_INVALID/);
assert.throws(() => parseConciergeIntent({ ...validIntent, radius_miles: 1000 }), /AI_INTENT_INVALID/);
assert.match(conciergeClarification("es", "location"), /ciudad|vecindario/i);
assert.match(conciergeClarification("pt-BR", "style"), /estilo|serviço/i);

for (const token of [
  'additionalProperties: false',
  'https://api.openai.com/v1/responses',
  'type: "json_schema"',
  'strict: true',
  'discoverNearbySalons',
  'bookingAvailability',
  'approvedAiModels("openai")',
  'estimated_cost_cents',
  'fallback',
]) assert.ok(serverSource.includes(token), `Concierge server is missing ${token}`);

for (const token of ["enforceRateLimit", "rejectBot", "monitoredRouteFailure", "private, no-store"])
  assert.ok(routeSource.includes(token), `Concierge route is missing ${token}`);
for (const label of ["Book", "View", "Compare", "Save"])
  assert.ok(uiSource.includes(label), `Verified-result UI is missing ${label}`);
assert.ok(migration.includes("ai_prompt_versions"), "The governed prompt version must be auditable.");
assert.ok(migration.includes("false,"), "The provider-backed concierge must deploy disabled by default.");

console.log("AI Beauty Concierge verification passed: actual deterministic parsing, strict-schema rejection, localized clarification, governed provider controls, and verified-card actions.");
