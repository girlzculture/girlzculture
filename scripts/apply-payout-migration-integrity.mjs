import { readFileSync, writeFileSync } from "node:fs";

const path = "supabase/migrations/20260825150000_stripe_connect_booking_payouts.sql";
let source = readFileSync(path, "utf8");

function replaceOnce(before, after) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing expected migration source: ${before}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Expected exactly one migration source: ${before}`);
  }
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

replaceOnce(
  `  check (status <> 'Transferred' or stripe_transfer_id ~ '^tr_[A-Za-z0-9]+$')`,
  `  check (\n    status <> 'Transferred'\n    or (\n      stripe_transfer_id is not null\n      and stripe_transfer_id ~ '^tr_[A-Za-z0-9]+$'\n    )\n  )`,
);

replaceOnce(
  `grant select on table public.salon_payout_attempts to authenticated;\n\ncreate or replace function public.admin_reserve_booking_payout(`,
  `grant select on table public.salon_payout_attempts to authenticated;\n\n-- This branch previously carried a two-argument draft overload. It was never\n-- a production contract; remove it so a preview that saw an earlier PR head\n-- cannot retain an ambiguous callable function.\ndrop function if exists public.admin_reserve_booking_payout(uuid, uuid);\n\ncreate or replace function public.admin_reserve_booking_payout(`,
);

writeFileSync(path, source);
console.log("Payout migration integrity patch applied.");
