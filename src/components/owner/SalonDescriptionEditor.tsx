"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
      count > 200 ? "Shorten the salon description to 200 words or fewer." : "",
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
      const result = await api.request<{
        text?: string;
        draftId?: string;
        aiAssisted?: boolean;
      }>("/api/salon/profile/description-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      if (!result.text) throw new Error("No usable draft was returned.");
      setDraft(result.text);
      setDraftId(result.draftId || "");
      setDraftAiAssisted(result.aiAssisted === true);
      setMessage("Draft ready. Review it before choosing Use this draft.");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : "A draft could not be created. You can still write the description manually.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sm:col-span-2">
      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-plum">
          About / Description
        </span>
        <textarea
          ref={textareaRef}
          name="description"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (!draft || event.target.value !== draft) setAiAssisted(false);
          }}
          rows={6}
          aria-invalid={count > 200}
          className="w-full rounded-[8px] border border-plum/15 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-magenta"
        />
      </label>
      <input
        type="hidden"
        name="description_ai_assisted"
        value={aiAssisted ? "true" : "false"}
      />
      <input
        type="hidden"
        name="description_ai_draft_id"
        value={aiAssisted ? draftId : ""}
      />
      <div className="mt-1 flex justify-between gap-3 text-xs text-ink/60">
        <span>Up to 200 words. The public page shows a short preview with Read more.</span>
        <span className={count > 200 ? "font-bold gc-text-danger" : ""}>
          {count}/200 words
        </span>
      </div>
      <div className="mt-3 rounded-[10px] border border-plum/10 bg-blush/20 p-3 sm:p-4">
        <div className="text-sm font-bold text-plum">Optional writing assistance</div>
        <p className="mt-1 text-xs leading-5 text-ink/65">
          Enter truthful services and qualities. The system creates an editable draft and never publishes it until you choose the draft and save the page.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            maxLength={600}
            placeholder="Example: silk presses, color, welcoming, appointment-only"
            className="min-h-11 flex-1 rounded-[8px] border border-plum/15 bg-white px-3 text-sm outline-none focus:border-magenta"
          />
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="min-h-11 rounded-[8px] border border-magenta bg-white px-4 text-sm font-bold text-magenta gc-disabled-control"
          >
            {loading ? "Creating draft…" : "Create draft"}
          </button>
        </div>
        {draft ? (
          <div className="mt-3 rounded-[8px] bg-white p-3">
            <span className="text-xs font-semibold text-ink/55">
              Writing-assisted draft
            </span>
            <p className="mt-2 text-sm leading-6 text-ink/75">{draft}</p>
            <button
              type="button"
              onClick={() => {
                setValue(draft);
                setAiAssisted(draftAiAssisted);
                setMessage(
                  "Draft placed in the description. Review it, then use Save changes to publish.",
                );
              }}
              className="mt-3 min-h-10 rounded-[8px] bg-magenta px-4 text-sm font-bold text-white"
            >
              Use this draft
            </button>
          </div>
        ) : null}
        {message ? (
          <p aria-live="polite" className="mt-2 text-sm font-semibold text-plum">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
