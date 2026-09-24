import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const business = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const requestId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function fixture(options = {}) {
  const calls = []; const saved = [];
  const tables = { subscriptions: [{ salon_id: business, status: 'active', current_period_end: '2099-01-01T00:00:00Z' }], gc_assistant_requests: [], styles: [], style_materials: [], bookings: [], test_data_registry: [], ...options.tables };
  const admin = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'p0_actor_has_permission') return { data: options.allowedPermissions ? options.allowedPermissions.includes(args.p_permission) : options.allowed !== false };
      if (name === 'business_finance_entry_options') return { data: options.financeEntry || {stylists:[],products:[]} };
      if (name === 'get_public_content_page') return { data: (options.knowledge || []).find(page => page.slug === args.p_slug) || null };
      if (name === 'is_marketplace_visible') return options.visibilityError ? { error: { code: 'unavailable' } } : { data: options.visible ?? true };
      if (name === 'is_salon_profile_public') return options.visibilityError ? { error: { code: 'unavailable' } } : { data: options.profileVisible ?? options.visible ?? true };
      if (name === 'save_gc_assistant_request') { saved.push(args.p_request); return { data: args.p_request }; }
      if (name === 'confirm_gc_assistant_request') return { data: { verified: true, result: {} } };
      throw Error(`Unexpected RPC ${name}`);
    },
    from(table) {
      const filters = []; let cap = Infinity; let single = false; let ordering;
      const q = {
        select() { return q; }, eq(key, value) { filters.push(row => row[key] === value); return q; },
        is(key, value) { filters.push(row => (row[key] ?? null) === value); return q; },
        in(key, values) { filters.push(row => values.includes(row[key])); return q; },
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
  const load = typescriptLoader(process.cwd(), { '@/lib/supabaseAdmin': {}, '@/lib/engineConfigServer': { getEngineNumber: async (_key, fallback) => fallback }, '@/lib/bookingAvailabilityServer': { serviceAvailabilityWindow: async input => ({ style: { id: input.styleId, salon_id: business, duration_min_hours: 1, buffer_minutes: 15 }, timeZone: 'America/New_York', bufferMinutes: 15, dates: [{ date: input.date, slots: [{ value: '13:00', stylistId: actor, stylistName: 'Save' }] }] }) }, '@/lib/contentModerationServer': { moderatePublicContent: async () => ({ allowed: true }) } }, {URLSearchParams, ...(options.now === undefined ? {} : { Date: class extends Date { static now() { return options.now; } } })});
  const server = load('src/lib/gcAssistantServer.ts');
  const context = { admin, user: { id: actor }, salon: { id: business, subscription_status: 'active', time_zone: 'America/New_York', description: 'Original Save' }, isOwner: !options.teamMember, teamMember: options.teamMember };
  return { calls, saved, context, server, run: (tool, args) => server.executeAssistantTool(context, { requestId, locale: 'fr', tool, args }) };
}

test('a whole-business closure preview saves only an unconfirmed own-business request and retains permission and assignment guards', async () => {
  // A future date keeps this durable-boundary regression independent of the
  // hosted September 2026 request used by the planning-wire regression.
  const args = { start: '2098-09-29T04:00:00Z', end: '2098-09-30T04:00:00Z', time_zone: 'America/New_York', stylist_id: null, reason: '' };
  const f = fixture();
  const response = await f.run('prepare_availability_block', args);
  assert.equal(response.preview_required, true);
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].salon_id, business);
  assert.equal(f.saved[0].requested_by, actor);
  assert.equal(f.saved[0].permission, 'availability');
  assert.equal(f.saved[0].risk_class, 3);
  assert.equal(f.saved[0].confirmed_at ?? null, null);
  assert.deepEqual(JSON.parse(JSON.stringify(f.saved[0].arguments)), args);
  assert.deepEqual(JSON.parse(JSON.stringify(f.saved[0].execution_payload)), { time_zone: 'America/New_York', all_professionals: true });
  assert.deepEqual(f.calls.filter(call => call.name).map(call => call.name), ['p0_actor_has_permission', 'save_gc_assistant_request']);
  assert.deepEqual(f.calls.filter(call => call.table).map(call => call.table), ['subscriptions', 'gc_assistant_requests']);
  for (const restriction of [{ allowed: false }, { teamMember: { stylist_id: actor } }]) {
    const scoped = fixture(restriction);
    await assert.rejects(scoped.run('prepare_availability_block', args), /ASSISTANT_ACCESS_DENIED/);
    assert.equal(scoped.saved.length, 0);
    assert.equal(scoped.calls.some(call => call.name === 'confirm_gc_assistant_request'), false);
  }
});

