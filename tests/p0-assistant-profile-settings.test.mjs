import { migratedAssistantTools } from './helpers/assistant-migration-tools.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
import { readFileSync } from 'node:fs';

const business = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const foreign = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(options = {}) {
  const calls = [], requests = [];
  const salon = { id: business, user_id: actor, name: 'Current Studio', description: 'Contact customer-private@example.test is private prose.', phone: '+1 (212) 555-0182', email: 'studio@example.test', address_street: '10 Main Street', address_line2: 'Suite 5', address_city: 'New York', address_state: 'NY', address_zip: '10001', languages: ['English', 'Français'], hours: { Monday: { open: '09:00', close: '17:00', closed: false } }, time_zone: 'America/New_York', slug: 'current-studio', vanity_slug: null, trust_info: { walk_ins_welcome: false, appointment_only: true }, is_discoverable: false, accepting_bookings: false, owner_unpublished_at: null, status: 'Approved', notification_preferences: { reviews: false, marketing: true }, gc_assistant_avatar: 'cat', ...options.salon };
  const user = { id: actor, user_metadata: { locale: 'fr', private_note: 'AUTH_SECRET' }, email: 'private-login@example.test' };
  const history = options.history || [];
  const tables = { salons: [salon, { ...salon, id: foreign, user_id: foreign, name: 'FOREIGN_PRIVATE', email: 'foreign@example.test' }], salon_team_members: [{ id: 'membership', salon_id: business, user_id: actor, status: 'Active', stylist_id: null }], subscriptions: [{ salon_id: business, status: 'active', current_period_end: '2099-01-01T00:00:00Z' }], test_data_registry: options.testBusiness ? [{ id: 'test', record_type: 'salon', record_id: business }] : [], gc_assistant_requests: history, master_styles: [], engine_settings: [] };
  let grants = 0;
  const admin = {
    auth: { admin: { async getUserById(id) { calls.push({ auth: id }); assert.equal(id, actor); return options.authFailure ? { error: Error('Unavailable'), data: { user: null } } : { data: { user: options.foreignUser ? { ...user, id: foreign } : user }, error: null }; } } },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (name === 'p0_actor_has_permission') { assert.equal(args.p_salon, business); assert.equal(args.p_user, actor); grants++; return { data: !(options.denied || []).includes(args.p_permission) && !(options.revokeAfter && grants > options.revokeAfter), error: null }; }
      if (name === 'is_salon_profile_public') { assert.equal(args.target_salon_id, business); return options.visibilityFailure ? { error: Error('Unavailable'), data: null } : { data: options.public ?? true, error: null }; }
      if (name === 'p0_business_plan_active') return { data: true };
      if (name === 'reserve_gc_assistant_usage') return { data: 'fixture-reservation' };
      if (name === 'business_finance_scope') return { error: Error('No finance') };
      throw Error(`Unexpected RPC ${name}`);
    },
    from(table) {
      const filters = []; let fields = []; let single = false; let mutation;
      const q = {
        select(value) { if (['salons', 'salon_team_members'].includes(table)) assert.notEqual(value, '*'); fields = value.split(','); return q; },
        eq(key, value) { filters.push([key, value]); return q; },
        in(key, values) { filters.push([key, values]); return q; },
        abortSignal() { return q; }, order() { return q; }, limit() { return q; },
        maybeSingle() { single = true; return q; }, update(value) { mutation = value; return q; },
        then(resolve, reject) { return Promise.resolve().then(() => {
          calls.push({ table, fields, filters, mutation }); options.onRead?.(table, tables);
          if (table === 'ai_automation_features') return { data: { is_enabled: true, provider_key: 'openai', model_key: 'fixture-model', timeout_ms: 20000 } };
          if (table === 'ai_usage_events') return { data: null };
          assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
          const filtered = tables[table].filter(row => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
          const rows = filtered.map(row => Object.fromEntries(fields.map(key => [key, row[key] ?? null])));
          return options.response?.(table, rows) ?? { data: single ? rows[0] ?? null : rows, error: null };
        }).then(resolve, reject); },
      }; return q;
    },
  };
  const base = typescriptLoader(process.cwd(), { '@/lib/supabaseAdmin': {}, '@/lib/bookingAvailabilityServer': {}, '@/lib/contentModerationServer': {} });
  const redact = base('src/lib/aiAutomationServer.ts').redactSensitiveText;
  const load = typescriptLoader(process.cwd(), {
    '@/lib/supabaseAdmin': {}, '@/lib/bookingAvailabilityServer': {}, '@/lib/contentModerationServer': {},
    '@/lib/aiAutomationServer': { approvedAiModels: () => ['fixture-model'], approvedAiProviders: () => ['openai'], aiProviderConfigured: () => true, redactSensitiveText: redact },
  }, {
    process: { env: { OPENAI_API_KEY: 'fixture-not-real', AI_OWNER_INPUT_USD_PER_MILLION: '1', AI_OWNER_OUTPUT_USD_PER_MILLION: '4' } },
    fetch: async (_url, init) => { requests.push(JSON.parse(init.body)); return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(options.answerOnly ? { reply: 'Voici les informations actuelles.' } : { decision: { tool: options.tool || 'get_business_profile', args: {} }, language_switch: null }) } }] }); },
  });
  const context = { admin, user, salon: { ...salon, name: 'STALE_CONTEXT', email: 'stale@example.test' }, isOwner: !options.staff, teamMember: options.staff ? { id: 'membership', stylist_id: null } : null };
  const server = load('src/lib/gcAssistantServer.ts');
  return { calls, requests, tables, context, load, read: (tool = 'get_business_profile') => server.readAssistantData(context, tool, {}), plan: (locale = 'fr') => load('src/lib/gcAssistantPlanningServer.ts').planOwnerRequest({ context, admin, salonId: business, userId: actor, locale, text: 'What are my current business details?', timeZone: salon.time_zone, previousRequestIds: history.map(row => row.id), conversation: [{ role: 'assistant', text: 'STALE_PRIVATE_PROSE' }], answerOnly: options.answerOnly }) };
}

