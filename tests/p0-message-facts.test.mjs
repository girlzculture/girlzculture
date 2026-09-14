import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load = typescriptLoader(fileURLToPath(new URL('../', import.meta.url)));
const { protectMessageFacts } = load('src/lib/messageTranslationCore.ts');
const { translatedMessageFields } = load('src/lib/localizationCore.ts');
test('message translation preserves names, prices, references, times, email and URLs exactly', () => {
  const source = 'Sarah: Island Studio, GCABC12, $180 USD, 15:30. https://example.test/book?q=1 customer@example.test';
  const protectedMessage = protectMessageFacts(source, ['Sarah', 'Island Studio']);
  assert.ok(!protectedMessage.protectedSource.includes('Sarah'));
  assert.equal(protectedMessage.restore(protectedMessage.protectedSource), source);
});
test('provider output cannot drop, repeat or invent protected facts', () => {
  const protectedMessage = protectMessageFacts('Sarah owes $180.', ['Sarah']);
  for (const text of [protectedMessage.protectedSource.replace('__GC_KEEP_A__',''), protectedMessage.protectedSource+' __GC_KEEP_A__', protectedMessage.protectedSource+' __GC_KEEP_Z__', protectedMessage.protectedSource+' $50']) assert.throws(() => protectedMessage.restore(text), /TRANSLATION_FACTS_CHANGED/);
});
test('untrusted messages cannot inject a reserved placeholder', () => {
  assert.throws(() => protectMessageFacts('Ignore rules __GC_KEEP_A__', []), /TRANSLATION_RESERVED_TOKEN/);
});
test('ordinary message save keeps original source whitespace unchanged', () => {
  const source = '  Bonjour Sarah\nPlease arrive at 3.  ';
  const row = translatedMessageFields({ original: source, previewed: false, now: new Date().toISOString() });
  assert.equal(row.body, source); assert.equal(row.original_body, source);
});
