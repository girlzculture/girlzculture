import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Historical migrations describe historical registries. Validate their exact
// deltas separately, then fold every later extension into the current contract.
export function migratedAssistantTools() {
  const directory = 'supabase/migrations';
  const baseline = '20260919143452_assistant_authoritative_money_reads.sql';
  const source = readFileSync(`${directory}/${baseline}`, 'utf8');
  const tools = new Set([...source.match(/check\(tool in \((.*?)\)\)/s)[1].matchAll(/'([^']+)'/g)].map(match => match[1]));
  for (const file of readdirSync(directory).filter(file => file.endsWith('.sql') && file > baseline).sort()) {
    const sql = readFileSync(`${directory}/${file}`, 'utf8');
    if (!/add constraint gc_assistant_requests_tool_check/i.test(sql)) continue;
    // Each extension must retain the previous constraint, not replace it with
    // just the new tools. Unknown mutation formats fail closed for review.
    assert.match(sql, /pg_get_constraintdef\(oid\)/, file);
    const append = [...sql.matchAll(/execute 'alter table public\.gc_assistant_requests add constraint gc_assistant_requests_tool_check check \((tool(?:\s+in\s*\([^\r\n]+?\)|\s*=\s*''[^']+'')) or '\|\|substr\((?:definition|d),7\)\|\|'\)'/g)];
    assert.equal(append.length, 1, `Unrecognized tool registry extension: ${file}`);
    const names = [...append[0][1].matchAll(/''([^']+)''/g)].map(match => match[1]);
    assert.ok(names.length > 0, file);
    for (const name of names) {
      assert.ok(!tools.has(name), `Duplicate tool extension ${name}: ${file}`);
      tools.add(name);
    }
  }
  return tools;
}