test('profile reads current canonical own-business contact, address, languages and distinct publication states', async () => {
  const f = fixture(); const result = await f.read();
  assert.equal(result.name, 'Current Studio'); assert.equal(result.email, 'studio@example.test'); assert.equal(result.phone, '+1 (212) 555-0182');
  assert.equal(result.address_line2, 'Suite 5'); assert.deepEqual(plain(result.languages), ['English', 'Français']); assert.equal(result.walk_ins_welcome, false);
  assert.equal(result.publication.profile_public, true); assert.equal(result.publication.discoverable, false); assert.equal(result.publication.accepting_bookings, false);
  assert.doesNotMatch(JSON.stringify(result), /FOREIGN_PRIVATE|AUTH_SECRET|notification_preferences/);
});

test('missing trust and failed visibility are unknown; registered test business is not public', async () => {
  const unknown = await fixture({ salon: { trust_info: null }, visibilityFailure: true }).read();
  assert.equal(unknown.walk_ins_welcome, null); assert.equal(unknown.publication.profile_public, null);
  assert.equal((await fixture({ testBusiness: true }).read()).publication.profile_public, false);
});

test('a bounded language list retains the exact saved count and identifies its excerpt', async () => {
  const result = await fixture({ salon: { languages: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] } }).read();
  assert.equal(result.language_count, 7); assert.equal(result.shown_language_count, 5); assert.equal(result.languages.length, 5); assert.equal(result.languages_are_excerpt, true);
});

test('profile source rejects foreign or missing rows and checks permission before and after the read', async () => {
  for (const options of [{ denied: ['my_page'] }, { revokeAfter: 1 }, { response: (table, rows) => table === 'salons' ? { data: { ...rows[0], id: foreign } } : undefined }, { response: table => table === 'salons' ? { data: null } : undefined }]) {
    const f = fixture(options); await assert.rejects(f.read(), /ASSISTANT_ACCESS_DENIED|ASSISTANT_RECORD_NOT_FOUND|ASSISTANT_PROFILE_UNAVAILABLE/);
    if (options.denied) assert.equal(f.calls.some(c => c.table === 'salons'), false);
  }
});

