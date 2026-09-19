import { useI18n } from "@/components/i18n/LocaleProvider";
import { businessFinanceRankings } from "@/lib/businessFinanceRankings";
import type { summarizeOperatingBooks } from "@/lib/businessFinanceCore";

export default function FinanceEarningsLeaders({ summary, names }: { summary: ReturnType<typeof summarizeOperatingBooks>; names: ReadonlyMap<string, string> }) {
  const { translateSource: t, locale } = useI18n();
  const ranking = businessFinanceRankings(summary, names, "business").professionals;
  const money = (amount: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(amount / 100);
  return <section aria-label={t("Highest recorded earned compensation")} className="mt-3 rounded-lg border border-teal/20 bg-teal/5 p-3 text-sm">
    <h3 className="font-semibold">{t("Highest recorded earned compensation")}</h3>
    <p className="mt-1 text-xs gc-text-secondary">{t("Commission earned plus wages due in the selected period. Service sales and compensation already paid are separate.")}</p>
    <p className="mt-1 text-xs">{summary.period.from} — {summary.period.to} · <span translate="no">{summary.period.timeZone}</span> · USD</p>
    {ranking.highest_amount_cents === null ? <p className="mt-2">{t("No assigned professional earnings in this period.")}</p> : <>
      <p className="mt-2 font-semibold">{money(ranking.highest_amount_cents)}</p>
      <p>{t("Professionals tied at this amount")}: {ranking.tied_leader_count}</p>
      <ul className="mt-1 list-inside list-disc break-words">{ranking.leaders.map(row => <li key={row.id}>{row.name ? <span translate="no">{row.name}</span> : t("Unnamed professional")}</li>)}</ul>
      {ranking.leaders_are_excerpt ? <p className="mt-1 text-xs">{t("Showing tied leaders")}: {ranking.leaders_shown_count} / {ranking.tied_leader_count}</p> : null}
    </>}
    {ranking.unassigned_excluded ? <p className="mt-2 text-xs">{t("Unassigned earned compensation is excluded from this ranking")}: {money(ranking.unassigned_earned_compensation_cents)}</p> : null}
  </section>;
}
