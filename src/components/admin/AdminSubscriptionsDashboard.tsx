"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useAdminQueryParam } from "@/components/admin/useAdminListContext";

type Row = Record<string, unknown>;

const PLAN_PRICES: Record<string, number> = {
  Basic: 99.5,
  Growth: 129.5,
  Premium: 159.5,
};

function text(value: unknown) {
  return String(value || "").trim();
}

function normalizedPlan(value: unknown) {
  const candidate = text(value).toLowerCase();
  return Object.keys(PLAN_PRICES).find((plan) => plan.toLowerCase() === candidate) || text(value) || "Not assigned";
}

function normalizedStatus(value: unknown) {
  return text(value).toLowerCase() || "unknown";
}

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function eventDollars(value: unknown) {
  return Number(value || 0) / 100;
}

function displayStatus(value: unknown) {
  const label = normalizedStatus(value).replaceAll("_", " ");
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function csvCell(value: unknown) {
  let result = String(value ?? "");
  if (/^[=+\-@]/.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <article className="rounded-[14px] border border-plum/10 bg-white p-4">
    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/55">{label}</p>
    <p className="mt-2 font-serif text-3xl font-semibold text-plum">{value}</p>
    {detail ? <p className="mt-2 text-xs text-ink/55">{detail}</p> : null}
  </article>;
}

export default function AdminSubscriptionsDashboard({ salons, subscriptions, billingEvents, changeRequests }: {
  salons: Row[];
  subscriptions: Row[];
  billingEvents: Row[];
  changeRequests: Row[];
}) {
  const [stateFilter, setStateFilter] = useAdminQueryParam("state", "all");
  const [planFilter, setPlanFilter] = useAdminQueryParam("plan", "all");
  const [statusFilter, setStatusFilter] = useAdminQueryParam("status", "all");
  const [fromDate, setFromDate] = useAdminQueryParam("from", "");
  const [toDate, setToDate] = useAdminQueryParam("to", "");
  const salonById = useMemo(() => new Map(salons.map((salon) => [text(salon.id), salon])), [salons]);
  const states = useMemo(() => [...new Set(salons.map((salon) => text(salon.address_state || salon.state)).filter(Boolean))].sort(), [salons]);
  const statuses = useMemo(() => [...new Set(subscriptions.map((subscription) => normalizedStatus(subscription.status)))].sort(), [subscriptions]);

  const filteredSubscriptions = useMemo(() => subscriptions.filter((subscription) => {
    const salon = salonById.get(text(subscription.salon_id));
    const state = text(salon?.address_state || salon?.state);
    const plan = normalizedPlan(subscription.tier || salon?.subscription_tier);
    const status = normalizedStatus(subscription.status);
    const created = text(subscription.created_at || subscription.updated_at).slice(0, 10);
    return (stateFilter === "all" || state === stateFilter)
      && (planFilter === "all" || plan === planFilter)
      && (statusFilter === "all" || status === statusFilter)
      && (!fromDate || created >= fromDate)
      && (!toDate || created <= toDate);
  }), [subscriptions, salonById, stateFilter, planFilter, statusFilter, fromDate, toDate]);

  const filteredEvents = useMemo(() => billingEvents.filter((event) => {
    const salon = salonById.get(text(event.salon_id));
    const state = text(event.state || salon?.address_state || salon?.state);
    const plan = normalizedPlan(event.new_plan || event.previous_plan || salon?.subscription_tier);
    const eventDate = text(event.event_date || event.created_at).slice(0, 10);
    return (stateFilter === "all" || state === stateFilter)
      && (planFilter === "all" || plan === planFilter)
      && (!fromDate || eventDate >= fromDate)
      && (!toDate || eventDate <= toDate);
  }), [billingEvents, salonById, stateFilter, planFilter, fromDate, toDate]);

  const active = filteredSubscriptions.filter((subscription) => ["active", "trialing"].includes(normalizedStatus(subscription.status)));
  const expectedMrr = active.reduce((sum, subscription) => sum + (PLAN_PRICES[normalizedPlan(subscription.tier || salonById.get(text(subscription.salon_id))?.subscription_tier)] || 0), 0);
  const collected = filteredEvents.reduce((sum, event) => sum + eventDollars(event.amount_collected), 0);
  const refunded = filteredEvents.reduce((sum, event) => sum + eventDollars(event.amount_refunded), 0);
  const upgrades = filteredEvents.filter((event) => /upgrade/i.test(text(event.event_type))).length;
  const downgrades = filteredEvents.filter((event) => /downgrade/i.test(text(event.event_type))).length;
  const cancellations = filteredSubscriptions.filter((subscription) => normalizedStatus(subscription.status) === "canceled" || Boolean(subscription.cancel_at_period_end)).length;
  const pastDue = filteredSubscriptions.filter((subscription) => ["past_due", "unpaid", "incomplete"].includes(normalizedStatus(subscription.status))).length;

  const matrix = useMemo(() => {
    const groups = new Map<string, Record<string, number>>();
    filteredSubscriptions.forEach((subscription) => {
      const salon = salonById.get(text(subscription.salon_id));
      const state = text(salon?.address_state || salon?.state) || "Not recorded";
      const plan = normalizedPlan(subscription.tier || salon?.subscription_tier);
      const entry = groups.get(state) || { Basic: 0, Growth: 0, Premium: 0, Total: 0 };
      if (plan in entry) entry[plan] += 1;
      entry.Total += 1;
      groups.set(state, entry);
    });
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [filteredSubscriptions, salonById]);

  const exportRows = filteredSubscriptions.map((subscription) => {
    const salon = salonById.get(text(subscription.salon_id));
    return [
      text(salon?.name) || "Salon unavailable",
      text(salon?.address_state || salon?.state) || "Not recorded",
      normalizedPlan(subscription.tier || salon?.subscription_tier),
      displayStatus(subscription.status),
      PLAN_PRICES[normalizedPlan(subscription.tier || salon?.subscription_tier)] || 0,
      text(subscription.current_period_start),
      text(subscription.current_period_end),
      Boolean(subscription.cancel_at_period_end) ? "Yes" : "No",
      text(subscription.stripe_subscription_id),
    ];
  });
  const returnParams = new URLSearchParams({
    ...(stateFilter !== "all" ? { state: stateFilter } : {}),
    ...(planFilter !== "all" ? { plan: planFilter } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
  });
  const returnPath = `/admin/subscriptions${returnParams.size ? `?${returnParams}` : ""}`;

  return <div className="space-y-5">
    <section className="rounded-[14px] border border-plum/10 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-plum">Subscription performance</h2>
          <p className="mt-1 text-xs text-ink/55">Filter active and historical records by state, plan, status, or date.</p>
        </div>
        <button type="button" onClick={() => downloadCsv("girlz-culture-subscriptions.csv", ["Salon", "State", "Plan", "Status", "Monthly price", "Period start", "Period end", "Cancels at period end", "Stripe subscription"], exportRows)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta"><Download size={15}/>Export filtered CSV</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-bold">State<select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3"><option value="all">All states</option>{states.map((state) => <option key={state}>{state}</option>)}</select></label>
        <label className="text-xs font-bold">Plan<select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3"><option value="all">All plans</option>{Object.keys(PLAN_PRICES).map((plan) => <option key={plan}>{plan}</option>)}</select></label>
        <label className="text-xs font-bold">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3"><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{displayStatus(status)}</option>)}</select></label>
        <label className="text-xs font-bold">From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3"/></label>
        <label className="text-xs font-bold">To<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3"/></label>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Expected monthly revenue" value={money(expectedMrr)} detail={`${active.length} active or trialing subscriptions`}/>
      <Metric label="Actually collected" value={money(collected)} detail={`${money(refunded)} refunded in the selected period`}/>
      <Metric label="Plan changes" value={upgrades + downgrades} detail={`${upgrades} upgrades · ${downgrades} downgrades`}/>
      <Metric label="Needs attention" value={pastDue + cancellations} detail={`${pastDue} past due · ${cancellations} canceled or scheduled`}/>
    </section>

    <section className="overflow-hidden rounded-[14px] border border-plum/10 bg-white">
      <div className="border-b border-plum/10 p-4"><h2 className="font-serif text-xl font-semibold text-plum">Plans by state</h2></div>
      <div className="divide-y divide-plum/10 md:hidden">{matrix.length ? matrix.map(([state, values]) => <article key={state} className="p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-serif text-lg text-plum">{state}</h3><b className="text-sm text-magenta">{values.Total} total</b></div><dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">{(["Basic", "Growth", "Premium"] as const).map((plan) => <div key={plan} className="rounded-lg bg-cream p-2"><dt className="text-[9px] font-bold uppercase tracking-wide text-ink/50">{plan}</dt><dd className="mt-1 font-serif text-lg text-plum">{values[plan]}</dd></div>)}</dl></article>) : <p className="p-8 text-center text-sm text-ink/50">No subscription records match these filters.</p>}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-blush/25"><tr>{["State", "Basic", "Growth", "Premium", "Total"].map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead><tbody>{matrix.length ? matrix.map(([state, values]) => <tr key={state} className="border-t border-plum/10"><td className="px-4 py-3 font-bold">{state}</td><td className="px-4 py-3">{values.Basic}</td><td className="px-4 py-3">{values.Growth}</td><td className="px-4 py-3">{values.Premium}</td><td className="px-4 py-3 font-bold">{values.Total}</td></tr>) : <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/50">No subscription records match these filters.</td></tr>}</tbody></table></div>
    </section>

    <section data-admin-record-landing className="overflow-hidden rounded-[14px] border border-plum/10 bg-white">
      <div className="border-b border-plum/10 p-4"><h2 className="font-serif text-xl font-semibold text-plum">Subscription records</h2></div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[960px] text-left text-xs"><thead className="bg-blush/25"><tr>{["Salon", "State", "Plan", "Status", "Monthly value", "Current period", "Scheduled action", "Record"].map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead><tbody>{filteredSubscriptions.length ? filteredSubscriptions.map((subscription) => { const salon = salonById.get(text(subscription.salon_id)); const plan = normalizedPlan(subscription.tier || salon?.subscription_tier); return <tr key={text(subscription.id)} className="border-t border-plum/10 align-top"><td className="px-4 py-3 font-bold">{text(salon?.name) || "Salon unavailable"}</td><td className="px-4 py-3">{text(salon?.address_state || salon?.state) || "Not recorded"}</td><td className="px-4 py-3">{plan}</td><td className="px-4 py-3">{displayStatus(subscription.status)}</td><td className="px-4 py-3">{money(PLAN_PRICES[plan] || 0)}</td><td className="px-4 py-3">{text(subscription.current_period_start).slice(0, 10) || "—"} – {text(subscription.current_period_end).slice(0, 10) || "—"}</td><td className="px-4 py-3">{Boolean(subscription.cancel_at_period_end) ? "Cancellation scheduled" : text(subscription.scheduled_tier) ? `Change to ${text(subscription.scheduled_tier)}` : "None"}</td><td className="px-4 py-3"><Link href={`/admin/subscriptions/${text(subscription.id)}?return=${encodeURIComponent(returnPath)}`} className="font-bold text-magenta">Open</Link></td></tr>; }) : <tr><td colSpan={8} className="px-4 py-10 text-center text-ink/50">No subscription records match these filters.</td></tr>}</tbody></table></div>
      <div className="divide-y divide-plum/10 md:hidden">{filteredSubscriptions.length ? filteredSubscriptions.map((subscription) => { const salon = salonById.get(text(subscription.salon_id)); const plan = normalizedPlan(subscription.tier || salon?.subscription_tier); return <Link key={text(subscription.id)} href={`/admin/subscriptions/${text(subscription.id)}?return=${encodeURIComponent(returnPath)}`} className="block p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-lg text-plum">{text(salon?.name) || "Salon unavailable"}</h3><p className="mt-1 text-xs text-ink/55">{text(salon?.address_state || salon?.state) || "State not recorded"}</p></div><span className="rounded-full bg-blush px-2 py-1 text-[9px] font-bold text-magenta">{displayStatus(subscription.status)}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><span>{plan} · {money(PLAN_PRICES[plan] || 0)}</span><span className="text-right">{Boolean(subscription.cancel_at_period_end) ? "Cancellation scheduled" : text(subscription.scheduled_tier) ? `Change to ${text(subscription.scheduled_tier)}` : "No scheduled action"}</span></div><span className="mt-3 inline-flex text-xs font-bold text-magenta">Open subscription record →</span></Link>; }) : <p className="p-8 text-center text-sm text-ink/50">No subscription records match these filters.</p>}</div>
    </section>

    {changeRequests.length ? <p className="text-xs text-ink/55">{changeRequests.length} plan-change request{changeRequests.length === 1 ? "" : "s"} are retained for detailed billing reconciliation.</p> : null}
  </div>;
}
