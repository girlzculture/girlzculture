"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  MapPin,
  PackageCheck,
  XCircle,
} from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import { readApiResponse } from "@/lib/apiResponseClient";

type Row = Record<string, unknown>;

function money(value: unknown) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function PickupReservationManager({
  token,
}: {
  token: string;
}) {
  const [reservation, setReservation] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/pickup/${encodeURIComponent(token)}`,
        {
          cache: "no-store",
          referrerPolicy: "no-referrer",
        },
      );
      const body = (await readApiResponse(
        response,
        "We couldn't load this pickup reservation.",
      )) as { reservation?: Row; error?: string };
      if (!response.ok || !body.reservation) {
        throw new Error(
          body.error || "This pickup reservation is no longer available.",
        );
      }
      setReservation(body.reservation);
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn't load this pickup reservation.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function cancel() {
    if (
      !window.confirm(
        "Cancel this pickup reservation? Inventory will be released. Deposits are refundable before the salon marks the order ready.",
      )
    ) {
      return;
    }
    const reason =
      window.prompt(
        "Optional reason for the salon:",
        "I no longer need this pickup reservation.",
      ) || "The customer canceled the pickup reservation.";
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/pickup/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel", reason }),
          referrerPolicy: "no-referrer",
        },
      );
      const body = (await readApiResponse(
        response,
        "We couldn't cancel this pickup reservation.",
      )) as { reservation?: Row; error?: string; policy?: string };
      if (!response.ok || !body.reservation) {
        throw new Error(
          body.error || "We couldn't cancel this pickup reservation.",
        );
      }
      setReservation(body.reservation);
      setMessage(
        body.policy || "The pickup reservation has been canceled.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn't cancel this pickup reservation.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-mist bg-white p-10 text-center text-sm text-charcoal/65"
      >
        Loading pickup reservation…
      </div>
    );
  }
  if (failed || !reservation) {
    return (
      <div className="rounded-2xl border border-coral/30 bg-white p-8 text-center">
        <XCircle className="mx-auto text-coral" size={34} />
        <h1 className="mt-3 text-2xl font-semibold text-charcoal">
          Pickup reservation unavailable
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-charcoal/65">
          {message}
        </p>
      </div>
    );
  }

  const items = Array.isArray(reservation.items)
    ? (reservation.items as Row[])
    : [];
  const salon = (reservation.salon || {}) as Row;
  const status = String(reservation.reservation_status || "Reserved");
  const closed = ["Collected", "Canceled", "Expired", "Refunded"].includes(
    status,
  );
  const address = [
    salon.address_street,
    [salon.address_city, salon.address_state, salon.address_zip]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-mist bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-teal/10 px-3 py-1 text-xs font-bold text-teal">
              <PackageCheck size={14} />
              {status}
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-charcoal">
              Pickup reservation {String(reservation.public_reference || "")}
            </h1>
            <p className="mt-2 text-sm text-charcoal/65">
              {String(salon.name || "Salon pickup")}
            </p>
          </div>
          {status === "Collected" ? (
            <CheckCircle2 className="text-teal" size={38} />
          ) : null}
        </div>
        <div className="mt-6 space-y-3">
          {items.map((item) => (
            <article
              key={String(item.id)}
              className="flex items-center gap-4 rounded-xl border border-mist bg-light-gray p-3"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-mist">
                {item.image_url ? (
                  <SafeImage
                    src={String(item.image_url)}
                    fallbackSrc={String(item.image_url)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <PackageCheck
                    className="absolute inset-0 m-auto text-charcoal/30"
                    size={25}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-charcoal">
                  {String(item.product_name)}
                </h2>
                <p className="mt-1 text-xs text-charcoal/55">
                  Quantity {String(item.quantity)}
                </p>
              </div>
              <b className="text-sm text-charcoal">
                {money(item.line_total)}
              </b>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard
          icon={CircleDollarSign}
          title="Payment"
          body={`Deposit ${money(reservation.deposit_amount)} · Balance ${money(reservation.remaining_balance)} at pickup`}
        />
        <InfoCard
          icon={CalendarClock}
          title="Pickup deadline"
          body={new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(String(reservation.pickup_deadline)))}
        />
        <InfoCard
          icon={MapPin}
          title="Pickup address"
          body={address || "Contact the salon for the pickup address."}
        />
      </section>

      <section className="rounded-2xl border border-mist bg-white p-5 sm:p-7">
        <h2 className="text-lg font-semibold text-charcoal">
          Pickup and cancellation policy
        </h2>
        <p className="mt-2 text-sm leading-6 text-charcoal/65">
          The salon will notify you when the order is ready. Canceling while
          the reservation is still Reserved releases the inventory and
          submits the deposit for refund. Once the salon marks the order Ready
          for pickup, the deposit is retained. The remaining balance is paid
          directly to the salon when you collect the product.
        </p>
        {message ? (
          <p
            role="status"
            className="mt-4 rounded-xl bg-light-gray p-3 text-sm text-charcoal"
          >
            {message}
          </p>
        ) : null}
        {!closed ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancel()}
            className="mt-5 min-h-11 rounded-xl border border-coral px-5 text-sm font-bold text-coral gc-disabled-control"
          >
            {busy ? "Canceling…" : "Cancel reservation"}
          </button>
        ) : null}
      </section>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof MapPin;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-2xl border border-mist bg-white p-5">
      <Icon size={21} className="text-teal" />
      <h2 className="mt-3 text-sm font-bold text-charcoal">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-charcoal/65">{body}</p>
    </article>
  );
}
