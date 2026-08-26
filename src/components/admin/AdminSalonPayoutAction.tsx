"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDollarSign, RefreshCw } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";

type Row = Record<string, unknown>;

type PayoutData = {
  booking?: Row;
  account?: Row;
  eligibility?: { can_pay?: boolean; reasons?: string[] };
  attempts?: Row[];
  provider_warning?: string | null;
  transfer_explanation?: string;
};

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function headers(json = false) {
  const session = await getSessionForScope("admin");
  if (!session) throw new Error("Your Platform Admin session has expired.");
  return { Authorization: `Bearer ${session.access_token}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}

export default function AdminSalonPayoutAction({
  bookingId,
  onChanged,
}: {
  bookingId: string;
  onChanged?: () => Promise<void> | void;
}) {
  const [data, setData] = useState<PayoutData>({});
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/finance/payout?booking=${encodeURIComponent(bookingId)}`, { headers: await headers(), cache: "no-store" });
      const body = await readApiResponse(response, "Unable to load this payout.") as PayoutData & { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to load this payout.");
      setData(body);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load this payout.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay() {
    if (!confirmed || paying) return;
    setPaying(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/finance/payout", {
        method: "POST",
        headers: await headers(true),
        body: JSON.stringify({ booking_id: bookingId, confirm: true }),
      });
      const body = await readApiResponse(response, "The salon transfer could not be completed.") as Row & { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || "The salon transfer could not be completed.");
      setNotice(String(body.message || "The salon transfer was completed."));
      setConfirmed(false);
      await load();
      await onChanged?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The salon transfer could not be completed.");
    } finally { setPaying(false); }
  }

  if (loading) return <section className="mt-5 rounded-xl border border-plum/10 bg-cream/40 p-4 text-xs text-ink/55">Checking Stripe Connect payout readiness…</section>;
  const booking = data.booking || {};
  const account = data.account || {};
  const alreadyTransferred = Boolean(booking.stripe_transfer_id);
  const canPay = Boolean(data.eligibility?.can_pay);
  const reasons = data.eligibility?.reasons || [];
  const deposit = Number(booking.deposit_amount || 0);
  const refund = Number(booking.refund_amount || 0);
  const processingFee = Number(booking.stripe_processing_fee || 0);
  const platformFee = Number(booking.platform_fee || 0);
  const net = Number(booking.net_amount_owed_salon || 0);

  return <section data-admin-salon-payout className="mt-5 rounded-2xl border border-plum/10 bg-cream/35 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${alreadyTransferred ? "bg-emerald-100 text-emerald-700" : "bg-white text-magenta"}`}>{alreadyTransferred ? <CheckCircle2 size={20}/> : <CircleDollarSign size={20}/>}</span><div><h3 className="font-serif text-xl text-plum">Salon payout</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-ink/60">{data.transfer_explanation || "Release the verified booking amount to the salon's connected Stripe account."}</p></div></div><button type="button" onClick={() => void load()} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-plum/15 px-3 text-[10px] font-bold text-plum"><RefreshCw size={13}/>Refresh Stripe status</button></div>

    <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5"><Fact label="Deposit collected" value={money(deposit)}/><Fact label="Stripe processing fee" value={money(processingFee)}/><Fact label="Girlz Culture fee" value={money(platformFee)}/><Fact label="Refunds / credits" value={money(refund)}/><Fact label="Verified net to salon" value={money(net)} strong/></div>

    <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-white p-4"><b className="text-xs text-plum">Connected Stripe account</b><dl className="mt-2 space-y-1 text-[11px] text-ink/60"><div className="flex justify-between gap-3"><dt>Account</dt><dd className="font-mono">{String(account.id || "Not connected")}</dd></div><div className="flex justify-between gap-3"><dt>Transfers</dt><dd>{String(account.transfers_capability || "inactive")}</dd></div><div className="flex justify-between gap-3"><dt>Bank payouts</dt><dd>{account.payouts_enabled ? "Enabled" : "Not enabled"}</dd></div><div className="flex justify-between gap-3"><dt>Requirements</dt><dd>{[...(account.currently_due as string[] || []), ...(account.past_due as string[] || [])].length || "None"}</dd></div></dl></div><div className="rounded-xl bg-white p-4"><b className="text-xs text-plum">Current transfer state</b><p className="mt-2 text-sm font-bold text-plum">{String(booking.payout_status || "Not recorded")}</p><p className="mt-1 text-[11px] leading-5 text-ink/55">Transfer: {String(booking.transfer_status || "Not transferred")}<br/>Bank payout: {String(booking.bank_payout_status || "Not started")}</p>{booking.stripe_transfer_id ? <p className="mt-2 break-all font-mono text-[10px] text-ink/45">{String(booking.stripe_transfer_id)}</p> : null}</div></div>

    {data.provider_warning ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{data.provider_warning}</p> : null}
    {!canPay && !alreadyTransferred && reasons.length ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="flex gap-2"><AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={16}/><div><b className="text-xs text-amber-950">Not ready to transfer</b><ul className="mt-1 space-y-1 text-[11px] text-amber-900">{reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></div></div></div> : null}
    {notice ? <p role="status" className="mt-3 rounded-lg bg-blush/50 p-3 text-xs leading-5 text-plum">{notice}</p> : null}

    {canPay && !alreadyTransferred ? <div className="mt-4 rounded-xl border border-magenta/20 bg-white p-4"><label className="flex items-start gap-3 text-xs leading-5 text-ink/70"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 accent-magenta"/><span>I confirm that I reviewed this booking, Stripe deposit, refunds, fees, connected salon account, and the verified <b>{money(net)}</b> net amount.</span></label><button type="button" disabled={!confirmed || paying} onClick={() => void pay()} className="mt-3 min-h-11 rounded-lg bg-magenta px-6 text-xs font-bold text-white disabled:opacity-45">{paying ? "Releasing funds…" : `Pay Salon ${money(net)}`}</button><p className="mt-2 text-[10px] leading-4 text-ink/45">The operation uses a booking-specific Stripe idempotency key. Repeated clicks cannot create a second active transfer.</p></div> : null}
    {alreadyTransferred ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">Transferred to the salon's Stripe balance. Stripe controls the connected account's later bank payout timing.</p> : null}

    {data.attempts?.length ? <details className="mt-4 rounded-xl border border-plum/10 bg-white"><summary className="cursor-pointer px-4 py-3 text-xs font-bold text-plum">Payout attempt history ({data.attempts.length})</summary><div className="space-y-2 border-t border-plum/10 p-3">{data.attempts.map((attempt) => <div key={String(attempt.id)} className="grid gap-1 rounded-lg bg-cream/50 p-3 text-[10px] sm:grid-cols-4"><span><b>Attempt</b><br/>{String(attempt.attempt_number)}</span><span><b>Status</b><br/>{String(attempt.status)}</span><span><b>Amount</b><br/>{money(attempt.amount)}</span><span><b>Reference</b><br/>{String(attempt.stripe_transfer_id || attempt.failure_reference || "Pending")}</span></div>)}</div></details> : null}
  </section>;
}

function Fact({label,value,strong=false}:{label:string;value:string;strong?:boolean}){return <div className={`rounded-xl p-3 ${strong?"bg-plum text-white":"bg-white text-plum"}`}><b className="block text-[10px] uppercase tracking-wide opacity-65">{label}</b><span className="mt-1 block font-serif text-xl">{value}</span></div>;}