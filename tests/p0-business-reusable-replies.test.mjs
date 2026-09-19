import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNodeTypescript } from './helpers/load-node-typescript.mjs';

const load = loadNodeTypescript(process.cwd());
const id = n => `18800000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const salon = id(1), actor = id(2), replyId = id(3), requestId = id(4);
const saved = { id: replyId, salon_id: salon, title: 'Avant votre visite', body: 'Bonjour !\nMerci de venir avec les cheveux démêlés.', source_locale: 'fr', revision: 1, archived_at: null, updated_at: '2026-09-19T12:00:00.000Z' };

test('reusable replies accept an explicit private save without sending or translating its original text', () => {
  const { parseReusableReplyAction } = load('src/lib/businessReusableReplies.ts');
  const body = { action: 'save', id: replyId, request_id: requestId, expected_revision: null, title: saved.title, body: saved.body, source_locale: 'fr' };
  assert.deepEqual(parseReusableReplyAction(body), body);
  for (const extra of [{ salon_id: id(99) }, { send: true }, { customer_id: id(99) }, { translated_body: 'Invented translation' }]) assert.throws(() => parseReusableReplyAction({ ...body, ...extra }), /REPLY_INVALID/);
});

test('reusable reply projection rejects a foreign-business row instead of exposing it to the draft chooser', () => {
  const { projectReusableReplyWorkspace } = load('src/lib/businessReusableReplies.ts');
  const input = { salon_id: salon, rows: [saved], total: 1, offset: 0, page_size: 25, archived: false };
  assert.deepEqual(projectReusableReplyWorkspace(input, salon).rows, [saved]);
  assert.throws(() => projectReusableReplyWorkspace({ ...input, rows: [{ ...saved, salon_id: id(99), body: 'Foreign private reply' }] }, salon), /REPLY_UNAVAILABLE/);
});

test('reusable reply use returns an editable original-language draft only from a current active reply', () => {
  const { reusableReplyDraft } = load('src/lib/businessReusableReplies.ts');
  assert.deepEqual(reusableReplyDraft(saved, salon), { body: saved.body, locale: 'fr' });
  assert.throws(() => reusableReplyDraft({ ...saved, archived_at: '2026-09-19T13:00:00.000Z' }, salon), /REPLY_NOT_FOUND/);
  assert.throws(() => reusableReplyDraft(saved, id(99)), /REPLY_UNAVAILABLE/);
});

test('reply input requires confirmation/revision and preserves text without silently truncating it', () => {
  const { parseReusableReplyAction, parseReusableReplyQuery } = load('src/lib/businessReusableReplies.ts');
  const original = { action: 'save', id: replyId, request_id: requestId, expected_revision: null, title: '  Save  ', body: '  Original\nsecond line  ', source_locale: 'unknown' };
  assert.deepEqual(parseReusableReplyAction(original), original);
  for (const changes of [{ body: 'x'.repeat(2001) }, { body: ' ' }, { title: 'x'.repeat(81) }, { source_locale: 'xx' }, { expected_revision: -1 }, { expected_revision: 1.5 }, { request_id: '' }, { body: 'bad\0text' }]) assert.throws(() => parseReusableReplyAction({ ...original, ...changes }), /REPLY_INVALID/);
  assert.equal(parseReusableReplyAction({ action: 'archive', id: replyId, request_id: requestId, expected_revision: 3, confirm: true }).action, 'archive');
  for (const confirm of [undefined, null, false, 'true']) assert.throws(() => parseReusableReplyAction({ action: 'archive', id: replyId, request_id: requestId, expected_revision: 3, confirm }), /REPLY_INVALID/);
  for (const query of ['offset=-1', 'offset=1.5', 'archived=maybe', 'id=foreign', 'send=true', 'offset=0&offset=25']) assert.throws(() => parseReusableReplyQuery(new URLSearchParams(query)), /REPLY_INVALID/);
});

test('reply projection exposes exact page count and refuses missing, duplicated or mismatched pages', () => {
  const { projectReusableReplyWorkspace } = load('src/lib/businessReusableReplies.ts');
  const rows = Array.from({ length: 25 }, (_, n) => ({ ...saved, id: id(100 + n) }));
  assert.equal(projectReusableReplyWorkspace({ salon_id: salon, rows, total: 26, offset: 0, page_size: 25, archived: false }, salon).total, 26);
  assert.equal(projectReusableReplyWorkspace({ salon_id: salon, rows: [saved], total: 26, offset: 25, page_size: 25, archived: false }, salon).rows.length, 1);
  for (const changes of [{ rows: rows.slice(0, 24) }, { rows: [...rows.slice(0, 24), rows[0]] }, { total: Infinity }, { total: -1 }, { archived: true }, { salon_id: id(99) }]) assert.throws(() => projectReusableReplyWorkspace({ salon_id: salon, rows, total: 26, offset: 0, page_size: 25, archived: false, ...changes }, salon), /REPLY_UNAVAILABLE/);
});

function harness({ permission = () => true, permissionError = false, workspaceOverride, saveError, readbackChange, authError } = {}) {
  const calls = [], incidents = [], rows = new Map([[replyId, { ...saved }]]), attempts = new Map();
  let checks = 0;
  const admin = { async rpc(name, args) {
    calls.push({ name, args }); assert.equal(args.p_salon, salon);
    if (name === 'p0_actor_has_permission') { assert.equal(args.p_user, actor); assert.equal(args.p_permission, 'bookings'); return permissionError ? { error: Error('private provider diagnostic') } : { data: permission(++checks) }; }
    assert.equal(args.p_actor, actor);
    if (name === 'business_reusable_replies_workspace') {
      let selected = [...rows.values()].filter(row => Boolean(row.archived_at) === args.p_archived && (!args.p_id || row.id === args.p_id));
      if (readbackChange && args.p_id) selected = selected.map(readbackChange);
      const value = { salon_id: salon, rows: selected.slice(args.p_offset, args.p_offset + 25), total: selected.length, offset: args.p_offset, page_size: 25, archived: args.p_archived };
      return { data: workspaceOverride ? workspaceOverride(value) : value };
    }
    if (name === 'save_business_reusable_reply') {
      if (saveError) return { error: Error(saveError) };
      const action = args.p_action, key = action.request_id, prior = attempts.get(key);
      if (prior) { assert.deepEqual(prior.action, action); return { data: prior.row }; }
      const current = rows.get(action.id);
      if ((current?.revision || null) !== action.expected_revision) return { error: Error('REPLY_STALE') };
      const next = action.action === 'archive' ? { ...current, archived_at: '2026-09-19T14:00:00Z', revision: current.revision + 1 } : { ...saved, id: action.id, title: action.title, body: action.body, source_locale: action.source_locale, revision: (action.expected_revision || 0) + 1 };
      rows.set(action.id, next); attempts.set(key, { action, row: next }); return { data: next };
    }
    throw Error(`Unexpected RPC ${name}`);
  } };
  const context = { admin, salon: { id: salon }, user: { id: actor }, isOwner: true, teamMember: null };
  const modules = loadNodeTypescript(process.cwd(), {
    '@/lib/supabaseAdmin': { async requireSalonPermission(_request, permission) { assert.equal(permission, 'bookings'); if (authError) throw Error(authError); return context; } },
    '@/lib/requestSecurity': { enforceRateLimit() {}, RateLimitError: class extends Error {} },
    '@/lib/operationalMonitoring': { routeMonitoringProfile() { return {}; }, withOperationalMonitoring(_profile, handler) { return handler; } },
    '@/lib/platformErrors': { async capturePlatformError(value) { incidents.push(value); return { requestId: 'reply-fixture-reference' }; }, safeFailure(error, _reference, status, extra) { return Response.json({ error, request_id: 'reply-fixture-reference', ...extra }, { status }); } },
  });
  const route = modules('src/app/api/salon/reusable-replies/route.ts');
  const api = (method = 'GET', body, params = '') => route[method](new Request(`http://localhost/api/salon/reusable-replies?business_id=${salon}${params}`, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) }));
  return { api, calls, incidents, rows, attempts };
}

