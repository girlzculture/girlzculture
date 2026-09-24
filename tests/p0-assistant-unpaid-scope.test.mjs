import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const id = n => `17910000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const business = id(1), foreignBusiness = id(2), actor = id(3), professional = id(4), otherProfessional = id(5), requestId = id(6);
const range = { start: '2026-03-01T05:00:00Z', end: '2026-04-01T04:00:00Z' };
const stale = { completed: [{ client_name: 'REVOKED PRIVATE CLIENT', unpaid_cents: 987654321 }], scope: 'authenticated_business_only' };

function booking(n, patch = {}) {
  return { id: id(n), salon_id: business, stylist_id: professional, customer_id: id(90), guest_name: 'Own client A',
    guest_email: 'private-contact@example.invalid', name: 'Own service A', created_at: '2026-03-01T15:00:00Z',
    appointment_datetime: '2026-03-10T15:00:00Z', service_completed_at: '2026-03-10T16:00:00Z', status: 'Completed',
    booking_origin: 'business_added', source: 'phone', estimated_total: 100, subtotal_before_promotion: 100,
    deposit_amount: 0, deposit_status: null, payment_mode: null, payment_verified_at: null, verified_charge: false,
    refund_status: null, refund_amount: 0, refund_completed_at: null, verified_refund: false,
    operating_compensation: { kind: 'none', version: null }, ...patch };
}
function financeData(rows, scope = { kind: 'business', stylist_id: null }) {
  return { scope, bookings: rows, sales: [], receipts: [], expenses: [], arrangements: [], obligations: [], compensation_payments: [], stylists: [] };
}

// Only the database/provider transport is simulated. The real helper, Finance
// transformation, assistant dispatcher and planner authorization all execute.
function fixture(options = {}) {
  const calls = [], saved = [], providerRequests = [];
  const denied = new Set(options.denied || []);
  let didRead = false, assigned = options.assigned || null;
  const scope = () => options.scopeAfterRead && didRead ? options.scopeAfterRead
    : options.ownFinance ? { kind: 'own', stylist_id: assigned } : { kind: 'business', stylist_id: null };
  const history = (options.history || []).map(row => ({ id: requestId, salon_id: business, requested_by: actor,
    tool: 'get_outstanding_balances', arguments: range, permission: 'earnings', locale: 'en', result: stale, ...row }));
  const rowsByBusiness = {
    [business]: options.rows || [booking(10)],
    [foreignBusiness]: [booking(20, { salon_id: foreignBusiness, guest_name: 'FOREIGN BUSINESS PRIVATE CLIENT', estimated_total: 9876543.21 })],
  };
  const admin = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'p0_actor_has_permission') {
        assert.equal(args.p_salon, business); assert.equal(args.p_user, actor);
        return { data: !denied.has(args.p_permission) };
      }
      if (name === 'p0_business_plan_active') return { data: true };
      if (name === 'business_finance_scope') {
        assert.equal(args.p_salon, business); assert.equal(args.p_user, actor);
        return denied.has('earnings') && !options.ownFinance ? { error: { message: 'FINANCE_ACCESS_DENIED' } } : { data: scope() };
      }
      if (name === 'read_business_finance') {
        assert.equal(args.p_salon, business); assert.equal(args.p_user, actor);
        if (denied.has('earnings') && !options.ownFinance) return { error: { message: 'FINANCE_ACCESS_DENIED' } };
        const data = structuredClone(options.data || financeData(rowsByBusiness[args.p_salon], scope()));
        didRead = true;
        for (const permission of options.revokeAfterRead || []) denied.add(permission);
        if (options.reassignAfterRead) assigned = options.reassignAfterRead;
        return { data };
      }
      if (name === 'save_gc_assistant_request') { saved.push(args.p_request); return { data: args.p_request }; }
      if (name === 'reserve_gc_assistant_usage') return { data: 'isolated-test-reservation' };
      throw Error(`Unexpected RPC ${name}`);
    },
    from(table) {
      const filters = []; let single = false, mutation;
      const query = {
        select(value) { filters.push(['select', value]); return query; },
        eq(key, value) { filters.push(['eq', key, value]); return query; },
        in(key, value) { filters.push(['in', key, value]); return query; },
        is(key, value) { filters.push(['is', key, value]); return query; },
        abortSignal() { return query; }, order() { return query; }, limit() { return query; },
        maybeSingle() { single = true; return query; },
        update(value) { mutation = value; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            calls.push({ table, filters, mutation });
            let rows;
            if (table === 'subscriptions') rows = [{ salon_id: business, status: 'active', current_period_end: '2099-01-01T00:00:00Z' }];
            else if (table === 'salons') {
              assert.ok(filters.some(f => f[0] === 'eq' && f[1] === 'id' && f[2] === business));
              rows = [{ id: business, user_id: options.assigned ? id(98) : actor }];
            }
            else if (table === 'gc_assistant_requests') {
              assert.ok(filters.some(f => f[0] === 'eq' && f[1] === 'salon_id' && f[2] === business));
              assert.ok(filters.some(f => f[0] === 'eq' && f[1] === 'requested_by' && f[2] === actor));
              rows = history;
            } else if (table === 'salon_team_members') {
              assert.ok(filters.some(f => f[0] === 'eq' && f[1] === 'salon_id' && f[2] === business));
              assert.ok(filters.some(f => f[0] === 'eq' && f[1] === 'user_id' && f[2] === actor));
              rows = assigned ? [{ salon_id: business, user_id: actor, stylist_id: assigned, status: 'Active' }] : [];
            } else if (table === 'ai_automation_features') rows = [{ feature_key: 'gc_owner_assistant', is_enabled: true, provider_key: 'openai', model_key: 'fixture-model', timeout_ms: 1000 }];
            else if (table === 'master_styles' || table === 'engine_settings') rows = [];
            else if (table === 'ai_usage_events') rows = [];
            else throw Error(`Unexpected table ${table}`);
            rows = rows.filter(row => filters.every(([op, key, value]) => op === 'eq' ? row[key] === value : op === 'in' ? value.includes(row[key]) : op === 'is' ? (row[key] ?? null) === value : true));
            return { data: single ? rows[0] || null : rows };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const load = typescriptLoader(root, {
    '@/lib/supabaseAdmin': {},
    '@/lib/aiAutomationServer': { approvedAiModels: () => ['fixture-model'], approvedAiProviders: () => ['openai'], aiProviderConfigured: () => true, redactSensitiveText: value => value },
  }, {
    process: { env: { OPENAI_API_KEY: 'local-fixture-only', AI_OWNER_INPUT_USD_PER_MILLION: '1', AI_OWNER_OUTPUT_USD_PER_MILLION: '4' } },
    TextDecoder, URLSearchParams,
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      providerRequests.push(JSON.parse(init.body));
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(options.answerOnly ? { reply: 'Here are the currently authorized recorded balances.' } : { decision: { clarification: 'Which date range?' }, language_switch: null }) } }] });
    },
  });
  const context = { admin, salon: { id: business, time_zone: 'America/New_York' }, user: { id: actor }, isOwner: !options.assigned,
    teamMember: options.assigned ? { stylist_id: options.assigned, permissions: { earnings: true, bookings: true, client_history: true } } : null };
  return { calls, saved, providerRequests,
    helper: () => load('src/lib/assistantOutstandingBalances.ts').readAssistantOutstandingBalances(context, range),
    execute: (args = range) => load('src/lib/gcAssistantServer.ts').executeAssistantTool(context, { requestId, locale: 'en', tool: 'get_outstanding_balances', args }),
    plan: () => load('src/lib/gcAssistantPlanningServer.ts').planOwnerRequest({ context, admin, salonId: business, userId: actor, locale: 'en', text: 'And who still has a balance?', timeZone: 'America/New_York',
      previousRequestIds: options.previousRequestIds || history.map(row => row.id), conversationRequestIds: options.conversationRequestIds,
      answerOnly: options.answerOnly, conversation: options.conversation || [{ role: 'assistant', text: 'REVOKED PRIVATE CLIENT owes 987654321 cents.' }] }),
  };
}

test('outstanding-balance dispatcher uses only the authenticated business and omits client identifiers/contact data', async () => {
  const f = fixture();
  const result = await f.execute();
  assert.match(JSON.stringify(result.request.result), /Own client A/);
  assert.doesNotMatch(JSON.stringify(result.request.result), /FOREIGN BUSINESS|987654321|private-contact|guest_email|customer_id|client_id/);
  assert.equal(f.saved.length, 1); assert.equal(f.saved[0].salon_id, business); assert.equal(f.saved[0].requested_by, actor);
  await assert.rejects(f.execute({ ...range, salon_id: foreignBusiness }), /ASSISTANT_INVALID_INPUT/);
});

test('mixed-business financial rows fail closed before a balance audit/result or model call', async () => {
  for (const contaminated of ['bookings', 'receipts', 'expenses', 'stylists']) {
    const data = financeData([booking(10)]);
    data[contaminated].push({ id: id(30), salon_id: foreignBusiness, guest_name: 'FOREIGN BUSINESS PRIVATE CLIENT' });
    const f = fixture({ data });
    await assert.rejects(f.execute(), /ACCESS_DENIED|INVALID_RECORD/);
    assert.equal(f.saved.length, 0); assert.equal(f.providerRequests.length, 0);
  }
});

test('direct balance reads require finance, booking and client permissions independently', async () => {
  for (const permission of ['earnings', 'bookings', 'client_history']) {
    const f = fixture({ denied: [permission] });
    await assert.rejects(f.execute(), /ACCESS_DENIED/);
    assert.equal(f.saved.length, 0); assert.equal(f.providerRequests.length, 0);
    assert.equal(f.calls.filter(call => call.name === 'read_business_finance').length, 0);
  }
});

test('permission loss during a finance read denies the projected result and audit', async () => {
  for (const permission of ['earnings', 'bookings', 'client_history']) {
    const f = fixture({ revokeAfterRead: [permission] });
    await assert.rejects(f.execute(), /ACCESS_DENIED/);
    assert.equal(f.saved.length, 0); assert.equal(f.providerRequests.length, 0);
  }
});

test('assigned staff with full-finance grant receives only its own professional balances', async () => {
  const f = fixture({ assigned: professional, rows: [booking(10), booking(11, { stylist_id: otherProfessional, guest_name: 'OTHER PROFESSIONAL PRIVATE CLIENT', name: 'Other professional service', estimated_total: 7777 })] });
  const result = await f.helper();
  assert.match(JSON.stringify(result), /Own service A/);
  assert.doesNotMatch(JSON.stringify(result), /OTHER PROFESSIONAL|Other professional service|777700/);
});

test('a professional reassignment during a business-wide finance read invalidates the stale context', async () => {
  const f = fixture({ assigned: professional, reassignAfterRead: otherProfessional });
  await assert.rejects(f.execute(), /ACCESS_DENIED/);
  assert.equal(f.saved.length, 0);
});

test('a replayed balance request recomputes current scoped facts rather than replaying prior private amounts', async () => {
  const f = fixture({ history: [{}] });
  const result = await f.execute();
  assert.equal(result.replayed, true);
  assert.match(JSON.stringify(result.request.result), /Own client A/);
  assert.doesNotMatch(JSON.stringify(result), /REVOKED PRIVATE CLIENT|987654321/);
  assert.equal(f.saved.length, 0);
});

test('follow-up without conversation IDs refreshes the real read before supplying model facts', async () => {
  const f = fixture({ history: [{}] });
  await f.plan();
  assert.ok(f.calls.some(call => call.name === 'read_business_finance'));
  const facts = JSON.parse(f.providerRequests[0].messages[1].content);
  assert.match(JSON.stringify(facts.previous), /Own client A/);
  assert.doesNotMatch(JSON.stringify(f.providerRequests), /REVOKED PRIVATE CLIENT|987654321/);
  assert.deepEqual(facts.conversation, []);
});

test('secondary permission loss removes old balances and transcript before follow-up planning', async () => {
  for (const permission of ['earnings', 'bookings', 'client_history']) {
    const f = fixture({ denied: [permission], history: [{}] });
    await f.plan();
    const facts = JSON.parse(f.providerRequests[0].messages[1].content);
    assert.deepEqual(facts.previous, []); assert.deepEqual(facts.conversation, []);
    assert.doesNotMatch(JSON.stringify(f.providerRequests), /REVOKED PRIVATE CLIENT|987654321/);
  }
});

test('answer-only follow-up refuses revoked balance evidence before making a model request', async () => {
  for (const permission of ['earnings', 'bookings', 'client_history']) {
    const f = fixture({ denied: [permission], history: [{}], answerOnly: true });
    await assert.rejects(f.plan(), /ASSISTANT_INVALID_PLAN|ASSISTANT_ACCESS_DENIED/);
    assert.equal(f.providerRequests.length, 0);
  }
});

test('foreign business and foreign actor history IDs cannot authorize balance prose', async () => {
  for (const foreign of [{ salon_id: foreignBusiness }, { requested_by: id(99) }]) {
    const f = fixture({ history: [foreign] });
    await f.plan();
    const facts = JSON.parse(f.providerRequests[0].messages[1].content);
    assert.deepEqual(facts.previous, []); assert.deepEqual(facts.conversation, []);
    assert.doesNotMatch(JSON.stringify(f.providerRequests), /REVOKED PRIVATE CLIENT|987654321/);
  }
});

test('fresh own-finance scope replaces a previous business-wide balance result before model exposure', async () => {
  const f = fixture({ assigned: professional, denied: ['earnings'], ownFinance: true, history: [{}] });
  await f.plan();
  const facts = JSON.parse(f.providerRequests[0].messages[1].content);
  assert.equal(facts.previous[0].result.scope, 'own_stylist_only');
  assert.equal(facts.previous[0].result.scope_stylist_id, professional);
  assert.doesNotMatch(JSON.stringify(f.providerRequests), /REVOKED PRIVATE CLIENT|987654321/);
  assert.deepEqual(facts.conversation, []);
});

test('follow-up rechecks permissions and assignment after the canonical read before any model call', async () => {
  for (const options of [{ revokeAfterRead: ['client_history'] }, { revokeAfterRead: ['bookings'] },
    { revokeAfterRead: ['earnings'] }, { assigned: professional, reassignAfterRead: otherProfessional }]) {
    const f = fixture({ ...options, history: [{}], answerOnly: true });
    await assert.rejects(f.plan(), /ASSISTANT_INVALID_PLAN|ASSISTANT_ACCESS_DENIED/);
    assert.equal(f.providerRequests.length, 0);
  }
});
