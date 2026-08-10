"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CircleDollarSign,
  Download,
  FileClock,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import {
  classifyBillingTransaction,
  filterBookingTransactions,
  financeCsv,
  summarizeBookingTransactions,
  summarizeUnifiedFinanceTransactions,
  unifiedFinanceCsv,
  type FinanceFilters,
  type FinanceRow,
  type UnifiedFinanceRow,
} from "@/lib/financeLedgerCore";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";
import { US_STATES } from "@/lib/usStates";
import { formatZonedDateTime } from "@/lib/dateTime";
import { useAdminListScrollRestoration } from "@/components/admin/useAdminListContext";

type FinanceData = {
  booking_transactions: FinanceRow[];
  billing_events: FinanceRow[];
  subscription_change_requests: FinanceRow[];
  stripe_events: FinanceRow[];
  salons: FinanceRow[];
  product_orders: FinanceRow[];
  product_refunds: FinanceRow[];
  admin_time_zone: string;
};

const empty: FinanceData = {
  booking_transactions: [],
  billing_events: [],
  subscription_change_requests: [],
  stripe_events: [],
  salons: [],
  product_orders: [],
  product_refunds: [],
  admin_time_zone: "America/New_York",
};
const tabs = [
  "Transactions",
  "Booking Deposits",
  "Product Orders",
  "Subscription Payments",
  "Refunds & Disputes",
  "Salon Payouts",
  "Stripe Event Ledger",
] as const;
type Tab = (typeof tabs)[number];

type UnifiedTransaction = UnifiedFinanceRow;

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
function when(value: unknown, timeZone = "America/New_York") {
  if (value) return formatZonedDateTime(value, timeZone);
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}
function values(rows: FinanceRow[], key: string) {
  return [...new Set(rows.map((row) => String(row[key] || "")).filter(Boolean))]
    .sort()
    .map((value) => [value, value] as const);
}

