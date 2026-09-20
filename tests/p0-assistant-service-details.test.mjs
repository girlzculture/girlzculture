import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const business = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const styleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const foreignBusiness = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const foreignStyle = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const plain = value => JSON.parse(JSON.stringify(value));

const requiredGroup = {
  id: 'finish', label: 'Curl finish', selection: 'single', required: true,
  options: [
    { value: 'light', label: 'Light curls', price_add: 25, duration_add_minutes: 15 },
    { value: 'full', label: 'Full curls', price_add: 45, duration_add_minutes: 30 },
  ],
};

function fixture(options = {}) {
  const calls = [];
  const tables = {
    styles: [{
      id: styleId, salon_id: business, name: 'Boho / Goddess Braids',
      description: 'Braids with a selected curl finish.', category: 'Braiding',
      category_id: 'hair', service_group_id: 'braiding', master_style_id: 'boho-braids',
      base_price: 180, price_display_min: 180, price_display_max: 310,
      duration_min_hours: 4, duration_max_hours: 6, buffer_minutes: 15,
      size_options: [{ value: 'medium', label: 'Medium', price_add: 0 }],
      length_options: [{ value: 'waist', label: 'Waist', price_add: 30 }],
      addons: [{ value: 'wash', label: 'Wash', price_add: 15 }],
      included_items: ['Scalp preparation'], option_groups: [requiredGroup],
      is_draft: false, archived_at: null,
    }, {
      id: foreignStyle, salon_id: foreignBusiness, name: 'Foreign private braids',
      base_price: 999, is_draft: false, archived_at: null,
    }],
    style_materials: [{
      id: '11111111-1111-4111-8111-111111111111', style_id: styleId,
      name: 'Human curl hair', price: 40, is_bring_your_own: false,
      longevity_weeks: 6, quality_grade: 'Remy', longevity: null, quality_note: null,
      option_type: 'material', metadata: { private_internal_note: 'Not part of the assistant projection' },
    }, {
      id: '22222222-2222-4222-8222-222222222222', style_id: foreignStyle,
      name: 'Foreign private material', price: 777, is_bring_your_own: false,
      option_type: 'material',
    }],
    subscriptions: [{ salon_id: business, status: 'active', current_period_end: '2099-01-01T00:00:00Z' }],
  };
  const admin = {
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      assert.equal(name, 'p0_actor_has_permission');
      assert.equal(args.p_salon, business);
      assert.equal(args.p_user, actor);
      const granted = options.permissions?.shift() ?? options.allowed ?? true;
      return { data: args.p_permission === 'styles' && granted, error: null };
    },
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
      const filters = []; let fields = []; let cap = Infinity; let order; let single = false;
      const query = {
        select(value) { assert.notEqual(value, '*', 'Read only the necessary service facts'); fields = value.split(',').map(field => field.trim()); return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        is(key, value) { filters.push(row => (row[key] ?? null) === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        ilike(key, pattern) {
          const needle = pattern.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLowerCase();
          filters.push(row => String(row[key]).toLowerCase().includes(needle)); return query;
        },
        order(key) { order = key; return query; },
        limit(value) { cap = value; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            options.onRead?.(table, tables);
            const rows = tables[table].filter(row => filters.every(filter => filter(row)));
            if (order) rows.sort((a, b) => String(a[order]).localeCompare(String(b[order])));
            calls.push({ table, fields, returned: rows.slice(0, cap).map(row => row.id) });
            // Unlike the older execution fixture, this honors SELECT. Omitted
            // checkout fields must not accidentally leak in from fixture rows.
            const projected = rows.slice(0, cap).map(row => Object.fromEntries(fields.map(key => [key, row[key] ?? null])));
            return options.response?.(table, projected, rows.length) ?? { data: single ? projected[0] ?? null : projected, count: rows.length, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const load = typescriptLoader(process.cwd(), {
    '@/lib/supabaseAdmin': {}, '@/lib/bookingAvailabilityServer': {}, '@/lib/contentModerationServer': {},
  });
  const server = load('src/lib/gcAssistantServer.ts');
  const context = { admin, user: { id: actor }, salon: { id: business, subscription_status: 'active', time_zone: 'America/New_York' }, isOwner: true, teamMember: null };
  return { calls, tables, context, server, load, read: query => server.readAssistantData(context, 'get_services_and_prices', { query }) };
}

test('service details preserve named alias matches and exclude other businesses', async () => {
  const f = fixture();
  for (const query of ['bohemian braids', 'booh braids', 'tresses boho']) {
    const result = await f.read(query);
    assert.equal(result.inventory_total, 1);
    assert.equal(result.match_status, 'related');
    assert.equal(result.exact_match, false);
    assert.equal(result.services[0].id, styleId);
    assert.equal(result.services[0].name, 'Boho / Goddess Braids');
    assert.equal(result.services[0].base_price, 180);
    assert.equal(result.services[0].duration_max_hours, 6);
    assert.doesNotMatch(JSON.stringify(result), /Foreign private|999|777/);
  }
});

test('a service details follow-up reads current saved facts without renaming the service', async () => {
  const f = fixture();
  assert.equal((await f.read('boho')).services[0].base_price, 180);
  f.tables.styles[0].base_price = 195;
  f.tables.styles[0].duration_max_hours = 7;
  const result = await f.read('bohemian braids');
  assert.equal(result.services[0].name, 'Boho / Goddess Braids');
  assert.equal(result.services[0].base_price, 195);
  assert.equal(result.services[0].duration_max_hours, 7);
});

test('service details retain the required options that checkout uses for price and duration', async () => {
  const result = await fixture().read('boho');
  assert.deepEqual(plain(result.services[0].option_groups ?? null), [{ ...requiredGroup, option_count: 2, options_are_excerpt: false }]);
});

test('service details preserve recorded display bounds and distinguish saved group from category identity', async () => {
  const result = await fixture().read('boho');
  const service = result.services[0];
  assert.deepEqual(plain({
    price_display_min: service.price_display_min, price_display_max: service.price_display_max,
    category: service.category, category_id: service.category_id, service_group_id: service.service_group_id,
    master_style_id: service.master_style_id, included_items: service.included_items,
  }), {
    price_display_min: 180, price_display_max: 310, category: 'Braiding', category_id: 'hair',
    service_group_id: 'braiding', master_style_id: 'boho-braids', included_items: ['Scalp preparation'],
  });
});

test('service details read material choices only through the returned own service assignment', async () => {
  const f = fixture();
  const result = await f.read('boho');
  assert.equal(result.services[0].materials?.length, 1);
  assert.equal(result.services[0].materials[0].name, 'Human curl hair');
  assert.equal(result.services[0].materials[0].price, 40);
  assert.equal(result.services[0].materials[0].is_bring_your_own, false);
  assert.doesNotMatch(JSON.stringify(result), /Foreign private|777|private_internal_note|Not part of the assistant projection/);
  assert.deepEqual(f.calls.filter(call => call.table === 'style_materials').flatMap(call => call.returned), ['11111111-1111-4111-8111-111111111111']);
});

test('a base price with unselected required options is explicitly not a final booking quote', async () => {
  const result = await fixture().read('boho');
  assert.equal(result.services[0].price_completeness, 'selection_required');
  assert.equal(result.services[0].monetary_quote_available, false);
  assert.deepEqual(plain(result.services[0].required_option_group_ids ?? null), ['finish']);
  assert.equal(Object.hasOwn(result.services[0], 'final_subtotal'), false);
});

test('revoked styles permission prevents direct service or material reads', async () => {
  const f = fixture({ allowed: false });
  await assert.rejects(f.read('boho'), error => error.code === 'ASSISTANT_ACCESS_DENIED');
  assert.equal(f.calls.some(call => call.table), false);
});

test('styles permission lost during the read discards all service and material facts', async () => {
  const f = fixture({ permissions: [true, false] });
  await assert.rejects(f.read('boho'), error => error.code === 'ASSISTANT_ACCESS_DENIED');
});

test('foreign or malformed returned rows fail closed even when the query was correctly scoped', async () => {
  for (const table of ['styles', 'style_materials']) {
    const f = fixture({ response: (current, rows, count) => current !== table ? null : {
      data: rows.map(row => ({ ...row, ...(table === 'styles' ? { salon_id: foreignBusiness } : { style_id: foreignStyle }) })), count, error: null,
    } });
    await assert.rejects(f.read('boho'), error => error.code === 'ASSISTANT_SERVICE_UNAVAILABLE');
  }
});

test('a moved own service cannot carry earlier assigned material facts into the response', async () => {
  const f = fixture({ onRead: (table, tables) => { if (table === 'style_materials') tables.styles[0].salon_id = foreignBusiness; } });
  await assert.rejects(f.read('boho'), error => error.code === 'ASSISTANT_SERVICE_UNAVAILABLE');
});

test('missing material evidence is unavailable rather than a synthetic empty material list', async () => {
  for (const failure of [{ data: [], count: null, error: null }, { data: null, count: null, error: { message: 'fixture failure' } }]) {
    const f = fixture({ response: table => table === 'style_materials' ? failure : null });
    await assert.rejects(f.read('boho'), error => error.code === 'ASSISTANT_SERVICE_UNAVAILABLE');
  }
});

test('catalog-only values, unsupported choices and bounded excerpts remain distinct', async () => {
  const f = fixture();
  f.tables.styles[0].option_groups = [];
  assert.equal((await f.read('boho')).services[0].price_completeness, 'catalog_only');
  f.tables.styles[0].option_groups = { required: 'not a checkout group array' };
  const unsupported = (await f.read('boho')).services[0];
  assert.equal(unsupported.price_completeness, 'incomplete');
  assert.equal(unsupported.choice_evidence.option_groups, 'unsupported');
  assert.equal(unsupported.choice_counts.option_groups, null);
  f.tables.styles[0].option_groups = [{ ...requiredGroup, options: Array.from({ length: 35 }, (_, i) => ({ value: `choice-${i}`, label: `Choice ${i}`, price_add: i, duration_add_minutes: 0 })) }];
  const excerpt = (await f.read('boho')).services[0];
  assert.equal(excerpt.price_completeness, 'incomplete');
  assert.equal(excerpt.choice_evidence.option_groups, 'excerpt');
  assert.equal(excerpt.option_groups[0].option_count, 35);
  assert.equal(excerpt.option_groups[0].options.length, 30);
  assert.equal(excerpt.option_groups[0].options_are_excerpt, true);
  assert.equal(excerpt.monetary_quote_available, false);
});

function planner(f, { answerOnly = false, denied = false, query = 'boho' } = {}) {
  const requests = [];
  const { admin } = f.context;
  const originalFrom = admin.from.bind(admin), originalRpc = admin.rpc.bind(admin);
  admin.rpc = async (name, args) => {
    if (name === 'p0_business_plan_active') return { data: true };
    if (name === 'reserve_gc_assistant_usage') return { data: 'fixture-reservation' };
    if (name === 'business_finance_scope') return { error: { message: 'FINANCE_ACCESS_DENIED' } };
    if (name === 'p0_actor_has_permission' && args.p_permission === 'overview') return { data: true };
    if (name === 'p0_actor_has_permission' && (args.p_permission !== 'styles' || denied)) return { data: false };
    return originalRpc(name, args);
  };
  admin.from = table => {
    if (!['gc_assistant_requests', 'ai_automation_features', 'ai_usage_events', 'master_styles'].includes(table)) return originalFrom(table);
    const filters = [];
    const q = { select() { return q; }, eq(key, value) { filters.push([key, value]); return q; }, in() { return q; }, order() { return q; }, limit() { return q; }, update() { return q; }, maybeSingle() { return q; }, then(resolve, reject) {
      return Promise.resolve().then(() => {
        if (table === 'ai_automation_features') return { data: { is_enabled: true, provider_key: 'openai', model_key: 'fixture-model', timeout_ms: 10000 } };
        if (table === 'master_styles') return { data: [], error: null };
        if (table === 'gc_assistant_requests') {
          assert.ok(filters.some(([key, value]) => key === 'salon_id' && value === business));
          assert.ok(filters.some(([key, value]) => key === 'requested_by' && value === actor));
          return { data: [{ id: 'service-request', tool: 'get_services_and_prices', permission: 'styles', arguments: { query }, result: { services: [{ name: 'OLD_PRIVATE_SERVICE', base_price: 999 }] } }] };
        }
        return { data: null };
      }).then(resolve, reject);
    } };
    return q;
  };
  const load = typescriptLoader(process.cwd(), {
    '@/lib/gcAssistantServer': { readAssistantData: f.server.readAssistantData },
    '@/lib/aiAutomationServer': { approvedAiModels: () => ['fixture-model'], approvedAiProviders: () => ['openai'], aiProviderConfigured: () => true, redactSensitiveText: value => value },
  }, {
    process: { env: { OPENAI_API_KEY: 'isolated-test-only', AI_OWNER_INPUT_USD_PER_MILLION: '1', AI_OWNER_OUTPUT_USD_PER_MILLION: '4' } }, TextDecoder,
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answerOnly ? { reply: 'Fixture response.' } : { language_switch: null, decision: { clarification: 'Which selection?' } }) } }] });
    },
  });
  return { requests, run: () => load('src/lib/gcAssistantPlanningServer.ts').planOwnerRequest({
    context: f.context, admin, salonId: business, userId: actor, locale: 'en', text: 'Does the current price include the required finish?',
    timeZone: 'America/New_York', previousRequestIds: ['service-request'], conversation: [{ role: 'assistant', text: 'OLD_PRIVATE_SERVICE is 999.' }], answerOnly,
  }) };
}