test('actual reply route reads only derived business/actor scope and fresh permission before/after projection', async () => {
  const h = harness(), response = await h.api(); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal((await response.json()).rows[0].body, saved.body);
  assert.deepEqual(h.calls.map(call => call.name), ['p0_actor_has_permission', 'business_reusable_replies_workspace', 'p0_actor_has_permission']);
});

test('actual reply route rejects wrong business/customer access and revoked grants without reply disclosure', async () => {
  for (const setup of [{ permission: () => false }, { permission: check => check < 2 }, { authError: 'Forbidden' }, { authError: 'Unauthorized' }]) {
    const h = harness(setup), response = await h.api(), body = await response.json();
    assert.ok([401, 403].includes(response.status)); assert.equal(body.rows, undefined); assert.doesNotMatch(JSON.stringify(body), /Bonjour/);
    if (setup.permission && setup.permission(1) === false) assert.equal(h.calls.length, 1);
  }
  const h = harness(), response = await h.api('GET', undefined, `&business_id=${id(99)}`); assert.equal(response.status, 400); assert.equal(h.calls.length, 0);
});

test('actual reply route rejects foreign/partial provider data and preserves exact incident reference without diagnostics', async () => {
  for (const setup of [{ workspaceOverride: value => ({ ...value, rows: [{ ...saved, salon_id: id(99), body: 'Foreign private body' }] }) }, { workspaceOverride: value => ({ ...value, total: 2 }) }, { permissionError: true }]) {
    const h = harness(setup), response = await h.api(), body = await response.json();
    assert.equal(response.status, 503); assert.equal(body.request_id, 'reply-fixture-reference'); assert.equal(h.incidents.length, 1);
    assert.doesNotMatch(JSON.stringify(body), /Foreign private|provider diagnostic|Bonjour/);
  }
});

