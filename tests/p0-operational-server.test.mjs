import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const business = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const service = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', professional = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const manual = { guest_name: 'Sheila', guest_phone: '', guest_email: '', style_id: service, service_name: '', duration_minutes: null, stylist_id: null, date: '2030-09-24', time: '13:00', source: 'phone', notes: 'Private original note' };

test('plan answers use the canonical entitlement catalog and do not infer an unknown plan', async () => {
  const known = fixture(); const result = (await known.run('get_plan_status', {})).request.result;
  assert.equal(result.current_plan.name, 'Premium');
  assert.equal(result.current_plan.entitlements.productListings.limit, null);
  assert.equal(result.available_plans.length, 5);
  assert.equal(result.current_plan.monthly_amount_cents, null, 'missing agreement must not invent a catalog charge');
  assert.deepEqual(Array.from(result.available_plans, plan => plan.monthly_amount_cents), [6900,9900,9900,14900,19900]);
  assert.equal(result.revenue_uplift_projection, null);
  const unknown = fixture({ tables: { subscriptions: [{ salon_id: business, status: 'active', tier: 'Unknown' }] } });
  assert.equal((await unknown.run('get_plan_status', {})).request.result.current_plan, null);
});

test('plan usage counts only the authorized business and uses existing active-record definitions', async () => {
  const f = fixture({ tables: {
    subscriptions: [{ salon_id: business, tier: 'Premium', scheduled_tier: 'Starter', status: 'active' }],
    salon_products: [{ salon_id: business, product_status: 'Draft' }, { salon_id: business, product_status: 'Archived' }, { salon_id: business, product_status: 'Active', archived_at: '2030-01-01' }, { salon_id: actor, product_status: 'Active' }],
    salon_promotions: [{ salon_id: business, status: 'Active', is_active: true }, { salon_id: business, status: 'Draft', is_active: true }, { salon_id: business, status: 'Active', is_active: false }, { salon_id: actor, status: 'Active', is_active: true }],
  } });
  const result = (await f.run('get_plan_status', {})).request.result;
  assert.equal(result.current_plan.name, 'Premium');
  assert.equal(result.effective_record_limit_plan, 'Starter');
  assert.equal(result.effective_record_limits.product_listings.limit, 10);
  assert.equal(result.business_usage.product_listings, 1);
  assert.equal(result.business_usage.active_promotions, 1);
  assert.ok(Number.isFinite(Date.parse(result.business_usage.as_of)));
});

test('overview permission does not disclose product or promotion usage without section permission', async () => {
  const f = fixture({ denied: ['products', 'promotions'] });
  const result = (await f.run('get_plan_status', {})).request.result;
  assert.equal(result.business_usage.product_listings, null);
  assert.equal(result.business_usage.active_promotions, null);
  assert.equal(f.calls.some(call => ['salon_products', 'salon_promotions'].includes(call.table)), false);
});

test('business comparison uses exact half-open ranges and excludes another tenant', async () => {
  const range = { start: '2030-09-24T00:00:00.000Z', end: '2030-09-25T00:00:00.000Z' };
  const f = fixture({ tables: { bookings: [
    { salon_id: business, appointment_datetime: '2030-09-23T00:00:00.000Z', status: 'Completed', estimated_total: 50 },
    { salon_id: business, appointment_datetime: range.start, status: 'Completed', estimated_total: 100 },
    { salon_id: business, appointment_datetime: range.end, status: 'Completed', estimated_total: 900 },
    { salon_id: actor, appointment_datetime: range.start, status: 'Completed', estimated_total: 9000 },
  ] } });
  const result = (await f.run('get_business_summary', range)).request.result;
  assert.equal(result.comparison.previous.start, '2030-09-23T00:00:00.000Z');
  assert.equal(result.comparison.previous.completed_booking_value, 50);
  assert.equal(result.comparison.current.completed_booking_value, 100);
  assert.equal(result.comparison.changes.completed_booking_value.percent, 100);
  assert.equal(result.cash_revenue, null);
});

