import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNodeTypescript } from './helpers/load-node-typescript.mjs';
const load = loadNodeTypescript(process.cwd());
const core = load('src/lib/businessMarketing.ts');
const salon = '11111111-1111-4111-8111-111111111111', actor = '22222222-2222-4222-8222-222222222222', service = '33333333-3333-4333-8333-333333333333', id = '44444444-4444-4444-8444-444444444444', promotion = '55555555-5555-4555-8555-555555555555';
const source = () => ({ photo_urls: ['https://fixture.invalid/own.jpg'], service_id: service, promotion_id: promotion, booking_id: null });
const snapshot = () => ({ business: { id: salon, name: 'Maison Étoile', slug: 'maison-etoile', vanity_slug: 'etoile', time_zone: 'America/New_York' }, photos: [{ url: source().photo_urls[0], title: 'Own portfolio', category: 'before_after' }], service: { id: service, name: 'Boho / Goddess Braids', base_price: 125, price_display_min: 125, price_display_max: 150 }, promotion: { id: promotion, title: 'Autumn offer', promotion_type: 'percentage', discount_value: 20, starts_at: null, ends_at: null, terms: 'Selected services only' }, completed_service: null });
const approve = () => ({ action: 'approve', id, revision: 1, scheduled_at: new Date(Date.now() + 3600_000).toISOString(), expires_at: new Date(Date.now() + 86400_000).toISOString(), reviewed_locales: [...core.MARKETING_LOCALES], media_permission: true, confirm: true });

test('marketing draft dictionary has complete locale keys and fact placeholders without reinterpreting business text', () => {
  const { BUSINESS_MARKETING_DRAFT_MESSAGES: messages } = load('src/i18n/business-marketing-draft-messages.ts');
  assert.deepEqual(Object.keys(messages), [...core.MARKETING_LOCALES]);
  for (const locale of core.MARKETING_LOCALES) {
    assert.deepEqual(Object.keys(messages[locale]), Object.keys(messages.en));
    for (const [key, value] of Object.entries(messages[locale])) {
      assert.ok(value.trim());
      assert.deepEqual([...(value.match(/\{\w+\}/g) || [])].sort(), [...(messages.en[key].match(/\{\w+\}/g) || [])].sort());
      if (locale !== 'en') assert.notEqual(value, messages.en[key]);
    }
  }
  const facts = snapshot(); facts.business.name = 'Maison $& {offer}';
  for (const copy of Object.values(core.draftMarketingCopies(facts))) assert.ok(copy.body.includes(facts.business.name));
});

test('four editable drafts retain actual names, prices, protection and booking facts without invented people or results', () => {
  const copies = core.draftMarketingCopies(snapshot());
  assert.deepEqual(Object.keys(copies), ['en', 'fr', 'es', 'zh-CN']);
  for (const copy of Object.values(copies)) {
    assert.match(copy.title, /Boho \/ Goddess Braids · Maison Étoile/);
    assert.match(copy.body, /USD 125\.00–USD 150\.00/);
    assert.match(copy.body, /20%/);
    assert.doesNotMatch(copy.body, /Sarah|guaranteed|best salon|five.star|sold.out/i);
    assert.deepEqual(copy.tags, ['#GirlzCulture', '#BohoGoddessBraids']);
  }
  assert.match(copies.en.body, /deposit stays unchanged/);
  assert.match(copies.fr.body, /L’acompte requis reste inchangé/);
  assert.match(copies.es.body, /depósito requerido no cambia/);
  assert.match(copies['zh-CN'].body, /所需定金保持不变/);
});
test('missing price is not advertised as free and descriptive offers do not invent a saving', () => {
  const facts = snapshot(); facts.service.base_price = facts.service.price_display_min = facts.service.price_display_max = null;
  facts.promotion.promotion_type = 'descriptive'; facts.promotion.discount_value = null;
  const copy = core.draftMarketingCopies(facts).en.body;
  assert.doesNotMatch(copy, /USD|free|20%|0\.00/); assert.match(copy, /eligible service offer/);
});

