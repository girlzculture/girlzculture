"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleDollarSign,
  Download,
  FileClock,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  filterBookingTransactions,
  financeCsv,
  summarizeBookingTransactions,
  type FinanceFilters,
  type FinanceRow,
} from "@/lib/financeLedgerCore";
import { getSessionForScope } from "@/lib/supabase";
import { US_STATES } from "@/lib/usStates";

type FinanceData = {
  booking_transactions: FinanceRow[];
  billing_events: FinanceRow[];
  subscription_change_requests: FinanceRow[];
  stripe_events: FinanceRow[];
  salons: FinanceRow[];
  product_orders: FinanceRow[];
};

const empty: FinanceData = {
  booking_transactions: [],
  billing_events: [],
  subscription_change_requests: [],
  stripe_events: [],
  salons: [],
  product_orders: [],
};
const tabs = [
  "Booking Deposits",
  "Product Orders",
  "Subscription Payments",
  "Refunds & Disputes",
  "Salon Payouts",
  "Stripe Event Ledger",
] as const;
type Tab = (typeof tabs)[number];

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
function minorMoney(value: unknown, currency: unknown) {
  const code = String(currency || "usd").toUpperCase();
  try {
    return (Number(value || 0) / 100).toLocaleString("en-US", {
      style: "currency",
      currency: code,
    });
  } catch {
    return `${code} ${(Number(value || 0) / 100).toFixed(2)}`;
  }
}
function when(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}
function values(rows: FinanceRow[], key: string) {
  return [...new Set(rows.map((row) => String(row[key] || "")).filter(Boolean))]
    .sort()
    .map((value) => [value, value] as const);
}

