"use client";

import { FormEvent, useState } from "react";
import { EMAIL_PATTERN, isValidEmail } from "@/lib/validation";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [website, setWebsite] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (!isValidEmail(email)) { setMessage("Please enter a valid email address."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source: "public-footer", website }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to subscribe");
      setEmail(""); setMessage("Subscription saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to subscribe");
    } finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="mt-4">
    <label className="hidden">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event)=>setWebsite(event.target.value)} /></label>
    <div className="flex overflow-hidden rounded-[8px] border border-white/25 bg-white/5"><label htmlFor="footer-email" className="sr-only">Email address</label><input id="footer-email" type="email" pattern={EMAIL_PATTERN} title="Enter a valid email address such as name@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className="gc-placeholder-on-dark min-w-0 flex-1 bg-transparent px-3 py-2 text-[12px] text-white outline-none" /><button disabled={saving} type="submit" className="bg-magenta px-4 text-[11px] font-bold text-white gc-disabled-control">{saving ? "Saving…" : "Subscribe"}</button></div>
    {message ? <p aria-live="polite" className="mt-2 text-[10px] gc-text-on-dark-muted">{message}</p> : null}
  </form>;
}
