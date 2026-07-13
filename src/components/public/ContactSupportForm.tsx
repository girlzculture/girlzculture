"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { EMAIL_PATTERN, isValidEmail } from "@/lib/validation";

const initial = { name: "", email: "", subject: "", category: "Booking question", message: "", website: "" };
export default function ContactSupportForm() {
  const [form, setForm] = useState(initial); const [notice, setNotice] = useState(""); const [sent, setSent] = useState(false); const [saving, setSaving] = useState(false);
  function update(field: keyof typeof initial, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setNotice(""); setSent(false);
    if (!isValidEmail(form.email)) { setNotice("Please enter a valid email address (name@example.com)."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to submit your request");
      setSent(true); setNotice(`Your request was received. Reference: ${body.ticketId}`); setForm(initial);
    } catch (error) { console.error("Contact support form error", error); setNotice(error instanceof Error ? error.message : "Unable to submit your request"); }
    finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="rounded-3xl border border-plum/10 bg-white p-5 shadow-[0_18px_55px_rgba(26,18,32,.08)] sm:p-8">
    <div className="grid gap-5 sm:grid-cols-2"><Field label="Name"><input required value={form.name} onChange={(event) => update("name", event.target.value)} /></Field><Field label="Email"><input required type="email" pattern={EMAIL_PATTERN} title="Enter a valid email address such as name@example.com" placeholder="name@example.com" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field><Field label="Subject"><input required value={form.subject} onChange={(event) => update("subject", event.target.value)} /></Field><Field label="Category"><select value={form.category} onChange={(event) => update("category", event.target.value)}><option>Booking question</option><option>Payment or deposit</option><option>Salon experience</option><option>Account help</option><option>Safety concern</option><option>Partnership question</option><option>Other</option></select></Field></div>
    <label className="mt-5 block text-sm font-bold text-plum">Message<textarea required minLength={10} rows={7} value={form.message} onChange={(event) => update("message", event.target.value)} placeholder="Tell us what happened and how we can help." className="mt-2 w-full rounded-xl border border-plum/15 p-4 font-normal text-ink outline-none focus:border-magenta" /></label>
    <label className="hidden">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} /></label>
    {notice ? <p aria-live="polite" className={`mt-4 rounded-xl p-4 text-sm ${sent ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{sent ? <CheckCircle2 className="mr-2 inline" size={17}/> : null}{notice}</p> : null}
    <button disabled={saving} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-magenta px-7 py-4 font-bold text-white disabled:opacity-60"><Send size={18}/>{saving ? "Sending…" : "Send support request"}</button>
  </form>;
}
function Field({ label, children }: { label: string; children: React.ReactElement<{ className?: string }> }) { return <label className="text-sm font-bold text-plum">{label}<span className="mt-2 block [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:border-plum/15 [&>*]:bg-white [&>*]:p-3.5 [&>*]:font-normal [&>*]:text-ink [&>*]:outline-none focus-within:[&>*]:border-magenta">{children}</span></label>; }