test('long saved names fit the headline while remaining exact in the business copy', () => {
  const facts = snapshot(); facts.business.name = 'Business '.repeat(15).trim(); facts.service.name = 'Service '.repeat(15).trim();
  const copies = core.draftMarketingCopies(facts);
  for (const copy of Object.values(copies)) { assert.ok(copy.title.length <= 160); assert.ok(copy.body.includes(facts.business.name)); assert.ok(copy.body.includes(facts.service.name)); }
});
test('destinations preserve canonical business, selected service and promotion', () => {
  assert.deepEqual(core.marketingDestinations(snapshot()), { public_path: '/etoile', booking_path: `/salon/maison-etoile/book?style=${service}&promotion=${promotion}` });
  assert.throws(() => core.marketingDestinations({ ...snapshot(), business: { ...snapshot().business, slug: 'pending-profile' } }), /PAGE_NOT_READY/);
});
test('foreign fields, unsupported media schemes, duplicate media and injected caption destinations reject', () => {
  assert.throws(() => core.marketingSource({ ...source(), salon_id: 'another-business' }));
  for (const urls of [['http://fixture.invalid/photo'], ['https://name:secret@fixture.invalid/photo'], [...source().photo_urls, ...source().photo_urls]]) assert.throws(() => core.marketingSource({ ...source(), photo_urls: urls }));
  const copies = core.draftMarketingCopies(snapshot()); copies.en.body = 'Book https://girlzculture.com/another-business';
  assert.throws(() => core.marketingCopies(copies), /LINK_IN_COPY/);
});
test('all four reviewed locales and explicit media permission bind the exact saved revision', () => {
  const valid = approve(); assert.equal(core.marketingPublication(valid).revision, 1);
  for (const bad of [{ ...valid, reviewed_locales: ['en'] }, { ...valid, reviewed_locales: ['en','en','fr','es'] }, { ...valid, confirm: false }, { ...valid, media_permission: false }, { ...valid, copies: {} }, { ...valid, revision: 0 }]) assert.throws(() => core.marketingPublication(bad));
});
test('scheduled instants require offsets, valid order and bounded windows', () => {
  const valid = approve();
  for (const bad of [{ ...valid, scheduled_at: '2026-10-01T10:00' }, { ...valid, expires_at: valid.scheduled_at }, { ...valid, scheduled_at: '2020-01-01T00:00:00Z' }, { ...valid, expires_at: '2099-01-01T00:00:00Z' }]) assert.throws(() => core.marketingPublication(bad), /SCHEDULE_INVALID/);
});

test('scheduled runner remains disabled on preview and held production deployments', async () => {
  let fetched = 0;
  const savedFetch = global.fetch, savedNetlify = global.Netlify;
  global.fetch = async () => { fetched++; return Response.json({}); };
  global.Netlify = { env: { get: () => 'fixture-internal-secret' } };
  try {
    const worker = loadNodeTypescript(process.cwd(), { './_monitoring.mjs': { monitoredNetlifyFailure: () => Response.json({ failed: true }, { status: 500 }) } })('netlify/functions/business-marketing-publish.ts');
    for (const deploy of [{ context: 'deploy-preview', published: false }, { context: 'production', published: false }]) {
      assert.equal((await (await worker.default(new Request('https://fixture.invalid'), { deploy })).json()).disabled, true);
    }
    assert.equal(fetched, 0);
    assert.equal(worker.config.schedule, '*/5 * * * *');
  } finally { global.fetch = savedFetch; global.Netlify = savedNetlify; }
});

