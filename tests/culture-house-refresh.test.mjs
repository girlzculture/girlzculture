import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connectionEnvironment, safeFailure, validateReconciliation, verifyOperationsOnly,
  OPERATIONS_ONLY_PATHS, REFRESH_WORKFLOW, REFRESH_CONFIRMATION } from '../scripts/refresh-culture-house.mjs';
import { verifyDispatchContext, MIGRATION_REPOSITORY, MIGRATION_WORKFLOW, MIGRATION_CONFIRMATION } from '../scripts/verify-production-migration-gate.mjs';

const connection = 'postgresql://postgres.cuzfockthsqwubupskui@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
test('only reviewed operations files may differ from the tested application', () => {
  verifyOperationsOnly(OPERATIONS_ONLY_PATHS);
  for (const paths of [[], ['src/app/layout.tsx'], ['supabase/migrations/new.sql'], [...OPERATIONS_ONLY_PATHS, 'netlify.toml']])
    assert.throws(() => verifyOperationsOnly(paths), /APPLICATION_SOURCE_CHANGED/);
});
test('uses session routing, certificate verification and environment-only password', () => {
  const result = connectionEnvironment(connection, 'fixture-secret');
  assert.equal(result.PGPORT, '5432'); assert.equal(result.PGSSLMODE, 'verify-full');
  assert.equal(result.PGSSLROOTCERT, 'system'); assert.equal(result.PGPASSWORD, 'fixture-secret');
});
for (const [label, value] of Object.entries({ transactionPool: connection.replace(':5432', ':6543'),
  otherProject: connection.replace('cuzfockthsqwubupskui', 'other'), externalHost: connection.replace('.pooler.supabase.com', '.example.test'),
  embeddedPassword: connection.replace('@', ':secret@'), query: connection + '?sslmode=disable', database: connection.replace('/postgres', '/other'), malformed: 'not-a-url' })) {
  test(`rejects unreviewed connection: ${label}`, () => assert.throws(() => connectionEnvironment(value, 'fixture')));
}
test('requires the existing protected secret', () => assert.throws(() => connectionEnvironment(connection, ''), /DATABASE_SECRET_MISSING/));
test('safe failure permits only SQLSTATE and never error details', () => {
  assert.equal(safeFailure('ERROR:  P0001\nprivate details'), 'P0001');
  assert.equal(safeFailure('password authentication failed for user secret'), 'UNCLASSIFIED');
});
test('requires reconciliation rather than treating process success as proof', () => {
  const good = { passed: true, sample: true, counts: { clients: 480, bookings: 3076, services: 6, products: 4 },
    checks: Object.fromEntries(Array.from({ length: 16 }, (_, n) => [`check${n}`, true])) };
  assert.equal(validateReconciliation(JSON.stringify(good)).passed, true);
  for (const bad of [{ ...good, passed: false }, { ...good, checks: {} }, { ...good, checks: { ...good.checks, isolated: false } },
    { ...good, counts: { ...good.counts, bookings: 526 } }, { ...good, counts: { ...good.counts, clients: 1 } }])
    assert.throws(() => validateReconciliation(JSON.stringify(bad)), /REFRESH_READBACK_FAILED/);
  assert.throws(() => validateReconciliation(''), /REFRESH_READBACK_INVALID/);
});
test('existing migration gate still rejects the refresh dispatch by default', () => {
  const sha = 'a'.repeat(40), env = { GITHUB_REPOSITORY: MIGRATION_REPOSITORY, GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main', MIGRATION_CONFIRMATION: REFRESH_CONFIRMATION, GITHUB_SHA: sha,
    GITHUB_WORKFLOW_SHA: sha, GITHUB_WORKFLOW_REF: `${MIGRATION_REPOSITORY}/${REFRESH_WORKFLOW}@refs/heads/main`, GITHUB_TOKEN: 'fixture' };
  assert.throws(() => verifyDispatchContext(env, sha));
  assert.equal(verifyDispatchContext(env, sha, { workflowPath: REFRESH_WORKFLOW, confirmation: REFRESH_CONFIRMATION }), sha);
  assert.throws(() => verifyDispatchContext({ ...env, GITHUB_REF: 'refs/heads/other' }, sha, { workflowPath: REFRESH_WORKFLOW, confirmation: REFRESH_CONFIRMATION }));
  assert.equal(verifyDispatchContext({ ...env, MIGRATION_CONFIRMATION, GITHUB_WORKFLOW_REF: `${MIGRATION_REPOSITORY}/${MIGRATION_WORKFLOW}@refs/heads/main` }, sha), sha);
});
test('protected workflow has one explicit same-tenant operation, no migrations or deploys', () => {
  const yaml = createRequire(import.meta.url)('js-yaml');
  const workflow = yaml.load(readFileSync(REFRESH_WORKFLOW, 'utf8'));
  assert.equal(workflow.jobs.refresh.environment, 'production-database');
  assert.equal(workflow.jobs.refresh.concurrency.group, 'girlz-culture-production-database');
  assert.equal(workflow.jobs.refresh.concurrency['cancel-in-progress'], false);
  assert.match(workflow.jobs.refresh.if, /refs\/heads\/main/);
  const commands = workflow.jobs.refresh.steps.map(s => s.run ?? '').join('\n');
  assert.equal(commands.split('node scripts/refresh-culture-house.mjs --apply').length - 1, 1);
  assert.doesNotMatch(commands, /db push|migration repair|netlify deploy|--prod/);
});
test('SQL retains atomic compare-and-set, login, reconciliation and isolation guards', () => {
  const sql = readFileSync('scripts/sql/refresh-culture-house.sql', 'utf8');
  for (const expected of ['begin isolation level repeatable read;', 'commit;', "set local lock_timeout='5s'", "set local timezone='America/New_York'",
    'c781503f-dcf0-409c-9ea9-3e5d6638b6e3', '2e60809e-e0c5-44fe-8f30-44ef9c993d08', 'w.seed_version=1 and w.seeded_at=v_expected',
    'CULTURE_HOUSE_EXISTING_HISTORY_CHANGED', 'CULTURE_HOUSE_IDENTITY_NOT_PRESERVED', 'CULTURE_HOUSE_PLATFORM_TOTALS_CHANGED', 'CULTURE_HOUSE_RECONCILIATION_FAILED',
    'REVIEWED_MIGRATION_INVENTORY_CHANGED']) assert.ok(sql.includes(expected), expected);
  assert.doesNotMatch(sql, /disable trigger|session_replication_role|alter role|alter system|update auth\.users/i);
});
