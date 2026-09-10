"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { WaitlistCategory } from "@/lib/businessCategories";
import { readApiResponse } from "@/lib/apiResponseClient";
import { EMAIL_PATTERN, isValidEmail } from "@/lib/validation";

export default function BusinessWaitlistForm({ category }: { category: WaitlistCategory }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ticketId, setTicketId] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (name.trim().length < 2 || !isValidEmail(email.trim())) {
      setError("Enter your business name and a valid email address.");
      return;
    }
    setSaving(true);
    try {
      // Reuse the monitored Partnerships inbox, moderation and rate limit.
      // This category-opening notification request is never a subscription.
      const response = await fetch("/api/support", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), email: email.trim(), website,
          category: "Partnerships",
          subject: `Business waitlist — ${category.name}`,
          message: `Business category: ${category.name} (${category.slug})\nBusiness name: ${name.trim()}\nPlease email me when this business category opens on Girlz Culture.`,
        }),
      });
      const body = await readApiResponse(response, "We couldn’t save your waitlist request. Please try again.");
      if (!response.ok || body.ok !== true || typeof body.ticketId !== "string" || !body.ticketId) {
        const candidate = body.reference || body.request_id;
        const reference = typeof candidate === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(candidate) ? candidate : "";
        const message = response.status === 429 ? "Too many requests. Please try again shortly." : "We couldn’t save your waitlist request. Please try again.";
        setError(`${message}${reference ? ` Reference ${reference}.` : ""}`);
        return;
      }
      setTicketId(body.ticketId);
    } catch {
      setError("We couldn’t save your waitlist request. Please try again.");
    } finally { setSaving(false); }
  }
  if (ticketId) return <div className="business-waitlist-success" role="status">
    <h2>You’re on the waitlist</h2>
    <p>We’ve received your interest in {category.name}. We’ll email {email.trim()} when this category opens.</p>
    <p className="business-waitlist-reference">Your reference: {ticketId}</p>
    <Link href="/business/signup" className="business-back-link">Explore business types</Link>
  </div>;
  return <form onSubmit={submit} className="business-waitlist-form" aria-label={`${category.name} waitlist`}>
    <label>Business name<input name="business_name" autoComplete="organization" required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
    <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} pattern={EMAIL_PATTERN} title="Enter a valid email address such as name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
    <label hidden aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
    <p className="business-waitlist-privacy">Join to receive an email when this category opens. <Link href="/privacy">Privacy Policy</Link></p>
    {error ? <p className="business-waitlist-error" role="alert">{error}</p> : null}
    <button type="submit" disabled={saving}>{saving ? "Joining…" : "Join the waitlist"}</button>
  </form>;
}