test('service and staff workload names are tenant scoped and require their section permissions', async () => {
  const range = { start: '2030-09-24T00:00:00.000Z', end: '2030-09-25T00:00:00.000Z' };
  const tables = {
    bookings: [{ salon_id: business, style_id: service, stylist_id: professional, appointment_datetime: range.start, status: 'Completed', estimated_total: 100 }],
    styles: [{ id: service, salon_id: actor, name: 'Foreign service' }],
    stylists: [{ id: professional, salon_id: business, name: 'Authorized professional' }],
  };
  const f = fixture({ tables });
  const result = (await f.run('get_business_summary', range)).request.result;
  assert.equal(result.service_performance.rows[0].name, null);
  assert.equal(result.professional_performance.rows[0].name, 'Authorized professional');
  assert.equal(result.professional_performance.rows[0].completed_booking_value, 100);
  assert.equal(JSON.stringify(result).includes('Foreign service'), false);
  const denied = fixture({ tables, denied: ['styles', 'stylists'] });
  const hidden = (await denied.run('get_business_summary', range)).request.result;
  assert.equal(hidden.service_performance, null); assert.equal(hidden.professional_performance, null);
  assert.equal(denied.calls.some(call => ['styles', 'stylists'].includes(call.table)), false);
});

test('period comparisons paginate beyond the default provider row cap', async () => {
  const range = { start: '2030-09-24T00:00:00.000Z', end: '2030-09-25T00:00:00.000Z' };
  const f = fixture({ tables: { bookings: Array.from({ length: 1001 }, (_, id) => ({ id, salon_id: business, appointment_datetime: range.start, status: 'Completed', estimated_total: 1 })) } });
  const result = (await f.run('get_business_summary', range)).request.result;
  assert.equal(result.comparison.current.total_appointments, 1001);
  assert.equal(result.comparison.current.completed_booking_value, 1001);
  assert.equal(result.comparison.previous.total_appointments, 0);
});

test('overview permission alone does not expose calendar gaps', async () => {
  const f = fixture({ denied: ['availability'] });
  const result = (await f.run('get_business_summary', { start: '2030-09-24T00:00:00.000Z', end: '2030-09-25T00:00:00.000Z' })).request.result;
  assert.equal(result.calendar_gaps, null);
  assert.equal(f.calls.some(call => call.calendar), false);
});

