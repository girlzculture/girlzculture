"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleDollarSign, RefreshCw } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";
import type { FinanceRow } from "@/lib/financeLedgerCore";

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function paid(value: unknown) {
  return /paid|succeeded|complete/i.test(String(value || ""));
}

function terminalPayout(row: FinanceRow) {
  return (
    Boolean(row.stripe_transfer_id) ||
    /transferred to salon|paid to bank|refunded|not required|transfer reversed/i.test(
      String(row.payout_status || ""),
    )
  );
}

function payoutBlocked(row: FinanceRow) {
  const deposit = Number(row.deposit_collected || row.deposit_amount || 0);
  const refund = Number(row.refund_amount || 0);
  const owed = Number(row.net_amount_owed_salon || 0);
  const refundState = String(row.refund_status || "");
  return (
    !paid(row.payment_status) ||
    deposit <= 0 ||
    owed <= 0 ||
    refund + 0.0001 >= deposit ||
    /pending|dispute|failed|requires attention/i.test(refundState) ||
    Boolean(row.stripe_transfer_reversal_id)
  );
}

export default function AdminSalonPayoutWorkspace({
  rows,
  onChanged,
}: {
  rows: FinanceRow[];
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState("");
  const [messages, setMessages] = useState<Record<string, string>>({});
  const payoutRows = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            Number(row.net_amount_owed_salon || 0) > 0 ||
            /awaiting payout|ready to pay|processing|failed|transferred|reconciliation/i.test(
              String(row.payout_status || ""),
            ),
        )
        .sort(
          (left, right) =>
            new Date(String(right.date || "")).getTime() -
            new Date(String(left.date || "")).getTime(),
        ),
    [rows],
  );

  async function release(row: FinanceRow) {
    const bookingId = String(row.booking_id || "");
    if (!bookingId || busy) return;
    const amount = Number(row.net_amount_owed_salon || 0);
    const confirmed = window.confirm(
      `Release ${money(amount)} for ${String(
        row.public_reference || bookingId,
      )} to ${String(
        row.salon || "this salon",
      )}'s connected Stripe account? Stripe will handle the later bank payout on that account's schedule.`,
    );
    if (!confirmed) return;

    setBusy(bookingId);
    setMessages((current) => ({ ...current, [bookingId]: "" }));
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your admin session has expired.");
      const response = await fetch("/api/admin/finance/payout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ booking_id: bookingId, confirm: true }),
      });
      const body = (await readApiResponse(
        response,
        "The salon transfer could not be completed.",
      )) as {
        error?: string;
        message?: string;
        transfer?: { id?: string; amount?: number; status?: string };
        reconciliation_required?: boolean;
      };
      if (!response.ok) {
        throw new Error(body.error || "The salon transfer could not be completed.");
      }
      setMessages((current) => ({
        ...current,
        [bookingId]:
          body.message ||
          `Released ${money(
            body.transfer?.amount,
          )} to the salon's connected Stripe account. Stripe will handle the bank payout on that account's schedule.`,
      }));
      await onChanged();
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [bookingId]:
          error instanceof Error
            ? error.message
            : "The salon transfer could not be completed.",
      }));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-2xl border border-plum/10 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CircleDollarSign className="text-magenta" size={20} />
            <h2 className="font-serif text-xl text-plum sm:text-2xl">
              Salon transfers
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-ink/60">
            “Pay Salon” releases the verified net amount to the salon’s connected
            Stripe account. Stripe’s separate bank-payout schedule remains
            visible as a different stage; a transfer is never mislabeled as a
            completed bank payout.
          </p>
        </div>
        <span className="rounded-full bg-blush px-3 py-2 text-[10px] font-bold text-plum">
          {payoutRows.length} payout record{payoutRows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {payoutRows.map((row) => {
          const bookingId = String(row.booking_id || "");
          const transferred = terminalPayout(row);
          const blocked = payoutBlocked(row);
          const requiresReconciliation = /reconciliation/i.test(
            String(row.payout_status || row.transfer_status || ""),
          );
          const processing =
            busy === bookingId ||
            /processing/i.test(String(row.payout_status || ""));
          return (
            <article
              key={bookingId || String(row.public_reference)}
              className="min-w-0 rounded-xl border border-plum/10 bg-cream/35 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-plum">
                    {String(row.salon || "Salon")}
                  </p>
                  <p className="mt-1 break-all text-[10px] text-ink/50">
                    {String(row.public_reference || bookingId || "Reference pending")}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-magenta">
                  {String(row.payout_status || "Not configured")}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white p-3">
                  <dt className="text-[9px] font-bold uppercase text-ink/45">
                    Deposit
                  </dt>
                  <dd className="mt-1 font-bold text-plum">
                    {money(row.deposit_collected || row.deposit_amount)}
                  </dd>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <dt className="text-[9px] font-bold uppercase text-ink/45">
                    Net owed
                  </dt>
                  <dd className="mt-1 font-bold text-plum">
                    {money(row.net_amount_owed_salon)}
                  </dd>
                </div>
                <div className="col-span-2 rounded-lg bg-white p-3">
                  <dt className="text-[9px] font-bold uppercase text-ink/45">
                    Transfer evidence
                  </dt>
                  <dd className="mt-1 break-all text-[11px] text-ink/65">
                    {String(
                      row.stripe_transfer_id ||
                        row.transfer_status ||
                        "Not transferred",
                    )}
                  </dd>
                </div>
              </dl>

              {messages[bookingId] ? (
                <p
                  role="status"
                  className="mt-3 rounded-lg border border-plum/10 bg-white p-3 text-[11px] leading-5 text-plum"
                >
                  {messages[bookingId]}
                </p>
              ) : null}

              <button
                type="button"
                disabled={
                  processing ||
                  transferred ||
                  blocked ||
                  requiresReconciliation ||
                  !bookingId
                }
                onClick={() => void release(row)}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-magenta px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-ink/25"
              >
                {requiresReconciliation ? (
                  "Reconcile existing transfer first"
                ) : processing ? (
                  <>
                    <RefreshCw className="animate-spin" size={15} />
                    Processing transfer…
                  </>
                ) : transferred ? (
                  <>
                    <CheckCircle2 size={15} />
                    Transfer recorded
                  </>
                ) : blocked ? (
                  "Review payment or refund first"
                ) : (
                  `Pay Salon ${money(row.net_amount_owed_salon)}`
                )}
              </button>
            </article>
          );
        })}
        {!payoutRows.length ? (
          <p className="rounded-xl border border-dashed border-plum/15 p-8 text-center text-xs text-ink/50 lg:col-span-2">
            No booking deposits currently require a salon transfer.
          </p>
        ) : null}
      </div>
    </section>
  );
}
