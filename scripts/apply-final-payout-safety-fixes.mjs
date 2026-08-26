import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing expected source in ${path}: ${before.slice(0, 140)}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Expected one source match in ${path}`);
  writeFileSync(path, source.slice(0, index) + after + source.slice(index + before.length));
}

replaceOnce(
  "supabase/migrations/20260825150000_stripe_connect_booking_payouts.sql",
  `connected_account_id text not null check (connected_account_id like 'acct\\\\_%' escape '\\\\\\\\'),`,
  `connected_account_id text not null check (connected_account_id ~ '^acct_[A-Za-z0-9]+$'),`,
);

const api = "src/app/api/admin/finance/payout/route.ts";
replaceOnce(
  api,
  `  let attemptId = "";\n  let bookingId = "";`,
  `  let attemptId = "";\n  let bookingId = "";\n  let actorId = "";\n  let stripeTransferId = "";`,
);
replaceOnce(
  api,
  `    const { admin, user } = await requireAdminPermission(request, "finance");\n    monitoringAdmin = admin;`,
  `    const { admin, user } = await requireAdminPermission(request, "finance");\n    monitoringAdmin = admin;\n    actorId = user.id;`,
);
replaceOnce(
  api,
  `    if (!/^tr_[A-Za-z0-9]+$/.test(String(transfer.id || ""))) throw new Error("Stripe did not return a transfer confirmation.");\n\n    const finalized`,
  `    if (!/^tr_[A-Za-z0-9]+$/.test(String(transfer.id || ""))) throw new Error("Stripe did not return a transfer confirmation.");\n    stripeTransferId = String(transfer.id);\n\n    const finalized`,
);
replaceOnce(
  api,
  `    if (attemptId && monitoringAdmin) {\n      await monitoringAdmin.rpc("admin_finalize_booking_payout", {\n        p_actor_user_id: (await requireAdminPermission(request, "finance")).user.id,`,
  `    if (attemptId && monitoringAdmin && !stripeTransferId && actorId) {\n      await monitoringAdmin.rpc("admin_finalize_booking_payout", {\n        p_actor_user_id: actorId,`,
);
replaceOnce(
  api,
  `      error: reference\n        ? \`The salon transfer was not completed. Review reference \${reference} before retrying.\`\n        : "The salon transfer was not completed.",`,
  `      error: stripeTransferId\n        ? reference\n          ? \`Stripe returned transfer \${stripeTransferId}, but the local payout record needs reconciliation. Do not create a new payout. Review reference \${reference}.\`\n          : \`Stripe returned transfer \${stripeTransferId}, but the local payout record needs reconciliation. Do not create a new payout.\`\n        : reference\n          ? \`The salon transfer was not completed. Review reference \${reference} before retrying.\`\n          : "The salon transfer was not completed.",`,
);

console.log("Final payout schema and reconciliation safety fixes applied.");