test('a replayed read rechecks current records instead of returning stale authorized data',async()=>{
  const f=fixture({tables:{gc_assistant_requests:[{id:requestId,salon_id:business,requested_by:actor,tool:'get_services_and_prices',arguments:{query:''},locale:'fr',result:{services:[{name:'Removed private service'}]}}],styles:[{id:actor,salon_id:business,name:'Current service',base_price:100}]}});
  const result=await f.run('get_services_and_prices',{query:''});
  assert.equal(result.replayed,true);
  assert.equal(JSON.stringify(result).includes('Removed private service'),false);
  assert.equal(result.request.result.services[0].name,'Current service');
  assert.equal(f.saved.length,0,'read refresh does not rewrite the original audit');
});

test('service search applies the requested name before the bounded database result limit', async () => {
  const styles = [...Array.from({ length: 100 }, (_,i) => ({ id: String(i), salon_id: business, name: `A service ${i}` })), { id: 'wanted', salon_id: business, name: 'Z medium knotless', base_price: 180 }];
  const f = fixture({ tables: { styles } });
  const response = await f.run('get_services_and_prices', { query: 'medium knotless' });
  assert.equal(response.request.result.services.length, 1, 'A real match must not disappear because unrelated names fill the first page');
  assert.equal(response.request.result.services[0].id, 'wanted');
});

test('literal service search cannot expand percent or underscore into wildcard records', async () => {
  const f = fixture({ tables: { styles: [{ id: 'literal', salon_id: business, name: 'A_100% Save' }, { id: 'not-literal', salon_id: business, name: 'AB1000 Save' }] } });
  const response = await f.run('get_services_and_prices', { query: '_100%' });
  assert.equal(response.request.result.services.length, 1); assert.equal(response.request.result.services[0].name, 'A_100% Save');
});

test('service lookup distinguishes a miss from an empty inventory and never includes another business', async () => {
  const styles = [
    { id: 'own-boho', salon_id: business, name: 'Boho / Goddess Braids', base_price: 250, duration_min_hours: 5, duration_max_hours: 7 },
    { id: 'own-box', salon_id: business, name: 'Box Braids', base_price: 190 },
    { id: 'foreign', salon_id: 'other-business', name: 'Private business B mermaid design', base_price: 999 },
  ];
  const f = fixture({ tables: { styles } });
  const miss = await f.run('get_services_and_prices', { query: 'Private business B mermaid design' });
  assert.equal(miss.request.result.inventory_total, 2);
  assert.equal(miss.request.result.matching_total, 0);
  assert.equal(miss.request.result.match_status, 'no_match');
  assert.doesNotMatch(JSON.stringify(miss.request.result.services), /foreign|999|Private business B/);
  await assert.rejects(f.run('get_services_and_prices', { query: '', salon_id: 'other-business' }), /ASSISTANT_INVALID_INPUT/);
  const empty = await fixture().run('get_services_and_prices', { query: 'braids' });
  assert.equal(empty.request.result.match_status, 'empty_inventory');
});

