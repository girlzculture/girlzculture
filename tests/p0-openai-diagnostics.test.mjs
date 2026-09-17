import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const diagnostic = (base = 'https://api.openai.com') => typescriptLoader(process.cwd(), {}, {
  TextDecoder, process: { env: { OPENAI_BASE_URL: base } },
})('src/lib/openAiServer.ts').openAiHttpFailure;

test('provider diagnostics exclude arbitrary body, header and prototype values', async () => {
  for (const body of ['<html>secret response</html>', JSON.stringify({ error: { code: '__proto__', message: 'sk-private secret' } })]) {
    assert.equal(await diagnostic()(new Response(body, { status: 502, headers: { 'X-Request-ID': 'secret-header' } })), 'OPENAI_DIRECT_HTTP_502_OTHER');
  }
  assert.equal(await diagnostic('https://gateway.example.test/team/site')(Response.json({ error: { code: 'invalid_json_schema' } }, { status: 400 })), 'OPENAI_COMPATIBLE_HTTP_400_SCHEMA');
});

test('diagnostics stop reading oversized errors and never classify a trailing private payload', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(16_385))); }, cancel() { cancelled = true; } });
  assert.equal(await diagnostic()(new Response(body, { status: 500 })), 'OPENAI_DIRECT_HTTP_500_OTHER');
  assert.equal(cancelled, true);
});

test('a schema rejection with a null provider code is categorized without storing the schema echo', async () => {
  const body = { error: { code: null, message: 'Invalid schema for response_format: PRIVATE SCHEMA CONTENT' } };
  assert.equal(await diagnostic()(Response.json(body, { status: 400 })), 'OPENAI_DIRECT_HTTP_400_SCHEMA');
});
