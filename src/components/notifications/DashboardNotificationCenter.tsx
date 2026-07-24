"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, CircleAlert, CreditCard, MessageSquare, X } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { dashboardNotificationCounts, markDashboardNotificationsRead } from "@/lib/dashboardNotificationsCore";

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

  const updateCounts = useCallback((rows: DashboardNotification[]) => {
    onCounts?.(dashboardNotificationCounts(rows));
  }, [onCounts]);

  const load = useCallback(async () => {
    const session = await getSessionForScope(scope);
    if (!session) return;
    const response = await fetch(`/api/notifications?scope=${scope}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = await response.json() as { notifications?: DashboardNotification[] };
    const rows = Array.isArray(body.notifications) ? body.notifications : [];
    setNotifications(rows);
    updateCounts(rows);
  }, [scope, updateCounts]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [load]);

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
    const session = await getSessionForScope(scope);
    if (!session) return false;
    const response = await fetch(`/api/notifications?scope=${scope}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, id }),
    });
    if (!response.ok) return false;
    const now = new Date().toISOString();
    const next = markDashboardNotificationsRead(notifications, action, now, id);
    setNotifications(next);
    updateCounts(next);
    return true;
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
        {notifications.length ? notifications.map((notification) => {
          const Icon = categoryIcon(notification.category);
          return <button type="button" key={notification.id} onClick={() => void select(notification)} className={`flex w-full gap-3 border-b border-plum/8 p-4 text-left hover:bg-blush/20 ${notification.read_at ? "bg-white" : "bg-blush/15"}`}>
            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${notification.severity === "critical" || notification.severity === "high" ? "bg-red-50 text-red-700" : "bg-cream text-magenta"}`}><Icon size={16}/></span>
            <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><b className="text-xs text-plum">{notification.title || "Update"}</b>{!notification.read_at ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-magenta"/> : null}</span><span className="mt-1 block text-[11px] leading-4 text-ink/60">{notification.body}</span>{Number(notification.occurrence_count || 1) > 1 ? <span className="mt-1 block text-[9px] font-bold text-ink/45">{notification.occurrence_count} occurrences grouped</span> : null}</span>
          </button>;
        }) : <p className="p-8 text-center text-xs text-ink/50">No notifications yet.</p>}
      </div>
    </section> : null}
  </div>;
}
