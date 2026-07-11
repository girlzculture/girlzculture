"use client";

import { FormEvent, useState } from "react";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source: "public-footer" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to subscribe");
      setEmail(""); setMessage("You’re on the list!");
    } catch (error) {
      console.error("Newsletter form error", error);
      setMessage(error instanceof Error ? error.message : "Unable to subscribe");
    } finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="mt-4">
    <div className="flex overflow-hidden rounded-[8px] border border-white/20 bg-white/5"><label htmlFor="footer-email" className="sr-only">Email address</label><input id="footer-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your email" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[11px] text-white outline-none placeholder:text-white/40" /><button disabled={saving} type="submit" className="bg-magenta px-4 text-[10px] font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Subscribe"}</button></div>
    {message ? <p aria-live="polite" className="mt-2 text-[10px] text-white/70">{message}</p> : null}
  </form>;
}
