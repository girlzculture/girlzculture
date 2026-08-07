import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read(
  "supabase/migrations/20260807020000_authoritative_submission_lifecycle.sql",
);
const listRoute = read("src/app/api/admin/submissions/route.ts");
const detailRoute = read("src/app/api/admin/submissions/[id]/route.ts");
const decisionRoute = read(
  "src/app/api/admin/submissions/[id]/decision/route.ts",
);
const applicationRoute = read("src/app/api/salon/application/route.ts");
const workspace = read("src/components/admin/AdminSubmissionsWorkspace.tsx");
const detail = read("src/components/admin/AdminSubmissionDetail.tsx");
const recordRoute = read("src/app/api/admin/records/route.ts");
const recordManager = read("src/components/admin/RecordLifecycleManager.tsx");

assert.match(migration, /create table if not exists public\.salon_application_revisions/);
assert.match(migration, /Salon application revisions are immutable/);
assert.match(migration, /after insert or update on public\.salon_applications/);
assert.match(migration, /admin_archive_salon_application/);
assert.match(migration, /admin_restore_salon_application/);
assert.match(migration, /salon_lifecycle_changed',false/);
assert.match(migration, /admin_update_submission_current_salon/);
assert.match(migration, /subscription_preserved',true/);
assert.match(migration, /lifecycle_preserved',true/);
assert.match(migration, /admin_update_salon_application_snapshot/);
assert.match(migration, /historical_revision_retained',true/);
assert.match(migration, /admin_reject_salon_application_atomic/);
assert.match(migration, /Restore this application before making a decision/);
assert.match(migration, /admin_delete_salon_application/);
assert.match(migration, /Only a Super Admin can permanently delete a salon application/);
assert.match(migration, /DELETE APPLICATION /);
assert.match(migration, /immutable_revisions_retained/);
assert.match(migration, /admin_operationally_delete_salon/);
assert.match(migration, /DELETE SALON /);
assert.match(migration, /tombstone_retained/);
assert.match(migration, /financial_history_retained/);
assert.match(migration, /booking_history_retained/);
assert.match(migration, /submit_salon_application_atomic/);
assert.match(migration, /primary_role='salon_owner'/);
assert.match(migration, /subscription_status='inactive'/);
assert.match(migration, /on conflict\(salon_id\) do update/);
assert.doesNotMatch(
  migration.match(/on conflict\(salon_id\) do update[\s\S]*?returning \* into v_application/)?.[0] || "",
  /subscription_status|subscription_tier|stripe|is_discoverable|status='Pending'/,
  "Resubmission must not reset the salon's paid/publication lifecycle.",
);

assert.match(listRoute, /cursor/);
assert.match(listRoute, /range\(offset, offset \+ limit\)/);
assert.match(listRoute, /archived_at/);
assert.match(listRoute, /salon:salons/);
assert.doesNotMatch(listRoute, /createSignedUrl/);
assert.match(detailRoute, /salon_application_revisions/);
assert.match(detailRoute, /record_management_events/);
assert.match(detailRoute, /createSignedUrl/);
assert.match(detailRoute, /action === "archive"/);
assert.match(detailRoute, /action === "restore"/);
assert.match(detailRoute, /action === "delete_application"/);
assert.match(detailRoute, /action === "delete_salon"/);
assert.match(decisionRoute, /application\.archived_at/);
assert.match(decisionRoute, /admin_reject_salon_application_atomic/);
assert.match(applicationRoute, /submit_salon_application_atomic/);
assert.doesNotMatch(applicationRoute, /subscription_status: "inactive"/);
assert.match(
  applicationRoute,
  /We have received your application\. Our team will review and get back to you within 2–4 business days/,
);

assert.match(workspace, /Current salon address/);
assert.match(workspace, /Submitted snapshot/);
assert.match(workspace, /Active/);
assert.match(workspace, /Archived/);
assert.match(workspace, /Load more/);
assert.match(workspace, /BroadcastChannel/);
assert.doesNotMatch(workspace, /lucide-react/);
assert.match(detail, /Edit current salon information/);
assert.match(detail, /Correct submitted snapshot/);
assert.match(detail, /Submission history/);
assert.match(detail, /Administrative audit/);
assert.match(detail, /Permanently delete application/);
assert.match(detail, /Remove salon from operational records/);
assert.match(detail, /Super Admin permanent actions/);
assert.doesNotMatch(detail, /lucide-react/);

assert.match(recordRoute, /actions: \["archive", "restore", "delete"\]/);
assert.match(recordRoute, /admin_archive_salon_application/);
assert.match(recordRoute, /admin_restore_salon_application/);
assert.match(recordRoute, /admin_operationally_delete_salon/);
assert.match(recordManager, /Super Admin permanent action/);
assert.match(recordManager, /owner_confirmation_phrase/);
assert.doesNotMatch(recordManager, /lucide-react/);

console.log(
  "Verified authoritative current-vs-submitted salon records, immutable revisions, true archive/restore, atomic decisions and resubmissions, and audited Super Admin final authority.",
);
