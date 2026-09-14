import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const actor = '11000000-0000-4000-8000-000000000001';
const business = '22000000-0000-4000-8000-000000000001';
const requestId = '33000000-0000-4000-8000-000000000001';
const reference = '44000000-0000-4000-8000-000000000001';
function fixture(code, stage = 'tool') {
  const incidents = [];
  const context = { admin: {}, user: { id: actor }, salon: { id: business }, isOwner: true };
  class RateLimitError extends Error { retryAfter = 30; }
  let core;
  const load = typescriptLoader(process.cwd(), {
    '@/lib/supabaseAdmin': { requireSalonOwner: async () => context },
    '@/lib/requestSecurity': { enforceRateLimit: () => { if (stage === 'rate') throw new RateLimitError(); }, RateLimitError },
    '@/lib/gcAssistantServer': { executeAssistantTool: async () => { throw new core.AssistantError(code, 409); }, confirmAssistantTool: async () => { throw new core.AssistantError(code, 409); } },
    '@/lib/gcAssistantPlanningServer': { planOwnerRequest: async () => ({ plan: { tool: 'prepare_customer_message', args: { booking_id: requestId, body: 'Private customer prose' } } }) },
    '@/lib/operationalMonitoring': { withOperationalMonitoring: (_profile, handler) => handler, routeMonitoringProfile() {} },
    '@/lib/platformErrors': { capturePlatformError: async input => { incidents.push(input); return reference; }, safeFailure: (_message, id) => Response.json({ request_id: id }, { status: 500 }) },
  }, { Error, SyntaxError });
  core = load('src/lib/gcAssistantCore.ts');
  const route = load('src/app/api/salon/assistant/route.ts');
  const payload = { action: 'tool', request_id: requestId, locale: 'fr', tool: 'prepare_customer_message', args: { booking_id: requestId, body: 'Private customer prose' } };
  if (stage === 'confirm') Object.assign(payload, { action: 'confirm', digest: 'a'.repeat(64), confirm: true, policy_reviewed: false });
  if (stage === 'plan') Object.assign(payload, { action: 'plan', text: 'Private owner prompt', previous_request_ids: [] });
  if (stage === 'confirm' || stage === 'plan') { delete payload.tool; delete payload.args; }
  return { incidents, context, send: () => route.POST(new Request('http://localhost/api/salon/assistant', { method: 'POST', body: JSON.stringify(payload) })) };
}

for (const [stage, code] of [['tool', 'ASSISTANT_ACCESS_DENIED'], ['tool', 'ASSISTANT_CONTENT_REVIEW_REQUIRED'], ['confirm', 'ASSISTANT_PREVIEW_STALE'], ['plan', 'ASSISTANT_PLAN_REQUIRED']]) {
  test(`Assistant ${stage} rejection ${code} retains protected evidence and the exact returned reference`, async () => {
    const f = fixture(code, stage);
    const response = await f.send(); const result = await response.json();
    assert.equal(response.status, 409); assert.equal(result.code, code);
    assert.equal(f.incidents.length, 1, 'Pre-execution failures need protected audit evidence');
    const incident = f.incidents[0];
    assert.equal(incident.admin, f.context.admin); assert.equal(incident.actorId, actor); assert.equal(incident.salonId, business);
    assert.equal(incident.metadata.assistant_request_id, requestId); assert.equal(incident.metadata.locale, 'fr');
    assert.equal(incident.metadata.failure_code, code); assert.equal(incident.metadata.stage, stage);
    if (stage !== 'confirm') { assert.equal(incident.metadata.proposed_tool, 'prepare_customer_message'); assert.equal(incident.metadata.risk_class, 4); assert.match(incident.metadata.arguments_sha256, /^[a-f0-9]{64}$/); }
    assert.doesNotMatch(JSON.stringify(incident.metadata), /Private customer prose|Private owner prompt/);
    assert.equal(result.request_id, reference); assert.equal(response.headers.get('X-Request-ID'), reference);
    assert.doesNotMatch(JSON.stringify(result), /Private|arguments|salon/);
  });
}

test('Assistant rate limit keeps retry semantics without creating a monitoring amplification loop', async () => {
  const f = fixture('ASSISTANT_RATE_LIMIT', 'rate'); const response = await f.send();
  assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '30'); assert.equal(f.incidents.length, 0);
});
