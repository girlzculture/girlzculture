"use client";
import { useI18n } from "@/components/i18n/LocaleProvider";
export default function BookingPriceEvidence({ booking }: { booking: Record<string, unknown> }) {
  const { translateSource: t, formatCurrency } = useI18n();
  const snapshot = booking.deposit_rule_snapshot as { subtotal?: unknown; deposit?: unknown } | null;
  if (!snapshot || typeof snapshot.subtotal !== "number" || !Number.isFinite(snapshot.subtotal)) return null;
  const total = Number(booking.estimated_total), deposit = Number(snapshot.deposit);
  if (!Number.isFinite(total) || !Number.isFinite(deposit) || deposit < 0 || total < deposit) return null;
  const rows = [["Original price", snapshot.subtotal], ["Offer savings", Math.max(0, snapshot.subtotal - total)], ["Agreed total", total], ["Required deposit", deposit], ["Agreed balance after deposit", Math.max(0, total - deposit)]] as const;
  return <section className="my-4 rounded-xl border border-border bg-white p-4" aria-label={t("Agreed booking price")}><h3 className="font-serif text-lg font-bold">{t("Agreed booking price")}</h3><dl className="mt-3 space-y-2 text-sm">{rows.map(([label, amount]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt>{t(label)}</dt><dd data-no-translate className="font-semibold tabular-nums">{formatCurrency(amount)}</dd></div>)}</dl></section>;
}
