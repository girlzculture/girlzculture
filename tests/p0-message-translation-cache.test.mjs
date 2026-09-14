import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const { bookingMessageTranslation } = typescriptLoader(process.cwd(), {
  '@/lib/aiAutomationServer': { generateTranslationDraft: () => { throw new Error('Provider must not be called'); } },
})('src/lib/bookingMessageTranslationServer.ts');

test('a known same-language message preserves the original without a cache lookup, claim or provider bill in all five locales', async () => {
  for (const locale of ['en', 'fr', 'wo', 'es', 'zh-CN']) {
    const original = '  Sarah — GCABC12 $180 15:30\nhttps://example.test  ';
    const calls = [];
    const admin = { from(table) { calls.push(table); assert.equal(table, 'booking_messages'); const query = { select: () => query, eq: () => query, single: async () => ({ data: { original_body: original, source_locale: locale }, error: null }) }; return query; }, rpc() { throw new Error('No reservation for same-language content'); } };
    const result = await bookingMessageTranslation({ admin, messageId: 'local-message', bookingId: 'local-booking', userId: 'local-user', locale, names: ['Sarah'] });
    assert.equal(result.translated_body, original); assert.equal(result.original, true); assert.deepEqual(calls, ['booking_messages']);
  }
});
