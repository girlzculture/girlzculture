import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const languages = ['en-US', 'fr', 'es', 'zh-Hans'].map(lang => ({ lang, usable_as_target: true, status: 'stable' }));
function setup(handler) {
  const calls = [];
  const load = typescriptLoader(root, {}, { Error, fetch: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/v3/languages?resource=translate_text')) return Response.json(languages);
    if (url.endsWith('/v2/usage')) return Response.json({ character_count: 100, character_limit: 500000 });
    return handler(url, init);
  } });
  return { adapter: load('src/lib/deeplServer.ts'), calls };
}

test('DeepL Free maps every application language explicitly and fails before translation for unsupported Wolof', async () => {
  process.env.DEEPL_AUTH_KEY = 'unit-test-not-a-secret:fx';
  process.env.DEEPL_API_URL = 'https://api-free.deepl.com';
  const { adapter, calls } = setup(() => { throw new Error('Unexpected paid request'); });
  const account = await adapter.deepLAccountStatus();
  assert.deepEqual(JSON.parse(JSON.stringify(account.supportedLocales)), ['en', 'fr', 'es', 'zh-CN']);
  assert.equal(account.remainingCharacters, 499900);
  await assert.rejects(adapter.translateWithDeepL('Hello', 'wo', { reserve: async () => {} }), /DEEPL_LANGUAGE_UNSUPPORTED/);
  assert.equal(calls.some(call => call.url.endsWith('/v2/translate')), false);
});

test('DeepL translation authenticates only to API Free, preserves exact facts and formatting, and reserves before the request', async () => {
  const order = [];
  const { adapter, calls } = setup((_url, init) => {
    order.push('translate');
    const body = JSON.parse(init.body);
    assert.equal(body.target_lang, 'zh-Hans');
    assert.equal(body.preserve_formatting, true);
    return Response.json({ translations: [{ text: body.text[0].replace('Hello', '你好'), billed_characters: 19 }] });
  });
  const source = 'Hello {name}\nGirlz Culture $120 on 2026-09-16 https://example.test/path';
  const result = await adapter.translateWithDeepL(source, 'zh-CN', { reserve: async ({ characters }) => {
    assert.ok(characters >= Array.from(source).length); order.push('reserve');
  } });
  assert.deepEqual(order, ['reserve', 'translate']);
  assert.equal(result.text, source.replace('Hello', '你好'));
  assert.equal(result.billedCharacters, 19);
  for (const call of calls) {
    assert.equal(new URL(call.url).origin, 'https://api-free.deepl.com');
    assert.equal(call.init.headers.Authorization, 'DeepL-Auth-Key unit-test-not-a-secret:fx');
    assert.equal(call.init.redirect, 'error');
  }
});

test('DeepL rejects paid/arbitrary endpoints before exposing a credential', async () => {
  const { adapter, calls } = setup(() => Response.json({}));
  for (const endpoint of ['https://api.deepl.com', 'https://evil.test', 'https://api-free.deepl.com@evil.test']) {
    process.env.DEEPL_API_URL = endpoint;
    await assert.rejects(adapter.deepLAccountStatus(), /DEEPL_FREE_ENDPOINT_REQUIRED/);
  }
  process.env.DEEPL_API_URL = 'https://api-free.deepl.com';
  assert.equal(calls.length, 0);
});

test('DeepL errors are bounded, never include provider bodies, and are not automatically retried', async () => {
  for (const [status, code] of [[403, 'DEEPL_AUTH_FAILED'], [429, 'DEEPL_RATE_LIMIT'], [456, 'DEEPL_QUOTA_EXHAUSTED'], [500, 'DEEPL_UNAVAILABLE']]) {
    const { adapter, calls } = setup(() => new Response('sensitive upstream detail', { status }));
    await assert.rejects(adapter.translateWithDeepL('Hello', 'fr', { reserve: async () => {} }), new RegExp(code));
    assert.equal(calls.filter(call => call.url.endsWith('/v2/translate')).length, 1);
  }
});

test('DeepL rejects altered or duplicated placeholders and does not share translated text across calls', async () => {
  const { adapter } = setup((_url, init) => {
    const text = JSON.parse(init.body).text[0];
    return Response.json({ translations: [{ text: text.replace(/__GC_DL_[A-Z]+__/u, 'changed') }] });
  });
  await assert.rejects(adapter.translateWithDeepL('Pay $120', 'fr', { reserve: async () => {} }), /DEEPL_FACTS_CHANGED/);
});

