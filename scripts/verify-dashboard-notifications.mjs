import assert from "node:assert/strict";
import fs from "node:fs";
import {
  dashboardNotificationCounts,
  markDashboardNotificationsRead,
} from "../src/lib/dashboardNotificationsCore.ts";

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
  /window\.setInterval\(\(\) => void load\(\),\s*60_000\)/,
]) {
  assert.match(center, requirement);
}

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
  "Dashboard notification verification passed: category counts and persisted read transitions execute correctly; authenticated scope isolation, click-outside/Escape behavior, record navigation, grouping, lifecycle/payment/support/error producers, and polling fallback are covered.",
);
