"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { bestPromotionForContext, promotionLabel, type SalonPromotion } from "@/lib/salonPromotions";

type StyleRecord = {
  id?: string;
  name?: string | null;
  price_display_min?: number | null;
  price_display_max?: number | null;
  duration_min_hours?: number | null;
  duration_max_hours?: number | null;
  base_price?: number | null;
  workmanship_base_price?: number | null;
  length_options?: unknown;
  size_options?: unknown;
  material_options?: unknown;
  addons?: unknown;
  hair_included?: boolean | null;
  included_items?: unknown;
  service_group_id?: string | null;
  master_style_id?: string | null;
};

type StyleMaterialRecord = {
  id?: string;
  style_id?: string | null;
  name?: string | null;
  price?: number | null;
  longevity?: string | null;
  quality_note?: string | null;
};

type OptionRecord = Record<string, unknown>;

type SalonStylesProps = {
  styles: StyleRecord[];
  styleMaterialsByStyleId: Record<string, StyleMaterialRecord[]>;
  salonSlug: string;
  salonId: string;
  promotions?: SalonPromotion[];
};

function normalizeOptions(value: unknown): OptionRecord[] {
  if (Array.isArray(value)) return value.filter((entry): entry is OptionRecord => Boolean(entry) && typeof entry === "object");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, entry]) => ({
      label: key,
      ...(entry && typeof entry === "object" ? entry as OptionRecord : {}),
    }));
  }
  return [];
}

function optionLabel(option: OptionRecord) {
  const label = option.label ?? option.name;
  return typeof label === "string" && label.trim() ? label : "Option";
}

function optionPrice(option: OptionRecord) {
  const value = option.price_add ?? option.price;
  return typeof value === "number" ? value : 0;
}

function formatRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "Custom quote";
  if (min != null && max != null) return `$${min} – $${max}`;
  return `From $${min ?? max}`;
}

function formatDuration(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "Time varies";
  if (min != null && max != null) return `${min} – ${max} hrs`;
  return `${min ?? max} hrs`;
}

function formatAddOnPrice(value: number) {
  return value > 0 ? `+$${value}` : "$0";
}

