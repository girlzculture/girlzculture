import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const actor = '11000000-0000-4000-8000-000000000001';
const bookingId = '22000000-0000-4000-8000-000000000001';
const messageId = '33000000-0000-4000-8000-000000000001';
const requestId = '44000000-0000-4000-8000-000000000001';
class RateLimitError extends Error { retryAfter = 30; }
function fixture(options = {}) {
  const mutations = [], deliveries = [], incidents = [], reads = [];
  const canonical = { status: 'Active', email_normalized: 'owner@example.test', primary_role: 'salon_owner', ...options.canonical };
  const booking = { appointment_datetime:'2099-01-01T10:00:00Z', duration_hours:1, status:'Confirmed', id: bookingId, salon_id: 'business-a', customer_id: 'customer-a', salon: { user_id: actor, name: 'Save' }, style: { name: 'Original service' }, ...options.booking };
  const prior = { id: messageId, booking_id: bookingId, original_body: '  Bonjour — $180, GC123  ', ...options.prior };
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: actor, email: 'owner@example.test' } } }) },
    from(table) {
      let operation = 'read', payload, offset=0, end=999, selection;
      const filters = [];
      const response = (single = false) => {
        if (operation === 'read') reads.push({ table, selection, filters: [...filters] });
        if (options.ambiguousSalon && table === 'bookings' && !selection?.includes('salon:salons!bookings_salon_id_fkey(')) return { data: null, error: { code: 'PGRST201', message: "Could not embed because more than one relationship was found for 'bookings' and 'salons'", hint: 'salons!bookings_salon_id_fkey or salons!business_client_formulas' } };
        if (options.failTable === table) return { data: null, error: new Error('private connection/provider details') };
        if (operation !== 'read') {
          mutations.push({ table, operation, payload });
          if (operation === 'insert' && options.replay) return { data: null, error: { code: '23505' } };
          return { data: { id: messageId, ...payload }, error: null };
        }
        if (options.tables?.[table]) { const rows=options.tables[table].filter(row=>filters.every(([key,value])=>row[key]===value)).slice(offset,end+1); return {data:single?rows[0]||null:rows,error:null}; }
        const row = table === 'platform_identities' ? canonical : table === 'salons' ? (booking.salon?.user_id===actor?{id:'business-a'}:null) : table === 'bookings' ? (filters.every(([k,v])=>booking[k]===v)?booking:null) : table === 'salon_team_members' ? options.team ? {salon_id:'business-a',...options.team} : null : table === 'admin_users' ? options.admin || null : table === 'booking_conversation_events' ? { event_type: 'booking_created', facts: { business: 'Save' } } : table === 'booking_messages' ? (filters.some(([k])=>k==='client_request_id')&&!options.replay?null:prior) : null;
        if (table === 'salon_team_members' && filters.some(([key, value]) => key === 'status' && value !== row?.status)) return { data: single ? null : [], error: null };
        return { data: single ? row : row ? [row] : [], error: null };
      };
      const query = {
        select(value) { selection=value; return query; }, eq(key, value) { filters.push([key, value]); return query; }, neq() { return query; }, is() { return query; }, in() { return query; }, ilike() { return query; }, limit() { return query; }, order() { return query; }, range(from,to) { offset=from;end=to;return query; },
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
  return { route, mutations, deliveries, incidents, reads, admin };
}
const send = (f, body = {}) => f.route.POST(new Request('http://localhost/api/messages', { method: 'POST', headers: { authorization: 'Bearer fixture-only', 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: bookingId, body: '  Bonjour — $180, GC123  ', client_request_id: requestId, ...body }) }));
const read = f => f.route.GET(new Request(`http://localhost/api/messages?booking_id=${bookingId}`, { headers: { authorization: 'Bearer fixture-only' } }));

test('normal message sends record the explicitly selected source without changing original text', async () => {
  for (const source_locale of ['en','fr','wo','es','zh-CN',null]) {
    const f = fixture(); const response = await send(f,{source_locale}); assert.equal(response.status,200);
    const saved=f.mutations.find(row=>row.table==='booking_messages').payload;
    assert.equal(saved.source_locale,source_locale);assert.equal(saved.source_locale_provenance,source_locale?'sender_selected':'unknown');
    assert.equal(saved.original_body,'  Bonjour — $180, GC123  ');assert.equal(saved.body,saved.original_body);
  }
});
test('invalid provenance and manual guests never create a customer conversation or notification',async()=>{
  const invalid=fixture();assert.equal((await send(invalid,{source_locale:'invented'})).status,400);assert.deepEqual(invalid.mutations,[]);
  const manual=fixture({booking:{booking_origin:'business_added',customer_id:null}});const response=await send(manual,{source_locale:'fr'});
  assert.equal(response.status,409);assert.equal((await response.json()).code,'MESSAGE_CUSTOMER_PARTICIPANT_REQUIRED');assert.deepEqual(manual.mutations,[]);assert.deepEqual(manual.deliveries,[]);
});

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

