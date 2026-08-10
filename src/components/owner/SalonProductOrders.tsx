"use client";

import { useCallback, useEffect, useState } from "react";
import { PackageCheck, RefreshCw, Truck } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";

type Row = Record<string, unknown>;

const nextActions: Record<string, string[]> = {
  New: ["Preparing"],
  Preparing: ["Ready for Pickup", "Shipped"],
  "Ready for Pickup": ["Delivered"],
  Shipped: ["Delivered"],
};
const reservationActions: Record<string, string[]> = {
  Reserved: ["Ready for pickup", "Canceled", "Not collected"],
  "Ready for pickup": ["Collected", "Canceled", "Not collected"],
};

export default function SalonProductOrders({
  mode = "operations",
  fromDate = "",
  toDate = "",
  onFromDateChange,
  onToDateChange,
}: {
  mode?: "operations" | "finance";
  fromDate?: string;
  toDate?: string;
  onFromDateChange?: (value: string) => void;
  onToDateChange?: (value: string) => void;
}) {
  const [orders, setOrders] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(
    async (method = "GET", body?: Record<string, unknown>) => {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Your salon session has expired.");
      const response = await fetch("/api/salon/product-orders", {
        method,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const result = await readApiResponse(
        response,
        "Unable to manage pickup reservations.",
      );
      if (!response.ok) {
        throw new Error(
          result.error || "Unable to manage pickup reservations.",
        );
      }
      return result;
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await request();
      setOrders(Array.isArray(result.orders) ? result.orders : []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load orders.",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleOrders = orders.filter((order) => {
    const date = String(order.created_at || "").slice(0, 10);
    return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  });
  const paidSales = visibleOrders
    .filter((order) => ["Paid", "Succeeded"].includes(String(order.payment_status || "")))
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const refunds = visibleOrders.reduce(
    (sum, order) =>
      sum +
      (Array.isArray(order.refunds)
        ? (order.refunds as Row[]).reduce(
            (refundSum, refund) =>
              refundSum +
              (String(refund.status || "") === "Succeeded"
                ? Number(refund.amount || 0)
                : 0),
            0,
          )
        : 0),
    0,
  );

  async function advance(order: Row, status: string) {
    if (
      ["Canceled", "Not collected"].includes(status) &&
      !window.confirm(
        `${status} this reservation? Inventory will be released.`,
      )
    ) {
      return;
    }
    setBusy(`${order.id}:${status}`);
    setMessage("");
    try {
      let carrier = "";
      let tracking = "";
      if (status === "Shipped") {
        carrier = window.prompt("Shipping carrier (for example, USPS)") || "";
        tracking = window.prompt("Tracking number") || "";
        if (!carrier || !tracking) {
          setMessage(
            "Carrier and tracking number are required to mark shipped.",
          );
          return;
        }
      }
      const result = await request("POST", {
        order_id: order.id,
        fulfillment_status: status,
        carrier,
        tracking_number: tracking,
        note: "",
      });
      setOrders((current) =>
        current.map((entry) =>
          entry.id === order.id ? (result.order as Row) : entry,
        ),
      );
      const warnings = Array.isArray(result.warnings)
        ? (result.warnings as Row[])
        : [];
      setMessage(
        warnings[0]?.message
          ? String(warnings[0].message)
          : `Reservation ${String(order.public_reference)} is now ${status}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update order.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-mist bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-charcoal">
            {mode === "finance" ? "Product sales ledger" : "Pickup Reservations"}
          </h2>
          <p className="mt-1 text-xs text-charcoal/60">
            {mode === "finance"
              ? "Paid orders, refunds, fulfillment, and authoritative order references."
              : "Prepare reserved products, notify customers, and record collection."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-mist px-4 text-xs font-bold text-charcoal"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      {message ? (
        <p
          role="status"
          className="mt-4 rounded-xl bg-light-gray p-3 text-xs text-charcoal"
        >
          {message}
        </p>
      ) : null}
      {mode === "finance" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-light-gray p-4"><span className="text-[10px] font-bold uppercase text-charcoal/55">Orders</span><b className="mt-1 block text-xl text-charcoal">{visibleOrders.length}</b></div>
          <div className="rounded-xl bg-light-gray p-4"><span className="text-[10px] font-bold uppercase text-charcoal/55">Paid product sales</span><b className="mt-1 block text-xl text-charcoal">${paidSales.toFixed(2)}</b></div>
          <div className="rounded-xl bg-light-gray p-4"><span className="text-[10px] font-bold uppercase text-charcoal/55">Succeeded refunds</span><b className="mt-1 block text-xl text-charcoal">${refunds.toFixed(2)}</b></div>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-light-gray p-3"><label className="text-[9px] font-bold text-charcoal/60">From<input aria-label="Product sales start date" type="date" value={fromDate} onChange={(event)=>onFromDateChange?.(event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-mist bg-white px-2 text-[10px] font-normal"/></label><label className="text-[9px] font-bold text-charcoal/60">To<input aria-label="Product sales end date" type="date" value={toDate} onChange={(event)=>onToDateChange?.(event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-mist bg-white px-2 text-[10px] font-normal"/></label></div>
        </div>
      ) : null}
      <div className="mt-4 space-y-3">
        {visibleOrders.map((order) => {
          const items = Array.isArray(order.items)
            ? (order.items as Row[])
            : [];
          const isReservation = Boolean(order.reservation_status);
          const displayStatus = String(
            order.reservation_status || order.fulfillment_status || "",
          );
          const actions = isReservation
            ? reservationActions[displayStatus] || []
            : nextActions[String(order.fulfillment_status || "")] || [];
          return (
            <article
              key={String(order.id)}
              className="rounded-xl border border-mist bg-white p-4"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {order.fulfillment_method === "Shipping" ? (
                      <Truck size={16} className="text-teal" />
                    ) : (
                      <PackageCheck size={16} className="text-teal" />
                    )}
                    <b className="text-sm text-charcoal">
                      {String(order.public_reference)}
                    </b>
                  </div>
                  <p className="mt-1 text-[11px] text-charcoal/60">
                    {String(order.guest_name)} ·{" "}
                    {isReservation
                      ? "Pickup reservation"
                      : String(order.fulfillment_method)}{" "}
                    ·{" "}
                    {items
                      .map(
                        (item) =>
                          `${String(item.quantity)}× ${String(item.product_name)}`,
                      )
                      .join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <b className="block text-sm text-charcoal">
                    ${Number(order.total_amount || 0).toFixed(2)}
                  </b>
                  <span className="text-[10px] font-bold text-teal">
                    {displayStatus}
                  </span>
                </div>
              </div>
              {isReservation ? (
                <div className="mt-3 grid gap-2 rounded-lg bg-light-gray p-3 text-[11px] text-charcoal sm:grid-cols-3">
                  <p>
                    Deposit{" "}
                    <b>${Number(order.deposit_amount || 0).toFixed(2)}</b>
                  </p>
                  <p>
                    Balance at pickup{" "}
                    <b>
                      ${Number(order.remaining_balance || 0).toFixed(2)}
                    </b>
                  </p>
                  <p>
                    Pickup by{" "}
                    <b>
                      {new Date(
                        String(order.pickup_deadline),
                      ).toLocaleString()}
                    </b>
                  </p>
                </div>
              ) : null}
              {order.tracking_number ? (
                <p className="mt-3 rounded-lg bg-light-gray p-2 text-[11px]">
                  {String(order.carrier)} tracking:{" "}
                  <b>{String(order.tracking_number)}</b>
                </p>
              ) : null}
              {actions.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {actions
                    .filter(
                      (status) =>
                        (status !== "Shipped" ||
                          order.fulfillment_method === "Shipping") &&
                        (status !== "Ready for Pickup" ||
                          order.fulfillment_method === "Pickup"),
                    )
                    .map((status) => (
                      <button
                        type="button"
                        key={status}
                        disabled={Boolean(busy)}
                        onClick={() => void advance(order, status)}
                        className={`rounded-lg px-3 py-2 text-[10px] font-bold disabled:opacity-50 ${
                          status === "Canceled"
                            ? "border border-coral text-coral"
                            : "bg-teal text-white"
                        }`}
                      >
                        {busy === `${order.id}:${status}`
                          ? "Saving…"
                          : status}
                      </button>
                    ))}
                </div>
              ) : null}
            </article>
          );
        })}
        {!loading && !visibleOrders.length ? (
          <p className="py-8 text-center text-sm text-charcoal/50">
            {fromDate || toDate ? "No product orders match this date range." : "No product orders yet."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