test('service aliases and typos return the actual record without declaring distinct styles identical', async () => {
  const f = fixture({ tables: { styles: [
    { id: 'own-boho', salon_id: business, name: 'Boho / Goddess Braids', base_price: 250, duration_min_hours: 5, duration_max_hours: 7 },
    { id: 'own-knotless', salon_id: business, name: 'Knotless Braids', base_price: 180 },
  ] } });
  const boho = await f.run('get_services_and_prices', { query: 'Bohemian / Mermaid Braids' });
  assert.equal(boho.request.result.services[0].id, 'own-boho');
  assert.equal(boho.request.result.services[0].name, 'Boho / Goddess Braids');
  assert.equal(boho.request.result.services[0].base_price, 250);
  assert.equal(boho.request.result.services[0].duration_max_hours, 7);
  assert.equal(boho.request.result.match_status, 'related');
  assert.equal(boho.request.result.exact_match, false, 'mermaid and goddess are not silently equated');
  const typo = await f.run('get_services_and_prices', { query: 'knotles braids' });
  assert.equal(typo.request.result.services[0].id, 'own-knotless');
});

test('ordinary partial names and adjacent spelling swaps retrieve scoped candidates without merging distinct braid techniques', async () => {
  const f = fixture({ tables: { styles: [
    { id: 'own-boho', salon_id: business, name: 'Boho / Goddess Braids', base_price: 250 },
    { id: 'own-knotless', salon_id: business, name: 'Knotless Braids', base_price: 180 },
    { id: 'own-box', salon_id: business, name: 'Box Braids', base_price: 190 },
    { id: 'foreign', salon_id: 'other-business', name: 'Boho Mermaid Braids', base_price: 999 },
  ] } });
  for (const [query, expected, price] of [['booh braids', 'own-boho', 250], ['knotl braids', 'own-knotless', 180], ['bohemian braids', 'own-boho', 250], ['trenzas boho', 'own-boho', 250], ['tresses boho', 'own-boho', 250]]) {
    const result = (await f.run('get_services_and_prices', { query })).request.result;
    assert.equal(result.services[0]?.id, expected, query);
    assert.equal(result.services[0].base_price, price);
    assert.equal(result.inventory_total, 3);
    assert.equal(result.match_status, 'related');
    assert.doesNotMatch(JSON.stringify(result.services), /foreign|999|Mermaid/);
  }
  const distinct = (await f.run('get_services_and_prices', { query: 'mermaid braids' })).request.result;
  assert.equal(distinct.match_status, 'no_match');
  assert.equal(distinct.inventory_total, 3);
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
  const f = fixture({now:Date.parse('2026-09-19T12:00:00Z'),tables:{salons:[{id:business,user_id:actor,time_zone:'America/New_York'}],styles:[{id:requestId,salon_id:business,name:'Own service',base_price:100,duration_min_hours:1,duration_max_hours:1,buffer_minutes:15,option_groups:[]}]}});
  const response = await f.run('get_availability', { style_id: requestId, stylist_id: null, date: '2026-09-20' });
  const slot = response.request.result.slots[0];
  assert.equal(slot.stylist_id, actor);
  assert.equal(slot.professional_name, 'Save');
  assert.equal(slot.time, '13:00');
});

test('published knowledge is searched as bounded source material and answered conversationally', async () => {
  const f = fixture({ knowledge: [{ slug: 'help', title: 'Help Center', sections: [{ title: 'Payments', body: 'How do deposits work?::Girlz Culture applies the platform deposit shown at checkout.\nHow do I book?::Choose a business and an available time.' }] }] });
  const response = await f.run('search_platform_knowledge', { query: 'deposits' });
  assert.equal(response.request.result.matches.length, 1);
  assert.equal(response.request.result.matches[0].question, 'How do deposits work?');
  assert.match(response.assistant_message, /base de connaissances Girlz Culture/i);
  assert.doesNotMatch(response.assistant_message, /sections|published_payload/);
});

