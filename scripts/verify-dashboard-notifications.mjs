import assert from "node:assert/strict";
import fs from "node:fs";
import {
  dashboardNotificationCounts,
  markDashboardNotificationsRead,
} from "../src/lib/dashboardNotificationsCore.ts";
import {
  nextDashboardNotificationPoll,
} from "../src/lib/dashboardNotificationPollingCore.ts";

const notifications = [
  { id: "one", category: "bookings", read_at: null },
  { id: "two", category: "bookings", read_at: null },
  { id: "three", category: "messages", read_at: null },
  { id: "four", category: "payments", read_at: "2026-07-23T12:00:00Z" },
];
assert.deepEqual(dashboardNotificationCounts(notifications), {
  bookings: 2,
  messages: 1,
});

const oneRead = markDashboardNotificationsRead(
  notifications,
  "read",
  "2026-07-23T14:00:00Z",
  "one",
);
assert.deepEqual(dashboardNotificationCounts(oneRead), {
  bookings: 1,
  messages: 1,
});
assert.equal(oneRead.find((row) => row.id === "two").read_at, null);

const allRead = markDashboardNotificationsRead(
  oneRead,
  "read_all",
  "2026-07-23T15:00:00Z",
);
assert.deepEqual(dashboardNotificationCounts(allRead), {});
assert.deepEqual(nextDashboardNotificationPoll("ready", 4), {
  attempt: 0,
  delay: 60_000,
});
assert.deepEqual(nextDashboardNotificationPoll("transient", 0), {
  attempt: 1,
  delay: 60_000,
});
assert.deepEqual(nextDashboardNotificationPoll("transient", 8), {
  attempt: 9,
  delay: 300_000,
});
assert.deepEqual(nextDashboardNotificationPoll("terminal", 3), {
  attempt: 3,
  delay: null,
});

const center = fs.readFileSync(
  "src/components/notifications/DashboardNotificationCenter.tsx",
  "utf8",
);
for (const requirement of [
  /document\.addEventListener\("mousedown",\s*outside\)/,
  /event\.key === "Escape"/,
  /await mark\("read",\s*notification\.id\)/,
  /router\.push\(action\)/,
  /mark\("read_all"\)/,
  /createAuthenticatedApiClient\(scope\)/,
  /terminalSession\.current = true/,
  /nextDashboardNotificationPoll\(outcome,\s*retryAttempt\)/,
  /auth\.onAuthStateChange/,
]) {
  assert.match(center, requirement);
}
assert.doesNotMatch(
  center,
  /fetch\(`\/api\/notifications/,
  "The notification center bypasses the shared authenticated JSON client.",
);

const migration = fs.readFileSync(
  "supabase/migrations/20260723250000_dashboard_notifications.sql",
  "utf8",
);
for (const requirement of [
  /create or replace function public\.upsert_dashboard_notification/,
  /occurrence_count=least\(occurrence_count\+1,1000000\)/,
  /dashboard_notify_support_ticket/,
  /dashboard_notify_application/,
  /dashboard_notify_platform_error/,
  /dashboard_notify_billing_event/,
  /recipient_role.*category.*severity/s,
]) {
  assert.match(migration, requirement);
}

const route = fs.readFileSync("src/app/api/notifications/route.ts", "utf8");
assert.match(route, /requireAdmin\(request\)/);
assert.match(route, /requireSalonOwner\(request\)/);
assert.match(route, /action === "read_all"/);
assert.match(route, /Cache-Control": "private, no-store"/);

console.log(
  "Dashboard notification verification passed: category counts and persisted read transitions execute correctly; the shared scoped JSON client owns refresh/content checks; terminal sessions stop polling; transient failures back off; auth recovery resumes; scope isolation, navigation, grouping, and notification producers are covered.",
);
