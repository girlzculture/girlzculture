import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const ids = { business: 'business-A', owner: 'owner-A', staff: 'staff-A', member: 'member-A', professional: 'professional-A', otherProfessional: 'professional-B', booking: 'booking-A' };
const range = { start: '2026-09-01T00:00:00Z', end: '2026-10-01T00:00:00Z' };
function fixture(options = {}) {
  const calls = [];
  const business = options.otherBusiness ? 'business-B' : ids.business;
  const tables = {
    salons: [{ id: ids.business, user_id: ids.owner }, { id: 'business-B', user_id: 'owner-B' }],
    salon_team_members: [{ id: ids.member, salon_id: ids.business, user_id: ids.staff, status: 'Active', stylist_id: ids.professional }],
    bookings: [
      { id: ids.booking, salon_id: ids.business, stylist_id: ids.professional, guest_name: 'Own original client', guest_email: 'private@example.test', customer_id: 'PRIVATE_ACCOUNT_ID', booking_origin: 'marketplace', appointment_datetime: '2026-09-19T12:00:00Z', status: 'Confirmed' },
      { id: 'unassigned-booking', salon_id: ids.business, stylist_id: ids.otherProfessional, guest_name: 'OTHER_ASSIGNMENT_CLIENT', appointment_datetime: '2026-09-19T12:00:00Z', status: 'Confirmed' },
      { id: 'foreign-booking', salon_id: 'business-B', stylist_id: ids.professional, guest_name: 'FOREIGN_CLIENT', appointment_datetime: '2026-09-19T12:00:00Z', status: 'Confirmed' },
    ],
    booking_messages: [{ id: 'message-A', salon_id: ids.business, booking_id: ids.booking, original_body: 'Own original message', body: 'Fallback', source_locale: 'en', sender_role: 'customer', created_at: '2026-09-19T12:00:00Z' }, { id: 'message-B', salon_id: 'business-B', booking_id: 'foreign-booking', original_body: 'FOREIGN_MESSAGE', created_at: '2026-09-19T12:00:00Z' }],
    reviews: [{ id: 'review-A', salon_id: ids.business, rating_overall: 4, written_review: 'Own original review', salon_reply: null, display_name: 'Own reviewer', moderation_status: 'Held', created_at: '2026-09-19T12:00:00Z' }, { id: 'review-B', salon_id: 'business-B', written_review: 'FOREIGN_REVIEW', created_at: '2026-09-19T12:00:00Z' }],
  };
  let dataRead = false;
  const admin = {
    async rpc(name, args) {
      assert.equal(name, 'p0_actor_has_permission'); assert.equal(args.p_salon, business);
      calls.push({ name, args });
      return { data: options.denied !== true && !(options.revokeDuringRead && dataRead), error: null };
    },
    from(table) {
      const filters = [], sort = []; let selected = [], one = false, start = 0, end = Infinity;
      const q = {
        select(fields) { selected = fields.split(','); return q; },
        eq(key, value) { filters.push(row => row[key] === value); return q; },
        in(key, values) { filters.push(row => values.includes(row[key])); return q; },
        gte(key, value) { filters.push(row => row[key] >= value); return q; },
        lt(key, value) { filters.push(row => row[key] < value); return q; },
        order(key, opts) { sort.push([key, opts?.ascending !== false]); return q; },
        limit(n) { end = n; return q; }, range(a, b) { start = a; end = b + 1; return q; },
        maybeSingle() { one = true; return q; },
        then(resolve, reject) {
          calls.push({ table, selected });
          let rows = tables[table].filter(row => filters.every(filter => filter(row)));
          if (options.foreignResponse === table) rows = tables[table].filter(row => row.salon_id === 'business-B');
          for (const [key, ascending] of [...sort].reverse()) rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
          const count = rows.length;
          const result = rows.slice(start, end).map(row => Object.fromEntries(selected.map(key => [key, row[key]])));
          if (['bookings', 'booking_messages', 'reviews'].includes(table)) {
            dataRead = true;
            if (options.reassignDuringRead) tables.salon_team_members[0].stylist_id = ids.otherProfessional;
          }
          return Promise.resolve({ data: one ? result[0] || null : result, count, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  const context = { admin, salon: { id: business, time_zone: 'America/New_York' }, user: { id: options.staff ? ids.staff : options.otherBusiness ? 'owner-B' : ids.owner }, isOwner: !options.staff, teamMember: options.staff ? { id: ids.member, stylist_id: ids.professional } : null };
  const read = typescriptLoader(process.cwd())('src/lib/ownerReadServer.ts').readOwnerOperation;
  return { calls, tables, run: (tool, args = tool === 'get_booking_messages' ? { booking_id: ids.booking } : range) => read(context, tool, args) };
}

for (const tool of ['get_booking_messages', 'get_reviews', 'get_customers']) {
  test(`${tool} blocks permission loss before and during the current source read`, async () => {
    for (const options of [{ denied: true }, { revokeDuringRead: true }]) {
      const f = fixture(options);
      await assert.rejects(f.run(tool), error => error.code === 'ASSISTANT_ACCESS_DENIED');
      if (options.denied) assert.equal(f.calls.some(call => ['bookings', 'booking_messages', 'reviews'].includes(call.table)), false);
    }
  });
  test(`${tool} rejects reassignment before returning source facts`, async () => {
    const f = fixture({ staff: true, reassignDuringRead: true });
    await assert.rejects(f.run(tool), error => error.code === 'ASSISTANT_ACCESS_DENIED');
  });
}

test('conversation/customer reads retain assigned own facts and refuse foreign bookings without reading their messages', async () => {
  const f = fixture({ staff: true });
  const clients = await f.run('get_customers');
  assert.equal(clients.customers.length, 1); assert.equal(clients.customers[0].name, 'Own original client');
  assert.doesNotMatch(JSON.stringify(clients), /FOREIGN_|OTHER_ASSIGNMENT_CLIENT|private@example|PRIVATE_ACCOUNT_ID/);
  const messages = await f.run('get_booking_messages'); assert.equal(messages.messages[0].original_body, 'Own original message');
  const before = f.calls.filter(call => call.table === 'booking_messages').length;
  await assert.rejects(f.run('get_booking_messages', { booking_id: 'foreign-booking' }), error => error.code === 'ASSISTANT_RECORD_NOT_FOUND');
  assert.equal(f.calls.filter(call => call.table === 'booking_messages').length, before);
});

for (const [tool, table] of [['get_booking_messages', 'booking_messages'], ['get_reviews', 'reviews'], ['get_customers', 'bookings']]) {
  test(`${tool} rejects a mixed or foreign provider response before projection`, async () => {
    await assert.rejects(fixture({ foreignResponse: table }).run(tool), error => error.code === 'ASSISTANT_SERVICE_UNAVAILABLE');
  });
}

test('two authenticated businesses receive only their own messages, reviews and booking associations', async () => {
  for (const otherBusiness of [false, true]) {
    const f = fixture({ otherBusiness });
    const messages = await f.run('get_booking_messages', { booking_id: otherBusiness ? 'foreign-booking' : ids.booking });
    const reviews = await f.run('get_reviews'), clients = await f.run('get_customers');
    const body = JSON.stringify({ messages, reviews, clients });
    if (otherBusiness) { assert.match(body, /FOREIGN_MESSAGE/); assert.match(body, /FOREIGN_REVIEW/); assert.match(body, /FOREIGN_CLIENT/); assert.doesNotMatch(body, /Own original|Own reviewer|OTHER_ASSIGNMENT_CLIENT/); }
    else { assert.match(body, /Own original message/); assert.match(body, /Own original review/); assert.match(body, /Own original client/); assert.doesNotMatch(body, /FOREIGN_/); }
  }
});

test('customer association reads preserve complete paginated count without treating repeated names as distinct clients', async () => {
  const f = fixture();
  f.tables.bookings = Array.from({ length: 1001 }, (_, n) => ({ id: `booking-${String(n).padStart(4, '0')}`, salon_id: ids.business, guest_name: 'Same original name', booking_origin: 'business_added', appointment_datetime: '2026-09-19T12:00:00Z' }));
  const result = await f.run('get_customers');
  assert.equal(result.total, 1001); assert.equal(result.customers.length, 1001); assert.equal(result.scope, 'customers_of_these_bookings');
  assert.equal(new Set(result.customers.map(row => row.booking_id)).size, 1001); assert.equal(result.customers[0].name, 'Same original name');
  assert.equal(f.calls.filter(call => call.table === 'bookings').length, 2);
});