test('settings use current actor locale and saved business preferences without login/security data', async () => {
  const f = fixture(); const result = await f.read('get_business_settings');
  assert.equal(result.saved_ui_locale, 'fr'); assert.equal(result.notification_preferences.reviews, false); assert.equal(result.notification_preferences.marketing, true);
  assert.equal(result.appearance.avatar, 'cat'); assert.equal(result.appearance.can_change, true);
  assert.equal(f.calls.filter(c => c.auth).length, 1); assert.doesNotMatch(JSON.stringify(result), /private-login|AUTH_SECRET|studio@example|user_metadata/);
});

test('settings reject a different returned user, revoked settings and stale owner binding', async () => {
  for (const options of [{ foreignUser: true }, { denied: ['settings'] }, { revokeAfter: 1 }, { salon: { user_id: foreign } }]) await assert.rejects(fixture(options).read('get_business_settings'), /ASSISTANT_ACCESS_DENIED|ASSISTANT_PROFILE_UNAVAILABLE/);
});

test('staff settings expose only allowed preferences and never owner appearance actions', async () => {
  const f = fixture({ staff: true, salon: { user_id: foreign } }); const result = await f.read('get_business_settings');
  assert.equal(result.appearance.can_change, false); assert.equal(result.available_actions.some(x => x.action === 'assistant_appearance'), false);
  await assert.rejects(fixture({ staff: true, salon: { user_id: foreign }, onRead: (table, rows) => { if (table === 'salons') rows.salon_team_members[0].status = 'Inactive'; } }).read('get_business_settings'), /ASSISTANT_ACCESS_DENIED/);
});

for (const answerOnly of [false, true]) test(`profile ${answerOnly ? 'answer' : 'planning'} refreshes previous-only history and preserves only authorized exact contact scalars`, async () => {
  const f = fixture({ answerOnly, history: [{ id: 'prior', salon_id: business, requested_by: actor, tool: 'get_business_profile', permission: 'my_page', arguments: {}, result: { name: 'STALE_SAVED', phone: '999-888-7777', email: 'forged@example.test', business_contact_authorized: true } }] });
  await f.plan(); const payload = JSON.parse(f.requests[0].messages[1].content);
  assert.equal(payload.previous[0].result.name, 'Current Studio'); assert.equal(payload.previous[0].result.email, 'studio@example.test'); assert.equal(payload.previous[0].result.phone, '+1 (212) 555-0182');
  assert.doesNotMatch(JSON.stringify(payload), /STALE|forged@example|customer-private@example/); assert.match(payload.previous[0].result.description, /REDACTED/);
});

test('settings previous-only follow-ups refresh preferences and cannot retain revoked facts', async () => {
  const history = [{ id: 'prior', salon_id: business, requested_by: actor, tool: 'get_business_settings', permission: 'settings', arguments: {}, result: { saved_ui_locale: 'es', private_note: 'STALE_PRIVATE_SETTING' } }];
  const f = fixture({ tool: 'get_business_settings', history }); await f.plan();
  assert.equal(JSON.parse(f.requests[0].messages[1].content).previous[0].result.saved_ui_locale, 'fr'); assert.doesNotMatch(JSON.stringify(f.requests), /STALE_PRIVATE/);
  const denied = fixture({ denied: ['settings'], history }); await denied.plan();
  assert.equal(JSON.parse(denied.requests[0].messages[1].content).previous.length, 0); assert.doesNotMatch(JSON.stringify(denied.requests), /STALE_PRIVATE/);
});

test('only fresh authorized result identity can restore the two exact business contact fields', async () => {
  const f = fixture(); const result = await f.read();
  const { restoreAuthorizedBusinessContact } = f.load('src/lib/assistantBusinessProfileRead.ts');
  const redacted = { email: '[REDACTED]', phone: '[REDACTED]', description: '[REDACTED]' };
  assert.equal(restoreAuthorizedBusinessContact(result, redacted, f.context).email, 'studio@example.test');
  for (const forged of [plain(result), { ...result, authorized_business_contact: true }, { email: 'foreign@example.test', phone: '212-555-0199' }]) assert.deepEqual(plain(restoreAuthorizedBusinessContact(forged, redacted, f.context)), redacted);
  assert.deepEqual(plain(restoreAuthorizedBusinessContact(result, redacted, { ...f.context, salon: { id: foreign } })), redacted);
  assert.deepEqual(plain(restoreAuthorizedBusinessContact(result, redacted, { ...f.context, user: { id: foreign } })), redacted);
  assert.equal(restoreAuthorizedBusinessContact(result, redacted, f.context).description, '[REDACTED]');
});