test('actual reply route saves and verifies exact body, then replay returns one saved revision with no send path', async () => {
  const h = harness(), action = { action: 'save', id: replyId, request_id: requestId, expected_revision: 1, title: 'Save', body: 'Texto original\nSin enviar.', source_locale: 'es' };
  for (let index = 0; index < 2; index++) { const response = await h.api('POST', action); assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.reply.body, action.body); assert.equal(body.reply.revision, 2); }
  assert.equal(h.attempts.size, 1); assert.equal(h.rows.size, 1);
  assert.ok(h.calls.every(call => ['p0_actor_has_permission', 'business_reusable_replies_workspace', 'save_business_reusable_reply'].includes(call.name)));
});

test('actual reply route refuses stale edits, changed readback, invalid actions and provider failures', async () => {
  const action = { action: 'save', id: replyId, request_id: requestId, expected_revision: 1, title: 'Title', body: 'Private original', source_locale: 'en' };
  const stale = harness(), staleResponse = await stale.api('POST', { ...action, expected_revision: 7 }); assert.equal(staleResponse.status, 409); assert.equal(stale.rows.get(replyId).revision, 1);
  const drift = harness({ readbackChange: row => ({ ...row, body: 'Changed after save' }) }); assert.equal((await drift.api('POST', action)).status, 409);
  const outage = harness({ saveError: 'secret provider details' }); const failure = await outage.api('POST', action); assert.equal(failure.status, 503); assert.doesNotMatch(JSON.stringify(await failure.json()), /secret provider/);
  for (const body of ['{', { ...action, action: 'send' }, { ...action, salon_id: id(99) }, { ...action, translated_body: 'Not requested' }]) { const h = harness(); assert.equal((await h.api('POST', body)).status, 400); assert.equal(h.attempts.size, 0); }
});

test('actual reply archive requires confirmation and fresh use read fails once archived', async () => {
  const h = harness(), response = await h.api('POST', { action: 'archive', id: replyId, request_id: requestId, expected_revision: 1, confirm: true }); assert.equal(response.status, 200);
  assert.equal((await response.json()).reply.revision, 2);
  assert.equal((await h.api('GET', undefined, `&id=${replyId}`)).status, 409);
  const archived = await h.api('GET', undefined, '&archived=true'); assert.equal((await archived.json()).rows.length, 1);
});

test('reusable reply four-locale copy is complete with matching placeholders and translated actions', () => {
  const { REUSABLE_REPLY_COPY_ROWS, reusableReplyCopy } = load('src/i18n/business-reusable-reply-copy.ts');
  assert.equal(new Set(REUSABLE_REPLY_COPY_ROWS.map(row => row[0])).size, REUSABLE_REPLY_COPY_ROWS.length);
  for (const row of REUSABLE_REPLY_COPY_ROWS) { assert.equal(row.length, 4); for (const value of row) { assert.ok(value.trim()); assert.deepEqual(value.match(/\{[^}]+\}/g) || [], row[0].match(/\{[^}]+\}/g) || []); } }
  for (const locale of ['fr', 'es', 'zh-CN']) for (const text of ['Use as draft', 'Archive reply', 'Replace draft']) assert.notEqual(reusableReplyCopy(locale, text), text);
});
