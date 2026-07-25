"use client";

import { useCallback, useEffect, useState } from "react";
import { PackageCheck, RefreshCw, Truck } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";

type Row = Record<string, unknown>;

const nextActions: Record<string, string[]> = {
  New: ["Preparing"],
  Preparing: ["Ready for Pickup", "Shipped"],
  "Ready for Pickup": ["Delivered"],
  Shipped: ["Delivered"],
};

export default function SalonProductOrders() {
  const [orders, setOrders] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (method = "GET", body?: Record<string, unknown>) => {
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
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Unable to manage product orders.");
    return result;
  }, []);

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

  async function advance(order: Row, status: string) {
    setBusy(`${order.id}:${status}`);
    setMessage("");
    try {
      let carrier = "";
      let tracking = "";
      if (status === "Shipped") {
        carrier = window.prompt("Shipping carrier (for example, USPS)") || "";
        tracking = window.prompt("Tracking number") || "";
        if (!carrier || !tracking) {
          setMessage("Carrier and tracking number are required to mark shipped.");
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
          entry.id === order.id ? result.order : entry,
        ),
      );
      setMessage(`Order ${String(order.public_reference)} is now ${status}.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update order.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mt-6 rounded-[14px] border border-plum/10 bg-white/75 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-plum">Online Orders</h2>
          <p className="mt-1 text-xs text-ink/55">
            Prepare pickup orders and record carrier tracking for shipments.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-plum/15 px-4 py-2 text-xs font-bold text-plum"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      {message ? (
        <p className="mt-4 rounded-lg bg-blush/35 p-3 text-xs text-plum">
          {message}
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {orders.map((order) => {
          const items = Array.isArray(order.items) ? (order.items as Row[]) : [];
          const actions =
            nextActions[String(order.fulfillment_status || "")] || [];
          return (
            <article
              key={String(order.id)}
              className="rounded-xl border border-plum/10 bg-white p-4"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {order.fulfillment_method === "Shipping" ? (
                      <Truck size={16} className="text-magenta" />
                    ) : (
                      <PackageCheck size={16} className="text-magenta" />
                    )}
                    <b className="text-sm text-plum">
                      {String(order.public_reference)}
                    </b>
                  </div>
                  <p className="mt-1 text-[11px] text-ink/60">
                    {String(order.guest_name)} ·{" "}
                    {String(order.fulfillment_method)} ·{" "}
                    {items
                      .map(
                        (item) =>
                          `${String(item.quantity)}× ${String(item.product_name)}`,
                      )
                      .join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <b className="block text-sm">
                    ${Number(order.total_amount || 0).toFixed(2)}
                  </b>
                  <span className="text-[10px] font-bold text-magenta">
                    {String(order.fulfillment_status)}
                  </span>
                </div>
              </div>
              {order.tracking_number ? (
                <p className="mt-3 rounded-lg bg-blush/30 p-2 text-[11px]">
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
                        className="rounded-lg bg-magenta px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50"
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
        {!loading && !orders.length ? (
          <p className="py-8 text-center text-sm text-ink/50">
            No online product orders yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}
