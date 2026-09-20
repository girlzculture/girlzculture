"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { ScopedApiError, scopedApiErrorMessage } from "@/lib/scopedApiCore";

type Method = { type: string; brand?: string; last4?: string; expMonth?: number; expYear?: number };
type Snapshot = { paymentMethod: Method | null; status: "available" | "none" | "unavailable"; updatePending: boolean; updateAllowed?: boolean; warning?: string; billingMode?: "test" | "live" };
type Outcome = { updated?: boolean; cancelled?: boolean; expired?: boolean; pending?: boolean };
const endpoint = "/api/stripe/portal";

/** A returned URL is a request to verify Stripe, never proof of a saved card. */
export default function SubscriptionPaymentMethod({ disabled = false }: { disabled?: boolean }) {
  const { translateSource: t } = useI18n();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const generation = useRef(0);
  const operation = useCallback(async (begin = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const current = generation.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const api = await createAuthenticatedApiClient("salon");
      const post = <T extends Record<string, unknown>>(body: Record<string, string>) => api.request<T>(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (begin) {
        const result = await post<{ url?: string; updated?: boolean; pending?: boolean }>({ action: "begin" });
        if (!result.url) {
          const fresh = await api.request<Snapshot>(endpoint);
          if (current === generation.current) {
            setSnapshot(fresh);
            setNotice(result.updated ? "Your subscription payment method was saved and verified." : "The payment method update is still being verified. Refresh its status.");
          }
          return;
        }
        const destination = new URL(result.url);
        if (destination.protocol !== "https:" || destination.hostname !== "checkout.stripe.com" || destination.username || destination.password) throw new ScopedApiError({ message: "Stripe returned an invalid payment settings link.", status: 502, code: "INVALID_PAYMENT_LINK" });
        if (current === generation.current) window.location.assign(destination.href);
        return;
      }
      const query = new URL(window.location.href);
      const session = query.searchParams.get("payment_method_session");
      const cancelled = query.searchParams.get("payment_method_cancel");
      if (session && cancelled) throw new ScopedApiError({ message: "The payment settings return link is invalid.", status: 400, code: "INVALID_PAYMENT_RETURN" });
      if (session) {
        const result = await post<Outcome>({ action: "complete", session_id: session });
        if (current !== generation.current) return;
        setNotice(result.updated ? "Your subscription payment method was saved and verified." : result.expired ? "Payment method update expired. Start a new update to change your method." : result.cancelled ? "Payment method update cancelled. Your existing method is unchanged." : "The payment method update is still being verified. Refresh its status.");
        if (result.updated || result.expired || result.cancelled) { query.searchParams.delete("payment_method_session"); window.history.replaceState(window.history.state, "", query); }
      } else if (cancelled) {
        const result = await post<Outcome>({ action: "cancel", attempt_id: cancelled });
        if (current !== generation.current) return;
        setNotice(result.cancelled ? "Payment method update cancelled. Your existing method is unchanged." : result.updated ? "Stripe has already completed this update. Refresh its status." : result.expired ? "Payment method update expired. Start a new update to change your method." : "The payment method update is still being verified. Refresh its status.");
        if (result.cancelled || result.updated || result.expired) { query.searchParams.delete("payment_method_cancel"); window.history.replaceState(window.history.state, "", query); }
      }
      const result = await api.request<Snapshot>(endpoint);
      if (current === generation.current) setSnapshot(result);
    } catch (failure) {
      if (current === generation.current) {
        setSnapshot(null); setNotice("");
        setError(scopedApiErrorMessage(failure, "Payment settings could not be verified."));
      }
    } finally {
      if (current === generation.current) { inFlight.current = false; setBusy(false); }
    }
  // Translate the result when rendered. Loading a locale catalog must not
  // invalidate an in-flight Stripe return or submit the completion twice.
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void operation(); });
    return () => { active = false;
      // Invalidate the operation, not a DOM ref, when the authorized workspace changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++; inFlight.current = false; };
  }, [operation]);
  const method = snapshot?.paymentMethod;
  return <section aria-label={t("Subscription payment method")} className="mt-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-serif text-xl text-heading">{t("Subscription payment method")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("Securely replace the method used for this subscription. This action does not create a purchase, upgrade or charge. Existing invoices and scheduled billing still apply.")}</p>
      </div>
      <button type="button" disabled={busy || disabled} onClick={() => void operation()} className="min-h-11 shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink disabled:bg-subtle disabled:text-muted">{t("Refresh payment status")}</button>
    </div>
    {error ? <p role="alert" className="mt-3 break-words text-sm text-danger">{t(error)}</p> : null}
    {notice ? <p role="status" className="mt-3 text-sm text-ink">{t(notice)}</p> : null}
    {busy ? <p role="status" className="mt-3 text-sm text-muted">{t("Checking secure payment settings…")}</p> : null}
    {snapshot ? <div className="mt-4 rounded-xl bg-subtle p-3 text-sm">
      <p className="font-semibold text-heading">{t("Current subscription default")}</p>
      {snapshot.status === "available" && method ? <p className="mt-1 text-ink" data-no-translate>{method.brand || method.type}{method.last4 ? ` •••• ${method.last4}` : ""}{method.expMonth && method.expYear ? ` · ${String(method.expMonth).padStart(2, "0")}/${method.expYear}` : ""}</p> : <p className="mt-1 text-muted">{t(snapshot.status === "none" ? "No saved default payment method." : "Payment method details are currently unavailable.")}</p>}
      {snapshot.updatePending ? <p className="mt-2 text-muted">{t("A payment method update is in progress. You can resume it below.")}</p> : null}
      {snapshot.warning ? <p role="status" className="mt-2 text-muted">{t(snapshot.warning)}</p> : null}
      {snapshot.billingMode === "test" ? <p className="mt-2 text-muted">{t("Stripe test mode")}</p> : null}
    </div> : null}
    <button type="button" disabled={busy || disabled || snapshot?.updateAllowed === false} onClick={() => void operation(true)} className="mt-4 min-h-11 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white disabled:bg-subtle disabled:text-muted">{t("Manage payment method")}</button>
  </section>;
}
