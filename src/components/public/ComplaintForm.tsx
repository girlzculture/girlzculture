"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { EMAIL_PATTERN, isValidEmail } from "@/lib/validation";

type SalonOption = { id: string; name: string; address_city?: string | null; address_state?: string | null };
const emptyForm = { name: "", email: "", salonId: "", bookedThroughPlatform: "Yes", bookingEmail: "", reason: "", issue: "", website: "" };

export default function ComplaintForm({ salons,reasons }: { salons: SalonOption[];reasons:string[] }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState("");
  function update(field: keyof typeof emptyForm, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(""); setSent(false);
    try {
      if (!isValidEmail(form.email)) throw new Error("Enter a valid contact email address (name@example.com).");
      if (form.bookedThroughPlatform === "Yes" && !isValidEmail(form.bookingEmail)) throw new Error("Enter the email used for your Girlz Culture booking.");
      const response = await fetch("/api/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, bookedThroughPlatform: form.bookedThroughPlatform === "Yes" }) });
      const body = await response.json() as { error?: string; ticketId?: string };
      if (!response.ok) throw new Error(body.error || "Unable to submit your complaint.");
      setSent(true); setNotice(`Your complaint was received. Support reference: ${body.ticketId}`); setForm(emptyForm);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to submit your complaint."); }
    finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="rounded-[24px] border border-plum/10 bg-white p-5 shadow-[0_18px_55px_rgba(26,18,32,.08)] sm:p-8">
    <div className="grid gap-5 sm:grid-cols-2"><Field label="Your name"><input required minLength={2} value={form.name} onChange={(event) => update("name", event.target.value)} /></Field><Field label="Your email"><input required type="email" pattern={EMAIL_PATTERN} placeholder="name@example.com" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field></div>
    <div className="mt-5"><Field label="Which business?"><select required value={form.salonId} onChange={(event) => update("salonId", event.target.value)}><option value="">Choose a Girlz Culture business</option>{salons.map((salon) => <option key={salon.id} value={salon.id}>{salon.name}{salon.address_city ? ` — ${salon.address_city}${salon.address_state ? `, ${salon.address_state}` : ""}` : ""}</option>)}</select></Field></div>
    <div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label="Did you book through Girlz Culture?"><select value={form.bookedThroughPlatform} onChange={(event) => update("bookedThroughPlatform", event.target.value)}><option>Yes</option><option>No</option></select></Field>{form.bookedThroughPlatform === "Yes" ? <Field label="Booking email"><input required type="email" pattern={EMAIL_PATTERN} placeholder="Email used at booking" value={form.bookingEmail} onChange={(event) => update("bookingEmail", event.target.value)} /></Field> : <div className="rounded-xl bg-blush/30 p-4 text-xs leading-5 text-ink/65">You can still submit. Support will review it manually, and it will not change a business’s quality score without a verified booking.</div>}</div>
    <div className="mt-5"><Field label="Reason"><select required value={form.reason} onChange={(event)=>update("reason",event.target.value)}><option value="">Choose a reason</option>{reasons.map(reason=><option key={reason}>{reason}</option>)}</select></Field></div>
    <label className="mt-5 block text-sm font-bold text-plum">What happened?<textarea required minLength={20} maxLength={5000} rows={8} value={form.issue} onChange={(event) => update("issue", event.target.value)} placeholder="Describe the issue, what happened, and the resolution you are seeking." className="mt-2 w-full rounded-xl border border-plum/15 p-4 font-normal text-ink outline-none focus:border-magenta" /></label>
    <label className="hidden">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} /></label>
    {notice ? <p aria-live="polite" className={`mt-4 rounded-xl p-4 text-sm ${sent ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{sent ? <CheckCircle2 className="mr-2 inline" size={17} /> : null}{notice}</p> : null}
    <button disabled={saving || !salons.length} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-magenta px-7 py-4 font-bold text-white disabled:opacity-50"><Send size={18} />{saving ? "Submitting…" : "Submit complaint"}</button>
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactElement<{ className?: string }> }) {
  return <label className="block text-sm font-bold text-plum">{label}<span className="mt-2 block [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:border-plum/15 [&>*]:bg-white [&>*]:p-3.5 [&>*]:font-normal [&>*]:text-ink [&>*]:outline-none focus-within:[&>*]:border-magenta">{children}</span></label>;
}
