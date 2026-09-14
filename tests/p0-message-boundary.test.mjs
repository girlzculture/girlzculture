import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const actor = '11000000-0000-4000-8000-000000000001';
const bookingId = '22000000-0000-4000-8000-000000000001';
const messageId = '33000000-0000-4000-8000-000000000001';
const requestId = '44000000-0000-4000-8000-000000000001';
class RateLimitError extends Error { retryAfter = 30; }
function fixture(options = {}) {
  const mutations = [], deliveries = [], incidents = [];
  const canonical = { status: 'Active', email_normalized: 'owner@example.test', primary_role: 'salon_owner', ...options.canonical };
  const booking = { id: bookingId, salon_id: 'business-a', customer_id: 'customer-a', salon: { user_id: actor, name: 'Save' }, style: { name: 'Original service' }, ...options.booking };
  const prior = { id: messageId, booking_id: bookingId, original_body: '  Bonjour — $180, GC123  ', ...options.prior };
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: actor, email: 'owner@example.test' } } }) },
    from(table) {
      let operation = 'read', payload;
      const filters = [];
      const response = (single = false) => {
        if (options.failTable === table) return { data: null, error: new Error('private connection/provider details') };
        if (operation !== 'read') {
          mutations.push({ table, operation, payload });
          if (operation === 'insert' && options.replay) return { data: null, error: { code: '23505' } };
          return { data: { id: messageId, ...payload }, error: null };
        }
        const row = table === 'platform_identities' ? canonical : table === 'bookings' ? booking : table === 'salon_team_members' ? options.team || null : table === 'admin_users' ? options.admin || null : table === 'booking_conversation_events' ? { event_type: 'booking_created', facts: { business: 'Save' } } : table === 'booking_messages' ? prior : null;
        if (table === 'salon_team_members' && filters.some(([key, value]) => key === 'status' && value !== row?.status)) return { data: single ? null : [], error: null };
        return { data: single ? row : row ? [row] : [], error: null };
      };
      const query = {
        select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, neq() { return query; }, is() { return query; }, in() { return query; }, ilike() { return query; }, limit() { return query; }, order() { return query; },
        insert(value) { operation = 'insert'; payload = value; return query; }, update(value) { operation = 'update'; payload = value; return query; },
        single: async () => response(true), maybeSingle: async () => response(true), then(resolve, reject) { return Promise.resolve(response()).then(resolve, reject); },
      };
      return query;
    },
  };
  const load = typescriptLoader(process.cwd(), {
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => admin, deliverBookingMessageNotifications: async id => { deliveries.push(id); return { warnings: options.notificationFailure ? [{ code: 'MESSAGE_NOTIFICATION_FAILED', request_id: 'GC-LOCAL-INCIDENT-17' }] : [] }; } },
    '@/lib/operationalMonitoring': { withOperationalMonitoring: (_profile, handler) => handler, routeMonitoringProfile() {}, noteOperationalFailure() {} },
    '@/lib/platformErrors': { capturePlatformError: async input => { incidents.push(input); return 'GC-LOCAL-INCIDENT-17'; }, safeFailure: (_message, reference, status, extras) => Response.json({ ...extras, request_id: reference }, { status }) },
    '@/lib/requestSecurity': { cleanText: (value, max) => String(value || '').trim().slice(0, max), enforceRateLimit: () => { if (options.rateLimit) throw new RateLimitError(); }, RateLimitError },
    '@/lib/contentModerationServer': { moderatePublicContent: async () => ({ allowed: !options.moderationBlocked }) },
    '@/lib/aiAutomationServer': { generateTranslationDraft: () => { throw new Error('Provider must not run in these tests'); } },
    '@/lib/bookingMessageTranslationServer': { bookingMessageTranslation: () => { throw new Error('Provider must not run in these tests'); } },
  }, { Error, SyntaxError });
  const route = load('src/app/api/messages/route.ts');
  return { route, mutations, deliveries, incidents };
}
const send = (f, body = {}) => f.route.POST(new Request('http://localhost/api/messages', { method: 'POST', headers: { authorization: 'Bearer fixture-only', 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: bookingId, body: '  Bonjour — $180, GC123  ', client_request_id: requestId, ...body }) }));
const read = f => f.route.GET(new Request(`http://localhost/api/messages?booking_id=${bookingId}`, { headers: { authorization: 'Bearer fixture-only' } }));

