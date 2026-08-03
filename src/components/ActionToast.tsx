"use client";

import { useEffect, useRef } from "react";

export default function ActionToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message) return;
    const dismiss = () => dismissRef.current();
    const timer = window.setTimeout(dismiss, 3_000);
    window.addEventListener("pointerdown", dismiss, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [message]);

  if (!message) return null;
  const failed = /fail|unable|could not|couldn't|error|invalid|expired/i.test(message);
  return (
    <div
      role={failed ? "alert" : "status"}
      aria-live={failed ? "assertive" : "polite"}
      onPointerDown={(event) => {
        event.stopPropagation();
        onDismiss();
      }}
      className={`fixed inset-x-4 bottom-24 z-[160] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-[10px] border bg-white px-4 py-3 text-xs font-semibold shadow-[0_14px_40px_rgba(13,17,20,.22)] md:bottom-6 ${failed ? "border-red-300 text-red-700" : "border-magenta/25 text-plum"}`}
    >
      <span>{message}</span>
      <button type="button" aria-label="Dismiss message" onClick={onDismiss} className="min-h-8 min-w-8 text-lg">
        ×
      </button>
    </div>
  );
}