test('operating earnings use verified receipts and exclude foreign or invented manual money', async () => {
  const range = { start: '2030-09-24T00:00:00.000Z', end: '2030-09-25T00:00:00.000Z' };
  const paid = { salon_id: business, appointment_datetime: range.start, status: 'Completed', estimated_total: 100, payment_mode: 'live', payment_verified_at: range.start, stripe_charge_id: 'ch_fixture', deposit_status: 'Paid', deposit_amount: 20 };
  const f = fixture({ tables: { bookings: [paid, { ...paid, salon_id: actor, deposit_amount: 999 }, { ...paid, booking_origin: 'business_added', deposit_amount: 888 }] } });
  const result = (await f.run('get_earnings_summary', range)).request.result;
  assert.equal(result.scope, 'authenticated_business_only');
  assert.equal(result.by_stage.deposit, 2000);
  assert.equal(result.cash_received_cents, 2000);
  assert.equal(result.evidence.provider_bank_settlement_verified, false);
  assert.equal(result.evidence.unverified_deposit_records, 1);
  assert.equal(result.completed_sales_cents, 20000);
  const overview = (await f.run('get_business_summary', range)).request.result;
  assert.equal(Object.hasOwn(overview, 'finance'), false);
  const denied = fixture({ denied: ['earnings'] });
  await assert.rejects(denied.run('get_earnings_summary', range), error => error.code === 'ASSISTANT_ACCESS_DENIED');
  assert.equal(denied.calls.some(call => call.table === 'bookings'), false);
});
function fixture(overrides = {}) {
  const calls = [];
  const teamMember = overrides.teamMember ? { id: professional, ...overrides.teamMember } : undefined;
  const tables = { salons: [{ id: business, user_id: teamMember ? service : actor, time_zone: 'America/New_York' }], salon_team_members: teamMember ? [{ ...teamMember, salon_id: business, user_id: actor, status: 'Active' }] : [], subscriptions: [{ salon_id: business, status: 'active',tier: 'Premium' }], gc_assistant_requests: [], styles: [{ id: service, salon_id: business, name: 'Medium knotless', duration_min_hours: 1, duration_max_hours: 1, buffer_minutes: 15, is_draft: false, archived_at: null }], stylists: [], bookings: [], salon_products: [], product_orders: [], salon_promotions: [], ...overrides.tables };
  const admin = { async rpc(name,args) { calls.push({ name, args }); if (name === 'p0_actor_has_permission') return { data: overrides.allowed !== false && !(overrides.denied || []).includes(args.p_permission) }; if (name === 'business_finance_scope') return overrides.ownFinance ? {data:{kind:'own',stylist_id:professional}} : {error:{message:'FINANCE_ACCESS_DENIED'}};
    if(name==='read_business_stock'){assert.equal(args.p_salon,business);assert.equal(args.p_user,actor);return {data:{products:tables.salon_products.filter(row=>row.salon_id===business),supplies:(tables.business_supplies||[]).filter(row=>row.salon_id===business)}};}
    if (name === 'read_business_finance') {
      assert.equal(args.p_salon,business); assert.equal(args.p_user,actor);
      const bookings=tables.bookings.filter(row=>row.salon_id===args.p_salon && (!overrides.ownFinance || row.stylist_id===professional)).map((row,index)=>({...row,id:row.id??`booking-${index}`,created_at:row.created_at||row.appointment_datetime,name:row.name||'Service',verified_charge:Boolean(row.stripe_charge_id),verified_refund:Boolean(row.stripe_refund_id),operating_compensation:{kind:'none',version:null}}));
      return {data:{scope:{kind:overrides.ownFinance?'own':'business',stylist_id:overrides.ownFinance?professional:null},bookings,sales:[],receipts:[],expenses:[],arrangements:[],obligations:[],compensation_payments:[],stylists:tables.stylists.filter(row=>row.salon_id===business && (!overrides.ownFinance || row.id===professional))}};
    }
    if (name === 'save_gc_assistant_request') return { data: args.p_request }; throw Error(name); }, from(table) {
    const filters = []; let one = false, first = 0, last = Infinity;
    const q = { select() { return q; }, in(k,v) { filters.push(row => v.includes(row[k])); return q; }, neq(k,v) { filters.push(row => row[k] != null && row[k] !== v); return q; }, ilike(k,v) { filters.push(row => String(row[k]).toLowerCase().includes(v.replaceAll("%", "").toLowerCase())); return q; }, eq(k,v) { filters.push(row => row[k] === v); return q; }, is(k,v) { filters.push(row => (row[k] ?? null) === v); return q; }, gte(k,v) { filters.push(row => row[k] >= v); return q; }, lt(k,v) { filters.push(row => row[k] < v); return q; }, order() { return q; }, limit(n) { last = n-1; return q; }, range(a,b) { first=a;last=b;return q; }, maybeSingle() { one=true;return q; }, then(resolve,reject) { return Promise.resolve().then(() => { calls.push({ table }); if (!tables[table]) throw Error(`Unspecified table ${table}`); const rows=tables[table].filter(row=>filters.every(f=>f(row)));return { data: one?rows[0]||null:rows.slice(first,last+1),count:rows.length }; }).then(resolve,reject); } }; return q;
  } };
  const load = typescriptLoader(process.cwd(), { '@/lib/supabaseAdmin': {}, '@/lib/contentModerationServer': { moderatePublicContent: async()=>({allowed:true}) },
    // These period/read fixtures have no seven-day hours or occupancy source.
    // Dedicated schedule tests exercise its real authorization/projection.
    '@/lib/businessScheduleOpportunitiesServer': { readBusinessScheduleOpportunities: async context => { assert.equal(context.salon.id,business);throw Error('SCHEDULE_HOURS_UNAVAILABLE'); } },
    '@/lib/bookingAvailabilityServer': { calendarAvailability: async input => { calls.push({ calendar:input }); return { time_zone:'America/New_York', gaps: overrides.gaps ?? (overrides.conflict ? [] : [{ start:'2030-09-24T13:00:00Z',end:'2030-09-24T23:00:00Z',stylist_id: overrides.professional || null }]) }; } } }, { ...(overrides.now === undefined ? {} : { Date: class extends Date { static now(){ return overrides.now; } } }) });
  const server = load('src/lib/gcAssistantServer.ts');
  const context = { admin, salon: { id: business, subscription_status:'active',time_zone:'America/New_York',profile_views:29 }, user:{id:actor},isOwner:!teamMember, teamMember };
  return { calls, load, run:(tool,args)=>server.executeAssistantTool(context,{tool,args,locale:'en',requestId:professional}) };
}
test('manual preparation derives duration and buffer from authoritative service and does not write a booking',async()=>{
  const f=fixture(); const result=await f.run('prepare_manual_appointment',manual);
  assert.equal(result.request.execution_payload.duration_minutes,60); assert.equal(result.request.execution_payload.buffer_minutes,15);
  assert.equal(result.request.execution_payload.appointment_datetime,'2030-09-24T17:00:00.000Z');
  assert.equal(result.request.execution_payload.payment_status,'Not collected by Girlz Culture');
  assert.equal(f.calls.filter(row=>row.name==='save_gc_assistant_request').length,1);
  assert.ok(f.calls.some(row=>row.calendar?.salonId===business));
});
test('missing service and variable duration require one precise clarification',async()=>{
  await assert.rejects(fixture().run('prepare_manual_appointment',{...manual,style_id:null}),/ASSISTANT_SERVICE_CLARIFICATION_REQUIRED/);
  await assert.rejects(fixture({tables:{styles:[{id:service,salon_id:business,name:'Braids',duration_min_hours:1,duration_max_hours:3,buffer_minutes:15}]}}).run('prepare_manual_appointment',manual),/ASSISTANT_DURATION_CLARIFICATION_REQUIRED/);
});
test('multiple professionals are not silently assigned and foreign professional identities are rejected',async()=>{
  const f=fixture({tables:{stylists:[{id:professional,salon_id:business,is_active:true},{id:service,salon_id:business,is_active:true}]}});
  await assert.rejects(f.run('prepare_manual_appointment',manual),/ASSISTANT_PROFESSIONAL_CLARIFICATION_REQUIRED/);
  await assert.rejects(f.run('prepare_manual_appointment',{...manual,stylist_id:actor}),/ASSISTANT_RECORD_NOT_FOUND/);
});
test('occupied time, foreign services, revoked access and invented durations never create proposals',async()=>{
  for (const [options,args,error] of [[{conflict:true},manual,/ASSISTANT_AVAILABILITY_CONFLICT/],[{}, {...manual,style_id:actor},/ASSISTANT_RECORD_NOT_FOUND/],[{allowed:false},manual,/ASSISTANT_ACCESS_DENIED/],[{}, {...manual,duration_minutes:120},/ASSISTANT_INVALID_DURATION/]]) {
    const f=fixture(options); await assert.rejects(f.run('prepare_manual_appointment',args),error);assert.equal(f.calls.filter(row=>row.name==='save_gc_assistant_request').length,0);
  }
});
test('explicit noncatalog service and duration create no master style or fake customer',async()=>{
  const result=await fixture().run('prepare_manual_appointment',{...manual,style_id:null,service_name:'Phone consultation',duration_minutes:30});
  assert.equal(result.request.execution_payload.service_facts,null);assert.equal(result.request.arguments.style_id,null);
  assert.equal(result.request.execution_payload.duration_minutes,30);
});
test('natural-language service matching stays inside the business catalog',async()=>{
  const f=fixture({tables:{styles:[{id:service,salon_id:business,name:'Boho / Goddess Braids',duration_min_hours:5,duration_max_hours:7,buffer_minutes:15,is_draft:false,archived_at:null}]}});
  const result=await f.run('prepare_manual_appointment',{...manual,style_id:null,service_name:'boho brads',service_preference:'named',duration_minutes:300});
  assert.equal(result.request.execution_payload.service_name,'Boho / Goddess Braids');
  assert.equal(result.request.execution_payload.service_facts.name,'Boho / Goddess Braids');
  assert.equal(result.request.execution_payload.duration_minutes,300);
});
test('explicit any-service and any-stylist requests choose safe own-business defaults',async()=>{
  const f=fixture({professional:professional,tables:{styles:[{id:service,salon_id:business,name:'Silk Press',duration_min_hours:1,duration_max_hours:2,buffer_minutes:15,is_draft:false,archived_at:null}],stylists:[{id:professional,salon_id:business,name:'Aisha',is_active:true,archived_at:null},{id:actor,salon_id:business,name:'Bri',is_active:true,archived_at:null}]}});
  const result=await f.run('prepare_manual_appointment',{...manual,style_id:null,service_name:'any service',service_preference:'any',duration_minutes:null,stylist_id:null,stylist_preference:'any'});
  assert.equal(result.request.execution_payload.service_name,'Silk Press');
  assert.equal(result.request.execution_payload.duration_minutes,120);
  assert.equal(result.request.execution_payload.stylist_id,professional);
  assert.equal(result.request.execution_payload.professional_name,'Aisha');
});
test('existing marketplace bookings cannot be changed with manual-only actions',async()=>{
  const f=fixture({tables:{bookings:[{id:service,salon_id:business,booking_origin:'marketplace',status:'Confirmed'}]}});
  await assert.rejects(f.run('prepare_manual_cancellation',{booking_id:service,reason:'Phone call'}),/ASSISTANT_MANUAL_APPOINTMENT_REQUIRED/);
});
test('shared dashboard metrics separate workload from marketplace credit without inventing revenue',()=>{
  const {ownerBusinessMetrics}=fixture().load('src/lib/ownerBusinessMetrics.ts');
  const result=ownerBusinessMetrics([{booking_origin:'marketplace',estimated_total:100,status:'Completed',guest_email:'a@example.test'},{booking_origin:'business_added',source:'phone',estimated_total:999,status:'Completed',guest_email:'b@example.test'},{booking_origin:'business_added',source:'whatsapp',estimated_total:999,status:'Cancelled',cancelled_by:'salon'}]);
  assert.equal(result.total_appointments,3);assert.equal(result.marketplace_bookings,1);assert.equal(result.business_added_appointments,2);assert.equal(result.completed_booking_value,100);assert.equal(result.customers,1);assert.equal(result.cancellation_rate,0);
});

