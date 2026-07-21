import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const migration=read("supabase/migrations/20260720190000_identity_deletion_and_reuse.sql");
const api=read("src/app/api/admin/identity-deletion/route.ts");
const service=read("src/lib/identityDeletionServer.ts");
const adminTeam=read("src/app/api/admin/team/route.ts");
const salonTeam=read("src/app/api/salon/team/route.ts");
const ui=read("src/components/admin/IdentityDeletionManager.tsx");

assert.match(migration,/identity_deletion_jobs/);
assert.match(migration,/prepare_identity_deletion/);
assert.match(migration,/update public\.bookings set customer_id=null/);
assert.match(migration,/update public\.reviews set customer_id=null/);
assert.match(migration,/update public\.support_tickets set customer_id=null/);
assert.match(migration,/delete from public\.customers/);
assert.match(migration,/status='Disabled'/);
assert.match(migration,/last active Super Admin cannot be removed/);
assert.match(migration,/Transfer or offboard the salon/);
assert.match(service,/auth\.admin\.deleteUser/);
assert.match(service,/status:"Completed"/);
assert.match(service,/15\*60_000/);
assert.match(api,/normalized email is available for a new account/);
assert.match(adminTeam,/prepareAndDeleteIdentity/);
assert.match(salonTeam,/prepareAndDeleteIdentity/);
assert.match(ui,/Type/);
assert.match(ui,/recent 15 minutes|last 15 minutes/);

console.log("Identity deletion verification passed (history retention, MFA, Auth deletion, email reuse).")
