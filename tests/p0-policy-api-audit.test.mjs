import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

for (const method of ['GET', 'POST']) test(`policy ${method} failure retains the authenticated Engine context and exact incident reference`, async () => {
  const incidents = [];
  const reference = '44000000-0000-4000-8000-000000000001';
  const context = { admin: { from(table) {
    const q = { select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, insert() { return q; }, single() { return q; }, maybeSingle() { return q; }, then(resolve, reject) { return Promise.resolve(table === 'subscriptions' ? { data: { status: 'active' } } : { error: new Error('Private database connection details') }).then(resolve, reject); } };
    return q;
  } }, salon: { id: 'business-a', subscription_status: 'active' }, user: { id: 'actor-a' } };
  const load = typescriptLoader(process.cwd(), {
    '@/lib/supabaseAdmin': { requireSalonPermission: async () => context },
    '@/lib/requestSecurity': { enforceRateLimit() {}, RateLimitError: class extends Error {} },
    '@/lib/plans': { isSubscriptionActive: () => true },
    '@/lib/operationalMonitoring': { withOperationalMonitoring: (_profile, handler) => handler, routeMonitoringProfile() {} },
    '@/lib/platformErrors': { capturePlatformError: async input => { incidents.push(input); return reference; }, safeFailure: (_message, id, status = 500, details = {}) => Response.json({ request_id: id, ...details }, { status, headers: { 'X-Request-ID': id } }) },
  }, { Error, SyntaxError });
  const { POLICY_DEFAULTS } = load('src/lib/businessPolicyCore.ts');
  const route = load('src/app/api/salon/policies/route.ts');
  const response = await route[method](new Request('http://localhost/api/salon/policies', { method, ...(method === 'POST' ? { body: JSON.stringify({ action: 'draft', locale: 'fr', policy: POLICY_DEFAULTS }) } : {}) }));
  const result = await response.json();
  assert.equal(response.status, 500); assert.equal(incidents.length, 1);
  assert.equal(incidents[0].admin, context.admin, 'Available authenticated admin context must reach the existing Engine persistence');
  assert.equal(incidents[0].actorId, 'actor-a'); assert.equal(incidents[0].salonId, 'business-a');
  assert.equal(result.code, 'POLICY_UNAVAILABLE'); assert.equal(result.request_id, reference);
  assert.equal(response.headers.get('X-Request-ID'), reference);
  assert.doesNotMatch(JSON.stringify(result), /Private|connection/);
});

test('an unchanged policy draft publishes after the JSONB round trip reorders its keys', async () => {
  const id = '44000000-0000-4000-8000-000000000002';
  let stored;
  let published = 0;
  const context = { salon: { id: 'business-a', subscription_status: 'active', business_policy_revision_id: null }, user: { id: 'actor-a' }, admin: {
    from(table) {
      const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return q; }, single() { return q; },
        insert(row) {
          // Postgres JSONB does not retain JavaScript insertion order.
          stored = { id, ...row, policy: Object.fromEntries(Object.entries(row.policy).sort(([a], [b]) => a.localeCompare(b))), version: null, published_at: null };
          return q;
        },
        then(resolve, reject) { return Promise.resolve({ data: table === 'subscriptions' ? { status: 'active' } : stored }).then(resolve, reject); },
      }; return q;
    },
    async rpc(name, input) {
      assert.equal(name, 'publish_business_policy');
      assert.deepEqual(JSON.parse(JSON.stringify(input)), { p_salon: 'business-a', p_user: 'actor-a', p_revision: id, p_expected_revision: null });
      published++;
      return { data: { ...stored, version: 1, published_at: new Date().toISOString() } };
    },
  } };
  const load = typescriptLoader(process.cwd(), {
    '@/lib/supabaseAdmin': { requireSalonPermission: async () => context },
    '@/lib/requestSecurity': { enforceRateLimit() {}, RateLimitError: class extends Error {} },
    '@/lib/plans': { isSubscriptionActive: () => true },
    '@/lib/operationalMonitoring': { withOperationalMonitoring: (_profile, handler) => handler, routeMonitoringProfile() {} },
    '@/lib/platformErrors': { capturePlatformError: async () => 'unexpected-error', safeFailure: () => Response.json({}, { status: 500 }) },
  }, { Error, SyntaxError });
  const { POLICY_DEFAULTS } = load('src/lib/businessPolicyCore.ts');
  const { POST } = load('src/app/api/salon/policies/route.ts');
  const request = body => new Request('http://localhost/api/salon/policies', { method: 'POST', body: JSON.stringify(body) });
  const draftResponse = await POST(request({ action: 'draft', locale: 'en', policy: { ...POLICY_DEFAULTS, notes: 'Please arrive with clean hair.' } }));
  assert.equal(draftResponse.status, 200);
  const draft = await draftResponse.json();
  const approval = { action: 'publish', revision_id: id, digest: draft.digest, expected_revision: draft.expected_revision, confirm: true, platform_rules_acknowledged: true, source_reviewed: true };
  const response = await POST(request(approval));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  assert.equal(published, 1);
  stored.policy.notes = 'Changed after the owner reviewed the draft.';
  const stale = await POST(request(approval));
  assert.equal(stale.status, 409, 'an actual content change must still invalidate approval');
  assert.equal((await stale.json()).code, 'POLICY_PREVIEW_STALE');
  assert.equal(stale.headers.get('X-Request-ID'), 'unexpected-error', 'the exact conflict reference must survive the monitoring wrapper');
  assert.equal(published, 1, 'a stale preview must never publish');
});