test('stylist-linked team members cannot prepare another professional appointment or private note',async()=>{
  const f=fixture({teamMember:{stylist_id:professional},tables:{bookings:[{id:service,salon_id:business,booking_origin:'business_added',status:'Confirmed',stylist_id:actor}]}});
  await assert.rejects(f.run('prepare_booking_note',{booking_id:service,note:'Private'}),/ASSISTANT_ACCESS_DENIED/);
  await assert.rejects(f.run('prepare_manual_cancellation',{booking_id:service,reason:'Phone'}),/ASSISTANT_ACCESS_DENIED/);
  await assert.rejects(f.run('prepare_manual_appointment',manual),/ASSISTANT_ACCESS_DENIED/);
});

test('broader reads use business filters and safe authoritative fields',async()=>{
  const range={start:'2030-09-24T00:00:00Z',end:'2030-09-25T00:00:00Z'};
  const rows=[{id:service,salon_id:business,name:'Owned',title:'Owned',created_at:range.start,appointment_datetime:'2030-09-24T17:00:00Z',status:'Completed',booking_origin:'marketplace',estimated_total:100,guest_name:'Sheila',guest_email:'private@example.test'},{id:actor,salon_id:actor,name:'Foreign',title:'Foreign',created_at:range.start,appointment_datetime:'2030-09-24T17:00:00Z',status:'Completed',estimated_total:900}];
  const f=fixture({tables:{stylists:rows,salon_products:rows,salon_promotions:rows,reviews:rows,bookings:rows,booking_messages:[{id:professional,salon_id:business,booking_id:service,body:'Original'}]}});
  for(const [tool,args,key] of [['get_professionals',{query:''},'professionals'],['get_products',{query:''},'products'],['get_promotions',{},'promotions'],['get_reviews',range,'reviews'],['get_customers',range,'customers'],['get_booking_messages',{booking_id:service},'messages']]) {
    const result=(await f.run(tool,args)).request.result;assert.equal(result[key].length,1,tool);assert.equal(JSON.stringify(result).includes('Foreign'),false,tool);
  }
  const earnings=(await f.run('get_earnings_summary',range)).request.result;
  assert.equal(earnings.completed_sales_cents,10000);assert.equal(earnings.cash_received_cents,0);assert.equal(earnings.evidence.provider_bank_settlement_verified,false);
  const summary=(await f.run('get_business_summary',range)).request.result;
  assert.equal(summary.total_appointments,1);assert.equal(summary.profile_views,29);assert.ok(summary.calendar_gaps);
  assert.equal(JSON.stringify(summary).includes('Sheila'),false);assert.equal(JSON.stringify(summary).includes('private@example.test'),false);
  assert.ok((await f.run('get_profile_completion',{})).request.result.profile_completion>=0);
  assert.equal((await f.run('get_plan_status',{})).request.result.billing_changes_require_subscription_workflow,true);
  assert.ok((await f.run('get_upcoming_appointments',range)).request.result.bookings.length===1);
  assert.ok((await f.run('get_availability',{date:manual.date,style_id:null,stylist_id:null})).request.result.gaps.length);
});

