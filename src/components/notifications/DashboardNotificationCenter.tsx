"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, CircleAlert, CreditCard, MessageSquare, X } from "lucide-react";
import { getSupabaseForScope } from "@/lib/supabase";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import {
  ScopedApiError,
  scopedApiErrorMessage,
} from "@/lib/scopedApiCore";
import { dashboardNotificationCounts, markDashboardNotificationsRead } from "@/lib/dashboardNotificationsCore";
import {
  nextDashboardNotificationPoll,
  type DashboardNotificationPollOutcome,
} from "@/lib/dashboardNotificationPollingCore";

export type DashboardNotification = {
  id?: string;
  title?: string;
  body?: string;
  action_url?: string;
  read_at?: string | null;
  created_at?: string;
  last_seen_at?: string;
  occurrence_count?: number;
  category?: string;
  severity?: string;
};

type Scope = "admin" | "salon";
const categoryIcon = (category?: string) =>
  category === "payments"
    ? CreditCard
    : category === "errors"
      ? CircleAlert
      : category === "messages"
        ? MessageSquare
        : Bell;

export default function DashboardNotificationCenter({
  scope,
  initialNotifications = [],
  onCounts,
}: {
  scope: Scope;
  initialNotifications?: DashboardNotification[];
  onCounts?: (counts: Record<string, number>) => void;
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [busy, setBusy] = useState(false);
  const [loadMessage, setLoadMessage] = useState("");
  const terminalSession = useRef(false);

  const updateCounts = useCallback((rows: DashboardNotification[]) => {
    onCounts?.(dashboardNotificationCounts(rows));
  }, [onCounts]);

  const load = useCallback(async (): Promise<DashboardNotificationPollOutcome> => {
    if (terminalSession.current) return "terminal";
    try {
      const api = await createAuthenticatedApiClient(scope);
      const body = await api.request<{
        notifications?: DashboardNotification[];
      }>(`/api/notifications?scope=${scope}`);
      const rows = Array.isArray(body.notifications) ? body.notifications : [];
      terminalSession.current = false;
      setLoadMessage("");
      setNotifications(rows);
      updateCounts(rows);
      return "ready";
    } catch (error) {
      if (error instanceof ScopedApiError && error.authenticationFailure) {
        terminalSession.current = true;
        setLoadMessage(
          scopedApiErrorMessage(
            error,
            `Your ${scope} session has expired. Sign in again.`,
          ),
        );
        return "terminal";
      }
      setLoadMessage(
        scopedApiErrorMessage(
          error,
          "Notifications are temporarily unavailable. They will retry automatically.",
        ),
      );
      return "transient";
    }
  }, [scope, updateCounts]);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let running = false;
    let rerun = false;
    let retryAttempt = 0;
    const schedule = (delay: number) => {
      if (stopped || terminalSession.current) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), Math.max(0, delay));
    };
    const tick = async () => {
      timer = null;
      if (stopped || terminalSession.current) return;
      if (running) {
        rerun = true;
        return;
      }
      running = true;
      const outcome = await load();
      running = false;
      if (stopped || outcome === "terminal") return;
      if (rerun) {
        rerun = false;
        schedule(0);
        return;
      }
      const next = nextDashboardNotificationPoll(outcome, retryAttempt);
      retryAttempt = next.attempt;
      if (next.delay !== null) schedule(next.delay);
    };
    const client = getSupabaseForScope(scope);
    const { data: authListener } = client.auth.onAuthStateChange(
      (event, session) => {
        if (stopped) return;
        if (event === "SIGNED_OUT") {
          terminalSession.current = true;
          if (timer !== null) window.clearTimeout(timer);
          timer = null;
          return;
        }
        if (
          session &&
          (event === "SIGNED_IN" ||
            event === "TOKEN_REFRESHED" ||
            event === "USER_UPDATED")
        ) {
          terminalSession.current = false;
          retryAttempt = 0;
          setLoadMessage("");
          schedule(0);
        }
      },
    );
    schedule(0);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      authListener.subscription.unsubscribe();
    };
  }, [load, scope]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function mark(action: "read" | "read_all", id?: string) {
    if (terminalSession.current) return false;
    try {
      const api = await createAuthenticatedApiClient(scope);
      await api.request(`/api/notifications?scope=${scope}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const now = new Date().toISOString();
      const next = markDashboardNotificationsRead(notifications, action, now, id);
      setNotifications(next);
      updateCounts(next);
      setLoadMessage("");
      return true;
    } catch (error) {
      if (error instanceof ScopedApiError && error.authenticationFailure) {
        terminalSession.current = true;
      }
      setLoadMessage(
        scopedApiErrorMessage(
          error,
          "The notification could not be updated. Try again.",
        ),
      );
      return false;
    }
  }

  async function select(notification: DashboardNotification) {
    if (busy) return;
    setBusy(true);
    try {
      if (!notification.read_at && notification.id) {
        await mark("read", notification.id);
      }
      setOpen(false);
      const action = String(notification.action_url || "").trim();
      if (action.startsWith("/") && !action.startsWith("//")) router.push(action);
    } finally {
      setBusy(false);
    }
  }

  const unread = notifications.filter((row) => !row.read_at).length;
  return <div ref={root} className="relative">
    <button
      type="button"
      aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-blush/50"
    >
      <Bell size={21}/>
      {unread ? <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-magenta px-1 text-[9px] font-bold text-white">{Math.min(unread, 99)}</span> : null}
    </button>
    {open ? <section role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-16 z-[80] max-h-[72vh] overflow-hidden rounded-2xl border border-plum/10 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[370px]">
      <header className="flex items-center justify-between border-b border-plum/10 p-4">
        <div><h2 className="font-serif text-xl text-plum">Notifications</h2><p className="text-[10px] text-ink/50">{unread ? `${unread} unread` : "You’re all caught up."}</p></div>
        <div className="flex items-center gap-1">
          {unread ? <button type="button" disabled={busy} onClick={() => void mark("read_all")} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-bold text-magenta"><CheckCheck size={14}/>Mark all read</button> : null}
          <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-blush"><X size={17}/></button>
        </div>
      </header>
      <div className="max-h-[calc(72vh-76px)] overflow-y-auto">
        {loadMessage ? (
          <p
            role="status"
            className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-[10px] leading-4 gc-text-warning"
          >
            {loadMessage}
          </p>
        ) : null}
        {notifications.length ? notifications.map((notification) => {
          const Icon = categoryIcon(notification.category);
          return <button type="button" key={notification.id} onClick={() => void select(notification)} className={`flex w-full gap-3 border-b border-plum/8 p-4 text-left hover:bg-blush/20 ${notification.read_at ? "bg-white" : "bg-blush/15"}`}>
            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${notification.severity === "critical" || notification.severity === "high" ? "bg-red-50 gc-text-danger" : "bg-cream text-magenta"}`}><Icon size={16}/></span>
            <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><b className="text-xs text-plum">{notification.title || "Update"}</b>{!notification.read_at ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-magenta"/> : null}</span><span className="mt-1 block text-[11px] leading-4 text-ink/60">{notification.body}</span>{Number(notification.occurrence_count || 1) > 1 ? <span className="mt-1 block text-[9px] font-bold text-ink/45">{notification.occurrence_count} occurrences grouped</span> : null}</span>
          </button>;
        }) : <p className="p-8 text-center text-xs text-ink/50">No notifications yet.</p>}
      </div>
    </section> : null}
  </div>;
}
