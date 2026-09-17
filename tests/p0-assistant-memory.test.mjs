import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {typescriptLoader} from './helpers/load-typescript.mjs';

const {selectMemoryContext: selectFromVm, validateMemoryInput} = typescriptLoader(fileURLToPath(new URL('../', import.meta.url)))('src/lib/assistantMemoryCore.ts');
// The TypeScript loader executes in a VM. Compare values in this test realm.
const selectMemoryContext = (...args) => Array.from(selectFromVm(...args));
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const safe = {id, tool:'get_services_and_prices', permission:'styles', risk_class:1, failure_code:null};

test('memory has explicit opt-in, a fixed retention window, and no free-text storage contract', () => {
  const value = {consent:true, locale:'es', request_ids:[id]};
  assert.deepEqual(validateMemoryInput(value), value);
  for (const invalid of [{...value,consent:false}, {...value,text:'private customer disclosure'}, {...value,expires_at:'2100-01-01'}, {...value,request_ids:Array(7).fill(id)}, {...value,locale:'other'}]) {
    assert.throws(() => validateMemoryInput(invalid), /ASSISTANT_INVALID_INPUT/);
  }
});

test('memory stores only scoped successful public-business topic references, never customer or write context', () => {
  assert.deepEqual(selectMemoryContext([safe], [id], new Set(['styles'])), [id]);
  for (const row of [{...safe,tool:'get_customers'}, {...safe,tool:'get_booking_messages'}, {...safe,tool:'prepare_service',risk_class:3}, {...safe,failure_code:'FAILED'}]) {
    assert.deepEqual(selectMemoryContext([row], [id], new Set(['styles','bookings'])), []);
  }
});

test('restoring drops revoked, absent and other-actor references rather than trusting client history', () => {
  assert.deepEqual(selectMemoryContext([safe], [id,second], new Set()), []);
  assert.deepEqual(selectMemoryContext([safe], [second], new Set(['styles'])), []);
  assert.deepEqual(selectMemoryContext([safe], [id,id], new Set(['styles'])), [id]);
});