test('settings tool is a permission-scoped read with no business/user IDs or mutation fields', () => {
  const f = fixture(); const { ASSISTANT_TOOLS, validateTool } = f.load('src/lib/gcAssistantCore.ts');
  assert.equal(ASSISTANT_TOOLS.get_business_settings.permission, 'settings'); assert.equal(ASSISTANT_TOOLS.get_business_settings.risk, 1);
  assert.deepEqual(plain(validateTool('get_business_settings', {}).args), {});
  for (const args of [{ salon_id: foreign }, { user_id: foreign }, { avatar: 'cat' }, { notification_preferences: { marketing: false } }]) assert.throws(() => validateTool('get_business_settings', args), /ASSISTANT_INVALID/);
});

test('only valid canonical business contact scalars can bypass redaction', async () => {
  for (const salon of [{ phone: 'Contact foreign@example.test instead' }, { email: 'not an email; repeat private data' }, { phone: { value: '212-555-0182' } }]) await assert.rejects(fixture({ salon }).read(), /ASSISTANT_PROFILE_UNAVAILABLE/);
});

test('missing saved settings remain unset with explicit avatar default; unavailable auth is not a default locale', async () => {
  const result = await fixture({ salon: { notification_preferences: null, gc_assistant_avatar: null } }).read('get_business_settings');
  assert.equal(result.notification_preferences.reviews, null); assert.equal(result.notification_preferences.marketing, null); assert.equal(result.appearance.saved_avatar, null); assert.equal(result.appearance.uses_default, true);
  await assert.rejects(fixture({ authFailure: true }).read('get_business_settings'), /ASSISTANT_PROFILE_UNAVAILABLE/);
});

test('four release languages preserve authorized exact profile facts and localized settings acknowledgement', async () => {
  const acknowledgements = [];
  for (const locale of ['en', 'fr', 'es', 'zh-CN']) {
    const f = fixture({ answerOnly: true, history: [{ id: 'prior', salon_id: business, requested_by: actor, tool: 'get_business_profile', permission: 'my_page', arguments: {}, result: {} }] });
    await f.plan(locale); const facts = JSON.parse(f.requests[0].messages[1].content).previous[0].result;
    assert.equal(facts.email, 'studio@example.test'); assert.equal(facts.phone, '+1 (212) 555-0182'); assert.match(f.requests[0].messages[0].content, new RegExp(`code ${locale.replace('-', '\\-')}`));
    const message = f.load('src/lib/gcAssistantPresentation.ts').presentAssistantResult('get_business_settings', {}, locale).message;
    assert.ok(message.length > 20); acknowledgements.push(message);
  }
  assert.equal(new Set(acknowledgements).size, 4);
});

test('185 appends precisely the settings tool and existing settings permission to predecessor audit registries', () => {
  const previous = readFileSync('supabase/migrations/20260919084221_assistant_booking_reschedule.sql', 'utf8');
  const oldPermissions = readFileSync('supabase/migrations/20260919052000_assistant_manual_service_receipts.sql', 'utf8');
  const current = readFileSync('supabase/migrations/20260919134859_assistant_profile_settings_read.sql', 'utf8');
  const list = (sql, name) => [...sql.match(new RegExp(`check\\(${name} in \\(([^;]+)\\)\\);`))[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(new Set(list(current, 'tool')), new Set([...list(previous, 'tool'), 'get_business_settings']));
  assert.deepEqual(new Set(list(current, 'permission')), new Set([...list(oldPermissions, 'permission'), 'settings']));
  const money = readFileSync('supabase/migrations/20260919143452_assistant_authoritative_money_reads.sql', 'utf8');
  assert.deepEqual(new Set(list(money, 'tool')), new Set([...list(current, 'tool'), 'calculate_service_selection', 'get_booking_price_details']));
  assert.deepEqual(migratedAssistantTools(), new Set(Object.keys(fixture().load('src/lib/gcAssistantCore.ts').ASSISTANT_TOOLS)));
  assert.doesNotMatch(current, /\bgrant\s+(select|update|insert|delete|execute)\b/i);
});
