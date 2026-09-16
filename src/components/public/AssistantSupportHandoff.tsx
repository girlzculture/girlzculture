"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import ContactSupportForm from "@/components/public/ContactSupportForm";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { customerSupportText } from "@/i18n/customer-support-source-catalog";
import { customerSupportSummary, type CustomerConversationTurn } from "@/lib/customerSupport";
import { readApiResponse } from "@/lib/apiResponseClient";

export default function AssistantSupportHandoff({ turns, failure }: { turns: CustomerConversationTurn[]; failure: string }) {
  const { locale } = useI18n();
  const [draft, setDraft] = useState<{ categories: string[]; message: string } | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const text = (source: string) => customerSupportText(source, locale);
  async function prepare() {
    if (pending.current) return;
    pending.current = true; setLoading(true); setError(false);
    try {
      const response = await fetch("/api/support", { method: "GET", cache: "no-store", redirect: "error", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      const body = await readApiResponse(response, "Unable to load support categories.");
      if (!response.ok || !Array.isArray(body.categories) || !body.categories.length || body.categories.length > 40 || body.categories.some(category => typeof category !== "string" || !category.trim() || category.length > 80)) throw new Error("SUPPORT_CATEGORIES_UNAVAILABLE");
      setDraft({ categories: body.categories as string[], message: customerSupportSummary(turns, failure, locale) });
    } catch { setError(true); }
    finally { pending.current = false; setLoading(false); }
  }
  return <section data-no-translate className="mt-5 border-t border-border pt-4" aria-label={text("Human support")}>
    <button type="button" disabled={loading} onClick={draft ? () => setDraft(null) : prepare} className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold gc-disabled-control">{text(draft ? "Discard support draft" : loading ? "Preparing support draft…" : "Ask a person for help")}</button>
    {error ? <p role="alert" className="mt-3 text-sm">{text("Support could not be loaded. Your conversation has not been sent.")} <Link href="/contact" className="font-semibold underline">{text("Open contact form")}</Link></p> : null}
    {draft ? <div className="mt-4 space-y-3"><h3 className="font-bold">{text("Review your support request")}</h3><p className="text-sm">{text("Edit the excerpt and remove anything you do not want to share. It is sent to platform support only when you press Send support request.")}</p><p className="text-sm">{text("Choose Payments for refunds or disputes, or Safety for a safety concern. For an immediate emergency, contact local emergency services.")}</p><ContactSupportForm categories={draft.categories} initialSubject={text("GC Assistant support")} initialMessage={draft.message}/></div> : null}
  </section>;
}
