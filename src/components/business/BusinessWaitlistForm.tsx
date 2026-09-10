"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { interpolateBusinessSignupTemplate, type BusinessSignupCategory, type BusinessSignupContent } from "@/lib/businessSignupContent";
import { readApiResponse } from "@/lib/apiResponseClient";
import { EMAIL_PATTERN, US_PHONE_PATTERN, formatUsPhoneInput } from "@/lib/validation";
import { BusinessWaitlistValidationError, isConfirmedBusinessWaitlistTicketId, validateBusinessWaitlistContact } from "@/lib/businessWaitlistCore";

export default function BusinessWaitlistForm({ category, copy }: { category: BusinessSignupCategory; copy: BusinessSignupContent["waitlist"] }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ticketId, setTicketId] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    const contact = { businessName: name, businessAddress: address, businessPhone: phone, businessEmail: email };
    try {
      validateBusinessWaitlistContact(contact);
    } catch (error) {
      setError(error instanceof BusinessWaitlistValidationError ? error.message : "Complete every required business field.");
      return;
    }
    setSaving(true);
    try {
      // Reuse the monitored Partnerships inbox, moderation and rate limit.
      // This category-opening notification request is never a subscription.
      const response = await fetch("/api/support", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "business_waitlist", categoryId: category.id, ...contact, website,
        }),
      });
      const body = await readApiResponse(response, "We couldn’t save your waitlist request. Please try again.");
      if (!response.ok || body.ok !== true || !isConfirmedBusinessWaitlistTicketId(body.ticketId)) {
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
    <h2>{interpolateBusinessSignupTemplate(copy.successHeading, category.name)}</h2>
    <p>{interpolateBusinessSignupTemplate(copy.successDescription, category.name)}</p>
    <p className="business-waitlist-reference">Your reference: {ticketId}</p>
    <Link href="/business/signup" className="business-back-link">Explore business types</Link>
  </div>;
  return <form onSubmit={submit} className="business-waitlist-form" aria-label={`${category.name} waitlist`}>
    <label>Business Name<input name="business_name" autoComplete="organization" required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
    <label>Business Address<input name="business_address" autoComplete="street-address" required minLength={5} maxLength={500} value={address} onChange={event => setAddress(event.target.value)} /></label>
    <label>Business Phone Number<input name="business_phone" type="tel" autoComplete="tel" required maxLength={40} pattern={US_PHONE_PATTERN} title="Enter a US phone number such as +1 (212) 555-0123" value={phone} onChange={event => setPhone(formatUsPhoneInput(event.target.value))} /></label>
    <label>Business Email<input name="business_email" type="email" autoComplete="email" required maxLength={254} pattern={EMAIL_PATTERN} title="Enter a valid email address such as name@example.com" value={email} onChange={event => setEmail(event.target.value)} /></label>
    <label>Business Type<input name="business_type" readOnly value={category.name} /></label>
    <label hidden aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
    <p className="business-waitlist-privacy">{interpolateBusinessSignupTemplate(copy.privacyText, category.name)} <Link href="/privacy">Privacy Policy</Link></p>
    {copy.supportText ? <p>{interpolateBusinessSignupTemplate(copy.supportText, category.name)}</p> : null}
    {error ? <p className="business-waitlist-error" role="alert">{error}</p> : null}
    <button type="submit" disabled={saving}>{saving ? "Joining…" : copy.submitLabel}</button>
  </form>;
}
