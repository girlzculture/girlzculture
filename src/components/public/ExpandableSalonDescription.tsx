"use client";

import { useMemo, useState } from "react";

const PREVIEW_WORDS = 50;
const MAX_WORDS = 200;

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
  const allWords = useMemo(
    () => words(description).slice(0, MAX_WORDS),
    [description],
  );
  const hasMore = allWords.length > PREVIEW_WORDS;
  const visible = expanded ? allWords : allWords.slice(0, PREVIEW_WORDS);

  return (
    <div className="mt-4 max-w-[760px]">
      <p className="text-sm leading-6 text-ink/80">
        {visible.join(" ")}
        {!expanded && hasMore ? "…" : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {hasMore ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className="min-h-9 text-sm font-bold text-magenta underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-magenta"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        ) : null}
        {aiAssisted ? (
          <span className="text-xs font-medium text-ink/55">Writing-assisted</span>
        ) : null}
      </div>
    </div>
  );
}