for (const [name, options] of [
  ['disabled identity', { canonical: { status: 'Disabled' } }],
  ['changed identity email', { canonical: { email_normalized: 'changed@example.test' } }],
  ['different business owner', { booking: { salon: { user_id: 'another-owner' } } }],
  ['customer from another booking', { canonical: { primary_role: 'customer' } }],
  ['invited team member', { canonical: { primary_role: 'salon_team' }, team: { status: 'Invited', permissions: { bookings: true } } }],
  ['team member without booking permission', { canonical: { primary_role: 'salon_team' }, team: { status: 'Active', permissions: {} } }],
  ['admin without support permission', { canonical: { primary_role: 'admin' }, admin: { status: 'Active', permissions: { engine: true } } }],
]) test(`messages deny ${name} before writes or notifications`, async () => {
  const f = fixture(options); const result = await send(f);
  assert.equal(result.status, 403); assert.equal((await result.json()).code, 'MESSAGE_ACCESS_DENIED');
  assert.deepEqual(f.mutations, []); assert.deepEqual(f.deliveries, []);
});
test('message save preserves exact original and invokes existing notification delivery', async () => {
  const f = fixture(); const result = await send(f); const body = await result.json();
  assert.equal(result.status, 200); assert.equal(body.message.original_body, '  Bonjour — $180, GC123  '); assert.equal(body.message.body, body.message.original_body);
  assert.deepEqual(f.deliveries, [messageId]); assert.equal(body.replayed, false);
});
test('same message retry uses original row and retries deduplicated notification channels', async () => {
  const f = fixture({ replay: true }); const result = await send(f); const body = await result.json();
  assert.equal(result.status, 200); assert.equal(body.message.id, messageId); assert.equal(body.replayed, true); assert.deepEqual(f.deliveries, [messageId]);
});
test('message idempotency conflict cannot resend different wording', async () => {
  const f = fixture({ replay: true, prior: { original_body: 'Different original' } }); const result = await send(f);
  assert.equal(result.status, 409); assert.equal((await result.json()).code, 'MESSAGE_IDEMPOTENCY_CONFLICT'); assert.deepEqual(f.deliveries, []);
});
test('notification failure preserves the saved message and exact protected reference', async () => {
  const f = fixture({ notificationFailure: true }); const result = await send(f); const body = await result.json();
  assert.equal(result.status, 200); assert.equal(body.message.id, messageId); assert.equal(body.warnings[0].request_id, 'GC-LOCAL-INCIDENT-17');
});
test('unexpected authorization query failure fails closed with JSON and an incident reference', async () => {
  const f = fixture({ failTable: 'salon_team_members' }); const result = await send(f); const body = await result.json();
  assert.equal(result.status, 503); assert.equal(body.request_id, 'GC-LOCAL-INCIDENT-17'); assert.equal(f.incidents.length, 1); assert.doesNotMatch(JSON.stringify(body), /private|provider details/);
  assert.deepEqual(f.mutations, []);
});
test('support read-only inspection does not change recipient read receipts', async () => {
  const f = fixture({ canonical: { primary_role: 'admin' }, admin: { status: 'Active', permissions: { support: true } } }); const result = await read(f); const body = await result.json();
  assert.equal(result.status, 200); assert.equal(body.role, 'admin'); assert.equal(body.welcome.facts.business, 'Save'); assert.deepEqual(f.mutations, []);
});
test('active permitted team member can read the correct booking and update their read receipt', async () => {
  const f = fixture({ canonical: { primary_role: 'salon_team' }, team: { status: 'Active', permissions: { bookings: true } } }); const result = await read(f);
  assert.equal(result.status, 200); assert.equal((await result.json()).role, 'salon'); assert.equal(f.mutations[0].table, 'booking_messages'); assert.ok(f.mutations[0].payload.read_by_salon_at);
});
test('rate limiting returns a stable localized code and retry delay', async () => {
  const f = fixture({ rateLimit: true }); const result = await send(f);
  assert.equal(result.status, 429); assert.equal(result.headers.get('Retry-After'), '30'); assert.equal((await result.json()).code, 'MESSAGE_RATE_LIMIT'); assert.deepEqual(f.mutations, []);
});
test('unknown actions fail validation before persistence', async () => {
  const f = fixture(); const result = await send(f, { action: 'run_sql' });
  assert.equal(result.status, 400); assert.deepEqual(f.mutations, []);
});

test('blocked message moderation returns its stable code without saving or notifying', async () => {
  const f = fixture({ moderationBlocked: true });
  const response = await send(f);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'MESSAGE_CONTENT_REVIEW_REQUIRED');
  assert.deepEqual(f.mutations, []);
  assert.deepEqual(f.deliveries, []);
});
