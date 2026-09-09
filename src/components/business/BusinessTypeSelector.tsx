"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { BUSINESS_CATEGORY_PHOTOS } from "@/lib/businessSignupMedia";
import BusinessPhoto from "./BusinessPhoto";

const categories = [
  { name: "Hair Salon & Braiding", photo: "hair", available: true },
  { name: "Nail Studio", photo: "nails" },
  { name: "Massage & Wellness", photo: "massage" },
  { name: "Aesthetics Clinic", photo: "aesthetics" },
  { name: "Tattoo Studio", photo: "tattoo" },
  { name: "Lash & Brow Bar", photo: "lashes" },
  { name: "Barbershop", photo: "barber" },
  { name: "Other", photo: "other" },
] as const;

export default function BusinessTypeSelector({ continueHref, children }: { continueHref: string; children?: ReactNode }) {
  const [selected, setSelected] = useState(false);
  const router = useRouter();
  return <form className="business-selection-flow" onSubmit={event => { event.preventDefault(); if (selected) router.push(continueHref); }}>
    <fieldset className="business-type-selector">
      <legend className="business-selector-title">Select Your Business Type</legend>
      <p className="business-selector-description">Choose the category that best describes your business to get started.</p>
      <div className="business-category-grid">
        {categories.map(category => {
          const available = "available" in category && category.available;
          return <label key={category.name} className={`business-category ${available ? "business-category-available" : "business-category-unavailable"}`} data-selected={available && selected}>
            <input type="radio" name="business_category" value={category.name} required={available} disabled={!available} checked={available && selected} onChange={() => { if (available) setSelected(true); }} />
            <BusinessPhoto crop={BUSINESS_CATEGORY_PHOTOS[category.photo]} />
            <span className="business-category-details">
              <span className="business-category-name">{category.name}</span>
              <span className="business-category-meta">
                {available ? <span className="business-category-action">{selected ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}</span> : null}
                <span className="business-category-status">{available ? "Available Now" : "Coming Soon"}</span>
              </span>
            </span>
          </label>;
        })}
      </div>
    </fieldset>
    {children}
    <button className="business-continue" type="submit" disabled={!selected}>Continue with Hair Salon &amp; Braiding <ArrowRight size={19} aria-hidden="true" /></button>
  </form>;
}