test('catalog and hours preparations share dashboard validation and never publish records',async()=>{
  const f=fixture({tables:{styles:[{id:service,salon_id:business,is_draft:true}],stylists:[],salon_products:[],salon_promotions:[]}});
  for(const [tool,args,table] of [
    ['prepare_service_edit',{style_id:service,name:'Braids',price:180,duration_hours:2,buffer_minutes:15},'styles'],
    ['prepare_professional_draft',{id:null,name:'Danielle',bio:'Original bio',specialties:['Braids'],years_experience:5},'stylists'],
    ['prepare_product_draft',{id:null,name:'Conditioner',description:'Original description',price:25},'salon_products'],
    ['prepare_promotion_draft',{id:null,title:'Autumn',description:'Original offer',promotion_type:'percentage',discount_value:10,start:'2030-09-24T00:00:00Z',end:'2030-09-25T00:00:00Z',time_zone:'America/New_York'},'salon_promotions'],
  ]) {
    const result=(await f.run(tool,args)).request;assert.equal(result.execution_payload.table,table);
    assert.equal(result.risk_class,3);assert.equal(result.result,null);assert.equal(result.execution_payload.values.is_active===true,false);
  }
  const hours=Object.fromEntries(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day=>[day,{open:'09:00',close:'18:00',closed:false}]));
  assert.equal((await f.run('prepare_business_hours',{hours})).request.execution_payload.hours.Mon.close,'18:00');
  await assert.rejects(fixture().run('prepare_service_edit',{style_id:service,name:'Braids',price:180,duration_hours:2,buffer_minutes:15}),/ASSISTANT_DRAFT_REQUIRED/);
});


