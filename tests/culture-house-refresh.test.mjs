import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Agent, createServer, request } from 'node:http';
import { connectionEnvironment, safeFailure, validateReconciliation, verifyOperationsOnly,
  OPERATIONS_ONLY_PATHS, REFRESH_WORKFLOW, REFRESH_CONFIRMATION, DATABASE_CA, REFRESH_PROCESS_TIMEOUT_MS } from '../scripts/refresh-culture-house.mjs';
import { verifyDispatchContext, MIGRATION_REPOSITORY, MIGRATION_WORKFLOW, MIGRATION_CONFIRMATION } from '../scripts/verify-production-migration-gate.mjs';

const connection = 'postgresql://postgres.cuzfockthsqwubupskui@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

test('fixture mutations use fresh connections while normal reads keep pooling', async () => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const fixture = spawn(process.execPath, ['scripts/start-acceptance-supabase-fixture.mjs'], {
    env: { ...process.env, GIRLZ_CULTURE_ACCEPTANCE_MODE: 'true', PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL: `http://127.0.0.1:${port}` },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  const exited = once(fixture, 'exit');
  const send = (path, version) => new Promise((resolve, reject) => {
    const body = version === undefined ? null : JSON.stringify({ version });
    const req = request({ host: '127.0.0.1', port, path, agent, method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-acceptance-fixture': 'p0-public-policy' } : {} }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', part => { text += part; });
      res.on('end', () => resolve({ status: res.statusCode, connection: res.headers.connection, reused: req.reusedSocket, body: JSON.parse(text) }));
    });
    req.on('error', reject); req.end(body);
  });
  try {
    await new Promise((resolve, reject) => {
      fixture.stdout.on('data', data => { if (data.toString().includes('fixture listening')) resolve(); });
      fixture.once('error', reject); fixture.once('exit', () => reject(Error('Fixture exited before ready')));
    });
    const path = '/__fixtures/p0-public-policy/55000000-0000-4000-8000-000000000001';
    for (const version of [1, 2, null]) {
      const result = await send(path, version);
      assert.equal(result.status, 200); assert.equal(result.body.ok, true);
      assert.equal(result.connection, 'close', 'No idle mutation socket may survive UI interactions');
      assert.equal(result.reused, false, 'Setup, replacement and cleanup each use a fresh socket; no retry');
    }
    assert.equal((await send('/health')).connection, 'keep-alive');
    assert.equal((await send('/health')).reused, true, 'Ordinary application reads still pool');
  } finally {
    agent.destroy(); fixture.kill('SIGTERM'); await exited;
  }
});
test('only reviewed operations files may differ from the tested application', () => {
  verifyOperationsOnly(OPERATIONS_ONLY_PATHS);
  for (const paths of [[], ['src/app/layout.tsx'], ['supabase/migrations/new.sql'], [...OPERATIONS_ONLY_PATHS, 'netlify.toml']])
    assert.throws(() => verifyOperationsOnly(paths), /APPLICATION_SOURCE_CHANGED/);
});
test('uses session routing, certificate verification and environment-only password', () => {
  const result = connectionEnvironment(connection, 'fixture-secret');
  assert.equal(result.PGPORT, '5432'); assert.equal(result.PGSSLMODE, 'verify-full');
  assert.equal(result.PGSSLROOTCERT, DATABASE_CA); assert.equal(result.PGPASSWORD, 'fixture-secret');
});
test('trusts the reviewed public Supabase CA without disabling certificate or hostname validation', () => {
  const pem = readFileSync(DATABASE_CA, 'utf8');
  assert.doesNotMatch(pem, /PRIVATE KEY/);
  const certificate = new X509Certificate(pem);
  assert.equal(certificate.fingerprint256, '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
  assert.equal(certificate.ca, true);
  assert.ok(certificate.verify(certificate.publicKey));
  assert.ok(Date.now() < Date.parse(certificate.validTo));
});
for (const [label, value] of Object.entries({ transactionPool: connection.replace(':5432', ':6543'),
  otherProject: connection.replace('cuzfockthsqwubupskui', 'other'), externalHost: connection.replace('.pooler.supabase.com', '.example.test'),
  embeddedPassword: connection.replace('@', ':secret@'), query: connection + '?sslmode=disable', database: connection.replace('/postgres', '/other'), malformed: 'not-a-url' })) {
  test(`rejects unreviewed connection: ${label}`, () => assert.throws(() => connectionEnvironment(value, 'fixture')));
}
test('requires the existing protected secret', () => assert.throws(() => connectionEnvironment(connection, ''), /DATABASE_SECRET_MISSING/));
test('safe failure permits only SQLSTATE and never error details', () => {
  assert.equal(safeFailure('ERROR:  P0001\nprivate details'), 'P0001');
  assert.equal(safeFailure('ERROR:  57014\nprivate statement context'), '57014');
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
  const sql = readFileSync('scripts/sql/refresh-culture-house.sql', 'utf8');
  const statementSeconds = Number(sql.match(/set local statement_timeout='(\d+)s'/)?.[1]);
  assert.ok(statementSeconds > 0 && statementSeconds <= 300, 'The private refresh remains bounded');
  assert.ok(REFRESH_PROCESS_TIMEOUT_MS > statementSeconds * 1000 + 30_000, 'Allow SQL cancellation, rollback and reconciliation before terminating the client');
  assert.ok(REFRESH_PROCESS_TIMEOUT_MS + 60_000 < workflow.jobs.refresh['timeout-minutes'] * 60_000, 'Keep room for cleanup before the protected job deadline');
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
