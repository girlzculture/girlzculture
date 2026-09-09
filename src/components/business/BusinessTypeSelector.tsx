"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Scissors, Sparkles, Flower2, HeartPulse, PenTool, Eye, Store, Shapes } from "lucide-react";

const categories = [
  { name: "Hair Salon & Braiding", icon: Scissors, available: true },
  { name: "Nail Studio", icon: Sparkles },
  { name: "Massage & Wellness", icon: Flower2 },
  { name: "Aesthetics Clinic", icon: HeartPulse },
  { name: "Tattoo Studio", icon: PenTool },
  { name: "Lash & Brow Bar", icon: Eye },
  { name: "Barbershop", icon: Store },
  { name: "Other", icon: Shapes },
] as const;

export default function BusinessTypeSelector({ continueHref }: { continueHref: string }) {
  const [selected, setSelected] = useState(false);
  const router = useRouter();
  return <form className="business-type-selector" onSubmit={event => { event.preventDefault(); if (selected) router.push(continueHref); }}>
    <fieldset>
      <legend className="business-selector-title">Select Your Business Type</legend>
      <p className="business-selector-description">Choose the category that best describes your business to get started.</p>
      <div className="business-category-grid">
        {categories.map(category => {
          const available = "available" in category && category.available;
          const Icon = category.icon;
          return <label key={category.name} className={`business-category ${available ? "business-category-available" : "business-category-unavailable"}`} data-selected={available && selected}>
            <input type="radio" name="business_category" value={category.name} required={available} disabled={!available} checked={available && selected} onChange={() => { if (available) setSelected(true); }} />
            <Icon size={27} aria-hidden="true" />
            <span className="business-category-name">{category.name}</span>
            <span className="business-category-status">{available ? "Available Now" : "Coming Soon"}</span>
            {available && selected ? <Check className="business-category-check" size={18} aria-hidden="true" /> : null}
          </label>;
        })}
      </div>
    </fieldset>
    <button className="business-continue" type="submit" disabled={!selected}>Continue with Hair Salon &amp; Braiding <ArrowRight size={19} aria-hidden="true" /></button>
  </form>;
}