test('assigned stylist reads exclude other appointments, clients, messages and availability before model access',async()=>{
 const range={start:'2030-09-24T00:00:00.000Z',end:'2030-09-25T00:00:00.000Z'};
 const own={id:service,salon_id:business,stylist_id:professional,guest_name:'Assigned client',customer_id:service,appointment_datetime:range.start,status:'Confirmed',estimated_total:100};
 const other={...own,id:actor,stylist_id:actor,guest_name:'OTHER_PRIVATE_CLIENT',estimated_total:999};
 const tables={bookings:[own,other,{...other,salon_id:actor,id:business}],booking_messages:[{id:actor,salon_id:business,booking_id:actor,body:'OTHER_PRIVATE_MESSAGE'}]};
 const f=fixture({teamMember:{stylist_id:professional},tables});
 for(const tool of ['get_bookings','get_customers','get_upcoming_appointments','get_business_summary']){const result=(await f.run(tool,range)).request.result;assert.doesNotMatch(JSON.stringify(result),/OTHER_PRIVATE_CLIENT|999/);if(tool==='get_bookings')assert.equal(result.total,1);if(tool==='get_business_summary')assert.equal(result.bookings,1);}
 await assert.rejects(f.run('get_booking_messages',{booking_id:actor}),e=>e.code==='ASSISTANT_RECORD_NOT_FOUND');
 assert.equal(f.calls.some(c=>c.table==='booking_messages'),false);
 await f.run('get_calendar_gaps',{date:'2030-09-24',stylist_id:null});assert.equal(f.calls.filter(c=>c.calendar).at(-1).calendar.stylistId,professional);
 await assert.rejects(f.run('get_calendar_gaps',{date:'2030-09-24',stylist_id:actor}),e=>e.code==='ASSISTANT_ACCESS_DENIED');
});

