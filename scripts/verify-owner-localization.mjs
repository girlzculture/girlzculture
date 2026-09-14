import fs from 'node:fs';
import assert from 'node:assert/strict';
import { typescriptLoader } from '../tests/helpers/load-typescript.mjs';
import { ownerCoverageReport } from './owner-localization-core.mjs';
const inventory = JSON.parse(fs.readFileSync('docs/owner-translation-inventory.json', 'utf8'));
const exceptions = JSON.parse(fs.readFileSync('docs/owner-translation-allowlist.json', 'utf8'));
const codeLiterals = JSON.parse(fs.readFileSync('docs/owner-code-literals.json', 'utf8'));
const { DASHBOARD_SOURCE_MESSAGES: catalogs } = typescriptLoader(process.cwd())('src/i18n/dashboard-source-catalog.ts');
const report = ownerCoverageReport(inventory, catalogs, exceptions, codeLiterals);
const output = JSON.stringify(report, null, 2) + '\n';
if (process.argv.includes('--write')) fs.writeFileSync('docs/owner-translation-coverage.json', output);
for (const [locale, row] of Object.entries(report.locales)) console.log(`${locale}: ${row.covered}/${row.source_count} inventoried UI sources covered; ${row.missing_count} missing.`);
if (!process.argv.includes('--write')) {
  assert.equal(fs.readFileSync('docs/owner-translation-coverage.json', 'utf8'), output, 'Owner coverage report is stale; regenerate and review the inventory.');
  assert.equal(report.status, 'AUTOMATED ONLY', 'Owner first-party copy has missing translations; do not waive these as proper names.');
}