function governed({ denied = false, kill = false, failed = false } = {}) {
  const tables = [], events = [], reservations = [], calls = [];
  const feature = { feature_key: 'translation_drafts', is_enabled: true, provider_key: 'deepl', model_key: 'deepl-api-free', timeout_ms: 15000 };
  const admin = {
    async rpc(name, args) { reservations.push({ name, args }); return denied ? { error: Error(typeof denied === 'string' ? denied : 'quota') } : { data: 'fixture-reservation' }; },
    from(table) {
      tables.push(table);
      const query = {
        select: () => query, eq: () => query, insert: () => query,
        update(data) { events.push(data); return query; },
        maybeSingle: async () => ({ data: { published_value: kill } }),
        single: async () => ({ data: { id: 'fixture-draft' } }),
        then(resolve) { return Promise.resolve({ data: null }).then(resolve); },
      }; return query;
    },
  };
  const load = typescriptLoader(root, {}, {
    Error,
    process: { env: { DEEPL_AUTH_KEY: 'fixture:fx', AI_APPROVED_PROVIDERS: 'openai,deepl', AI_APPROVED_MODELS: '{"deepl":["deepl-api-free"]}' } },
    fetch: async (url, init) => {
      calls.push(url);
      if (url.includes('/languages?')) return Response.json(languages);
      if (url.endsWith('/usage')) return Response.json({ character_count: 0, character_limit: 500000 });
      assert.equal(reservations.length, 1);
      return failed ? new Response('private provider body', { status: 456 }) : Response.json({ translations: [{ text: JSON.parse(init.body).text[0].replace('Hello', 'Bonjour') }] });
    },
  });
  return { api: load('src/lib/aiAutomationServer.ts'), admin, feature, calls, tables, events, reservations };
}

test('private display translation reserves and audits usage without copying prose into platform editorial drafts', async () => {
  const f = governed();
  const result = await f.api.generateTranslationDraft(f.admin, f.feature, 'actor-A', 'Hello __GC_KEEP_A__', 'fr', { messageDisplay: true });
  assert.equal(result.translatedText, 'Bonjour __GC_KEEP_A__');
  assert.equal(result.draft, null);
  assert.equal(f.tables.includes('ai_generation_drafts'), false);
  assert.equal(f.reservations[0].name, 'reserve_deepl_translation_usage');
  assert.equal(f.reservations[0].args.p_user, 'actor-A');
  assert.equal(f.events.at(-1).outcome, 'completed');
});

test('DeepL cannot serve the owner planner and cannot bypass stop or quota denials', async () => {
  const f = governed();
  assert.equal(f.api.aiProviderSupportsFeature('deepl', 'gc_owner_assistant'), false);
  assert.equal(f.api.aiProviderSupportsFeature('deepl', 'beauty_concierge'), false);
  assert.equal(f.api.aiProviderSupportsFeature('deepl', 'translation_drafts'), true);
  for (const configuration of [{ denied: true }, { kill: true }]) {
    const sample = governed(configuration);
    await assert.rejects(sample.api.generateTranslationDraft(sample.admin, sample.feature, 'actor-A', 'Hello', 'fr'));
    assert.equal(sample.calls.some(url => url.endsWith('/translate')), false);
  }
});

test('failed provider requests retain the reservation and safe failure code without a draft', async () => {
  const f = governed({ failed: true });
  await assert.rejects(f.api.generateTranslationDraft(f.admin, f.feature, 'actor-A', 'Hello', 'fr'), /DEEPL_QUOTA_EXHAUSTED/);
  assert.equal(f.events.at(-1).outcome, 'failed');
  assert.equal(f.events.at(-1).safe_error_code, 'DEEPL_QUOTA_EXHAUSTED');
  assert.equal(f.tables.includes('ai_generation_drafts'), false);
  assert.equal(f.events.some(event => 'estimated_cost_cents' in event || 'input_units' in event), false);
});

test('provider failure responses distinguish unsupported languages, quota and authentication without raw provider content', () => {
  const { translationProviderFailure } = typescriptLoader(root, {}, { Error })('src/lib/translationProviderErrors.ts');
  assert.equal(translationProviderFailure(Error('DEEPL_QUOTA_EXHAUSTED')).status, 429);
  assert.match(translationProviderFailure(Error('DEEPL_QUOTA_EXHAUSTED')).error, /No paid upgrade/);
  assert.equal(translationProviderFailure(Error('DEEPL_LANGUAGE_UNSUPPORTED')).status, 422);
  assert.equal(translationProviderFailure(Error('DEEPL_AUTH_FAILED')).status, 503);
  assert.equal(translationProviderFailure(Error('private detail')), null);
});

test('database quota and rate denials preserve their safe cause before contacting the translation endpoint', async () => {
  for (const code of ['DEEPL_QUOTA_EXHAUSTED', 'DEEPL_RATE_LIMIT', 'DEEPL_ALLOWANCE_UNAVAILABLE']) {
    const f = governed({ denied: code });
    await assert.rejects(f.api.generateTranslationDraft(f.admin, f.feature, 'actor-A', 'Hello', 'fr'), new RegExp(code));
    assert.equal(f.calls.some(url => url.endsWith('/translate')), false);
  }
});
