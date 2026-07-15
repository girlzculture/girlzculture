"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Download, RefreshCw, ShieldAlert } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export default function PushSetup({
  scope = "salon",
  required = false,
  compact = false,
  onReady,
}: {
  scope?: "salon" | "customer";
  required?: boolean;
  compact?: boolean;
  onReady?: (ready: boolean) => void;
}) {
  const [installed, setInstalled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ready = installed && configured && permission === "granted";

  const refreshStatus = useCallback(async () => {
    const hasSupport = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(hasSupport);
    const standalone = isStandalone();
    setInstalled(standalone);
    if (!hasSupport) return;
    setPermission(Notification.permission);
    const session = await getSessionForScope(scope);
    if (!session) return;
    const response = await fetch("/api/push/subscription", { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (response.ok) {
      const body = await response.json() as { configured?: boolean };
      setConfigured(Boolean(body.configured));
    }
  }, [scope]);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installedHandler = () => { setInstalled(true); setMessage("Girlz Culture is installed. Now enable booking alerts."); };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", installedHandler);
    const refreshTimer = window.setTimeout(() => void refreshStatus(), 0);
    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [refreshStatus]);

  useEffect(() => { onReady?.(ready); }, [onReady, ready]);

  async function installApp() {
    if (isStandalone()) { setInstalled(true); return; }
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setMessage("Installation started. Open the installed Girlz Culture app to finish alert setup.");
      else setMessage("Installation was dismissed. Install the app before completing salon setup.");
      setInstallPrompt(null);
      return;
    }
    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setMessage(isiOS
      ? "On iPhone or iPad: tap Share, choose Add to Home Screen, then open Girlz Culture from the new icon."
      : "Open your browser menu and choose Install app or Add to Home Screen, then reopen Girlz Culture from the installed icon.");
  }

  async function enableNotifications() {
    setBusy(true);
    setMessage("");
    try {
      if (!supported) throw new Error("This browser does not support Web Push. Use current Safari, Chrome, Edge, or Firefox.");
      if (!isStandalone()) throw new Error("Install and open Girlz Culture as an app before enabling salon booking alerts.");
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") throw new Error("Notifications are blocked. Allow them in your browser or device settings, then try again.");
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
      if (!publicKey) throw new Error("Web Push is not configured yet. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY in Netlify.");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const session = await getSessionForScope(scope);
      if (!session) throw new Error("Your session expired. Sign in again and retry.");
      const json = subscription.toJSON();
      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, installed: true, deviceLabel: `${navigator.platform || "Device"} app` }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to save this device for booking alerts.");
      setConfigured(true);
      setInstalled(true);
      setMessage("Booking alerts are active on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (ready && compact) return null;

  return (
    <section className={`rounded-[16px] border p-5 ${ready ? "border-emerald-200 bg-emerald-50" : "border-amber/40 bg-amber/10"}`} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${ready ? "bg-emerald-100 text-emerald-700" : "bg-white text-magenta"}`}>
          {ready ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-plum">Booking alerts on this device</h2>
            {required && !ready ? <span className="rounded-full bg-amber px-2 py-1 text-[9px] font-bold uppercase text-white">Required</span> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-ink/65">
            {ready ? "Installed and reachable. New bookings and cancellations can reach you even when the dashboard is closed." : "Install Girlz Culture and allow notifications so time-sensitive bookings are never missed."}
          </p>
          {!supported ? <p className="mt-3 text-xs font-semibold text-red-700">Web Push is not supported in this browser.</p> : null}
          {!ready ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void installApp()} disabled={installed} className="inline-flex min-h-10 items-center gap-2 rounded-[8px] border border-magenta px-4 text-xs font-bold text-magenta disabled:border-emerald-300 disabled:text-emerald-700">
                {installed ? <CheckCircle2 size={15} /> : <Download size={15} />}{installed ? "App installed" : "1. Install app"}
              </button>
              <button type="button" onClick={() => void enableNotifications()} disabled={busy || !installed} className="inline-flex min-h-10 items-center gap-2 rounded-[8px] bg-magenta px-4 text-xs font-bold text-white disabled:opacity-50">
                {busy ? <RefreshCw className="animate-spin" size={15} /> : <BellRing size={15} />}2. {busy ? "Enabling…" : "Enable alerts"}
              </button>
            </div>
          ) : null}
          {message ? <p className={`mt-3 text-xs leading-5 ${ready ? "text-emerald-700" : "text-plum"}`}>{message}</p> : null}
        </div>
      </div>
    </section>
  );
}
