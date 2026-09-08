import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as plans from "../src/lib/plans.ts";

// Execute the actual route handlers with in-memory provider adapters. No
// credentials, network requests, account creation, or database writes occur.
const missingPlans = [undefined, null, "", "   ", "invalid", false, 0, {}, ["starter"]];
for (const value of missingPlans) assert.equal(plans.parseApplicationPlan(value), null);
const choices = [["starter", "Starter"], ["growth", "Growth"], ["premium", "Premium"], ["basic", "Starter"]];
for (const [value, expected] of choices) assert.equal(plans.parseApplicationPlan(value), expected);

function loadRoute(path, overrides) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const adapters = {
    "@/lib/plans": plans,
    "@/lib/operationalMonitoring": {
      noteOperationalFailure() {},
      routeMonitoringProfile() { return {}; },
      withOperationalMonitoring(_profile, handler) { return handler; },
    },
    "@/lib/requestSecurity": {
      cleanText: (value) => String(value ?? "").trim(),
      cleanEmail: (value) => String(value).toLowerCase(),
      cleanUsPhone: (value) => String(value),
      enforceRateLimit() {}, rejectBot() {},
      errorResponse: () => Response.json({ error: "Provider unavailable" }, { status: 500 }),
    },
    "@/lib/usStates": { normalizeUsState: (value) => value, normalizeUsZip: (value) => value },
    "@/lib/engineConfigServer": { getEngineList: async () => ["Braiding Studio"] },
    "@/lib/geocodingServer": { geocodeSalonAddress: async () => ({ status: "fixture" }) },
    "@/lib/identityServer": {
      assertEmailAvailableForNewIdentity: async () => {}, auditIdentityEvent: async () => {},
      IdentityUnavailableError: class extends Error {}, IDENTITY_UNAVAILABLE_MESSAGE: "Unavailable",
    },
    ...overrides,
  };
  const routeModule = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    assert.ok(Object.hasOwn(adapters, name), `Unexpected route dependency: ${name}`);
    return adapters[name];
  }, routeModule, routeModule.exports);
  return routeModule.exports.POST;
}

const user = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", user_metadata: { role: "salon_owner", phone: "2125550123" } };
function request(body, authorized = true) {
  return new Request("http://localhost/api/fixture", {
    method: "POST", headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: "Bearer fixture-token" } : {}) },
    body: JSON.stringify(body),
  });
}
const validApplication = {
  business_name: "Fixture Salon", owner_name: "Fixture Owner", business_email: user.email,
  phone: "2125550123", street_address: "123 Test Street", city: "Brooklyn", state: "NY", zip_code: "11201",
  business_type: "Braiding Studio", years_in_operation: "1", stylist_count: "1",
  consent_authorized: true, consent_terms: true, consent_photos: true,
};
const writes = [];
let authError = null;
let providerFailure = false;
const application = loadRoute("src/app/api/salon/application/route.ts", {
  "@/lib/supabaseAdmin": {
    getSupabaseAdmin: () => ({
      auth: { getUser: async () => ({ data: { user }, error: authError }) },
      rpc: async (name, values) => {
        writes.push({ name, values });
        return { error: providerFailure ? new Error("fixture") : null, data: { salon: { id: "salon-fixture" }, application: { id: "application-fixture", ...values.p_application_values } } };
      },
    }),
    sendEmail: async () => ({ skipped: true }),
  },
});
for (const value of missingPlans) {
  const before = writes.length;
  const result = await application(request({ ...validApplication, selected_plan: value }));
  assert.equal(result.status, 400);
  assert.match(result.headers.get("content-type"), /application\/json/);
  assert.match((await result.json()).error, /choose a plan/i);
  assert.equal(writes.length, before, "An unselected application must never reach persistence");
}
for (const [value, expected] of choices) {
  const result = await application(request({ ...validApplication, selected_plan: value }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).application.selected_plan, expected);
  assert.equal(writes.at(-1).name, "submit_salon_application_atomic");
  assert.equal(writes.at(-1).values.p_application_values.selected_plan, expected);
  assert.equal(writes.at(-1).values.p_salon_values.subscription_tier, expected);
}
assert.equal((await application(request(validApplication, false))).status, 401);
authError = new Error("fixture auth failure");
assert.equal((await application(request(validApplication))).status, 401);
authError = null;
providerFailure = true;
const failedSubmission = await application(request({ ...validApplication, selected_plan: "growth" }));
assert.equal(failedSubmission.status, 500);
assert.equal(typeof (await failedSubmission.json()).error, "string");

const signupWrites = [];
const signupMetadata = [];
const admin = {
  from: (table) => ({ insert: async (values) => { signupWrites.push({ table, values }); return { error: null }; } }),
};
const signup = loadRoute("src/app/api/auth/signup/route.ts", {
  "@/lib/supabaseAdmin": { getSupabaseAdmin: () => admin },
  "@supabase/supabase-js": { createClient: () => ({ auth: { signUp: async ({ options }) => {
    signupMetadata.push(options.data);
    return { data: { user, session: null }, error: null };
  } } }) },
});
const previousEnv = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY];
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:3105";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-fixture";
try {
  for (const value of [...missingPlans, ...choices.map(([value]) => value)]) {
    const expected = plans.parseApplicationPlan(value);
    const result = await signup(request({ scope: "salon_owner", email: user.email, password: "fixture-password", phone: "2125550123", selected_plan: value }));
    assert.equal(result.status, 200);
    assert.equal(signupMetadata.at(-1).selected_plan, expected);
    assert.equal(signupWrites.at(-1).table, "salons");
    assert.equal(signupWrites.at(-1).values.subscription_tier, expected ?? "Free-seed");
    assert.equal(signupWrites.at(-1).values.subscription_status, "inactive");
  }
} finally {
  for (const [index, key] of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].entries()) {
    if (previousEnv[index] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[index];
  }
}

let existingSalon = null;
let bootstrapUser = user;
const bootstrapWrites = [];
const bootstrap = loadRoute("src/app/api/salon/bootstrap/route.ts", {
  "@/lib/supabaseAdmin": { getSupabaseAdmin: () => ({
    auth: { getUser: async () => ({ data: { user: bootstrapUser }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingSalon, error: null }) }) }),
      insert: (values) => {
        bootstrapWrites.push(values);
        return { select: () => ({ single: async () => ({ data: values, error: null }) }) };
      },
    }),
  }) },
});
for (const value of [...missingPlans, ...choices.map(([value]) => value)]) {
  const result = await bootstrap(request({ selected_plan: value }));
  assert.equal(result.status, 200);
  assert.equal(bootstrapWrites.at(-1).subscription_tier, plans.parseApplicationPlan(value) ?? "Free-seed");
}
bootstrapUser = { ...user, user_metadata: { ...user.user_metadata, selected_plan: "Premium" } };
await bootstrap(request({}));
assert.equal(bootstrapWrites.at(-1).subscription_tier, "Premium", "Preserve explicit signup metadata when no override is supplied");
await bootstrap(request({ selected_plan: "invalid" }));
assert.equal(bootstrapWrites.at(-1).subscription_tier, "Free-seed", "An invalid override must not revive an old choice");
existingSalon = { id: "existing", subscription_tier: "Basic" };
const count = bootstrapWrites.length;
const existing = await bootstrap(request({ selected_plan: "premium" }));
assert.deepEqual((await existing.json()).salon, existingSalon);
assert.equal(bootstrapWrites.length, count, "Existing salons must not be rewritten");
console.log("Application plan consent: parser, signup metadata, bootstrap, submission, and JSON failure boundaries passed (local adapters only).");
