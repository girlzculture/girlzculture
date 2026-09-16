import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

function harness({ denied = false, failed = false, permission = 'engine' } = {}) {
  const incidents = [], calls = [];
  const reference = '44000000-0000-4000-8000-000000000099';
  const admin = { from() { const q = { select: () => q, eq: () => q, single: async () => ({ data: { feature_key: 'translation_drafts' } }) }; return q; } };
  const load = typescriptLoader(process.cwd(), {
    '@/lib/supabaseAdmin': { requireAdminPermission: async (_request, requested) => { assert.equal(requested, permission); if (denied) throw Error('Forbidden'); return { admin, user: { id: 'operator' } }; } },
    '@/lib/requestSecurity': { cleanText: value => String(value || '').trim(), errorResponse: () => Response.json({ error: 'Request rejected' }, { status: 403 }) },
    '@/lib/deeplServer': { deepLAccountStatus: async () => { calls.push('status'); if (failed) throw Error('DEEPL_QUOTA_EXHAUSTED'); return { endpoint: 'https://api-free.deepl.com', characterCount: 10, characterLimit: 500000, supportedLocales: ['fr'] }; } },
    '@/lib/aiAutomationServer': { generateTranslationDraft: async () => { calls.push('translate'); throw Error('DEEPL_LANGUAGE_UNSUPPORTED'); } },
    '@/i18n/catalog': { ENGLISH_MESSAGES: { 'common.hello': 'Hello' }, normalizeLocale: locale => locale },
    '@/i18n/generated-source-messages': { GENERATED_SOURCE_MESSAGES: {} },
    '@/lib/localizationCore': { canGenerateTranslationDraft: () => true },
    'next/cache': { revalidatePath() {} },
    '@/lib/operationalMonitoring': { noteOperationalFailure() {}, withOperationalMonitoring: (_profile, handler) => handler, routeMonitoringProfile() {} },
    '@/lib/platformErrors': { capturePlatformError: async input => { incidents.push(input); return reference; }, safeFailure: (message, id, status, details) => Response.json({ error: `${message} Reference ${id}`, request_id: id, ...details }, { status, headers: { 'X-Request-ID': id, 'Cache-Control': 'private, no-store' } }) },
  }, { Error });
  return { admin, incidents, calls, reference, load };
}

for (const [name, method, body, code, status] of [
  ['ai', 'POST', { action: 'translation_provider_status' }, 'DEEPL_QUOTA_EXHAUSTED', 429],
  ['translations', 'PATCH', { action: 'generate_draft', translation_key: 'common.hello', locale: 'wo' }, 'DEEPL_LANGUAGE_UNSUPPORTED', 422],
]) test(`DeepL ${name} failure is JSON, actionable, and linked to its exact protected incident`, async () => {
  const f = harness({ failed: true, permission: name === 'ai' ? 'engine' : 'content' }); const route = f.load(`src/app/api/admin/engine/${name}/route.ts`);
  const response = await route[method](new Request(`http://localhost/api/admin/engine/${name}`, { method, body: JSON.stringify(body) }));
  const result = await response.json();
  assert.equal(response.status, status); assert.equal(result.code, code);
  assert.equal(result.request_id, f.reference); assert.equal(response.headers.get('X-Request-ID'), f.reference);
  assert.ok(result.error.includes(f.reference)); assert.equal(f.incidents.length, 1);
  assert.equal(f.incidents[0].admin, f.admin); assert.equal(f.incidents[0].actorId, 'operator');
  assert.equal(f.incidents[0].metadata.failure_code, code);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('only Engine-authorized operators can inspect DeepL account metadata', async () => {
  const f = harness({ denied: true }); const route = f.load('src/app/api/admin/engine/ai/route.ts');
  const response = await route.POST(new Request('http://localhost/api/admin/engine/ai', { method: 'POST', body: JSON.stringify({ action: 'translation_provider_status' }) }));
  assert.equal(response.status, 403); assert.deepEqual(f.calls, []);
});

test('the DeepL status route returns only nonsecret quota and language metadata', async () => {
  const f = harness(); const route = f.load('src/app/api/admin/engine/ai/route.ts');
  const response = await route.POST(new Request('http://localhost/api/admin/engine/ai', { method: 'POST', body: JSON.stringify({ action: 'translation_provider_status' }) }));
  const result = await response.json(); assert.equal(response.status, 200);
  assert.deepEqual(result.status.supportedLocales, ['fr']); assert.equal(result.status.characterCount, 10);
  assert.deepEqual(Object.keys(result.status).sort(), ['characterCount', 'characterLimit', 'endpoint', 'supportedLocales']);
});