test('expired and cancelled conversations retain readable history but reject new sends', async () => {
  for (const booking of [
    { status: 'Completed', appointment_datetime: '2020-01-01T10:00:00Z', duration_hours: 1 },
    { status: 'Cancelled', appointment_datetime: '2099-01-01T10:00:00Z', duration_hours: 1 },
  ]) {
    const f = fixture({ booking }); const response = await send(f);
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'MESSAGE_CONVERSATION_CLOSED');
    assert.equal(f.mutations.length, 0); assert.equal(f.deliveries.length, 0);
    assert.equal((await read(f)).status, 200);
  }
});
test('assigned staff cannot read, translate or send into another professional conversation', async () => {
  const f = fixture({ canonical: { primary_role: 'salon_team' }, team: { status: 'Active', stylist_id: 'assigned', permissions: { bookings: true } }, booking: { stylist_id: 'other-professional' } });
  assert.equal((await read(f)).status, 403);
  assert.equal((await send(f)).status, 403);
  assert.equal((await send(f, { action: 'translate_display', message_id: messageId, locale: 'fr' })).status, 403);
  assert.equal(f.mutations.length, 0); assert.equal(f.deliveries.length, 0);
});
test('support role is read-only even through a direct POST', async () => {
  const f = fixture({ canonical: { primary_role: 'admin' }, admin: { status: 'Active', permissions: { support: true } } });
  assert.equal((await send(f)).status, 403); assert.equal(f.mutations.length, 0);
});

test('inbox loads authorized booking and conversation history beyond provider page caps',async()=>{
 const own=Array.from({length:1002},(_,index)=>({id:'own-'+index,salon_id:'business-a',customer_id:'c',appointment_datetime:'2099-01-01',duration_hours:1}));
 const messages=Array.from({length:1002},(_,index)=>({id:'m-'+index,booking_id:bookingId,body:'Original '+index}));
 const f=fixture({tables:{bookings:own.concat({id:'foreign',salon_id:'business-b'})}});
 const response=await f.route.GET(new Request('http://localhost/api/messages',{headers:{authorization:'Bearer fixture-only'}}));
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.threads.length,1002);assert.equal(body.threads.some(t=>t.booking.salon_id!=='business-a'),false);
 const g=fixture({tables:{booking_messages:messages}});const detail=await read(g);assert.equal(detail.status,200);assert.equal((await detail.json()).messages.length,1002);
});

for (const [role, options, expectedFilters] of [
  ['owner', {}, [['salon_id','business-a']]],
  ['assigned staff', { canonical:{primary_role:'salon_team'}, team:{status:'Active',stylist_id:'assigned',permissions:{bookings:true}}, booking:{stylist_id:'assigned'} }, [['salon_id','business-a'],['stylist_id','assigned']]],
  ['customer', { canonical:{primary_role:'customer'}, booking:{customer_id:actor} }, [['customer_id',actor]]],
  ['support', { canonical:{primary_role:'admin'}, admin:{status:'Active',permissions:{support:true}} }, []],
]) test(`ambiguous salon relationship uses the booking FK and retains ${role} list/detail scope`, async () => {
  const f=fixture({...options,ambiguousSalon:true});
  const list=await f.route.GET(new Request('http://localhost/api/messages',{headers:{authorization:'Bearer fixture-only'}}));
  assert.equal(list.status,200);const body=await list.json();assert.equal(body.threads.length,1);
  assert.equal(body.threads[0].booking.salon.name,'Save');
  assert.deepEqual(f.mutations,[],'listing conversations remains read-only');
  const detail=await read(f);assert.equal(detail.status,200);
  const queries=f.reads.filter(row=>row.table==='bookings');assert.equal(queries.length,2);
  for(const query of queries) assert.equal(query.selection,'*,salon:salons!bookings_salon_id_fkey(id,name,slug,cover_photo_url,time_zone),style:styles(name)');
  assert.deepEqual(queries[0].filters,expectedFilters);
  assert.deepEqual(queries[1].filters,[...expectedFilters,['id',bookingId]]);
  assert.deepEqual(f.incidents,[]);
});

test('unexpected message read and send failures pass the existing admin to protected incident persistence',async()=>{
  for(const action of ['read','send']) {
    const f=fixture({failTable:'bookings'});
    const response=await(action==='read'?read(f):send(f));const body=await response.json();
    assert.equal(response.status,503);assert.equal(body.request_id,'GC-LOCAL-INCIDENT-17');
    assert.equal(f.incidents.length,1);assert.equal(f.incidents[0].admin,f.admin);
    assert.equal(f.incidents[0].feature,'booking-messages');
    assert.doesNotMatch(JSON.stringify(body),/private|provider details/);
    assert.deepEqual(f.mutations,[]);assert.deepEqual(f.deliveries,[]);
  }
});