export default function SalonStyles({ styles, styleMaterialsByStyleId, salonSlug, salonId, promotions = [] }: SalonStylesProps) {
  const defaultOpenId = styles[1]?.id || styles[1]?.name || styles[0]?.id || styles[0]?.name || null;
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);

  const styleCards = useMemo(() => styles.map((style, index) => {
    const id = style.id || style.name || `style-${index}`;
    const savedMaterials = styleMaterialsByStyleId[id] || [];
    const inlineMaterials = normalizeOptions(style.material_options).map((option, materialIndex) => ({
      id: `${id}-inline-material-${materialIndex}`,
      style_id: id,
      name: optionLabel(option),
      price: optionPrice(option),
      longevity: typeof option.longevity === "string" ? option.longevity : null,
      quality_note: typeof option.quality_note === "string" ? option.quality_note : null,
    }));

    const basePrice = style.workmanship_base_price ?? style.base_price ?? style.price_display_min ?? style.price_display_max ?? 0;
    const offer = bestPromotionForContext(promotions, {
      salonId,
      styleId: style.id || null,
      serviceGroupId: style.service_group_id,
      masterStyleId: style.master_style_id,
      basePrice,
      selectedAddons: [],
      subtotal: style.price_display_min ?? basePrice,
    });
    return {
      id,
      style,
      basePrice,
      offer,
      lengthOptions: normalizeOptions(style.length_options),
      addons: normalizeOptions(style.addons),
      materials: savedMaterials.length ? savedMaterials : inlineMaterials,
      includedItems: Array.isArray(style.included_items) ? style.included_items.map(String).filter(Boolean) : [],
    };
  }), [promotions, salonId, styles, styleMaterialsByStyleId]);

  if (!styleCards.length) {
    return <div className="rounded-[12px] border border-dashed border-plum/20 bg-blush/25 p-5 text-sm text-ink/65">This salon has not published its styles yet.</div>;
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-plum/10 bg-white/70">
      {styleCards.map((card) => {
        const isOpen = openId === card.id;
        return (
          <div key={card.id} className="border-b border-plum/10 last:border-b-0">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : card.id)}
              aria-expanded={isOpen}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto_48px_14px] items-center gap-2 px-4 py-3 text-left transition sm:grid-cols-[minmax(0,1fr)_auto_auto_18px] sm:gap-3 sm:px-5 ${isOpen ? "bg-blush/45 text-magenta" : "bg-white/70 text-ink hover:bg-cream/70"}`}
            >
              <span data-no-translate="true" className="min-w-0 text-[12px] font-semibold sm:text-[13px]"><span className="block truncate">{card.style.name || "Style"}</span>{card.offer ? <span className="mt-1 inline-flex rounded-full bg-amber/20 px-2 py-0.5 text-[8px] font-bold text-[#805000]">{promotionLabel(card.offer.promotion)}</span> : null}</span>
              <span className="whitespace-nowrap text-right text-[11px] font-semibold text-ink/75">{card.offer ? <><span className="block text-[9px] font-medium text-ink/40 line-through">{formatRange(card.style.price_display_min, card.style.price_display_max)}</span><span className="text-magenta">From ${card.offer.price.total.toFixed(2)}</span></> : formatRange(card.style.price_display_min, card.style.price_display_max)}</span>
              <span className={`whitespace-nowrap text-right text-[8px] sm:min-w-20 sm:text-[10px] ${isOpen ? "text-magenta" : "text-ink/50"}`}>{formatDuration(card.style.duration_min_hours, card.style.duration_max_hours)}</span>
              <ChevronDown aria-hidden="true" size={15} className={`transition-transform ${isOpen ? "rotate-180 text-magenta" : "text-ink/55"}`} />
            </button>

            {isOpen ? (
              <div className="bg-[linear-gradient(105deg,rgba(243,217,228,0.55),rgba(251,244,238,0.65))] px-4 py-4 sm:px-5">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 xl:grid-cols-[0.78fr_0.72fr_1.45fr_0.95fr]">
                  <div className="min-w-0">
                    <h4 className="text-[11px] font-bold text-plum">Length</h4>
                    <ul className="mt-3 space-y-2 text-[10px] text-ink/75">
                      {card.lengthOptions.map((option, index) => (
                        <li key={`${optionLabel(option)}-${index}`} className="flex items-center justify-between gap-3">
                          <span data-no-translate="true">{optionLabel(option)}</span>
                          <span className="font-semibold text-ink">${card.basePrice + optionPrice(option)}</span>
                        </li>
                      ))}
                      {!card.lengthOptions.length ? <li className="text-ink/45">No length choices published</li> : null}
                    </ul>
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-[11px] font-bold text-plum">Add-ons</h4>
                    <ul className="mt-3 space-y-2 text-[10px] text-ink/75">
                      {card.addons.map((option, index) => (
                        <li key={`${optionLabel(option)}-${index}`} className="flex items-center justify-between gap-3">
                          <span data-no-translate="true">{optionLabel(option)}</span>
                          <span className="font-semibold text-ink">{formatAddOnPrice(optionPrice(option))}</span>
                        </li>
                      ))}
                      {!card.addons.length ? <li className="text-ink/45">No add-ons published</li> : null}
                    </ul>
                  </div>

                  <div className="col-span-2 min-w-0 xl:col-span-1">
                    <h4 className="text-[11px] font-bold text-plum">Hair / Material Options</h4>
                    <ul className="mt-3 space-y-2 text-[9px] text-ink/70">
                      {card.materials.slice(0, 4).map((material) => (
                        <li key={material.id || material.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-plum/10 pb-2 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-2">
                          <span data-no-translate="true" className="min-w-0 truncate font-medium text-ink">{material.name || "Material"}</span>
                          <span className="font-semibold text-ink">{formatAddOnPrice(material.price || 0)}</span>
                          <span className="whitespace-nowrap text-ink/55 max-sm:col-start-1">{material.longevity || "Varies"}</span>
                          <span className="whitespace-nowrap text-plum max-sm:text-right">{material.quality_note || "Quality"}</span>
                        </li>
                      ))}
                      {!card.materials.length ? <li className="text-ink/45">No material choices published</li> : null}
                    </ul>
                  </div>

                  <div className="col-span-2 min-w-0 xl:col-span-1">
                    <h4 className="text-[11px] font-bold text-plum">What&apos;s Included</h4>
                    <ul className="mt-3 space-y-2 text-[10px] text-ink/75">
                      {card.includedItems.map((item) => (
                        <li key={item} className="flex items-start gap-2"><Check aria-hidden="true" size={13} className="mt-0.5 shrink-0 text-magenta" /><span data-no-translate="true">{item}</span></li>
                      ))}
                      {!card.includedItems.length ? <li className="text-ink/45">No inclusions published</li> : null}
                    </ul>
                  </div>
                </div>
                <p className="mt-4 text-[9px] font-medium text-magenta">Price may vary based on hair density and length.</p>
                {card.offer ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-magenta/20 bg-white/75 p-3"><p className="text-[10px] text-ink/70"><b className="text-plum">{card.offer.promotion.public_headline || card.offer.promotion.title}</b><br/><span className="line-through">{formatRange(card.style.price_display_min, card.style.price_display_max)}</span> <span className="font-bold text-magenta">From ${card.offer.price.total.toFixed(2)}</span></p><Link href={`/salon/${salonSlug}/book?style=${encodeURIComponent(String(card.style.id || ""))}&promotion=${encodeURIComponent(String(card.offer.promotion.id || ""))}`} className="inline-flex min-h-10 items-center rounded-lg bg-magenta px-4 text-[10px] font-bold text-white">Book this offer</Link></div> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
