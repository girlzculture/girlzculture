import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const classifierSource = read("src/lib/supportTicketClassification.ts");
const classifier = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(classifierSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64")}`
);

assert.equal(classifier.isComplaintSupportTicket({ complaint_id: "complaint-1", category: "Support" }), true);
assert.equal(classifier.isComplaintSupportTicket({ complaint_id: null, category: "Complaint" }), true);
assert.equal(classifier.isComplaintSupportTicket({ complaint_id: null, category: "Account access" }), false);
assert.match(classifier.complaintSupportTicketFilter, /complaint_id\.not\.is\.null/);
assert.match(classifier.complaintSupportTicketFilter, /category\.ilike\.complaint/);

const access = read("src/lib/adminSupportAccess.ts");
assert.match(access, /isComplaintSupportTicket\(result\.data\) \? "complaints" : "support"/);
assert.match(access, /access\.permissions\?\.\[permission\]/);

const data = read("src/app/api/admin/data/route.ts");
assert.doesNotMatch(data, /\.select\(\s*["']\*["']\s*\)/);
assert.doesNotMatch(data, /\|\|\s*["']\*["']/);
assert.match(data, /section === "support"[\s\S]*ordinarySupportTicketFilter/);
assert.match(data, /section === "complaints"[\s\S]*complaintSupportTicketFilter/);
assert.match(data, /section === "customers"[\s\S]*ordinarySupportTicketFilter/);
assert.match(data, /searchParams\.get\("record_id"\)/);
assert.match(data, /requestedQuery\.maybeSingle\(\)/);
assert.match(data, /prependRequestedAdminRecord/);
assert.match(data, /const exactRows = async/);
assert.match(data, /ticketsByComplaint/);
assert.match(data, /exactRows\("support_tickets"[\s\S]*"complaint_id", complaintIds\)/);
assert.match(data, /exactRows\("bookings"[\s\S]*"id", bookingIds\)/);
assert.match(data, /payload\.bookings = scopedBookings/);
assert.match(data, /exactRows\("salons"[\s\S]*"id", \[\.\.\.salonIds\]\)/);
assert.match(data, /exactRows\("customers"[\s\S]*"id", \[\.\.\.customerIds\]\)/);
assert.match(data, /requestedPrimary\?\.table === "customers"/);
assert.match(data, /exactValueRows\("bookings"[\s\S]*"guest_email"/);
assert.match(data, /requestedPrimary\?\.table === "reviews"/);
assert.match(data, /exactRows\("review_moderation_events"[\s\S]*"review_id"/);
assert.match(data, /requestedPrimary\?\.table === "subscriptions"/);
assert.match(data, /exactRows\("subscription_change_requests"[\s\S]*"salon_id"/);
assert.match(data, /exactRows\(\s*"salon_quality_metrics"/);
assert.match(data, /completed_bookings/);

const projectionsSource = read("src/lib/adminDataProjectionCore.ts");
const projections = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(projectionsSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64")}`
);
for (const [table, projection] of Object.entries(projections.ADMIN_OVERVIEW_PROJECTIONS)) {
  assert.ok(projection && !projection.includes("*"), `Overview source ${table} lacks an explicit projection.`);
}
for (const [section, sources] of Object.entries(projections.ADMIN_SECTION_SOURCES)) {
  for (const table of sources) {
    const projection = projections.ADMIN_SECTION_PROJECTIONS[section]?.[table];
    assert.ok(
      projection && !projection.includes("*"),
      `${section}.${table} lacks an explicit least-privilege projection.`,
    );
  }
}
assert.equal(
  projections.ADMIN_SECTION_SOURCE_PERMISSION_OVERRIDES.customers.support_tickets,
  "support",
);
assert.equal(
  projections.ADMIN_SECTION_SOURCE_PERMISSION_OVERRIDES.customers.complaints_log,
  "complaints",
);
const oldCustomerRows = Array.from({ length: 500 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
}));
const requestedCustomer = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const deepLinkedRows = projections.prependRequestedAdminRecord(
  oldCustomerRows,
  requestedCustomer,
);
assert.equal(deepLinkedRows.length, 500);
assert.equal(deepLinkedRows[0].id, requestedCustomer.id);
assert.equal(deepLinkedRows.some((row) => row.id === requestedCustomer.id), true);
assert.deepEqual(
  projections.adminRequestedPrimaryRecord("customers", requestedCustomer.id),
  { table: "customers", permission: "customers", recordId: requestedCustomer.id },
);
assert.equal(projections.adminRequestedPrimaryRecord("bookings", "new"), null);
assert.equal(
  projections.adminRequestedPrimaryRecord("settings", `member-${requestedCustomer.id}`)?.recordId,
  requestedCustomer.id,
);

const counts = read("src/app/api/admin/inbox-counts/route.ts");
assert.match(counts, /permissions\?\.support/);
assert.match(counts, /permissions\?\.complaints/);
assert.match(counts, /filter\(isComplaintSupportTicket\)/);
assert.match(counts, /support:\s*canReadSupport \? rows\.length - complaints : 0/);
assert.match(counts, /complaints:\s*canReadComplaints \? complaints : 0/);

const supportUi = read("src/components/AdminSupportInbox.tsx");
assert.match(supportUi, /onRead\?\.\(mode\)/);
assert.match(supportUi, /assigned_to/);
assert.match(supportUi, /Save assignment/);
assert.match(supportUi, /\/assignment/);
assert.match(supportUi, /report was preserved so evidence is not lost/i);

const dashboard = read("src/components/AdminDashboard.tsx");
assert.match(dashboard, /verifiedAccess\.support \|\| verifiedAccess\.complaints/);
assert.match(dashboard, /initialAssignees=\{safeData\.admins\}/);
assert.match(dashboard, /href="\/admin\/content\/blog-new" label="Create blog post"/);

const assignment = read("src/app/api/admin/support/[id]/assignment/route.ts");
assert.match(assignment, /requireAdminSupportRecord\(request, id\)/);
assert.match(assignment, /access\.permissions\?\.\[permission\]/);
assert.match(assignment, /admin\.rpc\("admin_assign_support_ticket"/);
assert.doesNotMatch(assignment, /\.from\("support_tickets"\)[\s\S]*\.update\(/);
assert.doesNotMatch(assignment, /\.from\("record_management_events"\)[\s\S]*\.insert\(/);
assert.doesNotMatch(assignment, /Response\.json\(\s*\{\s*error:\s*error instanceof Error/);

const responseRoute = read("src/app/api/admin/support/[id]/respond/route.ts");
assert.match(responseRoute, /admin\.rpc\("admin_respond_support_ticket"/);
assert.match(responseRoute, /admin\.rpc\("admin_claim_support_response_email"/);
assert.match(responseRoute, /admin\.rpc\("admin_complete_support_response_email"/);
assert.match(responseRoute, /idempotencyKey/);
assert.match(responseRoute, /noteOperationalFailure\("Support response email delivery failed"/);
assert.doesNotMatch(responseRoute, /\.from\("support_tickets"\)\.update/);
assert.doesNotMatch(responseRoute, /\.from\("complaints_log"\)\.update/);

const emailServer = read("src/lib/supabaseAdmin.ts");
assert.match(emailServer, /idempotencyKey\?: string/);
assert.match(emailServer, /"Idempotency-Key"/);

assert.match(supportUi, /responseRequestKey/);
assert.match(supportUi, /idempotency_key: responseRequestKey\.current/);

for (const [relative, auditTable, checkedFailure] of [
  ["src/app/api/admin/bookings/[id]/route.ts", "booking_audit_log", /if \((?:auditError|cancellationAuditError|refundAuditError)\)[\s\S]*throw (?:auditError|cancellationAuditError|refundAuditError)/],
  ["src/app/api/admin/records/route.ts", "record_management_events", /if \(audit\.error\)[\s\S]*throw audit\.error/],
  ["src/app/api/admin/team/route.ts", "admin_security_events", /if \(error\)[\s\S]*throw error/],
  ["src/app/api/salon/team/route.ts", "record_management_events", /if \(error\)[\s\S]*throw error/],
]) {
  const source = read(relative);
  assert.match(source, new RegExp(auditTable));
  assert.match(source, /noteOperationalFailure/);
  assert.match(source, checkedFailure);
}

for (const relative of [
  "src/app/api/admin/inbox-counts/route.ts",
  "src/app/api/admin/engine/media/route.ts",
  "src/app/api/admin/records/route.ts",
]) {
  const source = read(relative);
  assert.doesNotMatch(
    source,
    /Response\.json\([^\n]*error\.message/,
    `${relative} exposes an unclassified raw operational error.`,
  );
}

const migration = read("supabase/migrations/20260809120000_support_assignment_workflow.sql");
assert.match(migration, /add column if not exists assigned_to uuid references auth\.users/);
assert.match(migration, /support_tickets_assignment_queue_idx/);
assert.match(migration, /create or replace function public\.admin_assign_support_ticket/);
assert.match(migration, /for update/);
assert.match(migration, /when v_assignee_user_id is null then null/);
assert.match(migration, /insert into public\.record_management_events/);
assert.match(migration, /revoke all on function public\.admin_assign_support_ticket[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.admin_assign_support_ticket[\s\S]*to service_role/);
assert.match(migration, /create table if not exists public\.support_response_email_outbox/);
assert.match(migration, /idempotency_key text not null unique/);
assert.match(migration, /alter table public\.support_response_email_outbox enable row level security/);
assert.match(migration, /revoke all on table public\.support_response_email_outbox[\s\S]*from public, anon, authenticated/);
assert.match(migration, /create or replace function public\.admin_respond_support_ticket/);
assert.match(migration, /create or replace function public\.admin_claim_support_response_email/);
assert.match(migration, /create or replace function public\.admin_complete_support_response_email/);
assert.match(migration, /update public\.complaints_log/);
assert.match(migration, /insert into public\.record_management_events/);
assert.match(migration, /revoke all on function public\.admin_respond_support_ticket[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.admin_respond_support_ticket[\s\S]*to service_role/);
assert.match(migration, /integrations\.expected_migration/);
assert.match(migration, /20260809120000/);

const cleanDatabaseAssertions = read("scripts/sql/verify-clean-database.sql");
assert.match(cleanDatabaseAssertions, /Support assignment did not atomically persist its audit event/);
assert.match(cleanDatabaseAssertions, /Support unassignment did not clear ownership/);
assert.match(cleanDatabaseAssertions, /Clean database forced management audit failure/);
assert.match(cleanDatabaseAssertions, /Support assignment survived a failed audit transaction/);
assert.match(cleanDatabaseAssertions, /Support response idempotency replay duplicated durable records/);
assert.match(cleanDatabaseAssertions, /Support response or email outbox survived a failed audit transaction/);
assert.match(cleanDatabaseAssertions, /Quality metrics did not limit unresolved verified complaints to the 365-day window/);

const qualityMigration = read("supabase/migrations/20260809150000_admin_record_quality_and_content_targets.sql");
assert.match(qualityMigration, /lower\(coalesce\(booking\.status, ''\)\) in \('completed', 'cancelled', 'canceled'\)/);
assert.match(qualityMigration, /appointment_datetime >= now\(\) - interval '365 days'/);
assert.match(qualityMigration, /complaint\.created_at >= now\(\) - interval '365 days'/);
assert.match(qualityMigration, /completed_bookings/);
assert.match(qualityMigration, /create or replace function public\.admin_content_link_targets/);
assert.match(qualityMigration, /public\.is_marketplace_visible\(salon\.id\)/);
assert.match(qualityMigration, /limit \(select row_limit from input\)/);
assert.match(qualityMigration, /campaign\.placement_basis = 'paid'/);
assert.match(qualityMigration, /entitlement\.salon_id = campaign\.salon_id/);
assert.match(qualityMigration, /entitlement\.placement_type = 'Featured Salon'/);
assert.match(qualityMigration, /product\.product_status = 'Active'/);
assert.match(qualityMigration, /product\.archived_at is null/);
assert.match(qualityMigration, /set search_path = pg_catalog, public/);
assert.match(qualityMigration, /grant execute on function public\.admin_content_link_targets[\s\S]*to service_role/);

const contentRoute = read("src/app/api/admin/content/route.ts");
assert.match(contentRoute, /admin\.rpc\("admin_content_link_targets"/);
assert.doesNotMatch(contentRoute, /eligibility\s*=\s*await Promise\.all/);
assert.doesNotMatch(contentRoute, /admin\.rpc\("is_marketplace_visible"[\s\S]*salons\.data/);

console.log("Admin safety closure verification passed.");
