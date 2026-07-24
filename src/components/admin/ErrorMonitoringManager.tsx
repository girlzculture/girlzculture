/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";

type Row = Record<string, any>;

async function authHeaders(json = false) {
  const session = await getSessionForScope("admin");
  if (!session) throw new Error("Your admin session expired.");
  return {
    Authorization: `Bearer ${session.access_token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export default function ErrorMonitoringManager() {
  const [events, setEvents] = useState<Row[]>([]);
  const [rules, setRules] = useState<Row[]>([]);
  const [trend, setTrend] = useState<Row[]>([]);
  const [assignees, setAssignees] = useState<Row[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [status, setStatus] = useState("Open");
  const [severity, setSeverity] = useState("");
  const [feature, setFeature] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams({
        status,
        ...(severity ? { severity } : {}),
        ...(feature ? { feature } : {}),
        ...(query.trim() ? { q: query.trim() } : {}),
      });
      const response = await fetch(`/api/admin/engine/errors?${params}`, {
        headers: await authHeaders(),
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load error monitoring.");
      const nextEvents = Array.isArray(body.events) ? body.events : [];
      setEvents(nextEvents);
      setRules(Array.isArray(body.rules) ? body.rules : []);
      setTrend(Array.isArray(body.trend) ? body.trend : []);
      setAssignees(Array.isArray(body.assignees) ? body.assignees : []);
      setFeatures(Array.isArray(body.features) ? body.features : []);
      if (selected) {
        const refreshed = nextEvents.find((row: Row) => row.id === selected.id) || null;
        setSelected(refreshed);
        setAssignedTo(String(refreshed?.assigned_to || ""));
        setNotes(String(refreshed?.admin_notes || ""));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load error monitoring.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [feature, severity, status]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectEvent(event: Row) {
    setSelected(event);
    setNotes(String(event.admin_notes || ""));
    setAssignedTo(String(event.assigned_to || ""));
  }

  async function update(nextStatus: string) {
    if (!selected) return;
    setNotice("");
    try {
      const response = await fetch("/api/admin/engine/errors", {
        method: "PATCH",
        headers: await authHeaders(true),
        body: JSON.stringify({
          id: selected.id,
          status: nextStatus,
          notes,
          assigned_to: assignedTo || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update the event.");
      setSelected(body.event);
      setNotes(String(body.event.admin_notes || ""));
      setAssignedTo(String(body.event.assigned_to || ""));
      setNotice(`Event marked ${nextStatus.toLowerCase()}.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update the event.");
    }
  }

  const totals = useMemo(() => trend.reduce((result: Record<string, number>, item: Row) => {
    result[item.severity] = (result[item.severity] || 0) + Number(item.occurrence_count || 1);
    return result;
  }, {}), [trend]);
  const dailyTrend = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, offset) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (13 - offset));
      return {
        key: day.toISOString().slice(0, 10),
        label: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        count: 0,
      };
    });
    for (const item of trend) {
      const day = days.find((entry) => entry.key === String(item.occurred_at || "").slice(0, 10));
      if (day) day.count += Number(item.occurrence_count || 1);
    }
    return days;
  }, [trend]);
  const trendMaximum = Math.max(1, ...dailyTrend.map((day) => day.count));

  return <section className="space-y-4 rounded-[15px] border border-plum/10 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><AlertTriangle className="text-magenta" size={21}/><h2 className="font-serif text-2xl text-plum">Operational Monitoring</h2></div><p className="mt-1 text-xs text-ink/55">Platform failures are grouped by cause and explained in plain language. Ordinary validation is excluded.</p></div>
      <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/15 px-4 text-xs font-bold text-plum"><RefreshCw size={14}/>Refresh</button>
    </div>

    <div className="grid gap-3 sm:grid-cols-4">{["critical", "high", "medium", "low"].map((level) => <div key={level} className="rounded-xl border border-plum/10 bg-cream/45 p-3"><p className="text-[10px] font-bold uppercase text-ink/50">{level} · 14 days</p><p className="mt-1 font-serif text-2xl text-plum">{totals[level] || 0}</p></div>)}</div>
    <div className="rounded-xl border border-plum/10 bg-cream/35 p-3"><p className="text-[10px] font-bold uppercase text-ink/50">Occurrences by day · last 14 days</p><div className="mt-3 grid h-24 grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1" aria-label="Fourteen-day error occurrence trend">{dailyTrend.map((day) => <div key={day.key} title={`${day.label}: ${day.count}`} className="group flex h-full items-end"><span className="w-full rounded-t bg-magenta/70 transition-colors group-hover:bg-magenta" style={{ height: `${Math.max(day.count ? 8 : 2, (day.count / trendMaximum) * 100)}%` }}><span className="sr-only">{day.label}: {day.count}</span></span></div>)}</div></div>

    <div className="grid gap-3 md:grid-cols-[140px_140px_180px_1fr_auto]">
      <select aria-label="Error status" value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 rounded-lg border px-3 text-xs"><option>Open</option><option>Investigating</option><option>Resolved</option><option>Ignored</option></select>
      <select aria-label="Error severity" value={severity} onChange={(event) => setSeverity(event.target.value)} className="min-h-10 rounded-lg border px-3 text-xs"><option value="">All severity</option><option>critical</option><option>high</option><option>medium</option><option>low</option></select>
      <select aria-label="Affected feature" value={feature} onChange={(event) => setFeature(event.target.value)} className="min-h-10 rounded-lg border px-3 text-xs"><option value="">All features</option>{features.map((item) => <option key={item}>{item}</option>)}</select>
      <label className="flex min-h-10 items-center gap-2 rounded-lg border px-3"><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="Reference, route, or action" className="min-w-0 flex-1 text-xs outline-none"/></label>
      <button type="button" onClick={() => void load()} className="rounded-lg bg-magenta px-5 text-xs font-bold text-white">Search</button>
    </div>

    {notice ? <p role="status" className="rounded-lg bg-blush/55 p-3 text-xs text-plum">{notice}</p> : null}
    <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
      <div className="max-h-[600px] space-y-2 overflow-y-auto">
        {events.map((event) => <button key={event.id} type="button" onClick={() => selectEvent(event)} className={`w-full rounded-xl border p-4 text-left ${selected?.id === event.id ? "border-magenta bg-blush/30" : "border-plum/10"}`}><div className="flex items-center justify-between gap-3"><b className="text-xs text-plum">{event.presentation?.title || "Platform operation needs attention"}</b><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${event.severity === "critical" ? "bg-red-100 text-red-800" : event.severity === "high" ? "bg-amber-100 text-amber-800" : "bg-blush text-plum"}`}>{event.severity}</span></div><p className="mt-2 line-clamp-2 text-xs text-ink/65">{event.presentation?.explanation || event.user_safe_message || "An operation needs review."}</p><p className="mt-2 text-[9px] text-ink/45">{event.occurrence_count} occurrence{event.occurrence_count === 1 ? "" : "s"} · {event.affected_business_count || 0} affected business{event.affected_business_count === 1 ? "" : "es"} · last seen {new Date(event.last_occurred_at).toLocaleString()}</p></button>)}
        {!loading && !events.length ? <p className="rounded-xl border border-dashed border-plum/15 p-8 text-center text-xs text-ink/50">No events match these filters.</p> : null}
        {loading ? <p className="p-6 text-center text-xs text-ink/50">Loading monitored errors…</p> : null}
      </div>

      {selected ? <article className="min-w-0 rounded-xl border border-plum/10 bg-cream/35 p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-serif text-xl text-plum">{selected.presentation?.title || "Platform operation needs attention"}</h3><span className="text-[10px] font-bold text-magenta">{selected.status}</span></div>
        <p className="mt-3 text-sm leading-6 text-ink/70">{selected.presentation?.explanation || selected.user_safe_message}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-white p-3"><b className="text-xs text-plum">Impact</b><p className="mt-1 text-[11px] leading-5 text-ink/60">{selected.presentation?.impact}</p></div><div className="rounded-lg bg-white p-3"><b className="text-xs text-plum">Recommended admin action</b><p className="mt-1 text-[11px] leading-5 text-ink/60">{selected.presentation?.recommendedAction}</p></div></div>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="font-bold">Severity / category</dt><dd className="text-ink/60">{selected.severity} · {selected.presentation?.category}</dd></div><div><dt className="font-bold">First / last seen</dt><dd className="text-ink/60">{new Date(selected.first_occurred_at).toLocaleString()}<br/>{new Date(selected.last_occurred_at).toLocaleString()}</dd></div><div><dt className="font-bold">Route / action</dt><dd className="break-all text-ink/60">{selected.route || "Scheduled/background"} · {selected.action}</dd></div><div><dt className="font-bold">Occurrences / businesses</dt><dd className="text-ink/60">{selected.occurrence_count} · {selected.affected_business_count || 0}</dd></div></dl>
        {selected.affected_businesses?.length ? <div className="mt-4 rounded-lg border border-plum/10 bg-white p-3"><b className="text-xs text-plum">Affected salons and businesses</b><div className="mt-2 space-y-2">{selected.affected_businesses.map((item: Row) => <div key={`${item.event_id}-${item.salon_id}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-plum/8 pt-2 text-[11px]"><span><b>{item.salon?.name || "Salon"}</b><br/><span className="text-ink/55">{[item.salon?.address_city, item.salon?.address_state, item.salon?.address_zip].filter(Boolean).join(", ") || "Location not recorded"} · {item.occurrence_count} occurrence{item.occurrence_count === 1 ? "" : "s"}</span></span><Link href={`/admin/salons?salon=${item.salon_id}`} className="font-bold text-magenta">Open salon</Link></div>)}</div></div> : null}
        <details className="mt-4 rounded-lg bg-ink p-3 text-[11px] leading-5 text-white"><summary className="cursor-pointer font-bold">Technical details</summary><div className="mt-2"><p className="break-all text-white/65">Reference {selected.reference} · {selected.environment} · {selected.release}</p><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono">{selected.technical_message}{selected.technical_stack ? `\n\n${selected.technical_stack}` : ""}</pre></div></details>
        <label className="mt-4 block text-xs font-bold">Assigned admin<select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">Unassigned</option>{assignees.map((admin) => <option key={admin.id} value={admin.id}>{admin.name}{admin.email && admin.email !== admin.name ? ` · ${admin.email}` : ""}</option>)}</select></label>
        <label className="mt-4 block text-xs font-bold">Admin notes<textarea value={notes} onChange={(event) => setNotes(event.target.value.slice(0, 4000))} rows={5} className="mt-1 w-full rounded-lg border p-3 font-normal"/></label>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void update("Investigating")} className="rounded-lg border border-amber-300 px-3 py-2 text-[10px] font-bold text-amber-800">Investigating</button><button type="button" onClick={() => void update("Resolved")} className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-3 py-2 text-[10px] font-bold text-white"><CheckCircle2 size={13}/>Resolved</button><button type="button" onClick={() => void update("Ignored")} className="rounded-lg border px-3 py-2 text-[10px] font-bold">Ignore</button><button type="button" onClick={() => void update("Open")} className="rounded-lg border border-magenta px-3 py-2 text-[10px] font-bold text-magenta">Reopen</button></div>
      </article> : <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-plum/15 text-xs text-ink/50">Select an event to review its impact and recommended action.</div>}
    </div>

    <div className="rounded-xl border border-plum/10 p-3"><p className="text-[10px] font-bold uppercase text-ink/50">Alert thresholds</p><div className="mt-2 flex flex-wrap gap-3">{rules.map((rule) => <span key={rule.id} className="rounded-full bg-blush/50 px-3 py-2 text-[10px] text-plum">{rule.severity}: {rule.occurrence_threshold} in {rule.window_minutes} min · {rule.is_enabled ? "enabled" : "disabled"}</span>)}</div></div>
  </section>;
}