test('published worker uses only the protected canonical endpoint and reports safe failures', async () => {
  const savedFetch = global.fetch, savedNetlify = global.Netlify;
  const failures = []; let requests = 0;
  global.Netlify = { env: { get: name => { assert.equal(name, 'INTERNAL_API_SECRET'); return 'fixture-internal-secret'; } } };
  global.fetch = async (url, options) => {
    requests++; assert.equal(url, 'https://girlzculture.com/api/salon/marketing/publish-due');
    assert.equal(options.headers['x-internal-secret'], 'fixture-internal-secret');
    assert.equal(options.redirect, 'error'); assert.equal(options.method, 'POST');
    return Response.json({ internal_provider_detail: 'must not be logged' }, { status: requests === 1 ? 200 : 503 });
  };
  try {
    const worker = loadNodeTypescript(process.cwd(), { './_monitoring.mjs': { monitoredNetlifyFailure: details => { failures.push(details); return Response.json({ request_id: 'worker-safe-reference' }, { status: 500 }); } } })('netlify/functions/business-marketing-publish.ts');
    const context = { deploy: { context: 'production', published: true } };
    assert.equal((await worker.default(new Request('https://fixture.invalid'), context)).status, 200);
    assert.equal((await worker.default(new Request('https://fixture.invalid'), context)).status, 500);
    assert.equal(failures[0].error.message, 'MARKETING_WORKER_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(failures), /must not be logged|fixture-internal-secret/);
  } finally { global.fetch = savedFetch; global.Netlify = savedNetlify; }
});

test('worker route rejects missing or incorrect credentials before accessing the database', async () => {
  const before = process.env.INTERNAL_API_SECRET; process.env.INTERNAL_API_SECRET = 'fixture-internal-secret'; let calls = 0;
  try {
    const api = loadNodeTypescript(process.cwd(), {
      '@/lib/supabaseAdmin': { getSupabaseAdmin: () => { calls++; return { rpc: async () => ({ data: { published: 1, needs_review: 0, expired: 0 } }) }; } },
      '@/lib/platformErrors': { capturePlatformError: async () => 'exact-worker-reference', safeFailure: () => Response.json({}, { status: 500 }) },
      '@/lib/operationalMonitoring': { routeMonitoringProfile() {}, withOperationalMonitoring: (_profile, handle) => handle },
    })('src/app/api/salon/marketing/publish-due/route.ts');
    for (const supplied of ['', 'incorrect', 'same-length-but-incorrect']) assert.equal((await api.POST(new Request('https://fixture.invalid/api', { method: 'POST', headers: { 'x-internal-secret': supplied } }))).status, 401);
    assert.equal(calls, 0);
    const response = await api.POST(new Request('https://fixture.invalid/api', { method: 'POST', headers: { 'x-internal-secret': 'fixture-internal-secret' } }));
    assert.equal(response.status, 200); assert.equal(calls, 1); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  } finally { if (before === undefined) delete process.env.INTERNAL_API_SECRET; else process.env.INTERNAL_API_SECRET = before; }
});

function fixture() {
  const state = { owner: true, denied: false, readbackFails: false, calls: [], rows: [], error: null, blocked: false };
  const admin = {
    from(table) {
      const checks = []; let one = false;
      const query = { select() { return query; }, eq(key, value) { checks.push(row => row[key] === value); return query; }, is() { return query; }, or() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { one = true; return query; }, single() { one = true; return query; }, then(resolve) {
        state.calls.push({ table });
        const rows = table === 'business_marketing_posts' ? state.rows.filter(row => checks.every(check => check(row))) : [];
        return Promise.resolve({ data: one ? rows[0] || null : rows, error: one && state.readbackFails ? Error('readback unavailable') : null }).then(resolve);
      } }; return query;
    },
    async rpc(name, args) {
      state.calls.push({ name, args });
      if (state.error) return { error: { message: state.error } };
      if (name === 'business_marketing_snapshot') {
        assert.equal(args.p_salon, salon);
        if (args.p_source.service_id !== service || args.p_source.photo_urls.some(url => !source().photo_urls.includes(url))) return { error: { message: 'MARKETING_SOURCE_CHANGED' } };
        return { data: snapshot() };
      }
      assert.equal(args.p_salon, salon); assert.equal(args.p_actor, actor);
      let row = state.rows.find(item => item.id === args.p_id && item.salon_id === salon);
      if (name === 'save_business_marketing_post') {
        row = { id, salon_id: salon, revision: 1, status: 'draft', source: args.p_source, snapshot: snapshot(), copies: args.p_copies, ...core.marketingDestinations(snapshot()) };
        state.rows = [row];
      } else if (name === 'approve_business_marketing_post') { row.status = 'scheduled'; row.revision++; }
      else if (name === 'cancel_business_marketing_post') { row.status = 'cancelled'; row.revision++; }
      else throw Error(`Unexpected RPC ${name}`);
      return { data: row };
    },
  };
  const api = loadNodeTypescript(process.cwd(), {
    '@/lib/supabaseAdmin': { requireSalonPermission: async (_request, permission) => { assert.equal(permission, 'promotions'); if (state.denied) throw Error('Unauthorized'); return { admin, salon: { id: salon, gallery_photos: source().photo_urls }, user: { id: actor }, isOwner: state.owner }; } },
    '@/lib/requestSecurity': { enforceRateLimit() {}, RateLimitError: class extends Error {} },
    '@/lib/platformErrors': { capturePlatformError: async input => { state.incident = input; return 'protected-exact-reference'; }, safeFailure: (message, ref, status, extra) => Response.json({ error: message, request_id: ref, ...extra }, { status, headers: { 'X-Request-ID': ref } }) },
    '@/lib/contentModerationServer': { moderatePublicContent: async () => ({ allowed: !state.blocked }) },
    '@/lib/operationalMonitoring': { routeMonitoringProfile: () => ({}), withOperationalMonitoring: (_profile, handler) => handler },
  })('src/app/api/salon/marketing/route.ts');
  const post = body => api.POST(new Request('https://fixture.invalid/api/salon/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const save = () => post({ action: 'save', id, revision: 0, source: source(), copies: core.draftMarketingCopies(snapshot()) });
  return { state, api, post, save };
}
test('generation uses current scoped source data and remains explicitly unsaved and not externally posted', async () => {
  const f = fixture(), response = await f.post({ action: 'generate', source: source() });
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.saved, false); assert.equal(data.external_posting, false); assert.match(data.copies.fr.body, /Maison Étoile/);
  assert.equal(f.state.rows.length, 0); assert.equal(f.state.calls[0].args.p_salon, salon);
});
test('foreign services and media are rejected before caption generation', async () => {
  for (const selected of [{ ...source(), service_id: id }, { ...source(), photo_urls: ['https://fixture.invalid/other-business.jpg'] }]) {
    const f = fixture(), response = await f.post({ action: 'generate', source: selected });
    assert.equal(response.status, 409); const data = await response.json(); assert.equal(data.copies, undefined); assert.equal(data.code, 'MARKETING_SOURCE_CHANGED');
  }
});
test('save reads the exact persisted revision before reporting verified success', async () => {
  const f = fixture(); const response = await f.save(); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.verified, true); assert.equal(body.post.status, 'draft'); assert.equal(body.external_posting, false);
  assert.equal(f.state.calls[0].args.p_actor, actor); assert.equal(f.state.calls[1].table, 'business_marketing_posts');
});
test('GET and known-ID mutations exclude a second business', async () => {
  const f = fixture(); await f.save(); f.state.rows.push({ ...f.state.rows[0], id: promotion, salon_id: 'other', copies: { secret: 'other business' } });
  const response = await f.api.GET(new Request('https://fixture.invalid/api/salon/marketing'));
  assert.equal((await response.json()).posts.length, 1);
  const before = f.state.calls.filter(call => call.name).length;
  assert.equal((await f.post({ ...approve(), id: promotion })).status, 404);
  assert.equal(f.state.calls.filter(call => call.name).length, before);
});
test('owner approval schedules only saved content and cancellation returns a fresh verified state', async () => {
  const f = fixture(); await f.save();
  const approved = await f.post(approve()); assert.equal(approved.status, 200); assert.equal((await approved.json()).post.status, 'scheduled');
  const cancelled = await f.post({ action: 'cancel', id, revision: 2, confirm: true }); assert.equal(cancelled.status, 200); assert.equal((await cancelled.json()).post.status, 'cancelled');
  assert.deepEqual(f.state.calls.find(call => call.name === 'approve_business_marketing_post').args.p_reviewed, core.MARKETING_LOCALES);
});
test('team membership cannot substitute for owner approval and unauthenticated requests are JSON', async () => {
  const f = fixture(); f.state.owner = false; assert.equal((await f.save()).status, 403); assert.equal(f.state.calls.length, 0);
  f.state.denied = true; assert.equal((await f.save()).status, 401); assert.equal(f.state.calls.length, 0);
});
test('moderation, stale source and readback failure never appear as verified success', async () => {
  const f = fixture(); f.state.blocked = true; assert.equal((await f.save()).status, 400); assert.equal(f.state.rows.length, 0);
  f.state.blocked = false; f.state.error = 'MARKETING_STALE'; assert.equal((await f.save()).status, 409);
  f.state.error = null; f.state.readbackFails = true; const response = await f.save(); assert.equal(response.status, 500);
  const body = await response.json(); assert.equal(body.verified, undefined); assert.equal(body.request_id, response.headers.get('X-Request-ID')); assert.equal(f.state.incident.feature, 'business-marketing');
});
test('approval cannot inject new text, external destinations or another business ID', async () => {
  const f = fixture(); await f.save();
  for (const body of [{ ...approve(), copies: {} }, { ...approve(), salon_id: 'another' }, { ...approve(), booking_path: '/another-business' }]) assert.equal((await f.post(body)).status, 400);
  assert.equal(f.state.calls.filter(call => call.name === 'approve_business_marketing_post').length, 0);
});
