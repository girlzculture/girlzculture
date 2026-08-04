"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";

function wordCount(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

export default function SalonDescriptionEditor({
  initialValue = "",
  initiallyAiAssisted = false,
}: {
  initialValue?: string;
  initiallyAiAssisted?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [keywords, setKeywords] = useState("");
  const [draft, setDraft] = useState("");
  const [draftId, setDraftId] = useState("");
  const [draftAiAssisted, setDraftAiAssisted] = useState(false);
  const [aiAssisted, setAiAssisted] = useState(initiallyAiAssisted);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const count = useMemo(() => wordCount(value), [value]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.setCustomValidity(
      count > 300 ? "Shorten the salon description to 300 words or fewer." : "",
    );
  }, [count]);

  async function generate() {
    if (keywords.trim().length < 3) {
      setMessage("Enter a few services, qualities, or details first.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const api = await createAuthenticatedApiClient("salon");
      const result = await api.request<{ text?: string; draftId?: string; aiAssisted?: boolean }>("/api/salon/profile/description-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      if (!result.text) throw new Error("No usable draft was returned.");
      setDraft(result.text);
      setDraftId(result.draftId || "");
      setDraftAiAssisted(result.aiAssisted === true);
      setMessage("Draft ready. Review it before choosing Use this draft.");
    } catch {
      setMessage("A draft could not be created. You can still write the description manually.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sm:col-span-2">
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold">About / Description</span>
        <textarea
          ref={textareaRef}
          name="description"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (!draft || event.target.value !== draft) setAiAssisted(false);
          }}
          rows={5}
          aria-invalid={count > 300}
          className="w-full rounded-[7px] border border-plum/15 bg-white px-3 py-2.5 text-xs leading-5 outline-none focus:border-magenta"
        />
      </label>
      <input type="hidden" name="description_ai_assisted" value={aiAssisted ? "true" : "false"} />
      <input type="hidden" name="description_ai_draft_id" value={aiAssisted ? draftId : ""} />
      <div className="mt-1 flex justify-between gap-3 text-[9px] text-ink/50">
        <span>Up to 300 words. The public page previews about 80 words with Read more.</span>
        <span className={count > 300 ? "font-bold text-red-700" : ""}>{count}/300 words</span>
      </div>
      <div className="mt-3 rounded-[10px] border border-plum/10 bg-blush/20 p-3">
        <div className="flex items-center gap-2 text-[10px] font-bold text-plum"><Sparkles size={14} />Optional writing assistance</div>
        <p className="mt-1 text-[9px] leading-4 text-ink/55">Enter services and truthful details. A draft is never published until you review it and save the page.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input value={keywords} onChange={(event) => setKeywords(event.target.value)} maxLength={600} placeholder="e.g. silk presses, color, welcoming, appointment-only" className="min-h-10 flex-1 rounded-[7px] border border-plum/15 bg-white px-3 text-xs outline-none focus:border-magenta" />
          <button type="button" onClick={generate} disabled={loading} className="min-h-10 rounded-[7px] border border-magenta px-4 text-[10px] font-bold text-magenta disabled:opacity-60">{loading ? "Drafting…" : "Create draft"}</button>
        </div>
        {draft ? <div className="mt-3 rounded-[8px] bg-white p-3"><span className="text-[9px] font-semibold text-ink/45">AI-assisted draft</span><p className="mt-1 text-[10px] leading-5 text-ink/70">{draft}</p><button type="button" onClick={() => { setValue(draft); setAiAssisted(draftAiAssisted); setMessage("Draft placed in the description. Review it, then use Save changes to publish."); }} className="mt-2 rounded-full bg-magenta px-3 py-1.5 text-[9px] font-bold text-white">Use this draft</button></div> : null}
        {message ? <p aria-live="polite" className="mt-2 text-[9px] text-plum">{message}</p> : null}
      </div>
    </div>
  );
}
