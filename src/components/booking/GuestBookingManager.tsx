"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type Row = Record<string, unknown>;
type Proposal = Row & { options?: Row[] };
type ManagedBooking = {
  booking: Row;
  salon: Row;
  style: Row;
  stylist: Row | null;
  proposals: Proposal[];
  access_expires_at: string;
};

function money(value: unknown) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function when(value: unknown, timeZone = "America/New_York") {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(new Date(String(value)));
}

export default function GuestBookingManager({ token }: { token: string }) {
  const [data, setData] = useState<ManagedBooking | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [selectedOption, setSelectedOption] = useState("");
  const [cancelReason, setCancelReason] = useState(
    "Customer requested cancellation",
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/guest/bookings/manage?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ManagedBooking & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error || "Unable to load booking.");
        }
        setData(body);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load booking.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [token]);

  async function act(
    action: "cancel" | "accept_reschedule" | "decline_reschedule",
    proposalId?: string,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/guest/bookings/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        referrerPolicy: "no-referrer",
        body: JSON.stringify({
          token,
          action,
          proposal_id: proposalId,
          option_id: selectedOption,
          reason: cancelReason,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        manage_url?: string;
        status?: string;
        warnings?: Array<{ message?: string }>;
      };
      if (!response.ok) throw new Error(body.error || "Unable to update booking.");
      if (action === "cancel") {
        setNotice("Your booking is cancelled. Confirmation has been sent.");
        setData((current) =>
          current
            ? {
                ...current,
                booking: { ...current.booking, status: "Cancelled" },
              }
            : current,
        );
        return;
      }
      setNotice(
        body.warnings?.[0]?.message ||
          (action === "accept_reschedule"
            ? "The new appointment time is confirmed. An updated confirmation is on its way."
            : "The salon has been told that you declined this proposal."),
      );
      if (body.manage_url) window.location.assign(body.manage_url);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update booking.",
      );
    } finally {
      setBusy(false);
    }
  }

  const pendingProposal = useMemo(
    () =>
      data?.proposals.find(
        (proposal) => String(proposal.status) === "Pending",
      ) || null,
    [data],
  );
  const salonTimeZone = String(data?.salon.time_zone || "America/New_York");
  const address = data
    ? [
        data.salon.address_street,
        data.salon.address_line2,
        data.salon.address_city,
        [data.salon.address_state, data.salon.address_zip]
          .filter(Boolean)
          .join(" "),
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const inactive = data
    ? ["cancelled", "canceled", "completed", "refunded"].includes(
        String(data.booking.status || "").toLowerCase(),
      )
    : false;

  if (!data && busy) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center text-plum">
        <RefreshCw className="animate-spin" aria-label="Loading booking" />
      </div>
    );
  }
  if (!data) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-plum/10 bg-white p-7 text-center shadow-sm">
        <ShieldCheck className="mx-auto text-magenta" size={42} />
        <h1 className="mt-4 font-serif text-3xl text-plum">
          Your secure link needs refreshing
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          {error || "This Manage Booking link is unavailable."}
        </p>
        <Link
          href="/booking/recover"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-magenta px-6 font-bold text-white"
        >
          Request a new link
        </Link>
      </section>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-5 lg:grid-cols-[1.35fr_.65fr]">
      <main className="space-y-5">
        <section className="rounded-2xl border border-plum/10 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.18em] text-magenta">
                Confirmation {String(data.booking.confirmation_code || "")}
              </p>
              <h1 className="mt-2 font-serif text-4xl text-plum">
                {String(data.style.name || "Salon appointment")}
              </h1>
              <p className="mt-1 text-sm text-ink/60">
                Booking ID {String(data.booking.id)}
              </p>
            </div>
            <span className="rounded-full bg-blush px-4 py-2 text-xs font-extrabold text-plum">
              {String(data.booking.status)}
            </span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-cream p-4">
              <div className="flex items-center gap-2 font-bold text-plum">
                <CalendarDays size={18} /> Appointment
              </div>
              <p className="mt-2 text-sm leading-6">
                {when(data.booking.appointment_datetime, salonTimeZone)}
              </p>
            </div>
            <div className="rounded-xl bg-cream p-4">
              <div className="flex items-center gap-2 font-bold text-plum">
                <Clock3 size={18} /> Duration &amp; stylist
              </div>
              <p className="mt-2 text-sm leading-6">
                {Number(data.booking.duration_hours || 0)} hours ·{" "}
                {String(data.stylist?.name || "Salon assigned")}
              </p>
            </div>
          </div>
        </section>

        {pendingProposal ? (
          <section className="rounded-2xl border border-magenta/25 bg-blush/45 p-5 sm:p-7">
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-magenta">
              Response needed
            </p>
            <h2 className="mt-2 font-serif text-3xl text-plum">
              The salon proposed new times
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              {String(pendingProposal.message || pendingProposal.reason || "")}
            </p>
            <div className="mt-5 grid gap-3">
              {(pendingProposal.options || []).map((option) => (
                <label
                  key={String(option.id)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-plum/10 bg-white p-4"
                >
                  <input
                    type="radio"
                    name="reschedule-option"
                    value={String(option.id)}
                    checked={selectedOption === String(option.id)}
                    onChange={(event) => setSelectedOption(event.target.value)}
                    className="accent-magenta"
                  />
                  <span className="text-sm font-bold">
                    {when(option.appointment_datetime, salonTimeZone)}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || !selectedOption}
                onClick={() =>
                  void act("accept_reschedule", String(pendingProposal.id))
                }
                className="min-h-11 rounded-xl bg-magenta px-5 text-sm font-bold text-white disabled:opacity-50"
              >
                Accept selected time
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act("decline_reschedule", String(pendingProposal.id))
                }
                className="min-h-11 rounded-xl border border-magenta px-5 text-sm font-bold text-magenta disabled:opacity-50"
              >
                Decline proposal
              </button>
            </div>
          </section>
        ) : null}

        {!inactive ? (
          <section className="rounded-2xl border border-plum/10 bg-white p-5 sm:p-7">
            <h2 className="font-serif text-2xl text-plum">
              Need to cancel?
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink/65">
              Cancellation is available only within the published policy.
              Reservation deposits remain subject to the terms accepted at
              checkout.
            </p>
            <label className="mt-4 block text-xs font-bold text-ink/75">
              Reason
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                maxLength={160}
                className="mt-2 min-h-24 w-full rounded-xl border border-plum/15 bg-cream/40 p-3 text-sm outline-none focus:border-magenta"
              />
            </label>
            <button
              type="button"
              disabled={busy || !cancelReason.trim()}
              onClick={() => {
                if (
                  window.confirm(
                    "Cancel this appointment? This cannot be undone from this link.",
                  )
                ) {
                  void act("cancel");
                }
              }}
              className="mt-4 min-h-11 rounded-xl border border-magenta px-5 text-sm font-bold text-magenta disabled:opacity-50"
            >
              Cancel booking
            </button>
          </section>
        ) : null}
      </main>

      <aside className="space-y-5">
        <section className="rounded-2xl bg-plum p-6 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-gold">
            Your salon
          </p>
          <h2 className="mt-2 font-serif text-3xl">
            {String(data.salon.name)}
          </h2>
          <p className="mt-4 flex gap-2 text-sm leading-6 text-white/75">
            <MapPin className="shrink-0" size={18} /> {address}
          </p>
          <div className="mt-5 grid gap-2 text-sm">
            <a href={`tel:${String(data.salon.phone || "")}`}>
              {String(data.salon.phone || "")}
            </a>
            <a href={`mailto:${String(data.salon.email || "")}`}>
              {String(data.salon.email || "")}
            </a>
          </div>
        </section>
        <section className="rounded-2xl border border-plum/10 bg-white p-6">
          <h2 className="font-serif text-2xl text-plum">Price summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt>Total</dt>
              <dd className="font-bold">
                {money(data.booking.estimated_total)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Deposit paid</dt>
              <dd className="font-bold">
                {money(data.booking.deposit_amount)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-plum/10 pt-3">
              <dt>Balance due at salon</dt>
              <dd className="font-extrabold text-magenta">
                {money(data.booking.balance_due)}
              </dd>
            </div>
          </dl>
        </section>
        <section className="rounded-2xl border border-plum/10 bg-blush/45 p-6">
          <div className="flex items-center gap-2 font-bold text-plum">
            <CheckCircle2 size={19} /> An account is optional
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/65">
            This secure link is enough to manage this booking. Create an account
            only if you want all future appointments in one place.
          </p>
          <Link
            href="/login?mode=signup"
            className="mt-4 inline-flex font-bold text-magenta"
          >
            Create an account
          </Link>
        </section>
      </aside>

      {(error || notice) && (
        <div
          role="status"
          className={`fixed bottom-5 left-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 rounded-xl px-5 py-4 text-sm font-bold shadow-xl ${
            error ? "bg-ink text-white" : "bg-plum text-white"
          }`}
        >
          {error || notice}
        </div>
      )}
    </div>
  );
}