export default function AdminFinanceDashboard() {
  const [data, setData] = useState<FinanceData>(empty);
  const [tab, setTab] = useState<Tab>("Booking Deposits");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<FinanceFilters>({
    from: "",
    to: "",
    state: "all",
    city: "all",
    salon: "all",
    paymentStatus: "all",
    payoutStatus: "all",
    mode: "all",
  });

  async function load() {
    setBusy(true);
    setError("");
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your admin session has expired.");
      const response = await fetch("/api/admin/finance", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = (await response.json()) as FinanceData & { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Unable to load finance records.");
      }
      setData({
        booking_transactions: Array.isArray(body.booking_transactions)
          ? body.booking_transactions
          : [],
        billing_events: Array.isArray(body.billing_events)
          ? body.billing_events
          : [],
        subscription_change_requests: Array.isArray(
          body.subscription_change_requests,
        )
          ? body.subscription_change_requests
          : [],
        stripe_events: Array.isArray(body.stripe_events)
          ? body.stripe_events
          : [],
        salons: Array.isArray(body.salons) ? body.salons : [],
        product_orders: [],
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load finance records.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(
    () => filterBookingTransactions(data.booking_transactions, filters),
    [data.booking_transactions, filters],
  );
  const totals = useMemo(
    () => summarizeBookingTransactions(filtered),
    [filtered],
  );
  const setFilter = (key: keyof FinanceFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  function exportCsv() {
    const blob = new Blob([financeCsv(filtered)], {
      type: "text/csv;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `girlz-culture-booking-finance-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  if (busy && !data.booking_transactions.length) {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl bg-white">
        <RefreshCw className="animate-spin text-magenta" />
      </div>
    );
  }
  if (error && !data.booking_transactions.length) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-8 text-center">
        <h2 className="font-serif text-2xl text-plum">Finance unavailable</h2>
        <p className="mt-2 text-sm text-ink/65">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-5 rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-plum/10 bg-white p-2">
        {tabs.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setTab(item)}
            className={`min-h-11 shrink-0 rounded-xl px-4 text-xs font-bold ${
              tab === item ? "bg-magenta text-white" : "text-plum"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Booking Deposits" || tab === "Salon Payouts" ? (
        <>
          <section className="rounded-2xl border border-plum/10 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Input
                label="From"
                type="date"
                value={filters.from}
                onChange={(value) => setFilter("from", value)}
              />
              <Input
                label="To"
                type="date"
                value={filters.to}
                onChange={(value) => setFilter("to", value)}
              />
              <Select
                label="State"
                value={filters.state}
                onChange={(value) => setFilter("state", value)}
                options={US_STATES.map(([code, name]) => [code, name])}
              />
              <Select
                label="City"
                value={filters.city}
                onChange={(value) => setFilter("city", value)}
                options={values(data.booking_transactions, "city")}
              />
              <Select
                label="Salon"
                value={filters.salon}
                onChange={(value) => setFilter("salon", value)}
                options={data.salons.map((salon) => [
                  String(salon.id),
                  String(salon.name),
                ])}
              />
              <Select
                label="Payment status"
                value={filters.paymentStatus}
                onChange={(value) => setFilter("paymentStatus", value)}
                options={values(data.booking_transactions, "payment_status")}
              />
              <Select
                label="Payout status"
                value={filters.payoutStatus}
                onChange={(value) => setFilter("payoutStatus", value)}
                options={values(data.booking_transactions, "payout_status")}
              />
              <Select
                label="Stripe mode"
                value={filters.mode}
                onChange={(value) => setFilter("mode", value)}
                options={[
                  ["test", "Test mode"],
                  ["live", "Live mode"],
                ]}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-plum/10 pt-4">
              <p className="text-xs text-ink/55">
                {filtered.length} transaction{filtered.length === 1 ? "" : "s"}.
                Totals below use these exact filtered rows.
              </p>
              <button
                type="button"
                onClick={exportCsv}
                disabled={!filtered.length}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta disabled:opacity-40"
              >
                <Download size={15} /> Export safe CSV
              </button>
            </div>
          </section>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Deposits collected" value={money(totals.deposits)} />
            <Metric label="Refunds" value={money(totals.refunds)} />
            <Metric
              label="Stripe processing fees"
              value={money(totals.processingFees)}
            />
            <Metric label="Platform fees" value={money(totals.platformFees)} />
            <Metric label="Net owed to salons" value={money(totals.netOwed)} />
            <Metric
              label="Balance due at salons"
              value={money(totals.balanceDue)}
            />
            <Metric
              label="Completed booking value"
              value={money(totals.completedBookingValue)}
              note="Completed appointments only; upcoming and cancelled bookings are excluded."
            />
            <Metric
              label="Adjusted booking value"
              value={money(totals.adjustedTotal)}
              note="Includes upcoming records so their deposits reconcile in this ledger."
            />
          </div>
          <BookingLedger rows={filtered} payoutView={tab === "Salon Payouts"} />
        </>
      ) : null}

      {tab === "Product Orders" ? (
        <Empty
          icon={<PackageOpen />}
          title="Product commerce has not launched"
          body="No product-order revenue is included in platform totals. This ledger is ready for verified order payments when commerce launches."
        />
      ) : null}

      {tab === "Subscription Payments" ? (
        <SubscriptionLedger
          events={data.billing_events}
          changes={data.subscription_change_requests}
        />
      ) : null}

      {tab === "Refunds & Disputes" ? (
        <RefundLedger
          bookings={filtered.filter(
            (row) =>
              Number(row.refund_amount || 0) > 0 ||
              !/not applicable|none/i.test(String(row.refund_status || "")),
          )}
          events={data.billing_events.filter((event) =>
            /refund|credit|dispute/i.test(String(event.event_type || "")),
          )}
        />
      ) : null}

      {tab === "Stripe Event Ledger" ? (
        <StripeEvents rows={data.stripe_events} />
      ) : null}
    </div>
  );
}

function BookingLedger({
  rows,
  payoutView,
}: {
  rows: FinanceRow[];
  payoutView: boolean;
}) {
  return (
    <Table
      headers={
        payoutView
          ? [
              "Payment date",
              "Booking",
              "Salon / location",
              "Deposit",
              "Stripe fee",
              "Platform fee",
              "Net owed",
              "Payout",
              "Stripe references",
            ]
          : [
              "Payment date",
              "Booking / customer",
              "Salon / location",
              "Service / stylist",
              "Original / discount",
              "Adjusted total",
              "Deposit / balance",
              "Fees / net owed",
              "Payment / refund / payout",
              "Stripe reference",
            ]
      }
    >
      {rows.length ? (
        rows.map((row) => (
          <tr
            key={String(row.booking_id)}
            className="border-b border-plum/10 align-top"
          >
            <Td>
              {when(row.date)}
              <Mode value={row.payment_mode} />
            </Td>
            <Td>
              <b>{String(row.confirmation_code || "No code")}</b>
              {!payoutView ? (
                <>
                  <small>{String(row.booking_id)}</small>
                  <small>{String(row.customer)}</small>
                </>
              ) : null}
            </Td>
            <Td>
              <b>{String(row.salon)}</b>
              <small>
                {[row.city, row.state].filter(Boolean).join(", ") ||
                  "Location unavailable"}
              </small>
            </Td>
            {payoutView ? (
              <>
                <Td>{money(row.deposit_collected)}</Td>
                <Td>{money(row.stripe_processing_fee)}</Td>
                <Td>{money(row.platform_fee)}</Td>
                <Td>{money(row.net_amount_owed_salon)}</Td>
                <Td>
                  <Status value={row.payout_status} />
                </Td>
                <Td>
                  <small>{String(row.stripe_reference || "—")}</small>
                  <small>{String(row.stripe_payout_id || "")}</small>
                </Td>
              </>
            ) : (
              <>
                <Td>
                  <b>{String(row.service)}</b>
                  <small>{String(row.stylist)}</small>
                </Td>
                <Td>
                  {money(row.original_service_value)}
                  <small>− {money(row.discount)}</small>
                </Td>
                <Td>{money(row.adjusted_total)}</Td>
                <Td>
                  <b>{money(row.deposit_collected)}</b>
                  <small>Balance {money(row.balance_due)}</small>
                </Td>
                <Td>
                  Stripe {money(row.stripe_processing_fee)}
                  <small>Platform {money(row.platform_fee)}</small>
                  <small>Net {money(row.net_amount_owed_salon)}</small>
                </Td>
                <Td>
                  <Status value={row.payment_status} />
                  <Status value={row.refund_status} />
                  <Status value={row.payout_status} />
                </Td>
                <Td>
                  <small>{String(row.stripe_reference || "—")}</small>
                  {row.stripe_receipt_url ? (
                    <a
                      href={String(row.stripe_receipt_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block font-bold text-magenta"
                    >
                      Receipt
                    </a>
                  ) : null}
                </Td>
              </>
            )}
          </tr>
        ))
      ) : (
        <EmptyRow
          columns={payoutView ? 9 : 10}
          text="No booking finance records match these filters."
        />
      )}
    </Table>
  );
}

function SubscriptionLedger({
  events,
  changes,
}: {
  events: FinanceRow[];
  changes: FinanceRow[];
}) {
  const payments = events.filter((event) =>
    /subscription|upgrade|renewal|downgrade/i.test(
      String(event.event_type || ""),
    ),
  );
  return (
    <div className="space-y-5">
      <Notice>
        Subscription entitlements activate only after the Stripe invoice and
        resulting subscription price are verified. Amounts below are stored in
        cents from Stripe events.
      </Notice>
      <Table
        headers={[
          "Date",
          "Salon",
          "Event",
          "Plan",
          "Collected",
          "Payment",
          "Stripe references",
        ]}
      >
        {payments.length ? (
          payments.map((event) => (
            <tr
              key={String(event.id)}
              className="border-b border-plum/10 align-top"
            >
              <Td>{when(event.event_date)}</Td>
              <Td>
                <b>{String(event.salon_name || "Salon unavailable")}</b>
                <small>
                  {[event.state, event.market_snapshot]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </Td>
              <Td>
                <Status value={event.event_type} />
              </Td>
              <Td>
                {String(event.previous_plan || "—")} →{" "}
                {String(event.new_plan || "—")}
              </Td>
              <Td>{minorMoney(event.amount_collected, event.currency)}</Td>
              <Td>
                <Status value={event.payment_status} />
              </Td>
              <Td>
                <small>Invoice {String(event.stripe_invoice_id || "—")}</small>
                <small>Event {String(event.stripe_event_id || "—")}</small>
              </Td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={7} text="No verified subscription payments yet." />
        )}
      </Table>
      <Table
        headers={[
          "Requested",
          "Salon",
          "Plan change",
          "Unused credit",
          "Prorated charge",
          "Tax",
          "Due / collected",
          "Renewal",
          "Status",
        ]}
      >
        {changes.length ? (
          changes.map((change) => (
            <tr
              key={String(change.id)}
              className="border-b border-plum/10 align-top"
            >
              <Td>{when(change.requested_at)}</Td>
              <Td>
                <small>{String(change.salon_id)}</small>
              </Td>
              <Td>
                {String(change.previous_plan)} → {String(change.new_plan)}
              </Td>
              <Td>{minorMoney(change.proration_credit, change.currency)}</Td>
              <Td>{minorMoney(change.proration_charge, change.currency)}</Td>
              <Td>{minorMoney(change.tax_amount, change.currency)}</Td>
              <Td>
                {minorMoney(change.amount_due, change.currency)}
                <small>
                  Collected{" "}
                  {minorMoney(change.amount_collected, change.currency)}
                </small>
              </Td>
              <Td>
                {minorMoney(change.renewal_amount, change.currency)}
                <small>{when(change.renewal_date)}</small>
              </Td>
              <Td>
                <Status value={change.status} />
              </Td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={9} text="No plan-change requests yet." />
        )}
      </Table>
    </div>
  );
}

function RefundLedger({
  bookings,
  events,
}: {
  bookings: FinanceRow[];
  events: FinanceRow[];
}) {
  return (
    <div className="space-y-5">
      <Table
        headers={[
          "Booking",
          "Customer",
          "Salon",
          "Deposit",
          "Refund",
          "Status",
          "Stripe reference",
        ]}
      >
        {bookings.length ? (
          bookings.map((row) => (
            <tr
              key={String(row.booking_id)}
              className="border-b border-plum/10"
            >
              <Td>{String(row.confirmation_code || row.booking_id)}</Td>
              <Td>{String(row.customer)}</Td>
              <Td>{String(row.salon)}</Td>
              <Td>{money(row.deposit_collected)}</Td>
              <Td>{money(row.refund_amount)}</Td>
              <Td>
                <Status value={row.refund_status} />
              </Td>
              <Td>
                <small>{String(row.stripe_reference || "—")}</small>
              </Td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={7} text="No booking refunds match the filters." />
        )}
      </Table>
      <Table
        headers={[
          "Date",
          "Salon",
          "Provider event",
          "Refunded",
          "Credited",
          "Status",
          "Event ID",
        ]}
      >
        {events.length ? (
          events.map((event) => (
            <tr key={String(event.id)} className="border-b border-plum/10">
              <Td>{when(event.event_date)}</Td>
              <Td>{String(event.salon_name || "Salon unavailable")}</Td>
              <Td>{String(event.event_type)}</Td>
              <Td>{minorMoney(event.amount_refunded, event.currency)}</Td>
              <Td>{minorMoney(event.amount_credited, event.currency)}</Td>
              <Td>
                <Status value={event.payment_status} />
              </Td>
              <Td>
                <small>{String(event.stripe_event_id)}</small>
              </Td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={7} text="No Stripe refund or dispute events yet." />
        )}
      </Table>
    </div>
  );
}

function StripeEvents({ rows }: { rows: FinanceRow[] }) {
  return (
    <div className="space-y-5">
      <Notice>
        <ShieldCheck size={17} className="mr-2 inline text-magenta" />
        This is a sanitized processing ledger. It contains event IDs and
        statuses, never provider payloads, card data, tokens, or secrets.
      </Notice>
      <Table
        headers={[
          "Provider time",
          "Event type",
          "Mode",
          "Processing",
          "Attempts",
          "Last attempt",
          "Engine reference",
          "Stripe event ID",
        ]}
      >
        {rows.length ? (
          rows.map((row) => (
            <tr key={String(row.id)} className="border-b border-plum/10">
              <Td>{when(row.provider_created_at || row.processed_at)}</Td>
              <Td>{String(row.event_type)}</Td>
              <Td>
                <Mode value={row.livemode ? "live" : "test"} />
              </Td>
              <Td>
                <Status value={row.processing_status} />
              </Td>
              <Td>{String(row.attempt_count || 1)}</Td>
              <Td>{when(row.last_attempt_at)}</Td>
              <Td>
                <small>{String(row.error_reference || "—")}</small>
              </Td>
              <Td>
                <small>{String(row.id)}</small>
              </Td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={8} text="No Stripe webhook events yet." />
        )}
      </Table>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <section className="rounded-2xl border border-plum/10 bg-white p-5">
      <CircleDollarSign className="text-magenta" size={19} />
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-ink/50">
        {label}
      </p>
      <p className="mt-1 font-serif text-2xl text-plum">{value}</p>
      {note ? <p className="mt-2 text-[10px] leading-4 text-ink/50">{note}</p> : null}
    </section>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber/25 bg-amber/10 p-4 text-xs leading-5 text-ink/70">
      {children}
    </div>
  );
}
function Empty({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-plum/20 bg-white p-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blush text-magenta">
        {icon}
      </div>
      <h2 className="mt-4 font-serif text-2xl text-plum">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink/60">
        {body}
      </p>
    </div>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-plum/10 bg-white">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-cream">
          <tr>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-3 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="max-w-64 px-3 py-3">
      {children}
    </td>
  );
}
function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return (
    <tr>
      <td colSpan={columns} className="p-10 text-center text-ink/50">
        <FileClock className="mx-auto mb-2 text-magenta" />
        {text}
      </td>
    </tr>
  );
}
function Status({ value }: { value: unknown }) {
  const label = String(value || "Not recorded");
  return (
    <span className="mr-1 mt-1 inline-flex rounded-full bg-blush px-2 py-1 text-[9px] font-bold text-plum">
      {label}
    </span>
  );
}
function Mode({ value }: { value: unknown }) {
  const live = String(value).toLowerCase() === "live";
  return (
    <span
      className={`mt-1 block w-fit rounded-full px-2 py-1 text-[8px] font-extrabold uppercase ${
        live ? "bg-green-100 text-green-800" : "bg-amber/15 text-amber-800"
      }`}
    >
      {live ? "Live money" : "Test mode"}
    </span>
  );
}
function Input({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
}) {
  return (
    <label className="text-[10px] font-bold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 px-3 text-xs"
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="text-[10px] font-bold">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 px-3 text-xs"
      >
        <option value="all">All</option>
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
