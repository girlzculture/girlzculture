"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CircleDollarSign, Plus, Wallet, ArrowDownLeft, ReceiptText } from "lucide-react";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { scopedApiErrorMessage } from "@/lib/scopedApiCore";
import { moneyCents, validateFinancePeriod, type OperatingBooks, type OperatingSale, type summarizeOperatingBooks } from "@/lib/businessFinanceCore";
import FinanceRecords from "./FinanceRecords";
import {useSearchParams} from "next/navigation";
import WorkspaceTabs from "@/components/dashboard/WorkspaceTabs";
import {financeWorkspaceState,updateFinanceLocation,type FinanceTab} from "@/lib/financeWorkspace";
import FinancePeriodControls from "./FinancePeriodControls";
import FinancePeriodRecords from "./FinancePeriodRecords";
import FinanceEarningsLeaders from "./FinanceEarningsLeaders";
import FinanceCompensation from "./FinanceCompensation";
import FinanceReportControls from "./FinanceReportControls";
import BusinessDepositSettings from "./BusinessDepositSettings";
import BusinessMoneyInsights from "./BusinessMoneyInsights";
import BusinessBookingMoney from "./BusinessBookingMoney";
import BusinessScheduleOpportunities from "./BusinessScheduleOpportunities";
import BusinessServiceContribution from "./BusinessServiceContribution";
import { FinanceField, financePanel as panel, financeInput as input, financeButton as button, financePrimary as primary } from "./FinanceUI";
import { useI18n } from "@/components/i18n/LocaleProvider";

type Row = Record<string, unknown>;
type Snapshot = { scope: { kind: "business" | "own" }; books: OperatingBooks; summary: ReturnType<typeof summarizeOperatingBooks>; evidence: Record<string, unknown>; stylists: Row[]; arrangements: Row[] };
type LoadedSnapshot = { key: string; data: Snapshot | null };
type EntryOptions = { binding: string; stylists: Row[]; products: Row[] };
type Editor = { binding: string; period: string; mode: string; saleId: string | null };
const localDay = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
};

