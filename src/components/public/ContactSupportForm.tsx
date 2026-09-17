"use client";

import { FormEvent, useRef, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { EMAIL_PATTERN, isValidEmail } from "@/lib/validation";
import { readApiResponse } from "@/lib/apiResponseClient";
import { confirmedSupportReference } from "@/lib/customerSupport";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { customerSupportText } from "@/i18n/customer-support-source-catalog";

const initial = { name: "", email: "", subject: "", category: "", message: "", website: "" };
export default function ContactSupportForm({ categories, initialMessage = "", initialSubject = "" }: { categories: string[]; initialMessage?: string; initialSubject?: string }) {
  const { locale } = useI18n();
  const text = (source: string) => customerSupportText(source, locale);
  const [form, setForm] = useState(() => ({ ...initial, message: initialMessage.slice(0, 5000), subject: initialSubject.slice(0, 180) }));
  const [notice, setNotice] = useState(""); const [sent, setSent] = useState(false); const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  function update(field: keyof typeof initial, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return;
    setNotice(""); setSent(false);
    if (!isValidEmail(form.email)) { setNotice(text("Please enter a valid email address (name@example.com).")); return; }
    submitting.current = true; setSaving(true);
    try {
      const response = await fetch("/api/support", { method: "POST", redirect: "error", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(form), signal: AbortSignal.timeout(30000) });
      const body = await readApiResponse(response, text("Unable to submit your request"));
      if (!response.ok) throw new Error(body.error || text("Unable to submit your request"));
      if (!confirmedSupportReference(body.ticketId)) throw new Error(text("No confirmed support reference was returned. Keep your draft and contact support before sending again."));
      setSent(true); setNotice(customerSupportText("Your request was received. Reference: {reference}", locale, { reference: body.ticketId })); setForm({...initial,category:categories[0]||""});
    } catch (error) { setNotice(error instanceof Error && error.name !== "TimeoutError" ? error.message : text("Delivery could not be confirmed. Keep your draft and contact support before sending again.")); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <form data-no-translate onSubmit={submit} className="rounded-3xl border border-plum/10 bg-white p-5 shadow-[0_18px_55px_rgba(13,17,20,.08)] sm:p-8">
    <fieldset disabled={saving} className="min-w-0">
    <div className="grid gap-5 sm:grid-cols-2"><Field label={text("Name")}><input required minLength={2} maxLength={120} value={form.name} onChange={(event) => update("name", event.target.value)} /></Field><Field label={text("Email")}><input required type="email" pattern={EMAIL_PATTERN} title={text("Enter a valid email address such as name@example.com")} placeholder="name@example.com" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field><Field label={text("Subject")}><input required minLength={3} maxLength={180} value={form.subject} onChange={(event) => update("subject", event.target.value)} /></Field><Field label={text("Category")}><select required value={form.category} onChange={(event) => update("category", event.target.value)}><option value="">{text("Choose a category")}</option>{categories.map(category=><option key={category} value={category}>{text(category)}</option>)}</select></Field></div>
    <label className="mt-5 block text-sm font-bold text-plum">{text("Message")}<textarea required minLength={10} maxLength={5000} rows={7} value={form.message} onChange={(event) => update("message", event.target.value)} placeholder={text("Tell us what happened and how we can help.")} className="mt-2 w-full rounded-xl border border-plum/15 p-4 font-normal text-ink outline-none focus:border-magenta" /></label>
    <label className="hidden">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} /></label>
    </fieldset>
    {notice ? <p data-no-translate aria-live="polite" className={`mt-4 break-words rounded-xl p-4 text-sm ${sent ? "bg-green-50 gc-text-success" : "bg-red-50 gc-text-danger"}`}>{sent ? <CheckCircle2 className="mr-2 inline" size={17}/> : null}{notice}</p> : null}
    <button disabled={saving} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-magenta px-7 py-4 font-bold text-white gc-disabled-control"><Send size={18}/>{text(saving ? "Sending…" : "Send support request")}</button>
  </form>;
}
function Field({ label, children }: { label: string; children: React.ReactElement<{ className?: string }> }) { return <label className="text-sm font-bold text-plum">{label}<span className="mt-2 block [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:border-plum/15 [&>*]:bg-white [&>*]:p-3.5 [&>*]:font-normal [&>*]:text-ink [&>*]:outline-none focus-within:[&>*]:border-magenta">{children}</span></label>; }
