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
