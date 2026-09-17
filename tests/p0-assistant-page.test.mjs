import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const { assistantPageFromPath, ASSISTANT_PAGES } = typescriptLoader(process.cwd())('src/lib/assistantPageContext.ts');

test('all dashboard sections are recognized without sending record IDs or arbitrary URLs', () => {
  assert.equal(assistantPageFromPath('/salon/dashboard'), 'overview');
  for (const section of ASSISTANT_PAGES) assert.equal(assistantPageFromPath(`/salon/dashboard/${section}`), section);
  assert.equal(assistantPageFromPath('/salon/dashboard/bookings/private-id'), 'bookings');
  for (const path of [null, '/admin', '/salon/dashboard-evil', '/salon/dashboard/unknown', '/salon/dashboard/bookings?private=1', '/salon/dashboard/bookings#private']) assert.equal(assistantPageFromPath(path), null);
});