test('assistant separates an existing provider agreement from new-sale prices without exposing Stripe IDs', async () => {
  const snapshot={price_id:'price_retired',amount_cents:5900,currency:'usd',interval:'month',interval_count:1,quantity:1,observed_at:'2026-09-18T21:35:00Z'};
  const f=fixture({tables:{subscriptions:[
    {salon_id:actor,tier:'Premium',status:'active',price_id:'price_other',recurring_price_snapshot:{...snapshot,price_id:'price_other',amount_cents:99999}},
    {salon_id:business,tier:'Starter',status:'active',price_id:'price_retired',recurring_price_snapshot:snapshot},
  ]}});
  const result=(await f.run('get_plan_status',{})).request.result;
  assert.equal(result.current_plan.monthly_amount_cents,5900);
  assert.equal(result.available_plans.find(plan=>plan.name==='Starter').monthly_amount_cents,9900);
  assert.doesNotMatch(JSON.stringify(result),/price_retired|price_other|99999/);
});

test('assistant stock uses own-business quantities and thresholds, excludes foreign supplies, and checks revoked permissions',async()=>{
 const tables={salon_products:[{id:service,salon_id:business,name:'Own oil',inventory_quantity:2,track_inventory:true,low_stock_threshold:3},{id:professional,salon_id:actor,name:'Foreign oil',inventory_quantity:0,track_inventory:true,low_stock_threshold:5}],business_supplies:[{id:service,salon_id:business,name:'Own gloves',inventory_quantity:0,track_inventory:true,low_stock_threshold:2},{id:actor,salon_id:actor,name:'Foreign formula supply',inventory_quantity:0,track_inventory:true,low_stock_threshold:10}]};
 const f=fixture({tables});for(const query of ['', 'Own oil', 'Foreign formula supply']){const result=(await f.run('get_products',{query})).request.result;assert.equal(JSON.stringify(result).includes('Foreign'),false);assert.equal(result.stock_alerts_total,2);assert.equal(result.stock_alerts[0].quantity,2);}
 const denied=fixture({tables,denied:['products']});await assert.rejects(denied.run('get_products',{query:''}),error=>error.code==='ASSISTANT_ACCESS_DENIED');assert.equal(denied.calls.some(call=>call.name==='read_business_stock'||call.table==='salon_products'),false);
});


