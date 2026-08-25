"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";

type OwnerLiveEventDetail = {
  id?: string;
  title?: string;
  body?: string;
  bookingId?: string;
  actionUrl?: string;
  eventType?: string;
};

function playBookingTone() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.45);
    window.setTimeout(() => void context.close(), 700);
  } catch {
    // Device/browser sound policy remains authoritative.
  }
}

export default function OwnerRealtimeAlertBridge() {
  const [alert, setAlert] = useState<OwnerLiveEventDetail | null>(null);
  const seen = useRef(new Set<string>());
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const show = (detail: OwnerLiveEventDetail) => {
      const key =
        String(detail.bookingId || detail.id || "") ||
        `${detail.title || "booking"}:${detail.body || ""}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      if (seen.current.size > 150) {
        const oldest = seen.current.values().next().value;
        if (oldest) seen.current.delete(oldest);
      }
      setAlert(detail);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => setAlert(null), 8_000);
      playBookingTone();
      try {
        navigator.vibrate?.([180, 90, 180]);
      } catch {
        // Vibration support and device settings vary.
      }
      if (
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification(detail.title || "New booking received", {
            body:
              detail.body ||
              "A customer completed a booking. Open Girlz Culture for details.",
            tag: key,
            icon: "/pwa-icon-192.png",
          });
        } catch {
          // The in-dashboard alert remains available.
        }
      }
    };
    const notification = (event: Event) => {
      const detail = (event as CustomEvent<OwnerLiveEventDetail>).detail || {};
      const title = String(detail.title || "").toLowerCase();
      if (
        detail.bookingId ||
        title.includes("booking") ||
        title.includes("appointment")
      ) {
        show(detail);
      }
    };
    const booking = (event: Event) =>
      show((event as CustomEvent<OwnerLiveEventDetail>).detail || {});
    window.addEventListener("gc:owner-notification", notification);
    window.addEventListener("gc:owner-booking-update", booking);
    return () => {
      window.removeEventListener("gc:owner-notification", notification);
      window.removeEventListener("gc:owner-booking-update", booking);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  if (!alert) return null;
  return (
    <section
      role="status"
      aria-live="assertive"
      className="fixed inset-x-3 top-[84px] z-[100] rounded-2xl border border-teal/25 bg-white p-4 shadow-2xl sm:left-auto sm:right-5 sm:w-[380px]"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal/10 text-teal">
          <CalendarDays size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-sm text-plum">
            {alert.title || "New booking received"}
          </b>
          <p className="mt-1 text-xs leading-5 text-ink/65">
            {alert.body ||
              "A customer completed a booking. The appointment list has been updated."}
          </p>
          {alert.actionUrl ? (
            <a
              href={alert.actionUrl}
              className="mt-2 inline-flex text-xs font-bold text-teal"
            >
              Open booking →
            </a>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss booking alert"
          onClick={() => setAlert(null)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-blush"
        >
          <X size={17} />
        </button>
      </div>
    </section>
  );
}
