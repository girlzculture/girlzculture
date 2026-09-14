import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerCoverageReport } from '../scripts/owner-localization-core.mjs';
const empty = { entries: [] };
const inventory = (source, kind = 'literal', context = 'reviewed') => ({ entries: { one: { source, occurrences: [{ file: 'owner.tsx', kind, context }] } } });
test('new dynamic labels and error literals fail coverage even without an explicit JSX occurrence', () => {
  for (const [copy, kind] of [['Unable to save appointment.', 'literal'], ['Bookings: {value0}', 'template']]) {
    const result = ownerCoverageReport(inventory(copy, kind), {}, empty, empty);
    assert.equal(result.status, 'FAIL'); assert.equal(result.locales['zh-CN'].missing_count, 1);
  }
});
test('a reviewed code value cannot exempt a new UI use or a changed code context', () => {
  const code = { entries: [{ source: 'Authorization', reason: 'Header name', contexts: [{ file: 'owner.tsx', context: 'reviewed' }] }] };
  assert.equal(ownerCoverageReport(inventory('Authorization'), {}, empty, code).excluded_code_count, 1);
  for (const [kind, context] of [['jsx-text', 'reviewed'], ['localized-source', 'reviewed'], ['literal', 'new-owner-label']]) {
    assert.equal(ownerCoverageReport(inventory('Authorization', kind, context), {}, empty, code).status, 'FAIL');
  }
});
