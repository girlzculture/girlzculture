import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/admin/AdminFinanceDashboard.tsx";
let source = readFileSync(path, "utf8");

const importLine =
  'import AdminSalonPayoutWorkspace from "@/components/admin/AdminSalonPayoutWorkspace";';
if (!source.includes(importLine)) {
  const anchor =
    'import { useAdminListScrollRestoration } from "@/components/admin/useAdminListContext";';
  if (!source.includes(anchor)) {
    throw new Error("Unable to find the Admin Finance import anchor.");
  }
  source = source.replace(anchor, `${anchor}\n${importLine}`);
}

if (!source.includes("<AdminSalonPayoutWorkspace")) {
  const bookingLedger = /\s{10}<BookingLedger\n\s{12}rows=\{filtered\}\n\s{12}payoutView=\{tab === "Salon Payouts"\}\n\s{12}timeZone=\{data\.admin_time_zone\}\n\s{10}\/>/;
  const match = source.match(bookingLedger);
  if (!match) {
    throw new Error("Unable to find the Salon Payouts booking-ledger anchor.");
  }
  const replacement = `          {tab === "Salon Payouts" ? (\n            <AdminSalonPayoutWorkspace\n              rows={filtered}\n              onChanged={() => load(selectedSalonId)}\n            />\n          ) : null}\n${match[0].trimStart()}`;
  source = source.replace(bookingLedger, `\n${replacement}`);
}

writeFileSync(path, source);
console.log("Salon payout workspace wired into Platform Admin Finance.");
