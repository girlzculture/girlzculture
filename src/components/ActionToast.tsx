"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACTION_TOAST_SUCCESS_DURATION_MS,
  actionToastIsError,
  actionToastReference,
} from "@/lib/actionToastCore";

export default function ActionToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  const [copiedReference, setCopiedReference] = useState("");
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message) return;
    if (actionToastIsError(message)) return;
    const dismiss = () => dismissRef.current();
    const timer = window.setTimeout(
      dismiss,
      ACTION_TOAST_SUCCESS_DURATION_MS,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [message]);

  if (!message) return null;
  const failed = actionToastIsError(message);
  const reference = actionToastReference(message);

  async function copyReference() {
    if (!reference) return;
    let didCopy = false;
    try {
      await navigator.clipboard.writeText(reference);
      didCopy = true;
    } catch {
      const field = document.createElement("textarea");
      field.value = reference;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      didCopy = document.execCommand("copy");
      field.remove();
    }
    if (didCopy) setCopiedReference(reference);
  }

  return (
    <div
      role={failed ? "alert" : "status"}
      aria-live={failed ? "assertive" : "polite"}
      className={`fixed inset-x-4 bottom-24 z-[160] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-[10px] border bg-white px-4 py-3 text-xs font-semibold shadow-[0_14px_40px_rgba(13,17,20,.22)] md:bottom-6 ${failed ? "border-red-300 gc-text-danger" : "border-magenta/25 text-plum"}`}
    >
      <span className="min-w-0 flex-1 leading-5">{message}</span>
      <span className="flex shrink-0 items-center gap-1">
        {reference ? (
          <button
            type="button"
            onClick={() => void copyReference()}
            className="min-h-9 rounded-md border border-current/25 px-2 text-[10px] font-bold"
          >
            {copiedReference === reference ? "Copied" : "Copy reference"}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Dismiss message"
          onClick={onDismiss}
          className="min-h-9 min-w-9 text-lg"
        >
          ×
        </button>
      </span>
    </div>
  );
}
