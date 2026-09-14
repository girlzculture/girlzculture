"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";

export default function AdminMarketplacePreviewButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openPreview() {
    setError("");
    setLoading(true);
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your Platform Admin session has expired.");
      const response = await fetch("/api/admin/marketplace-preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await readApiResponse(
        response,
        "The private marketplace preview could not be opened.",
      ) as { preview_url?: string; error?: string };
      if (!response.ok || !body.preview_url) {
        throw new Error(body.error || "The private marketplace preview could not be opened.");
      }
      window.location.assign(body.preview_url);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "The private marketplace preview could not be opened.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void openPreview()}
        disabled={loading}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta/30 bg-white px-3 text-[11px] font-bold text-magenta shadow-sm gc-disabled-control"
      >
        <Eye size={15} />
        {loading ? "Opening preview…" : "Preview marketplace"}
      </button>
      {error ? (
        <p role="alert" className="absolute right-0 top-12 z-50 w-72 rounded-lg border border-red-200 bg-white p-3 text-xs text-red-700 shadow-lg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
