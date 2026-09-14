import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load = typescriptLoader(process.cwd());
const { currentBusinessPolicy } = load('src/lib/businessPolicyServer.ts');
const { POLICY_DEFAULTS } = load('src/lib/businessPolicyCore.ts');
function client(results) {
  const calls = [];
  return { calls, from: table => {
    calls.push(table); const query = {};
    for (const method of ['select', 'eq', 'not']) query[method] = () => query;
    query.single = query.maybeSingle = async () => results[table]; return query;
  } };
}
test('missing businesses and businesses without published policies have no disclosure', async () => {
  for (const data of [null, { business_policy_revision_id: null }]) {
    const admin = client({ salons: { data, error: null } });
    assert.equal(await currentBusinessPolicy(admin, 'local-fixture'), null);
    assert.deepEqual(admin.calls, ['salons']);
  }
});
test('policy lookup failures are not concealed as an absent policy', async () => {
  const error = new Error('local database unavailable');
  await assert.rejects(currentBusinessPolicy(client({ salons: { data: null, error } }), 'local-fixture'), /local database unavailable/);
});
test('a published policy retains its exact revision and original notes', async () => {
  const revision = { id: 'published-local', version: 3, source_locale: 'fr', policy: { ...POLICY_DEFAULTS, notes: 'Original GC123 $180' } };
  const admin = client({ salons: { data: { business_policy_revision_id: revision.id }, error: null }, business_policy_revisions: { data: revision, error: null } });
  assert.equal(JSON.stringify(await currentBusinessPolicy(admin, 'local-fixture')), JSON.stringify(revision));
});
