"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";

export default function MarketplacePreviewBanner() {
  const [ending, setEnding] = useState(false);

  async function endPreview() {
    setEnding(true);
    try {
      await fetch("/api/admin/marketplace-preview", {
        method: "DELETE",
        cache: "no-store",
        credentials: "same-origin",
      });
    } finally {
      window.location.replace("/prelaunch");
    }
  }

  return (
    <aside className="sticky top-0 z-[160] flex min-h-12 items-center justify-center gap-3 bg-charcoal px-4 py-2 text-center text-xs text-white shadow-md">
      <Eye size={16} className="shrink-0 text-blush" />
      <p>
        <b>Private Platform Admin preview.</b>{" "}
        This marketplace is not public; booking and payment remain disabled.
      </p>
      <button
        type="button"
        onClick={() => void endPreview()}
        disabled={ending}
        className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-white/25 px-2 font-bold hover:bg-white/10 gc-disabled-control"
      >
        <X size={13} /> {ending ? "Closing…" : "Exit"}
      </button>
    </aside>
  );
}
