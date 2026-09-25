import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyProductionMigrationGate } from './verify-production-migration-gate.mjs';

// Reviewed assistant correction, already verified before the operational change.
export const RELEASE_SOURCE = '5ec6c091d70492d0cc1c670be03f1bd353392cbf';
export const REFRESH_PROCESS_TIMEOUT_MS = 360_000;
export const REFRESH_WORKFLOW = '.github/workflows/culture-house-refresh.yml';
export const REFRESH_CONFIRMATION = 'REFRESH EXISTING CULTURE HOUSE';
// Public Supabase production CA, as used by Supabase Studio's certificate download.
// https://supabase.com/docs/guides/database/psql requires this CA for verify-full.
export const DATABASE_CA = fileURLToPath(new URL('./certificates/supabase-prod-ca-2021.crt', import.meta.url));
export const OPERATIONS_ONLY_PATHS = [REFRESH_WORKFLOW, 'scripts/refresh-culture-house.mjs',
  'scripts/start-acceptance-supabase-fixture.mjs',
  'scripts/certificates/supabase-prod-ca-2021.crt',
  'tests/browser/founder-discovery-corrections.spec.ts',
  'scripts/sql/refresh-culture-house.sql', 'scripts/verify-production-migration-gate.mjs',
  'tests/culture-house-refresh.test.mjs'].sort();
const PROJECT = 'cuzfockthsqwubupskui';
function requireThat(condition, code) { if (!condition) throw new Error(code); }

export function verifyOperationsOnly(changedPaths) {
  requireThat(changedPaths.length > 0 && changedPaths.every(p => OPERATIONS_ONLY_PATHS.includes(p)), 'APPLICATION_SOURCE_CHANGED');
}

// Link metadata contains only connection routing. The secret stays in the
// protected runner environment and never appears in argv, SQL, logs or artifacts.
export function connectionEnvironment(link, password) {
  let url;
  try { url = new URL(link.trim()); } catch { throw new Error('INVALID_LINK_METADATA'); }
  requireThat(url.protocol === 'postgresql:' && !url.password && !url.search && !url.hash
    && url.username === `postgres.${PROJECT}` && url.pathname === '/postgres'
    && url.port === '5432' && /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname), 'UNREVIEWED_DATABASE_CONNECTION');
  requireThat(typeof password === 'string' && password.length > 0, 'DATABASE_SECRET_MISSING');
  return { PGHOST: url.hostname, PGPORT: '5432', PGUSER: url.username, PGDATABASE: 'postgres',
    PGPASSWORD: password, PGSSLMODE: 'verify-full', PGSSLROOTCERT: DATABASE_CA, PGCONNECT_TIMEOUT: '15',
    PGAPPNAME: 'culture-house-reviewed-refresh' };
}

export function safeFailure(stderr) {
  // psql VERBOSITY=sqlstate omits exception detail/context, and this allowlist
  // further excludes connection strings, passwords and any database record.
  return stderr.match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5})(?:\s|$)/)?.[1] ?? 'UNCLASSIFIED';
}

export function validateReconciliation(output) {
  let result;
  try { result = JSON.parse(output.trim()); } catch { throw new Error('REFRESH_READBACK_INVALID'); }
  requireThat(result?.passed === true && result.sample === true && result.counts?.clients === 480
    && result.counts.bookings >= 2500 && result.counts.services === 6 && result.counts.products === 4
    && Object.keys(result.checks ?? {}).length >= 16 && Object.values(result.checks).every(v => v === true), 'REFRESH_READBACK_FAILED');
  return { passed: true, counts: result.counts, checks: result.checks };
}

export async function main(env = process.env) {
  requireThat(['--preflight', '--apply'].includes(process.argv[2]), 'EXPLICIT_OPERATION_REQUIRED');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const checkoutSha = git('rev-parse', 'HEAD');
  verifyOperationsOnly(git('diff', '--name-only', RELEASE_SOURCE, checkoutSha).split('\n'));
  const proof = await verifyProductionMigrationGate({ env, checkoutSha,
    workflowPath: REFRESH_WORKFLOW, confirmation: REFRESH_CONFIRMATION });
  console.log(`Protected refresh source ${checkoutSha}; unchanged application ${RELEASE_SOURCE}; passing main CI ${proof.url}`);
  if (process.argv[2] === '--preflight') return;
  const connection = connectionEnvironment(readFileSync('supabase/.temp/pooler-url', 'utf8'), env.SUPABASE_DB_PASSWORD);
  const result = spawnSync('psql', ['-X', '-qAt', '--set', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=sqlstate'], {
    input: readFileSync('scripts/sql/refresh-culture-house.sql', 'utf8'), encoding: 'utf8',
    env: { PATH: env.PATH, HOME: env.HOME, ...connection }, timeout: REFRESH_PROCESS_TIMEOUT_MS, maxBuffer: 1024 * 1024,
  });
  requireThat(result.status === 0, `REFRESH_FAILED_SQLSTATE_${safeFailure(result.stderr ?? '')}_READ_BACK_BEFORE_RETRY`);
  const reconciliation = validateReconciliation(result.stdout);
  const receipt = { sourceCommit: checkoutSha, applicationCommit: RELEASE_SOURCE,
    verifiedAt: new Date().toISOString(), mainCi: proof.url, committed: true, ...reconciliation };
  console.log(JSON.stringify(receipt));
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `Culture House refresh committed and reconciled.\n\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\`\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