export default function BusinessFinances({ independent = false, salonId, timeZone, isOwner, access, paymentEvidence }: { independent?: boolean; salonId: string; timeZone: string; isOwner: boolean; access: Record<string, boolean> | null; paymentEvidence?: ReactNode }) {
  const { translateSource: t, locale } = useI18n();
  const today = localDay(timeZone);
  const params=useSearchParams();
  const {from,to,tab:requestedTab}=financeWorkspaceState(params,today,timeZone);
  const [saleKind,setSaleKind]=useState("service");
  const [loaded, setLoaded] = useState<LoadedSnapshot | null>(null);
  const [entryOptions, setEntryOptions] = useState<EntryOptions | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null), [busy, setBusy] = useState(false);
  const periodControls = useRef<HTMLDivElement>(null);
  const pending = useRef(false), generation = useRef(0), request = useRef<{ signature: string; id: string } | null>(null);
  const readable = isOwner || access?.earnings === true || access?.earnings_own === true;
  const manageable = isOwner || access?.finance_manage === true;
  const loggable = manageable || access?.finance_log === true;
  const binding = JSON.stringify([salonId, isOwner, access]);
  const snapshotKey = JSON.stringify([binding, from, to, timeZone]);
  // A new URL or permission binding must never label the previous response's
  // books as the newly selected period, even before the loading effect runs.
  const current = loaded?.key === snapshotKey ? loaded : null;
  const data = current?.data || null;
  // Entry choices belong to the authorized workspace, not a reporting period.
  // Keep a same-workspace draft's uncontrolled selects mounted during a date
  // read, but never carry choices across a changed business/permission binding.
  const options = entryOptions?.binding === binding ? entryOptions.stylists : [];
  const productOptions = entryOptions?.binding === binding ? entryOptions.products : [];
  const selected = editor?.binding === binding && editor.period === snapshotKey
    ? data?.books.sales.find(sale => sale.id === editor.saleId) || null : null;
  const mode = editor?.binding === binding && (!editor.saleId || selected) ? editor.mode : "";
  function setPeriod(start:string,end:string) {
    try { validateFinancePeriod({from:start,to:end,timeZone});updateFinanceLocation({finance_from:start,finance_to:end});setError(""); }
    catch {setError(t("Choose a valid reporting period."));}
  }
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cents / 100);
  const load = useCallback(async () => {
    const token = ++generation.current;
    try {
      const api = await createAuthenticatedApiClient("salon");
      if (generation.current !== token) return;
      setLoading(true); setError("");
      const [snapshot, entry] = await Promise.all([
        readable ? api.request<Snapshot>(`/api/salon/finances?${new URLSearchParams({ from, to })}`) : null,
        loggable ? api.request<{ stylists: Row[]; products?:Row[] }>("/api/salon/finances?options=entry") : null,
      ]);
      if (generation.current !== token) return;
      setLoaded({ key: snapshotKey, data: snapshot });
      setEntryOptions({ binding, products: entry?.products || [], stylists: entry?.stylists || snapshot?.stylists || [] });
    } catch (failure) { if (generation.current === token) { setLoaded({key: snapshotKey, data: null}); setError(scopedApiErrorMessage(failure, t("Finance records could not be loaded."))); } }
    finally { if (generation.current === token) setLoading(false); }
  }, [from, to, readable, loggable, binding, snapshotKey, t, setLoading, setError, setLoaded, setEntryOptions]);
  useEffect(() => {
    let active = true;
    // Start the external read after effect setup; cancelled Strict Mode setups
    // must not issue a second request. This is not a timing/retry delay.
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => {
      active = false;
      // Numeric request generation, not a DOM ref: invalidate in-flight reads.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [load, binding]);
  const choose = (value: string, sale: OperatingSale | null = null) => { setEditor(value ? { binding, period: snapshotKey, mode: value, saleId: sale?.id || null } : null); setNotice(""); setError(""); request.current = null; };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    const form = new FormData(event.currentTarget); const text = (name: string) => String(form.get(name) || "").trim();
    let payload: Row;
    try {
      if (mode === "sale") payload = { kind: text("kind"), source: text("source"), name: text("name"), list_cents: moneyCents(text("price")), stylist_id: text("stylist_id") || null, client_name: text("client_name") || null, method: text("method"), cost_cents: text("cost") ? moneyCents(text("cost")) : null, quantity: text("kind")==="product"?Number(text("quantity")):1, ...(text("kind")==="product"?{product_id:text("product_id")}:{}) };
      else if (mode === "expense") payload = { category: text("category"), amount_cents: moneyCents(text("amount")), treatment: text("treatment"), note: text("note") };
      else if (mode === "receipt" && selected) payload = { [selected.id.startsWith("booking:") ? "booking_id" : selected.id.startsWith("order:") ? "product_order_id" : "sale_id"]: selected.id.split(":")[1], amount_cents: moneyCents(text("amount")), method: text("method") };
      else if (mode === "refund") payload = { original_payment_id: text("original_payment_id"), amount_cents: moneyCents(text("amount")), note: text("note") };
      else throw Error("FINANCE_INVALID_RECORD");
      if (text("occurred_at")) payload.occurred_at = new Date(text("occurred_at")).toISOString();
    } catch { setError(t("Check the amount and required fields.")); return; }
    const signature = JSON.stringify([mode, payload]);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    const token = generation.current;
    pending.current = true; setBusy(true); setError("");
    try {
      const api = await createAuthenticatedApiClient("salon");
      if(generation.current!==token)return;
      const result = await api.request("/api/salon/finances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, payload, request_id: request.current.id }) });
      if (generation.current !== token) return;
      if (result.verified !== true) throw Error("FINANCE_NOT_VERIFIED");
      request.current = null; setEditor(null); setNotice(t("Record saved. No payment was processed.")); updateFinanceLocation({finance:mode==="expense"?"expenses":"transactions"}); await load();
    } catch (failure) { if (generation.current === token) setError(scopedApiErrorMessage(failure, t("The record could not be saved. Your entry is retained."))); }
    finally { pending.current = false; setBusy(false); }
  }
  const s = data?.summary;
  const fullScope=isOwner||access?.earnings===true;
  const tabs=([["overview","Overview"],["transactions","Transactions"],["expenses","Expenses"],["team","Team earnings"],["reports","Reports"],["settings","Deposit settings"]] as const).filter(([id])=>id==="team"?!independent:id==="settings"?isOwner:id==="expenses"?fullScope:true).map(([id,label])=>({id,label:t(label)}));
  const tab=tabs.some(item=>item.id===requestedTab)?requestedTab:"overview";
  const panelProps=(id:FinanceTab)=>({role:"tabpanel" as const,id:`finance-panel-${id}`,"aria-labelledby":`finance-tab-${id}`,hidden:tab!==id,className:"space-y-4"});
  const names = new Map((data?.stylists || options).map(person => [String(person.id), String(person.name)]));
  const field = (label: string, child: ReactNode) => <FinanceField label={t(label)}>{child}</FinanceField>;
  const methods = field("Payment method", <select className={input} name="method" required><option value="cash">{t("Cash")}</option><option value="card">{t("Card")}</option><option value="transfer">{t("Transfer")}</option><option value="other">{t("Other")}</option></select>);
  return <section className="space-y-4" aria-label={t("Finances")}>
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-serif text-3xl font-bold">{t("Finances")}</h1><p className="mt-1 text-sm gc-text-secondary">{t(data?.scope.kind === "own" ? "Your service sales and earned compensation." : "Sales, payments and business costs in one place.")}</p></div><div className="flex flex-wrap gap-2">{loggable ? <button className={primary} onClick={() => choose("sale")}><Plus className="mr-1 inline" size={16}/>{t("Record a sale")}</button> : null}{manageable ? <button className={button} onClick={() => choose("expense")}>{t("Add expense")}</button> : null}</div></header>
    {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">{error}<button className="ml-3 underline" onClick={() => void load()}>{t("Reload")}</button></div> : null}
    {notice ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm">{notice}</p> : null}
    {mode ? <form key={`${mode}:${selected?.id || ""}`} onSubmit={submit} className={`${panel} space-y-4`} aria-label={t(mode === "sale" ? "Record a sale" : mode === "expense" ? "Add expense" : mode === "receipt" ? "Record balance" : "Record refund")}>
      <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold">{t(mode === "sale" ? "Record a sale" : mode === "expense" ? "Add expense" : mode === "receipt" ? "Record balance" : "Record refund")}</h2><button type="button" className={button} disabled={busy} onClick={() => choose("")}>{t("Cancel")}</button></div>
      <p className="text-sm gc-text-secondary">{t("Record money handled outside the app. This does not charge a card or issue a refund.")}</p>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        {mode === "sale" ? <>{saleKind==="service"?field("Service or product", <input autoFocus required name="name" maxLength={200} className={input}/>):null}{field("Price paid", <input required name="price" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" className={input}/>)}{field("Type", <select name="kind" className={input} value={saleKind} onChange={event=>setSaleKind(event.target.value)}><option value="service">{t("Service")}</option><option value="product">{t("Product")}</option></select>)}{saleKind==="product"?<>{field("Catalog product",<select name="product_id" required className={input} defaultValue=""><option value="">{t("Choose product")}</option>{productOptions.map(product=><option data-no-translate key={String(product.id)} value={String(product.id)}>{String(product.name)}</option>)}</select>)}{field("Quantity sold",<input name="quantity" type="number" min="1" max="10000" step="1" defaultValue="1" required className={input}/>)}<p className="text-xs sm:col-span-2">{t("Enter the total price and total known cost for all units. Catalog stock is reduced once. The product name is saved from the selected catalog record.")}</p></>:null}{field("Stylist", <select required={saleKind === "service"} name="stylist_id" className={input} defaultValue=""><option value="">{t("Choose stylist")}</option>{options.map(person => <option data-no-translate key={String(person.id)} value={String(person.id)}>{String(person.name)}</option>)}</select>)}{methods}{field("Source", <select name="source" className={input}><option value="walk_in">{t("Walk-in")}</option><option value="phone">{t("Phone")}</option><option value="social">{t("Social media")}</option><option value="other">{t("Other")}</option></select>)}{field("Client name (optional)", <input name="client_name" maxLength={120} className={input}/>)}{field("Known cost (optional)", <input name="cost" inputMode="decimal" className={input}/>)}</> : null}
        {mode === "expense" ? <>{field("Category", <input name="category" required maxLength={100} className={input}/>)}{field("Amount", <input name="amount" required inputMode="decimal" className={input}/>)}{field("Treatment", <select name="treatment" className={input}><option value="operating">{t("Operating expense")}</option><option value="inventory_asset">{t("Inventory purchase — cost when sold")}</option></select>)}{field("Note", <input name="note" maxLength={1000} className={input}/>)}</> : null}
        {mode === "receipt" ? <>{field("Amount received", <input name="amount" required inputMode="decimal" className={input} defaultValue={((s?.balances.find(row => row.sale_id === selected?.id)?.unpaid_cents || 0) / 100).toFixed(2)}/>)}{methods}</> : null}
        {mode === "refund" ? <>{field("Original payment", <select required name="original_payment_id" className={input}>{data?.books.payments.filter(payment => payment.id.startsWith("receipt:") && payment.stage !== "refund" && payment.sale_id === selected?.id).map(payment => <option key={payment.id} value={payment.id.slice(8)}>{t(payment.method)} · {money(payment.amount_cents)}</option>)}</select>)}{field("Amount refunded", <input required name="amount" inputMode="decimal" className={input}/>)}{field("Reason", <input required name="note" maxLength={1000} className={input}/>)}</> : null}
        {field("Recorded date and time (optional)", <input type="datetime-local" name="occurred_at" className={input}/>)}
      </fieldset><p className="text-xs gc-text-secondary">{t("Leave the time empty to use now. An entered time uses this device's time zone.")}</p><button type="submit" disabled={busy} className={primary}>{t(busy ? "Saving…" : "Save record")}</button>
    </form> : null}
    {readable ? <>
    <WorkspaceTabs id="finance" label={t("Finance workspace")} items={tabs} selected={tab} onSelect={value=>updateFinanceLocation({finance:value})}/>
    <div ref={periodControls}><FinancePeriodControls key={`${from}:${to}`} from={from} to={to} today={today} timeZone={timeZone} busy={busy} onChange={setPeriod}/></div>
        {loading || !current ? <p role="status">{t("Loading finance records…")}</p> : null}
    {s ? <><div {...panelProps("overview")}><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Completed sales", s.completed_sales_cents, CircleDollarSign], ["Payments received", s.cash_received_cents, Wallet], ["Recorded refunds", s.by_stage.refund, ArrowDownLeft], ["Unpaid balances", s.balances.reduce((sum, row) => sum + row.unpaid_cents, 0), ReceiptText]].map(([label, value, Icon]) => { const Symbol = Icon as typeof Wallet; return <div key={String(label)} className={panel}><Symbol size={20} className="mb-3 text-magenta"/><p className="text-xs gc-text-secondary">{t(String(label))}</p><strong className="mt-1 block font-serif text-2xl">{money(Number(value))}</strong></div>; })}</div>
      <div className="grid gap-4 lg:grid-cols-2"><section className={panel}><h2 className="font-serif text-xl font-bold">{t("Completed sales by day")}</h2><div className="mt-4 space-y-2">{Object.entries(s.by_day).map(([day, row]) => <div key={day} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-xs"><span>{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</span><div className="h-3 overflow-hidden rounded bg-plum/5"><div className="h-full rounded bg-magenta" style={{ width: `${100 * row.sales_cents / Math.max(1, ...Object.values(s.by_day).map(row => row.sales_cents))}%` }}/></div><strong>{money(row.sales_cents)}</strong></div>)}{!Object.keys(s.by_day).length ? <p className="text-sm gc-text-secondary">{t("No completed sales in this period.")}</p> : null}</div></section><section className={panel}><h2 className="font-serif text-xl font-bold">{t("Payment methods")}</h2><dl className="mt-4 space-y-3">{Object.entries(s.by_method).map(([method, value]) => <div className="flex justify-between text-sm" key={method}><dt>{t(method[0].toUpperCase() + method.slice(1))}</dt><dd className="font-semibold">{money(value)}</dd></div>)}</dl><p className="mt-4 text-xs gc-text-secondary">{t("Payment methods and deposits are parts of the same receipts, not additional sales.")}</p></section></div>
      {data.scope.kind === "business" ? <BusinessMoneyInsights salonId={salonId} books={data.books} period={{from,to,timeZone}}/> : null}
      {data.scope.kind === "business" && (isOwner || (access?.earnings === true && access?.bookings === true)) ? <BusinessBookingMoney key={`${binding}:${from}:${to}`} businessId={salonId} period={{from,to,timeZone}}/> : null}
      {isOwner || access?.availability === true ? <BusinessScheduleOpportunities key={binding}/> : null}
      {data.scope.kind === "business" && (isOwner || access?.earnings === true && access?.bookings === true && access?.styles === true) ? <BusinessServiceContribution key={`contribution:${binding}`} businessId={salonId} period={{from,to,timeZone}} canCheckCapacity={isOwner || access?.styles === true && access?.availability === true}/> : null}
      </div><div {...panelProps("transactions")}><FinanceRecords books={data.books} summary={s} names={names} loggable={loggable} manageable={manageable} onAction={choose} timeZone={timeZone}/></div>
      {fullScope ? <div {...panelProps("expenses")}><FinancePeriodRecords kind="expenses" includeExpenses={true} salonId={salonId} books={data.books} period={{from,to,timeZone}} summary={s}/></div> : null}
      {!independent ? <div {...panelProps("team")}><section className={panel}><h2 className="font-serif text-xl font-bold">{t("Stylist earnings")}</h2><p className="mt-1 text-xs gc-text-secondary">{t("Service sales, earned compensation and money paid are different figures.")}</p>{fullScope ? <FinanceEarningsLeaders summary={s} names={names}/> : null}<div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(s.by_stylist).map(([id, row]) => <div key={id} className="rounded-lg border border-plum/10 p-3 text-sm"><b>{names.get(id) ? <span translate="no">{names.get(id)}</span> : t("Unassigned")}</b><dl className="mt-2 space-y-1">{[["Service sales", row.service_sales_cents], ["Commission earned", row.commission_earned_cents], ["Wages due", row.wage_due_cents], ["Compensation paid", row.paid_cents], ["Booth rent due", row.booth_rent_due_cents], ["Booth rent received", row.booth_rent_paid_cents]].map(([label, value]) => <div key={label} className="flex justify-between gap-2"><dt>{t(String(label))}</dt><dd>{money(Number(value))}</dd></div>)}</dl></div>)}</div>{!Object.keys(s.by_stylist).length ? <div className="mt-3 space-y-3"><p className="text-sm gc-text-secondary">{t("No stylist earnings in this period.")}</p>{loggable ? <button className={button} onClick={() => choose("sale")}>{t("Record a sale")}</button> : <button className={button} onClick={() => periodControls.current?.querySelector<HTMLInputElement>('input[type="date"]')?.focus()}>{t("Change reporting period")}</button>}</div> : null}</section>
      <FinanceCompensation books={data.books} summary={s} arrangements={data.arrangements} names={names} isOwner={isOwner} manageable={manageable} today={today} timeZone={timeZone} onSaved={load}/></div> : null}
      <div {...panelProps("reports")}><FinanceReportControls key={`${binding}:${from}:${to}`} from={from} to={to}/><FinancePeriodRecords kind="daily" includeExpenses={fullScope} salonId={salonId} books={data.books} period={{from,to,timeZone}} summary={s}/>
      {data.scope.kind === "business" ? <section className={panel}><h2 className="font-serif text-xl font-bold">{t("Recorded profit")}: {money(s.recorded_profit_cents)}</h2><p className="mt-2 text-sm gc-text-secondary">{t("Based on recorded sales and costs. Missing expenses or service costs mean this is not an exact margin.")}</p><p className="mt-2 text-sm">{t("Operating expenses")}: {money(s.operating_expenses_cents)} · {t("Cost of sales")}: {money(s.cost_of_sales_cents)} · {t("Sales without cost data")}: {s.costs_missing_for_sales}</p></section> : null}
      <details className="rounded-lg border border-plum/10 bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">{t("About these totals")}</summary><div className="mt-3 space-y-2"><p className="text-xs gc-text-secondary">{t("Visits")}: {s.visits} · {t("Identified clients")}: {s.identified_clients} · {t("Unnamed visits")}: {s.unnamed_visits}. {t("Verified live booking deposits and recorded external payments only. Test payments are excluded. Bank settlement is separate.")}</p>
      <p className="text-xs gc-text-secondary">{t("Product sales exclude sales tax and shipping. Product refunds use a proportional merchandise allocation. Tax treatment and bank settlement must be reconciled separately.")}</p>
      </div></details>
      {data.scope.kind === "business" && paymentEvidence ? <details className={panel}><summary className="cursor-pointer font-semibold">{t("Platform payment evidence")}</summary>{paymentEvidence}</details> : null}
      </div>
      {isOwner ? <div {...panelProps("settings")}><BusinessDepositSettings key={binding}/></div> : null}
    </> : null}</> : <p className={`${panel} text-sm`}>{t("You can record payments. This role does not have access to business finance totals.")}</p>}
  </section>;
}
