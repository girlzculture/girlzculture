import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const business = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const requestId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function fixture(options = {}) {
  const calls = []; const saved = [];
  const tables = { subscriptions: [{ salon_id: business, status: 'active', current_period_end: '2099-01-01T00:00:00Z' }], gc_assistant_requests: [], styles: [], bookings: [], ...options.tables };
  const admin = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'p0_actor_has_permission') return { data: options.allowed !== false };
      if (name === 'save_gc_assistant_request') { saved.push(args.p_request); return { data: args.p_request }; }
      if (name === 'confirm_gc_assistant_request') return { data: { verified: true, result: {} } };
      throw Error(`Unexpected RPC ${name}`);
    },
    from(table) {
      const filters = []; let cap = Infinity; let single = false; let ordering;
      const q = {
        select() { return q; }, eq(key, value) { filters.push(row => row[key] === value); return q; },
        is(key, value) { filters.push(row => (row[key] ?? null) === value); return q; },
        gte(key, value) { filters.push(row => row[key] >= value); return q; }, lt(key, value) { filters.push(row => row[key] < value); return q; },
        ilike(key, pattern) { calls.push({ table, pattern }); const needle = pattern.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLowerCase(); filters.push(row => String(row[key]).toLowerCase().includes(needle)); return q; },
        order(key) { ordering = key; return q; }, limit(n) { cap = n; return q; }, maybeSingle() { single = true; return q; },
        then(resolve, reject) { return Promise.resolve().then(() => {
          calls.push({ table }); if (!tables[table]) throw Error(`Unexpected table ${table}`);
          const rows = tables[table].filter(row => filters.every(filter => filter(row)));
          if (ordering) rows.sort((a,b) => String(a[ordering]).localeCompare(String(b[ordering])));
          return { data: single ? rows[0] || null : rows.slice(0, cap), count: rows.length };
        }).then(resolve, reject); },
      }; return q;
    },
  };
  const load = typescriptLoader(process.cwd(), { '@/lib/supabaseAdmin': {}, '@/lib/bookingAvailabilityServer': { bookingAvailability: async () => ({ timeZone: 'America/New_York', durationMinutes: 60, bufferMinutes: 15, slots: [{ value: '13:00', stylistId: actor, stylistName: 'Save' }] }) }, '@/lib/contentModerationServer': { moderatePublicContent: async () => ({ allowed: true }) } });
  const server = load('src/lib/gcAssistantServer.ts');
  const context = { admin, user: { id: actor }, salon: { id: business, subscription_status: 'active', time_zone: 'America/New_York', description: 'Original Save' }, isOwner: true };
  return { calls, saved, context, server, run: (tool, args) => server.executeAssistantTool(context, { requestId, locale: 'fr', tool, args }) };
}

test('service search applies the requested name before the bounded database result limit', async () => {
  const styles = [...Array.from({ length: 100 }, (_,i) => ({ id: String(i), salon_id: business, name: `A service ${i}` })), { id: 'wanted', salon_id: business, name: 'Z medium knotless', base_price: 180 }];
  const f = fixture({ tables: { styles } });
  const response = await f.run('get_services_and_prices', { query: 'medium knotless' });
  assert.equal(response.request.result.services.length, 1, 'A real match must not disappear because unrelated names fill the first page');
  assert.equal(response.request.result.services[0].id, 'wanted');
});

test('literal service search cannot expand percent or underscore into wildcard records', async () => {
  const f = fixture({ tables: { styles: [{ salon_id: business, name: 'A_100% Save' }, { salon_id: business, name: 'AB1000 Save' }] } });
  const response = await f.run('get_services_and_prices', { query: '_100%' });
  assert.equal(response.request.result.services.length, 1); assert.equal(response.request.result.services[0].name, 'A_100% Save');
});

test('bookings are read only for the resolved business and requested interval', async () => {
  const f = fixture({ tables: { bookings: [
    { salon_id: business, appointment_datetime: '2026-09-20T15:00:00Z', guest_name: 'Save' },
    { salon_id: 'other-business', appointment_datetime: '2026-09-20T15:00:00Z', guest_name: 'Private B' },
    { salon_id: business, appointment_datetime: '2026-09-25T15:00:00Z', guest_name: 'Outside range' },
  ] } });
  const response = await f.run('get_bookings', { start: '2026-09-20T00:00:00Z', end: '2026-09-21T00:00:00Z' });
  assert.equal(response.request.result.bookings.length, 1); assert.equal(response.request.result.bookings[0].guest_name, 'Save');
  assert.equal(response.request.result.time_zone, 'America/New_York');
  assert.equal(f.saved[0].salon_id, business); assert.equal(f.saved[0].requested_by, actor);
});

test('availability retains canonical professional identity for a subsequent scoped draft', async () => {
  const f = fixture();
  const response = await f.run('get_availability', { style_id: requestId, stylist_id: null, date: '2026-09-20' });
  const slot = response.request.result.slots[0];
  assert.equal(slot.stylist_id, actor);
  assert.equal(slot.professional_name, 'Save');
  assert.equal(slot.time, '13:00');
});

test('revoked permission and expired subscription stop reads and proposal saves', async () => {
  for (const [options, code] of [[{ allowed: false }, 'ASSISTANT_ACCESS_DENIED'], [{ tables: { subscriptions: [{ salon_id: business, status: 'active', current_period_end: '2000-01-01T00:00:00Z' }] } }, 'ASSISTANT_PLAN_REQUIRED']]) {
    const f = fixture(options); await assert.rejects(f.run('get_business_profile', {}), new RegExp(code)); assert.equal(f.saved.length, 0);
  }
});

test('replayed read results still require fresh permission before becoming visible', async () => {
  const f = fixture({ allowed: false, tables: { gc_assistant_requests: [{ id: requestId, salon_id: business, requested_by: actor, tool: 'get_business_profile', arguments: {}, locale: 'fr', result: { description: 'Private history' } }] } });
  await assert.rejects(f.run('get_business_profile', {}), /ASSISTANT_ACCESS_DENIED/);
  assert.equal(f.calls.some(row => row.table === 'gc_assistant_requests'), false);
});

test('a newly revoked actor cannot confirm an existing public proposal', async () => {
  const f = fixture({ allowed: false, tables: { gc_assistant_requests: [{ id: requestId, salon_id: business, requested_by: actor, tool: 'prepare_business_profile_update', arguments: { field: 'description', text: 'Change', hours: null }, execution_payload: {}, confirmed_at: null }] } });
  await assert.rejects(f.server.confirmAssistantTool(f.context, requestId, 'a'.repeat(64), false), /ASSISTANT_ACCESS_DENIED/);
  assert.equal(f.calls.some(row => row.name === 'confirm_gc_assistant_request'), false);
});

test('confirmation revalidates the customer identity shown in the preview', async () => {
  const f = fixture({ tables: {
    gc_assistant_requests: [{ id: requestId, salon_id: business, requested_by: actor, tool: 'prepare_customer_message', arguments: { booking_id: requestId, body: 'Hello Sarah' }, execution_payload: { customer_name: 'Sarah', public_reference: 'GC123', time_zone: 'America/New_York' }, confirmed_at: null }],
    bookings: [{ id: requestId, salon_id: business, status: 'Confirmed', appointment_datetime: '2026-09-20T13:00:00Z', guest_name: 'Different customer', public_reference: 'GC123' }],
  } });
  await assert.rejects(f.server.confirmAssistantTool(f.context, requestId, 'a'.repeat(64), false), /ASSISTANT_PREVIEW_STALE/);
  assert.equal(f.calls.some(row => row.name === 'confirm_gc_assistant_request'), false);
});
