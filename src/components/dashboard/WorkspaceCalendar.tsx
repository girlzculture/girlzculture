"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/LocaleProvider";

export type WorkspaceEvent = { id: string; start: string; end?: string; title: string; subtitle?: string; status?: string; href?: string; kind?: "appointment" | "unavailable" };
type View = "day" | "week" | "month";
// ISO keys deliberately use Gregorian Latin digits, independently of display language.
export function calendarDayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}
function utcDay(value: string) { return new Date(`${value}T12:00:00Z`); }
function addDays(date: Date, amount: number) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + amount); return next; }

export default function WorkspaceCalendar({ events, timeZone = "UTC", initialView = "week", initialDate, title = "Appointment calendar" }: { events: WorkspaceEvent[]; timeZone?: string; initialView?: View; initialDate?: string; title?: string }) {
  const { translateSource: t, formatDate } = useI18n();
  const [view, setView] = useState<View>(initialView);
  const [anchor, setAnchor] = useState(() => initialDate || calendarDayKey(new Date(), timeZone));
  const [query, setQuery] = useState("");
  const date = utcDay(anchor);
  const first = view === "month" ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)) : date;
  const start = view === "day" ? first : addDays(first, -((first.getUTCDay() + 6) % 7));
  const days = Array.from({ length: view === "day" ? 1 : view === "week" ? 7 : 42 }, (_, index) => addDays(start, index));
  const visible = useMemo(() => events.filter(event => Number.isFinite(Date.parse(event.start)) && (!query.trim() || [event.title, event.subtitle, event.status].filter(Boolean).join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)), [events, query]);
  const viewLabels = { day: t("Day"), week: t("Week"), month: t("Month") };
  function shift(amount: number) {
    const next = view === "month" ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12)) : addDays(date, amount * (view === "week" ? 7 : 1));
    setAnchor(next.toISOString().slice(0, 10));
  }
  return <section className="gc-panel" aria-label={t(title)}>
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-xl"><CalendarDays size={20} aria-hidden/>{t(title)}</h2><p className="mt-1 text-sm">{timeZone.replaceAll("_", " ")} · {t("Loaded appointments and availability overrides")}</p></div>
      <div className="flex gap-1 rounded-xl border border-border p-1" aria-label={t("Calendar view")}>
        {(["day", "week", "month"] as const).map(mode => <button type="button" key={mode} onClick={() => setView(mode)} aria-pressed={view === mode} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${view === mode ? "bg-primary-hover text-white" : "hover:bg-subtle"}`}>{viewLabels[mode]}</button>)}
      </div>
    </header>
    <div className="my-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label={t("Previous {value0}", { value0: viewLabels[view] })} onClick={() => shift(-1)} className="grid h-10 w-10 place-items-center rounded-lg border border-border"><ChevronLeft size={18}/></button>
        <button type="button" onClick={() => setAnchor(calendarDayKey(new Date(), timeZone))} className="min-h-10 rounded-lg border border-border px-3 font-semibold">{t("Today")}</button>
        <button type="button" aria-label={t("Next {value0}", { value0: viewLabels[view] })} onClick={() => shift(1)} className="grid h-10 w-10 place-items-center rounded-lg border border-border"><ChevronRight size={18}/></button>
        <label><span className="sr-only">{t("Calendar date")}</span><input type="date" value={anchor} onChange={event => { if (event.target.value && Number.isFinite(Date.parse(event.target.value))) setAnchor(event.target.value); }} className="min-h-10 max-w-40 border px-2 text-sm"/></label>
      </div>
      <input aria-label={t("Filter calendar appointments")} value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Find a client, service or status")} className="min-h-10 w-full rounded-lg border px-3 text-sm sm:w-64"/>
    </div>
    <h3 className="mb-3 text-base" aria-live="polite">{formatDate(date, { month: "long", year: "numeric", ...(view === "day" ? { day: "numeric" } : {}), timeZone: "UTC" })}</h3>
    <div className="max-w-full overflow-x-auto rounded-xl border border-border" tabIndex={0} role="region" aria-label={t("{value0} calendar", { value0: viewLabels[view] })}>
      <div className={view === "day" ? "grid grid-cols-1" : view === "week" ? "grid grid-cols-1 sm:min-w-[770px] sm:grid-cols-7" : "grid min-w-[560px] grid-cols-7"}>
        {days.map(day => {
          const key = day.toISOString().slice(0, 10);
          const appointments = visible.filter(event => {
            const startKey=calendarDayKey(new Date(event.start),timeZone);
            const ends=event.end?Date.parse(event.end):NaN;
            // End is exclusive; a closure ending at midnight must not block
            // the next day. Include each intervening local day across DST.
            const endKey=Number.isFinite(ends)&&ends>Date.parse(event.start)?calendarDayKey(new Date(ends-1),timeZone):startKey;
            return startKey<=key&&endKey>=key;
          });
          const today = key === calendarDayKey(new Date(), timeZone);
          return <section key={key} aria-label={formatDate(day, { dateStyle: "full", timeZone: "UTC" })} className={`min-w-0 border-b border-r border-border p-2 ${view === "month" ? "min-h-28" : "min-h-20 sm:min-h-64"} ${today ? "bg-subtle" : "bg-white"}`}>
            <header className="mb-3 flex items-center justify-between text-xs font-semibold"><span>{formatDate(day, { weekday: "short", timeZone: "UTC" })}</span><span className={`grid h-7 w-7 place-items-center rounded-full ${today ? "bg-primary-hover text-white" : "text-text-primary"}`}>{day.getUTCDate()}</span></header>
            <div className="space-y-2">{appointments.map(event => {
              const content = <><time className="block text-xs font-bold">{calendarDayKey(new Date(event.start), timeZone) < key ? t("Continues") : formatDate(event.start, { timeZone, hour: "numeric", minute: "2-digit" })}</time>{event.end ? <span className="block text-xs">{t("Ends {value0}", { value0:formatDate(event.end, { timeZone, month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) })}</span> : null}<b data-no-translate className="mt-1 block break-words text-sm">{event.title}</b>{event.subtitle ? <span data-no-translate className="mt-1 block break-words text-xs">{event.subtitle}</span> : null}{event.status ? <span className="mt-2 block text-xs font-semibold">{t(event.status)}</span> : null}</>;
              const className = `block rounded-lg border-l-[3px] p-2 ${event.kind === "unavailable" ? "border-red-700 bg-red-50 text-text-danger" : /pending/i.test(event.status||"") ? "border-amber-600 bg-amber-50 text-ink" : /completed/i.test(event.status||"") ? "border-emerald-700 bg-emerald-50 text-ink" : "border-primary bg-subtle text-text-primary"}`;
              return event.href ? <Link key={event.id} href={event.href} className={className}>{content}</Link> : <div key={event.id} className={className}>{content}</div>;
            })}{!appointments.length && view !== "month" ? <p className="py-6 text-center text-xs">{t("No appointments loaded")}</p> : null}</div>
          </section>;
        })}
      </div>
    </div>
  </section>;
}
