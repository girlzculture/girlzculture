import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/api/admin/finance/booking-payout/route.ts";
let source = readFileSync(path, "utf8");
source = source.replace(
  `      actorRole: "admin",\n      recordType: "booking",\n      recordId: bookingId || null,\n      safeMessage:`,
  `      actorRole: "admin",\n      safeMessage:`,
);
writeFileSync(path, source);
console.log("Booking payout route compatibility finalized.");
