"use client";

import { useMemo, useState } from "react";

const PREVIEW_WORDS = 80;

function words(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean);
}

export default function ExpandableSalonDescription({
  description,
  aiAssisted = false,
}: {
  description: string;
  aiAssisted?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const allWords = useMemo(() => words(description).slice(0, 300), [description]);
  const hasMore = allWords.length > PREVIEW_WORDS;
  const visible = expanded ? allWords : allWords.slice(0, PREVIEW_WORDS);

  return (
    <div className="mt-4 max-w-[760px]">
      <p className="text-[11px] leading-[1.65] text-ink/75 sm:text-[12px]">
        {visible.join(" ")}
        {!expanded && hasMore ? "…" : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {hasMore ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className="min-h-8 text-[10px] font-bold text-magenta underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-magenta"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        ) : null}
        {aiAssisted ? (
          <span className="text-[9px] font-medium text-ink/40">AI-assisted</span>
        ) : null}
      </div>
    </div>
  );
}