test('policy answers include the current own-business deposit rule without retrieving incident records', async () => {
  const f=fixture({tables:{business_policy_revisions:[],business_deposit_rules:[
    {id:'rule-A',salon_id:business,rate:20,threshold_amount:300,threshold_rate:40,repeat_incident_count:2,repeat_incident_rate:50,incident_window_days:180},
    {id:'rule-B',salon_id:'other-business',rate:99,threshold_amount:null,threshold_rate:null,repeat_incident_count:null,repeat_incident_rate:null,incident_window_days:365},
  ]}});
  const response=await f.run('get_business_policies',{});
  assert.equal(response.request.result.deposit_rules.rate,20);
  assert.equal(response.request.result.deposit_rules.threshold_rate,40);
  assert.equal(response.request.result.deposit_rules.repeat_incident_rate,50);
  assert.equal(response.request.result.deposit_rules.incident_scope,'this_business_only');
  assert.equal(response.request.result.deposit_rules.basis,'eligible_service_subtotal_before_discounts');
  assert.doesNotMatch(JSON.stringify(response.request.result),/rule-B|other-business/);
  assert.equal(f.calls.some(call=>call.table==='business_booking_incidents'||call.name==='own_business_incident_count'),false);
});

test('photo counts use only the authenticated business and distinguish unique saved images from public visibility', async () => {
  const f = fixture({ visible: false, tables: { salons: [
    { id: business, gallery_photos: ['a', 'b', 'a', ''], cover_photo_url: 'a', logo_url: 'logo' },
    { id: 'other-business', gallery_photos: ['private-other', 'private-two', 'private-three'], cover_photo_url: 'private-cover' },
  ] } });
  const response = await f.run('get_business_media', {});
  const media = response.request.result;
  assert.equal(media.gallery_count, 2);
  assert.equal(media.distinct_saved_images, 3);
  assert.equal(media.cover_count, 1);
  assert.equal(media.logo_count, 1);
  assert.equal(media.duplicate_gallery_references, 1);
  assert.equal(media.publicly_visible, false);
  assert.equal(media.published_gallery_count, 0);
  assert.doesNotMatch(JSON.stringify(response), /private-other|private-cover/);
  assert.equal(f.calls.find(call => call.name === 'is_salon_profile_public').args.target_salon_id, business);
  assert.equal(f.saved[0].permission, 'photos');
  await assert.rejects(f.run('get_business_media', { salon_id: 'other-business' }), /ASSISTANT_INVALID_INPUT/);
});

test('photo reads fail closed without permission and retain unknown publication rather than inventing zero', async () => {
  const revoked = fixture({ allowed: false });
  await assert.rejects(revoked.run('get_business_media', {}), /ASSISTANT_ACCESS_DENIED/);
  assert.equal(revoked.calls.some(call => call.table === 'salons'), false);
  const f = fixture({ visibilityError: true, tables: { salons: [{ id: business, gallery_photos: ['a'] }] } });
  const result = (await f.run('get_business_media', {})).request.result;
  assert.equal(result.gallery_count, 1);
  assert.equal(result.publicly_visible, null);
  assert.equal(result.published_gallery_count, null);
});

test('saved-photo visibility follows the public profile even when booking discovery is paused and still excludes registered tests', async () => {
  const f = fixture({ visible: false, profileVisible: true, tables: { salons: [{ id: business, gallery_photos: ['own-photo'] }], test_data_registry: [{ id: 'other-test', record_type: 'salon', record_id: 'other-business' }] } });
  const result = (await f.run('get_business_media', {})).request.result;
  assert.equal(result.gallery_count, 1);
  assert.equal(result.publicly_visible, true, 'closing bookings must not claim the readable public profile is unpublished');
  assert.equal(result.published_gallery_count, 1);
  const registered = fixture({ profileVisible: true, tables: { salons: [{ id: business, gallery_photos: ['own-photo'] }], test_data_registry: [{ id: 'own-test', record_type: 'salon', record_id: business }] } });
  const hidden = (await registered.run('get_business_media', {})).request.result;
  assert.equal(hidden.gallery_count, 1);
  assert.equal(hidden.publicly_visible, false);
});