export default function AdminFinanceDashboard({
  initialTransactionKey,
  returnTo = "/admin/finance",
}: {
  initialTransactionKey?: string;
  returnTo?: string;
} = {}) {
  const [data, setData] = useState<FinanceData>(empty);
  const [tab, setTab] = useState<Tab>("Transactions");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionType, setTransactionType] = useState("all");
  const [selectedSalonId, setSelectedSalonId] = useState("");
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
  useAdminListScrollRestoration(!busy && !initialTransactionKey);

  const load = useCallback(async (salonId = "") => {
    setBusy(true);
    setError("");
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your admin session has expired.");
      const endpoint = salonId
        ? `/api/admin/finance?salon=${encodeURIComponent(salonId)}`
        : "/api/admin/finance";
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = (await readApiResponse(
        response,
        "Unable to load finance records.",
      )) as FinanceData & { error?: string };
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
        product_orders: Array.isArray(body.product_orders)
          ? body.product_orders
          : [],
        product_refunds: Array.isArray(body.product_refunds)
          ? body.product_refunds
          : [],
        admin_time_zone: String(body.admin_time_zone || "America/New_York"),
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
  }, []);
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const salonId = search
      .get("salon")
      ?.trim() || "";
    const timer = window.setTimeout(() => {
      const requestedTab = search.get("tab") as Tab | null;
      if (requestedTab && tabs.includes(requestedTab)) setTab(requestedTab);
      setTransactionSearch(search.get("q") || "");
      setTransactionType(search.get("type") || "all");
      setFilters((current) => ({
        ...current,
        from: search.get("from") || "",
        to: search.get("to") || "",
        state: search.get("state") || "all",
        city: search.get("city") || "all",
        salon: salonId || "all",
        paymentStatus: search.get("payment_status") || "all",
        payoutStatus: search.get("payout_status") || "all",
        mode: search.get("mode") || "all",
      }));
      if (salonId) {
        setSelectedSalonId(salonId);
      }
      void load(salonId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(
    () => filterBookingTransactions(data.booking_transactions, filters),
    [data.booking_transactions, filters],
  );
  const totals = useMemo(
    () => summarizeBookingTransactions(filtered),
    [filtered],
  );
  const unifiedTransactions = useMemo(() => {
    const salonById = new Map(
      data.salons.map((salon) => [String(salon.id), salon]),
    );
    const orderById = new Map(
      data.product_orders.map((order) => [String(order.id), order]),
    );
    const recordLocation = (salonId: unknown) => {
      const salon = salonById.get(String(salonId || ""));
      return {
        salon: salon?.name || "Salon unavailable",
        city: salon?.address_city || "",
        state: salon?.address_state || "",
      };
    };
    const matchesSharedFilters = (row: FinanceRow) => {
      const timestamp = new Date(String(row.date || "")).getTime();
      const from = filters.from
        ? new Date(`${filters.from}T00:00:00`).getTime()
        : Number.NEGATIVE_INFINITY;
      const to = filters.to
        ? new Date(`${filters.to}T23:59:59.999`).getTime()
        : Number.POSITIVE_INFINITY;
      return (
        Number.isFinite(timestamp) &&
        timestamp >= from &&
        timestamp <= to &&
        (filters.state === "all" || row.state === filters.state) &&
        (filters.city === "all" || row.city === filters.city) &&
        (filters.salon === "all" || row.salon_id === filters.salon) &&
        (filters.paymentStatus === "all" ||
          row.payment_status === filters.paymentStatus) &&
        (filters.payoutStatus === "all" ||
          row.payout_status === filters.payoutStatus) &&
        (filters.mode === "all" || row.payment_mode === filters.mode)
      );
    };
    const bookingRows: UnifiedTransaction[] = filtered.map((row) => ({
      ...row,
      transaction_key: `booking-${String(row.booking_id)}`,
      transaction_type: "Booking deposit",
      gross_amount: Number(row.deposit_collected || 0),
      refund_amount: Number(row.refund_amount || 0),
    }));
    const productRows: UnifiedTransaction[] = data.product_orders
      .map((row) => {
        const salon = salonById.get(String(row.salon_id || ""));
        return {
          ...row,
          date: row.paid_at || row.created_at,
          transaction_key: `product-${String(row.id)}`,
          transaction_type: "Product order" as const,
          public_reference: row.public_reference || "Reference pending",
          customer: row.guest_name || "Customer",
          salon: salon?.name || "Salon unavailable",
          city: salon?.address_city || "",
          state: salon?.address_state || "",
          gross_amount: Number(row.total_amount || 0),
          refund_amount: 0,
          payment_mode: row.payment_mode || "test",
        } as UnifiedTransaction;
      })
      .filter(matchesSharedFilters);
    const productRefundRows: UnifiedTransaction[] = data.product_refunds
      .filter((refund) =>
        ["Pending", "Succeeded"].includes(String(refund.status)),
      )
      .map((refund) => {
        const order = orderById.get(String(refund.order_id || ""));
        const location = recordLocation(order?.salon_id);
        return {
          ...refund,
          ...location,
          date: refund.created_at,
          salon_id: order?.salon_id,
          customer: order?.guest_name || "Customer",
          public_reference:
            order?.public_reference || "Reference pending",
          transaction_key: `product-refund-${String(refund.id)}`,
          transaction_type: "Product refund" as const,
          gross_amount: 0,
          refund_amount: Number(refund.amount || 0),
          net_amount_owed_salon: 0,
          stripe_processing_fee: 0,
          platform_fee: 0,
          payment_status: refund.status || "Not recorded",
          payout_status: "Not applicable",
          payment_mode: order?.payment_mode || "test",
          stripe_reference: refund.stripe_refund_id || "",
        } as UnifiedTransaction;
      })
      .filter(matchesSharedFilters);
    const billingInvoiceIds = new Set(
      data.billing_events
        .map((event) => String(event.stripe_invoice_id || ""))
        .filter(Boolean),
    );
    const billingRows: UnifiedTransaction[] = data.billing_events
      .map((event) => {
        const location = recordLocation(event.salon_id);
        const eventType = String(event.event_type || "Billing event");
        const refund =
          Number(event.amount_refunded || 0) +
          Number(event.amount_credited || 0);
        const type = classifyBillingTransaction(eventType);
        return {
          ...event,
          ...location,
          date: event.event_date,
          customer: "Not applicable",
          public_reference:
            event.stripe_invoice_id ||
            event.stripe_event_id ||
            "Reference pending",
          transaction_key: `billing-${String(event.id)}`,
          transaction_type: type,
          gross_amount: Number(event.amount_collected || 0) / 100,
          refund_amount: refund / 100,
          net_amount_owed_salon: 0,
          stripe_processing_fee: 0,
          platform_fee: 0,
          payout_status: "Not applicable",
          payment_mode: event.livemode ? "live" : "test",
          stripe_reference:
            event.stripe_invoice_id || event.stripe_event_id || "",
        } as UnifiedTransaction;
      })
      .filter(matchesSharedFilters);
    const changeRows: UnifiedTransaction[] =
      data.subscription_change_requests
        .filter(
          (change) =>
            !change.stripe_invoice_id ||
            !billingInvoiceIds.has(String(change.stripe_invoice_id)),
        )
        .map((change) => {
          const location = recordLocation(change.salon_id);
          return {
            ...change,
            ...location,
            date: change.requested_at,
            customer: "Not applicable",
            public_reference:
              change.stripe_invoice_id ||
              change.stripe_payment_reference ||
              "Reference pending",
            transaction_key: `plan-change-${String(change.id)}`,
            transaction_type: "Plan adjustment" as const,
            gross_amount: Number(change.amount_collected || 0) / 100,
            refund_amount: Number(change.proration_credit || 0) / 100,
            net_amount_owed_salon: 0,
            stripe_processing_fee: 0,
            platform_fee: 0,
            payment_status: change.status || "Not recorded",
            payout_status: "Not applicable",
            payment_mode: change.payment_mode || "test",
            stripe_reference:
              change.stripe_invoice_id ||
              change.stripe_payment_reference ||
              "",
          } as UnifiedTransaction;
        })
        .filter(matchesSharedFilters);
    const query = transactionSearch.trim().toLowerCase();
    return [
      ...bookingRows,
      ...productRows,
      ...productRefundRows,
      ...billingRows,
      ...changeRows,
    ]
      .filter(
        (row) =>
          (transactionType === "all" ||
            row.transaction_type === transactionType) &&
          (!query ||
            [
              row.public_reference,
              row.booking_id,
              row.id,
              row.salon,
              row.customer,
              row.service,
            ]
              .map((value) => String(value || "").toLowerCase())
              .some((value) => value.includes(query))),
      )
      .sort(
        (left, right) =>
          new Date(String(right.date || "")).getTime() -
          new Date(String(left.date || "")).getTime(),
      );
  }, [
    data.product_orders,
    data.product_refunds,
    data.billing_events,
    data.subscription_change_requests,
    data.salons,
    filtered,
    filters,
    transactionSearch,
    transactionType,
  ]);
  const unifiedTotals = useMemo(
    () => summarizeUnifiedFinanceTransactions(unifiedTransactions),
    [unifiedTransactions],
  );
  const setFilter = (key: keyof FinanceFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const selectedSalon = selectedSalonId
    ? data.salons.find((salon) => String(salon.id) === selectedSalonId)
    : null;
  const financeReturnPath = useMemo(() => {
    const query = new URLSearchParams();
    if (tab !== "Transactions") query.set("tab", tab);
    if (transactionSearch) query.set("q", transactionSearch);
    if (transactionType !== "all") query.set("type", transactionType);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (filters.state !== "all") query.set("state", filters.state);
    if (filters.city !== "all") query.set("city", filters.city);
    if (filters.salon !== "all") query.set("salon", filters.salon);
    if (filters.paymentStatus !== "all") query.set("payment_status", filters.paymentStatus);
    if (filters.payoutStatus !== "all") query.set("payout_status", filters.payoutStatus);
    if (filters.mode !== "all") query.set("mode", filters.mode);
    const suffix = query.toString();
    return suffix ? `/admin/finance?${suffix}` : "/admin/finance";
  }, [filters, tab, transactionSearch, transactionType]);

  function exportCsv() {
    const blob = new Blob([financeCsv(filtered, data.admin_time_zone)], {
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

  function exportUnifiedCsv() {
    const csv = unifiedFinanceCsv(
      unifiedTransactions,
      data.admin_time_zone,
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    const salonSuffix = selectedSalonId ? "-selected-salon" : "";
    link.download = `girlz-culture-finance-transactions${salonSuffix}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function refundProductOrder(order: FinanceRow) {
    const total = Number(order.total_amount || 0);
    const alreadyRefunded = data.product_refunds
      .filter(
        (refund) =>
          String(refund.order_id) === String(order.id) &&
          ["Pending", "Succeeded"].includes(String(refund.status)),
      )
      .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
    const refundable = Math.max(0, total - alreadyRefunded);
    if (!refundable) {
      setActionMessage("This order has no remaining refundable amount.");
      return;
    }
    const amountInput = window.prompt(
      `Refund amount (maximum ${money(refundable)}):`,
      refundable.toFixed(2),
    );
    if (amountInput === null) return;
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0 || amount > refundable) {
      setActionMessage(
        `Enter an amount between $0.01 and ${money(refundable)}.`,
      );
      return;
    }
    const reason =
      window.prompt(
        "Reason: non_delivery, damaged_or_wrong, duplicate_charge, fraud, or salon_unable_to_fulfill",
        "non_delivery",
      ) || "";
    if (
      ![
        "non_delivery",
        "damaged_or_wrong",
        "duplicate_charge",
        "fraud",
        "salon_unable_to_fulfill",
      ].includes(reason)
    ) {
      setActionMessage("Choose one of the supported refund reasons.");
      return;
    }
    const notes = window.prompt("Internal notes (optional):", "") || "";
    setActionBusy(String(order.id));
    setActionMessage("");
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your admin session has expired.");
      const response = await fetch("/api/admin/finance/product-refund", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: order.id,
          amount,
          reason,
          notes,
        }),
      });
      const body = (await readApiResponse(
        response,
        "The refund could not be processed.",
      )) as {
        error?: string;
        refund?: FinanceRow;
      };
      if (!response.ok)
        throw new Error(body.error || "The refund could not be processed.");
      setActionMessage(
        `Refund ${String(body.refund?.status || "submitted")} for ${String(order.public_reference || order.id)}.`,
      );
      await load(selectedSalonId);
    } catch (refundError) {
      setActionMessage(
        refundError instanceof Error
          ? refundError.message
          : "The refund could not be processed.",
      );
    } finally {
      setActionBusy("");
    }
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
          onClick={() => void load(selectedSalonId)}
          className="mt-5 rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (initialTransactionKey) {
    const focused = unifiedTransactions.find((row) => row.transaction_key === initialTransactionKey);
    return <div data-admin-finance-detail className="space-y-5">
      <Link href={returnTo} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/15 bg-white px-4 text-xs font-bold text-plum"><ArrowLeft size={16}/>Back to filtered transactions</Link>
      {focused ? <section className="rounded-2xl border border-plum/10 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-magenta">{focused.transaction_type}</p><h2 className="mt-1 font-serif text-3xl text-plum">{String(focused.public_reference || "Transaction detail")}</h2><p className="mt-1 text-xs text-ink/55">Recorded {when(focused.date, data.admin_time_zone)}</p></div><Status value={focused.payment_status}/></div><TransactionDetails row={focused} timeZone={data.admin_time_zone}/></section> : <section className="rounded-2xl border border-dashed border-plum/20 bg-white p-8 text-center"><h2 className="font-serif text-2xl text-plum">Transaction unavailable</h2><p className="mt-2 text-sm text-ink/55">The transaction was removed, is outside your permissions, or no longer matches this salon scope.</p></section>}
    </div>;
  }

  return (
    <div className="space-y-5">
      {selectedSalonId ? (
        <section className="rounded-2xl border border-magenta/20 bg-blush/45 px-5 py-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-magenta">
            Salon financial records
          </p>
          <h2 className="mt-1 font-serif text-2xl text-plum">
            {String(selectedSalon?.name || "Selected salon")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-ink/60">
            This view is limited to this salon. Totals and CSV exports are
            calculated from the same filtered transaction rows.
          </p>
        </section>
      ) : null}
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

      {tab === "Transactions" ? (
        <>
          <section className="rounded-2xl border border-plum/10 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-[10px] font-bold">
                Search
                <span className="relative mt-1 block">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-3 text-ink/40"
                  />
                  <input
                    type="search"
                    value={transactionSearch}
                    onChange={(event) =>
                      setTransactionSearch(event.target.value)
                    }
                    placeholder="Reference, salon, customer, service"
                    className="min-h-10 w-full rounded-lg border border-plum/15 pl-9 pr-3 text-xs"
                  />
                </span>
              </label>
              <Select
                label="Transaction type"
                value={transactionType}
                onChange={setTransactionType}
                 options={[
                   ["Booking deposit", "Booking deposit"],
                   ["Product order", "Product order"],
                   ["Product refund", "Product refund"],
                   ["Subscription payment", "Subscription payment"],
                   ["Subscription refund", "Subscription refund"],
                   ["Plan adjustment", "Plan adjustment"],
                   ["Billing event", "Other billing event"],
                 ]}
              />
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
                options={values(
                  [...data.booking_transactions, ...unifiedTransactions],
                  "city",
                )}
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
                options={values(
                  [
                    ...data.booking_transactions,
                    ...data.product_orders,
                  ],
                  "payment_status",
                )}
              />
              <Select
                label="Payout status"
                value={filters.payoutStatus}
                onChange={(value) => setFilter("payoutStatus", value)}
                options={values(
                  [
                    ...data.booking_transactions,
                    ...data.product_orders,
                  ],
                  "payout_status",
                )}
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
                {unifiedTransactions.length} matching transaction
                {unifiedTransactions.length === 1 ? "" : "s"}. Summary and CSV
                use the same filtered rows in {data.admin_time_zone}.
              </p>
              <button
                type="button"
                onClick={exportUnifiedCsv}
                disabled={!unifiedTransactions.length}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta disabled:opacity-40"
              >
                <Download size={15} /> Export filtered CSV
              </button>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-4">
            <FinanceGroup title="Money received">
              <SummaryLine
                label="Customer payments"
                value={money(unifiedTotals.received)}
                help="Paid booking deposits plus paid product orders in the current filter."
              />
            </FinanceGroup>
            <FinanceGroup title="Money returned">
              <SummaryLine
                label="Refunded or pending refund"
                value={money(unifiedTotals.returned)}
                help="Booking refunds plus successful or provider-pending product refunds."
              />
            </FinanceGroup>
            <FinanceGroup title="Money owed">
              <SummaryLine
                label="Net owed to salons"
                value={money(unifiedTotals.owed)}
                help="Stored salon liability after platform and processing fees."
              />
            </FinanceGroup>
            <FinanceGroup title="Platform accounting">
              <SummaryLine
                label="Platform fees"
                value={money(unifiedTotals.platform)}
                help="Platform fee evidence stored on each transaction."
              />
              <SummaryLine
                label="Processing fees"
                value={money(unifiedTotals.processing)}
                help="Provider processing fee evidence stored on each transaction."
              />
            </FinanceGroup>
          </div>

          <UnifiedTransactionLedger
            rows={unifiedTransactions}
            timeZone={data.admin_time_zone}
            returnPath={financeReturnPath}
          />
        </>
      ) : null}

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
          <BookingLedger
            rows={filtered}
            payoutView={tab === "Salon Payouts"}
            timeZone={data.admin_time_zone}
          />
        </>
      ) : null}

      {tab === "Product Orders" ? (
        <>
          {actionMessage ? (
            <p
              role="status"
              className="rounded-xl border border-plum/10 bg-white px-4 py-3 text-xs text-plum"
            >
              {actionMessage}
            </p>
          ) : null}
          <ProductOrderLedger
            rows={data.product_orders}
            salons={data.salons}
            timeZone={data.admin_time_zone}
            actionBusy={actionBusy}
            onRefund={refundProductOrder}
          />
        </>
      ) : null}

      {tab === "Subscription Payments" ? (
        <SubscriptionLedger
          events={data.billing_events}
          changes={data.subscription_change_requests}
          timeZone={data.admin_time_zone}
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
          productRefunds={data.product_refunds}
          timeZone={data.admin_time_zone}
        />
      ) : null}

      {tab === "Stripe Event Ledger" ? (
        <StripeEvents
          rows={data.stripe_events}
          timeZone={data.admin_time_zone}
        />
      ) : null}
    </div>
  );
}

function UnifiedTransactionLedger({
  rows,
  timeZone,
  returnPath,
}: {
  rows: UnifiedTransaction[];
  timeZone: string;
  returnPath: string;
}) {
  return (
    <section className="rounded-2xl border border-plum/10 bg-white">
      <div className="border-b border-plum/10 px-5 py-4">
        <h2 className="font-serif text-xl text-plum">Transaction ledger</h2>
        <p className="mt-1 text-xs text-ink/55">
          Open a transaction to reconcile internal records with sanitized
          Stripe evidence. Full provider payloads and card data are never
          displayed.
        </p>
      </div>

      <div className="space-y-3 p-3 lg:hidden">
        {rows.length ? (
          rows.map((row) => (
              <article
                key={row.transaction_key}
                className="rounded-xl border border-plum/10 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Status value={row.transaction_type} />
                    <p className="mt-2 font-serif text-lg text-plum">
                      {String(row.public_reference || "Reference pending")}
                    </p>
                    <p className="text-[11px] text-ink/55">
                      {when(row.date, timeZone)}
                    </p>
                  </div>
                  <Mode value={row.payment_mode} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <SummaryLine label="Salon" value={String(row.salon)} />
                  <SummaryLine label="Customer" value={String(row.customer)} />
                  <SummaryLine label="Gross" value={money(row.gross_amount)} />
                  <SummaryLine
                    label="Refund"
                    value={money(row.refund_amount)}
                  />
                  <SummaryLine
                    label="Net owed"
                    value={money(row.net_amount_owed_salon)}
                  />
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-ink/45">
                      Status
                    </p>
                    <Status value={row.payment_status} />
                  </div>
                </div>
                <Link
                  href={`/admin/finance/${encodeURIComponent(String(row.transaction_key))}?return=${encodeURIComponent(returnPath)}`}
                  className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-plum/15 text-xs font-bold text-plum"
                >
                  Open transaction details
                </Link>
              </article>
            ))
        ) : (
          <div className="p-8 text-center text-xs text-ink/50">
            <FileClock className="mx-auto mb-2 text-magenta" />
            No finance transactions match these filters.
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-cream">
            <tr>
              {[
                "Date / time",
                "Reference",
                "Type",
                "Salon",
                "Customer",
                "Gross",
                "Refund",
                "Net owed",
                "Status",
                "",
              ].map((header) => (
                <th key={header} className="whitespace-nowrap px-3 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                  <TransactionRows
                    key={row.transaction_key}
                    row={row}
                    timeZone={timeZone}
                    returnPath={returnPath}
                  />
                ))
            ) : (
              <EmptyRow
                columns={10}
                text="No finance transactions match these filters."
              />
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TransactionRows({
  row,
  timeZone,
  returnPath,
}: {
  row: UnifiedTransaction;
  timeZone: string;
  returnPath: string;
}) {
  return (
      <tr className="border-b border-plum/10 align-top">
        <Td>
          {when(row.date, timeZone)}
          <Mode value={row.payment_mode} />
        </Td>
        <Td>
          <b>{String(row.public_reference || "Reference pending")}</b>
        </Td>
        <Td>{String(row.transaction_type)}</Td>
        <Td>{String(row.salon || "Salon unavailable")}</Td>
        <Td>{String(row.customer || "Customer")}</Td>
        <Td>{money(row.gross_amount)}</Td>
        <Td>{money(row.refund_amount)}</Td>
        <Td>{money(row.net_amount_owed_salon)}</Td>
        <Td>
          <Status value={row.payment_status} />
          <Status value={row.payout_status} />
        </Td>
        <Td>
          <Link
            href={`/admin/finance/${encodeURIComponent(String(row.transaction_key))}?return=${encodeURIComponent(returnPath)}`}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-plum/15 px-3 text-[10px] font-bold text-plum"
          >
            Details
          </Link>
        </Td>
      </tr>
  );
}

function TransactionDetails({
  row,
  timeZone,
}: {
  row: UnifiedTransaction;
  timeZone: string;
}) {
  const isBooking = row.transaction_type === "Booking deposit";
  const items = Array.isArray(row.items) ? (row.items as FinanceRow[]) : [];
  const auditHistory = (
    Array.isArray(isBooking ? row.audit_history : row.events)
      ? (isBooking ? row.audit_history : row.events)
      : []
  ) as FinanceRow[];
  const internalId = String(
    (isBooking ? row.booking_id : row.id) || "Not recorded",
  );
  return (
    <div className="mt-4 rounded-xl border border-plum/10 bg-white p-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DetailBlock
          title="Internal evidence"
          rows={[
            ["Internal UUID", internalId],
            ["Public reference", row.public_reference],
            ["Recorded", when(row.date, timeZone)],
            ["Mode", row.payment_mode],
          ]}
        />
        <DetailBlock
          title={isBooking ? "Appointment" : "Products"}
          rows={
            isBooking
              ? [
                  ["Service", row.service],
                  ["Stylist", row.stylist],
                  ["Appointment", when(row.appointment_date, timeZone)],
                  ["Booking status", row.booking_status],
                ]
              : [
                  [
                    "Items",
                    items.length
                      ? items
                          .map(
                            (item) =>
                              `${String(item.product_name || "Product")} × ${Number(item.quantity || 1)}`,
                          )
                          .join(", ")
                      : "No item snapshot",
                  ],
                  ["Fulfillment", row.fulfillment_method],
                  ["Fulfillment status", row.fulfillment_status],
                  ["Tracking", row.tracking_number || "Not recorded"],
                ]
          }
        />
        <DetailBlock
          title="Amounts"
          rows={
            isBooking
              ? [
                  ["Original value", money(row.original_service_value)],
                  ["Discount", money(row.discount)],
                  ["Adjusted total", money(row.adjusted_total)],
                  ["Deposit", money(row.deposit_collected)],
                  ["Balance at salon", money(row.balance_due)],
                ]
              : [
                  ["Subtotal", money(row.subtotal)],
                  ["Discount", money(row.discount_amount)],
                  ["Shipping", money(row.shipping_amount)],
                  ["Tax", money(row.tax_amount)],
                  ["Total", money(row.total_amount)],
                ]
          }
        />
        <DetailBlock
          title="Reconciliation"
          rows={[
            ["Provider fee", money(row.stripe_processing_fee)],
            ["Platform fee", money(row.platform_fee)],
            ["Refund", money(row.refund_amount)],
            ["Net owed to salon", money(row.net_amount_owed_salon)],
            ["Payout status", row.payout_status],
          ]}
        />
      </div>
      <div className="mt-4 border-t border-plum/10 pt-4">
        <p className="text-[9px] font-bold uppercase tracking-[.12em] text-ink/45">
          Sanitized provider and audit references
        </p>
        <div className="mt-2 grid gap-2 text-[10px] text-ink/60 sm:grid-cols-2 xl:grid-cols-4">
          <Evidence
            label="Checkout / charge"
            value={
              row.stripe_checkout_session_id ||
              row.stripe_reference ||
              "Not recorded"
            }
          />
          {!isBooking ? (
            <Evidence
              label="Tax calculation"
              value={row.stripe_tax_calculation_id || "Not recorded"}
            />
          ) : null}
          <Evidence
            label="Payment intent"
            value={row.stripe_payment_intent_id || "Not recorded"}
          />
          <Evidence
            label="Transfer"
            value={row.stripe_transfer_id || "Not recorded"}
          />
          <Evidence
            label="Refund"
            value={row.stripe_refund_id || "Not recorded"}
          />
        </div>
      </div>
      <div className="mt-4 border-t border-plum/10 pt-4">
        <p className="text-[9px] font-bold uppercase tracking-[.12em] text-ink/45">
          Audit history
        </p>
        {auditHistory.length ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {auditHistory.slice(0, 6).map((event, index) => (
              <div
                key={String(event.id || `${event.created_at}-${index}`)}
                className="rounded-lg bg-cream/70 p-3 text-[10px] text-ink/65"
              >
                <b className="block text-plum">
                  {String(event.action || event.event_type || "Recorded event")
                    .replaceAll("_", " ")}
                </b>
                <span className="mt-1 block">
                  {when(event.created_at, timeZone)}
                </span>
                <span className="mt-1 block">
                  Actor: {String(event.actor_role || "system")}
                </span>
                {event.reason || event.note ? (
                  <span className="mt-1 block break-words">
                    {String(event.reason || event.note)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-ink/50">
            No additional audit events are recorded for this transaction.
          </p>
        )}
      </div>
    </div>
  );
}

function FinanceGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-plum/10 bg-white p-5">
      <p className="font-serif text-lg text-plum">{title}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function SummaryLine({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[.1em] text-ink/45">
        {label}
      </p>
      <p className="mt-1 font-serif text-xl text-plum">{value}</p>
      {help ? (
        <p title={help} className="mt-1 text-[9px] leading-4 text-ink/45">
          {help}
        </p>
      ) : null}
    </div>
  );
}

function DetailBlock({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, unknown]>;
}) {
  return (
    <div>
      <p className="font-serif text-sm text-plum">{title}</p>
      <dl className="mt-2 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="text-[9px] font-bold uppercase tracking-wide text-ink/40">
              {label}
            </dt>
            <dd className="max-w-48 break-words text-right text-[10px] text-ink/70">
              {String(value ?? "Not recorded")}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Evidence({ label, value }: { label: string; value: unknown }) {
  return (
    <p className="min-w-0 rounded-lg bg-cream px-3 py-2">
      <b className="block text-ink/45">{label}</b>
      <span className="block truncate" title={String(value)}>
        {String(value)}
      </span>
    </p>
  );
}

function BookingLedger({
  rows,
  payoutView,
  timeZone,
}: {
  rows: FinanceRow[];
  payoutView: boolean;
  timeZone: string;
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
              {when(row.date, timeZone)}
              <Mode value={row.payment_mode} />
            </Td>
            <Td>
              <b>
                {String(
                  row.public_reference ||
                    row.confirmation_code ||
                    "Reference pending",
                )}
              </b>
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
  timeZone,
}: {
  events: FinanceRow[];
  changes: FinanceRow[];
  timeZone: string;
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
              <Td>{when(event.event_date, timeZone)}</Td>
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
              <Td>{when(change.requested_at, timeZone)}</Td>
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
                <small>{when(change.renewal_date, timeZone)}</small>
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

function ProductOrderLedger({
  rows,
  salons,
  timeZone,
  actionBusy,
  onRefund,
}: {
  rows: FinanceRow[];
  salons: FinanceRow[];
  timeZone: string;
  actionBusy: string;
  onRefund: (order: FinanceRow) => void;
}) {
  const salonNames = new Map(
    salons.map((salon) => [String(salon.id), String(salon.name)]),
  );
  const paid = rows.reduce(
    (sum, row) => sum + Number(row.total_amount || 0),
    0,
  );
  const fees = rows.reduce(
    (sum, row) => sum + Number(row.stripe_processing_fee || 0),
    0,
  );
  const net = rows.reduce(
    (sum, row) => sum + Number(row.net_amount_owed_salon || 0),
    0,
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Product payments" value={money(paid)} />
        <Metric label="Stripe processing fees" value={money(fees)} />
        <Metric label="Net owed to salons" value={money(net)} />
        <Metric
          label="Orders"
          value={String(rows.length)}
          note="Product orders only; appointment deposits remain in their own ledger."
        />
      </div>
      <Table
        headers={[
          "Paid",
          "Order",
          "Salon / customer",
          "Fulfillment",
          "Subtotal / total",
          "Fees / net",
          "Payment / payout",
          "Stripe evidence",
          "Actions",
        ]}
      >
        {rows.length ? (
          rows.map((order) => (
            <tr key={String(order.id)} className="border-b border-plum/10">
              <Td>{when(order.paid_at || order.created_at, timeZone)}</Td>
              <Td>
                <b>{String(order.public_reference || order.id)}</b>
                <small>
                  {Array.isArray(order.items)
                    ? `${(order.items as FinanceRow[]).length} line item(s)`
                    : "No item snapshot"}
                </small>
              </Td>
              <Td>
                {salonNames.get(String(order.salon_id)) || "Salon unavailable"}
                <small>{String(order.guest_name || "Customer")}</small>
              </Td>
              <Td>
                {String(order.fulfillment_method)}
                <small>{String(order.fulfillment_status)}</small>
                {order.tracking_number ? (
                  <small>
                    {String(order.carrier)} {String(order.tracking_number)}
                  </small>
                ) : null}
              </Td>
              <Td>
                {money(order.subtotal)}
                <small>Total {money(order.total_amount)}</small>
                <small>
                  Tax {money(order.tax_amount)} · Shipping{" "}
                  {money(order.shipping_amount)}
                </small>
              </Td>
              <Td>
                {money(order.stripe_processing_fee)}
                <small>Net {money(order.net_amount_owed_salon)}</small>
                <small>Platform {money(order.platform_fee)}</small>
              </Td>
              <Td>
                <Status value={order.payment_status} />
                <small>{String(order.payout_status)}</small>
              </Td>
              <Td>
                <small>
                  Session {String(order.stripe_checkout_session_id || "—")}
                </small>
                <small>
                  Payment {String(order.stripe_payment_intent_id || "—")}
                </small>
                <small>
                  Transfer {String(order.stripe_transfer_id || "—")}
                </small>
                <small>
                  Account {String(order.stripe_connected_account_id || "—")}
                </small>
              </Td>
              <Td>
                <button
                  type="button"
                  disabled={
                    actionBusy === String(order.id) ||
                    String(order.payment_status) === "Refunded" ||
                    !order.stripe_payment_intent_id
                  }
                  onClick={() => onRefund(order)}
                  className="rounded-lg border border-magenta px-3 py-2 text-[11px] font-bold text-magenta disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {actionBusy === String(order.id)
                    ? "Submitting…"
                    : "Issue refund"}
                </button>
              </Td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={9} text="No verified product orders yet." />
        )}
      </Table>
    </div>
  );
}

function RefundLedger({
  bookings,
  events,
  productRefunds,
  timeZone,
}: {
  bookings: FinanceRow[];
  events: FinanceRow[];
  productRefunds: FinanceRow[];
  timeZone: string;
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
          "Cancelled / issued by",
          "Funding",
          "Stripe reference",
        ]}
      >
        {bookings.length ? (
          bookings.map((row) => (
            <tr
              key={String(row.booking_id)}
              className="border-b border-plum/10"
            >
              <Td>
                {String(
                  row.public_reference ||
                    row.confirmation_code ||
                    row.booking_id,
                )}
              </Td>
              <Td>{String(row.customer)}</Td>
              <Td>{String(row.salon)}</Td>
              <Td>{money(row.deposit_collected)}</Td>
              <Td>{money(row.refund_amount)}</Td>
              <Td>
                <Status value={row.refund_status} />
              </Td>
              <Td>
                <b className="capitalize">
                  {String(row.cancelled_by || "Not recorded")}
                </b>
                <small className="capitalize">
                  Refund: {String(row.refund_initiated_by || "Not issued")}
                </small>
              </Td>
              <Td>
                <Status value={row.refund_funding_state} />
              </Td>
              <Td>
                <small>{String(row.stripe_reference || "—")}</small>
                <small>{String(row.stripe_refund_id || "")}</small>
                <small>
                  {String(row.stripe_transfer_reversal_id || "")}
                </small>
              </Td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={9} text="No booking refunds match the filters." />
        )}
      </Table>
      <Table
        headers={[
          "Date",
          "Product order",
          "Reason",
          "Amount",
          "Status",
          "Stripe refund",
          "Engine reference",
        ]}
      >
        {productRefunds.length ? (
          productRefunds.map((refund) => (
            <tr key={String(refund.id)} className="border-b border-plum/10">
              <Td>{when(refund.created_at, timeZone)}</Td>
              <Td>{String(refund.order_id)}</Td>
              <Td>{String(refund.reason).replaceAll("_", " ")}</Td>
              <Td>{money(refund.amount)}</Td>
              <Td><Status value={refund.status} /></Td>
              <Td><small>{String(refund.stripe_refund_id || "—")}</small></Td>
              <Td><small>{String(refund.error_reference || "—")}</small></Td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={7} text="No product-order refunds yet." />
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
              <Td>{when(event.event_date, timeZone)}</Td>
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

function StripeEvents({
  rows,
  timeZone,
}: {
  rows: FinanceRow[];
  timeZone: string;
}) {
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
              <Td>
                {when(row.provider_created_at || row.processed_at, timeZone)}
              </Td>
              <Td>{String(row.event_type)}</Td>
              <Td>
                <Mode value={row.livemode ? "live" : "test"} />
              </Td>
              <Td>
                <Status value={row.processing_status} />
              </Td>
              <Td>{String(row.attempt_count || 1)}</Td>
              <Td>{when(row.last_attempt_at, timeZone)}</Td>
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
