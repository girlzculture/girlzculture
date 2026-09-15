import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const root = process.cwd();

test('service results become a concise conversational answer instead of a raw vertical record dump', () => {
  const { presentAssistantResult } = typescriptLoader(root)('src/lib/gcAssistantPresentation.ts');
  const services = Array.from({ length: 16 }, (_, index) => ({
    id: `private-id-${index}`,
    name: `Service ${index + 1}`,
    base_price: 100 + index,
    duration_min_hours: 2,
    duration_max_hours: 2,
    is_draft: false,
  }));
  const answer = presentAssistantResult('get_services_and_prices', { services, total: 16, currency: 'USD' }, 'en');

  assert.match(answer.message, /16 services/i);
  assert.match(answer.message, /Service 1/);
  assert.doesNotMatch(answer.message, /private-id|base_price|Current business information/);
  assert.ok(answer.message.length < 700, 'The chat bubble must stay concise even when the business has many services');
  assert.equal(answer.details, undefined, 'A service quick action must not restore the raw recursive dump behind the answer');
});

test('the assistant composer uses an icon microphone with live interim transcription and a ten-minute ceiling', () => {
  const source = readFileSync('src/components/owner/AssistantDictation.tsx', 'utf8');
  const assistant = readFileSync('src/components/owner/GcAssistant.tsx', 'utf8');

  assert.doesNotMatch(source, />\{t\(listening \? "Stop dictation" : "Dictate a request"\)\}</);
  assert.match(source, /aria-label=/);
  assert.match(source, /continuous\s*=\s*true/);
  assert.match(source, /interimResults\s*=\s*true/);
  assert.match(source, /600_000/);
  assert.doesNotMatch(assistant, /turn\.notice \|\| "Current business information"/);
});
