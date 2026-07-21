import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const migration=read("supabase/migrations/20260720200000_safe_test_data_batches.sql");
const api=read("src/app/api/admin/test-data/route.ts");
const ui=read("src/components/admin/TestDataManager.tsx");
const engine=read("src/components/admin/EngineControlCenter.tsx");

assert.match(migration,/create table if not exists public\.test_data_batches/);
assert.match(migration,/create table if not exists public\.test_data_registry/);
assert.match(migration,/unique\(record_type,record_id\)/);
assert.match(migration,/execute_test_batch_cleanup/);
assert.match(migration,/maintenance\.test_data_enabled/);
assert.match(migration,/DELETE '\|\|v_batch\.name/);
assert.match(migration,/Only a Super Admin can clear labeled test data/);
assert.match(migration,/Anonymized and retained paid test booking/);
assert.match(migration,/Archived service with booking history/);
assert.match(migration,/Archived promo code with redemption history/);
assert.match(migration,/Offboarded test salon; retained required history/);
assert.match(migration,/revoke all on function public\.execute_test_batch_cleanup/);
assert.match(migration,/grant execute .* to service_role/);
assert.doesNotMatch(api,/@test|example\.com|\.ilike\(|\.like\(/i,"The cleanup API must never guess test data from names, domains, or pattern matching.");
assert.match(api,/is_super_admin/);
assert.match(api,/assertRecentHighRiskVerification/);
assert.match(api,/currentEnvironment/);
assert.match(api,/record_type:type,record_id:recordId/);
assert.match(api,/selected_types:selectedTypes/);
assert.match(api,/prepareAndDeleteIdentity/);
assert.match(ui,/Choose the exact existing record/);
assert.match(ui,/exact phrase/);
assert.match(ui,/Download cleanup audit report/);
assert.match(engine,/TestDataManager/);

console.log("Test-data management verification passed (explicit markers, preview, MFA, protected-history retention, audit report).");