test('Master exact Alma walk-in preserves Thursday September 24 at 3:30 PM and never substitutes an earlier opening',async()=>{
 const now=Date.parse('2026-09-23T12:00:00Z');
 const options={now,professional,tables:{stylists:[{id:professional,salon_id:business,name:'Aisha',is_active:true,archived_at:null}]},gaps:[{start:'2026-09-24T19:00:00Z',end:'2026-09-24T21:00:00Z',stylist_id:professional}]};
 const args={...manual,guest_name:'Alma Aba',date:'2026-09-24',time:'15:30',source:'walk_in',style_id:null,service_name:'',service_preference:'any',duration_minutes:null,stylist_id:null,stylist_preference:'any'};
 const f=fixture(options),result=await f.run('prepare_manual_appointment',args);
 assert.equal(result.request.execution_payload.appointment_datetime,'2026-09-24T19:30:00.000Z');
 assert.equal(result.request.execution_payload.stylist_id,professional);assert.equal(result.request.execution_payload.service_name,'Medium knotless');
 assert.equal(result.request.arguments.guest_name,'Alma Aba');assert.equal(result.request.arguments.time,'15:30');
 const blocked=fixture({...options,gaps:[{start:'2026-09-24T19:00:00Z',end:'2026-09-24T20:15:00Z',stylist_id:professional}]});
 await assert.rejects(blocked.run('prepare_manual_appointment',args),error=>{
  assert.equal(error.code,'ASSISTANT_AVAILABILITY_CONFLICT');
  assert.equal(error.alternatives[0].start,'2026-09-24T19:00:00.000Z');
  assert.equal(error.alternatives[0].service_name,'Medium knotless');
  assert.equal(error.alternatives[0].professional_name,'Aisha');
  assert.equal(error.alternatives[0].time_zone,'America/New_York');
  return true;
 });
 assert.equal(blocked.calls.filter(c=>c.name==='save_gc_assistant_request').length,0);
});

test('any service selects an assigned service that fits the exact time instead of stopping at the first catalog row',async()=>{
 const short='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 const f=fixture({now:Date.parse('2026-09-23T12:00:00Z'),professional,tables:{
  styles:[{id:service,salon_id:business,name:'Long braids',duration_min_hours:4,duration_max_hours:4,buffer_minutes:15,is_draft:false,archived_at:null},{id:short,salon_id:business,name:'Quick finish',duration_min_hours:0.5,duration_max_hours:0.5,buffer_minutes:15,is_draft:false,archived_at:null}],
  stylists:[{id:professional,salon_id:business,name:'Aisha',is_active:true,archived_at:null,assigned_service_ids:[short]}],
 },gaps:[{start:'2026-09-24T19:30:00Z',end:'2026-09-24T20:30:00Z',stylist_id:professional}]});
 const result=await f.run('prepare_manual_appointment',{...manual,date:'2026-09-24',time:'15:30',style_id:null,service_name:'',service_preference:'any',duration_minutes:null,stylist_id:null,stylist_preference:'any'});
 assert.equal(result.request.execution_payload.appointment_datetime,'2026-09-24T19:30:00.000Z');
 assert.equal(result.request.execution_payload.service_facts.id,short);assert.equal(result.request.execution_payload.duration_minutes,30);
 assert.equal(result.request.execution_payload.professional_name,'Aisha');
});