test('actual planner and answer payloads retain required choices and material prices beyond the nested depth limit', async () => {
  for (const answerOnly of [false, true]) {
    const f = fixture(), p = planner(f, { answerOnly });
    await p.run();
    const sent = JSON.parse(p.requests[0].messages[1].content), result = sent.previous[0].result;
    assert.equal(result.services[0].name, 'Boho / Goddess Braids');
    assert.equal(result.services[0].base_price, 180);
    assert.equal(result.services[0].price_completeness, 'selection_required');
    assert.equal(result.services[0].materials[0].name, 'Human curl hair');
    assert.equal(result.services[0].materials[0].price, 40);
    assert.deepEqual(result.generic_option_choices.map(({ value, label, price_add, duration_add_minutes, required }) => ({ value, label, price_add, duration_add_minutes, required })), requiredGroup.options.map(option => ({ ...option, required: true })));
    assert.equal(result.monetary_quote_available, false);
    assert.doesNotMatch(JSON.stringify(sent), /OLD_PRIVATE_SERVICE|Foreign private|private_internal_note/);
    assert.deepEqual(sent.conversation, []);
  }
});

test('previous-request-only service follow-ups discard revoked private facts before either model phase', async () => {
  for (const answerOnly of [false, true]) {
    const f = fixture(), p = planner(f, { answerOnly, denied: true });
    if (answerOnly) { await assert.rejects(p.run(), /ASSISTANT_INVALID_PLAN/); assert.equal(p.requests.length, 0); }
    else { await p.run(); assert.doesNotMatch(JSON.stringify(p.requests), /OLD_PRIVATE_SERVICE|Boho|Human curl hair/); }
    assert.equal(f.calls.some(call => call.table), false, 'Revoked tools cannot query even own service sources');
  }
});

test('model option excerpts preserve known full counts without implying that omitted choices are absent', async () => {
  const f = fixture();
  f.tables.styles[0].option_groups[0] = { ...requiredGroup, options: Array.from({ length: 15 }, (_, index) => ({ value: `finish-${index}`, label: `Finish ${index}`, price_add: index, duration_add_minutes: index })) };
  const p = planner(f, { answerOnly: true });
  await p.run();
  const result = JSON.parse(p.requests[0].messages[1].content).previous[0].result;
  assert.equal(result.generic_option_choice_count, 15);
  assert.equal(result.generic_option_choices.length, 12);
  assert.equal(result.generic_options_are_excerpt, true);
  assert.equal(result.services[0].option_groups[0].option_count, 15);
  assert.equal(result.services[0].monetary_quote_available, false);
});