test('owner platform guidance never retrieves a different public business page', async () => {
  const f = fixture({ knowledge: [{ slug: 'salon/another-business', title: 'Other business', hero_subtitle: 'PRIVATE-B price 999 USD' }] });
  const response = await f.run('search_platform_knowledge', { query: 'another-business 999 price' });
  assert.equal(response.request.result.matches.length, 0);
  assert.doesNotMatch(JSON.stringify(response.request.result), /PRIVATE-B/);
  const reads = f.calls.filter(call => call.name === 'get_public_content_page');
  assert.deepEqual(reads.map(call => call.args.p_slug).sort(), ['faq', 'help', 'how-it-works', 'pricing', 'privacy', 'terms']);
  assert.equal(f.calls.some(call => call.name === 'get_public_content_pages'), false);
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
    bookings: [{ id: requestId, salon_id: business, status: 'Confirmed', duration_hours: 1, appointment_datetime: '2099-09-20T13:00:00Z', guest_name: 'Different customer', public_reference: 'GC123' }],
  } });
  await assert.rejects(f.server.confirmAssistantTool(f.context, requestId, 'a'.repeat(64), false), /ASSISTANT_PREVIEW_STALE/);
  assert.equal(f.calls.some(row => row.name === 'confirm_gc_assistant_request'), false);
});


test('a saved proposal cannot replay private booking data after stylist reassignment',async()=>{
 const args={booking_id:actor,body:'Original private message'};
 const f=fixture({teamMember:{stylist_id:requestId},tables:{bookings:[{id:actor,salon_id:business,stylist_id:actor}],gc_assistant_requests:[{id:requestId,salon_id:business,requested_by:actor,tool:'prepare_customer_message',arguments:args,locale:'fr',before_summary:{guest_name:'REASSIGNED_PRIVATE_NAME'},execution_payload:{body:'REASSIGNED_PRIVATE_BODY'}}]}});
 await assert.rejects(f.run('prepare_customer_message',args),e=>e.code==='ASSISTANT_ACCESS_DENIED' && e.status===403);
});

test('assistant refuses to prepare new sends for a closed conversation while retained read tools remain scoped',async()=>{
 const f=fixture({tables:{bookings:[{id:requestId,salon_id:business,status:'Cancelled',appointment_datetime:'2099-01-01T13:00:00Z',duration_hours:1,customer_id:actor}]}});
 await assert.rejects(f.run('prepare_customer_message',{booking_id:requestId,body:'Private follow-up'}),e=>e.code==='ASSISTANT_CONVERSATION_CLOSED');
 assert.equal(f.saved.length,0);
});

const financeService = '17700000-0000-4000-8000-000000000003';
const financeProfessional = '17700000-0000-4000-8000-000000000004';
const manualSaleArgs = {service_id:financeService,stylist_id:financeProfessional,amount_cents:12000,method:'cash',source:'walk_in',date:'2026-09-18',time:'12:30',client_name:null,payment_received:true};
test('manual finance execution stores the actual granted permission and only prepares a reviewed draft',async()=>{
  for(const permission of ['finance_log','finance_manage']) {
    const f=fixture({allowedPermissions:[permission],financeEntry:{stylists:[{id:financeProfessional,salon_id:business,name:'Aisha'}]},tables:{styles:[{id:financeService,salon_id:business,name:'Silk Press',is_draft:false,archived_at:null}]}});
    const result=await f.run('prepare_manual_service_sale',manualSaleArgs);
    assert.equal(result.preview_required,true);assert.equal(f.saved[0].permission,permission);assert.equal(f.saved[0].risk_class,4);
    assert.equal(f.saved[0].execution_payload.finance_payload.list_cents,12000);assert.equal(f.saved[0].execution_payload.finance_payload.cost_cents,null);
    assert.equal(f.calls.some(call=>call.name==='record_business_finance'||call.name==='confirm_gc_assistant_request'),false);
  }
});
test('calendar access alone cannot prepare a receipt or read finance selection vocabulary',async()=>{
  const f=fixture({allowedPermissions:['bookings']});
  for(const [tool,args] of [['prepare_manual_service_sale',manualSaleArgs],['get_manual_sale_options',{}]])await assert.rejects(f.run(tool,args),/ASSISTANT_ACCESS_DENIED/);
  assert.equal(f.saved.length,0);assert.equal(f.calls.some(call=>call.name==='business_finance_entry_options'),false);
});

