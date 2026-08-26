import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing expected source in ${path}: ${before.slice(0, 120)}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Expected one source match in ${path}`);
  writeFileSync(path, source.slice(0, index) + after + source.slice(index + before.length));
}

const path = "src/components/admin/AdminFinanceDashboard.tsx";
replaceOnce(
  path,
  `import { useAdminListScrollRestoration } from "@/components/admin/useAdminListContext";`,
  `import { useAdminListScrollRestoration } from "@/components/admin/useAdminListContext";\nimport AdminSalonPayoutAction from "@/components/admin/AdminSalonPayoutAction";`,
);
replaceOnce(
  path,
  `<TransactionDetails row={focused} timeZone={data.admin_time_zone}/></section>`,
  `<TransactionDetails row={focused} timeZone={data.admin_time_zone}/>{focused.transaction_type === "Booking deposit" && focused.booking_id ? <AdminSalonPayoutAction bookingId={String(focused.booking_id)} onChanged={() => load(selectedSalonId)}/> : null}</section>`,
);
console.log("Pay Salon control wired into focused booking-deposit details.");