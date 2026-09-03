"use client";

import { useState } from "react";
import SafeImage from "@/components/site/SafeImage";

type Row = Record<string, unknown> & { id?: string; name?: string };
type Mode = "empty" | "image" | "product" | "promotion";
type Fallback = {
  mode?: Mode;
  image_url?: string | null;
  product_id?: string | null;
  promotion_id?: string | null;
};

export default function StylistSectionFallbackEditor({
  gallery,
  products,
  promotions,
  initial,
  onSave,
  onNotice,
}: {
  gallery: string[];
  products: Row[];
  promotions: Row[];
  initial?: Fallback | null;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(initial?.mode || "empty");
  const [imageUrl, setImageUrl] = useState(initial?.image_url || gallery[0] || "");
  const [productId, setProductId] = useState(initial?.product_id || "");
  const [promotionId, setPromotionId] = useState(initial?.promotion_id || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        stylist_section_fallback: {
          mode,
          image_url: mode === "image" ? imageUrl : null,
          product_id: mode === "product" ? productId : null,
          promotion_id: mode === "promotion" ? promotionId : null,
        },
      });
      onNotice("Salon-page stylist replacement saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-5 rounded-[14px] border border-plum/10 bg-white p-5">
      <h2 className="font-serif text-xl font-semibold text-plum">When you do not publish stylists</h2>
      <p className="mt-2 text-xs leading-6 text-ink/60">Choose the standard empty message or one existing salon highlight. A highlight appears only on your salon page. It does not guarantee placement on the Girlz Culture homepage, Featured Salons, Trending Picks, blogs, or advertising.</p>
      <div className="mt-4 space-y-4">
          <label className="block text-[10px] font-bold">Replacement type<select value={mode} onChange={(event) => setMode(event.target.value as Mode)} className="mt-1.5 min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 text-xs"><option value="empty">Standard no-stylists message</option><option value="image">Gallery highlight image</option><option value="product">Product highlight</option><option value="promotion">Promotion highlight</option></select></label>
          {mode === "image" ? <div><label className="block text-[10px] font-bold">Choose an existing gallery image<select value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 text-xs"><option value="">Choose an image</option>{gallery.map((url, index) => <option key={url} value={url}>Gallery image {index + 1}</option>)}</select></label>{imageUrl ? <SafeImage src={imageUrl} fallbackSrc={imageUrl} alt="Selected salon-page highlight" className="mt-3 h-36 w-full max-w-sm rounded-[10px] object-cover" /> : null}</div> : null}
          {mode === "product" ? <label className="block text-[10px] font-bold">Choose an active product<select value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 text-xs"><option value="">Choose a product</option>{products.map((product) => <option key={product.id} value={product.id}>{String(product.name || "Product")}</option>)}</select></label> : null}
          {mode === "promotion" ? <label className="block text-[10px] font-bold">Choose a salon promotion<select value={promotionId} onChange={(event) => setPromotionId(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 text-xs"><option value="">Choose a promotion</option>{promotions.map((promotion) => <option key={promotion.id} value={promotion.id}>{String(promotion.title || promotion.name || "Promotion")}</option>)}</select></label> : null}
          <button type="button" disabled={saving || (mode === "image" && !imageUrl) || (mode === "product" && !productId) || (mode === "promotion" && !promotionId)} onClick={save} className="min-h-10 rounded-[7px] bg-magenta px-5 text-[10px] font-bold text-white gc-disabled-control">{saving ? "Saving…" : "Save salon-page replacement"}</button>
      </div>
    </section>
  );
}