test('Master loose professional names preserve real IDs, ambiguity and tenant boundaries',async()=>{
 const rows=[{id:'own-jasmine',salon_id:business,name:'Jasmine Walker',bio:'Original private bio'},{id:'own-jazmine',salon_id:business,name:'Jasmin White'},{id:'own-dominique',salon_id:business,name:'Dominique Andréa'},{id:'foreign',salon_id:actor,name:'Jasmin Private',bio:'FOREIGN PRIVATE'}];
 const f=fixture({tables:{stylists:rows}});
 const result=(await f.run('get_professionals',{query:'Jasmin'})).request.result;
 assert.deepEqual(Array.from(result.professionals,x=>x.id).sort(),['own-jasmine','own-jazmine']);
 assert.equal(result.inventory_total,3);assert.equal(result.matching_total,2);assert.equal(result.search_complete,true);
 assert.equal(JSON.stringify(result).includes('FOREIGN PRIVATE'),false);
 const misspelled=(await f.run('get_professionals',{query:'Dominqiue Andrea'})).request.result;
 assert.equal(misspelled.professionals.length,1);assert.equal(misspelled.professionals[0].name,'Dominique Andréa');
 assert.equal(misspelled.professionals[0].id,'own-dominique');
 const foreign=(await f.run('get_professionals',{query:'Jasmin Private'})).request.result;
 assert.equal(foreign.professionals.length,0,'a foreign identity is never approximated to an own professional from only its first name');
});

test('Master exact professional lookup survives the fuzzy inventory cap and escapes wildcard input',async()=>{
 const rows=Array.from({length:1000},(_,i)=>({id:'own-'+i,salon_id:business,name:'A professional '+String(i).padStart(4,'0')}));
 rows.push({id:'wanted',salon_id:business,name:'Z Name_100%'});
 const f=fixture({tables:{stylists:rows}});
 const found=(await f.run('get_professionals',{query:'Name_100%'})).request.result;
 assert.deepEqual(Array.from(found.professionals,x=>x.id),['wanted']);assert.equal(found.inventory_total,1001);assert.equal(found.search_complete,false);
 const missing=(await f.run('get_professionals',{query:'not present'})).request.result;
 assert.equal(missing.match_status,'incomplete_search');
});

test('Master exact Boho and Dominican examples keep saved names prices and duration bounds',async()=>{
 const f=fixture({tables:{styles:[{id:'boho',salon_id:business,name:'Boho / Knotless Braids',base_price:180,duration_min_hours:4,duration_max_hours:6},{id:'dominican',salon_id:business,name:'Dominican Blowout',base_price:75,duration_min_hours:1,duration_max_hours:1.5}]}});
 for(const [query,id,name,price,min,max]of [['Boho braid','boho','Boho / Knotless Braids',180,4,6],['dominican','dominican','Dominican Blowout',75,1,1.5],['domincan','dominican','Dominican Blowout',75,1,1.5]]){
  const result=(await f.run('get_services_and_prices',{query})).request.result;
  assert.equal(result.services.length,1);const row=result.services[0];
  assert.deepEqual([row.id,row.name,row.base_price,row.duration_min_hours,row.duration_max_hours],[id,name,price,min,max]);
 }
});
