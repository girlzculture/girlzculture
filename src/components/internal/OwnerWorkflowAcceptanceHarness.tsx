"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  Clock3,
  ImageIcon,
  LockKeyhole,
  Package,
  Scissors,
  UsersRound,
} from "lucide-react";
import {
  OwnerDetailHeader,
  OwnerSectionCard,
} from "@/components/owner/OwnerWorkflowUi";

const bookings = [
  { id: "booking-1", customer: "Jasmine P.", service: "Knotless Braids", status: "Confirmed", group: "Upcoming", time: "May 16 · 10:00 AM", reference: "GC-UPCOMING" },
  { id: "booking-2", customer: "Tiffany M.", service: "Fulani Braids", status: "Completed", group: "All", time: "May 14 · 1:00 PM", reference: "GC-COMPLETE" },
  { id: "booking-3", customer: "Aaliyah K.", service: "Boho Braids", status: "In Progress", group: "In Progress", time: "Today · 2:00 PM", reference: "GC-ACTIVE" },
  { id: "booking-4", customer: "Monique D.", service: "Goddess Locs", status: "Requested", group: "Needs Resolution", time: "Tomorrow · 11:30 AM", reference: "GC-REVIEW" },
];

const workflowGroups = ["Upcoming", "In Progress", "Needs Resolution", "All"];
const availabilityWorkspaces = [
  { id: "calendar", title: "Appointment calendar", icon: CalendarDays, description: "Review the weekly calendar and open one appointment at a time." },
  { id: "hours", title: "Store hours", icon: Clock3, description: "Set regular weekly opening and closing times." },
  { id: "slots", title: "Bookable time slots", icon: BadgeCheck, description: "Set intervals and buffers between appointments." },
  { id: "stylists", title: "Per-stylist availability", icon: UsersRound, description: "Maintain customer-facing hours for each stylist." },
  { id: "overrides", title: "Overrides & blockouts", icon: LockKeyhole, description: "Temporarily stop and restore salon or stylist availability." },
];

export default function OwnerWorkflowAcceptanceHarness() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "All";
  const group = searchParams.get("group") || (searchParams.has("status") ? "All" : "Upcoming");
  const query = searchParams.get("q") || "";
  const workspaceId = searchParams.get("workspace") || "";
  const recordId = searchParams.get("record") || "";
  const [queryDraft, setQueryDraft] = useState(query);
  const [saved, setSaved] = useState(false);
  const record = bookings.find((item) => item.id === recordId) || null;
  const workspace = availabilityWorkspaces.find((item) => item.id === workspaceId) || null;
  const visible = bookings.filter((item) => {
    const matchesGroup = group === "All" || item.group === group;
    const matchesStatus = status === "All" || item.status === status;
    const haystack = `${item.customer} ${item.service} ${item.status} ${item.reference}`.toLowerCase();
    return matchesGroup && matchesStatus && (!query || haystack.includes(query.toLowerCase()));
  });

  function contextQuery(overrides: { group?: string; status?: string; query?: string; record?: string; workspace?: string } = {}) {
    const params = new URLSearchParams();
    const nextGroup = overrides.group ?? group;
    const nextStatus = overrides.status ?? status;
    const nextQuery = overrides.query ?? query;
    if (nextGroup !== "Upcoming") params.set("group", nextGroup);
    if (nextStatus !== "All") params.set("status", nextStatus);
    if (nextQuery) params.set("q", nextQuery);
    if (overrides.record) params.set("record", overrides.record);
    if (overrides.workspace) params.set("workspace", overrides.workspace);
    const value = params.toString();
    return value ? `?${value}` : "";
  }

  function setStatus(next: string) {
    router.replace(
      `/internal/acceptance/owner-workflows${contextQuery({ group: next === "All" ? group : "All", status: next })}`,
      { scroll: false },
    );
  }

  function setGroup(next: string) {
    router.replace(
      `/internal/acceptance/owner-workflows${contextQuery({ group: next, status: "All" })}`,
      { scroll: false },
    );
  }

  function openRecord(id: string) {
    router.push(`/internal/acceptance/owner-workflows${contextQuery({ record: id })}`);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
  }

  return (
    <main className="min-h-screen bg-cream px-4 py-6 text-ink sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="mb-5 rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 text-xs text-plum">
          Internal acceptance fixture · no production authentication or data is used.
        </p>
        {recordId ? (
          <>
            <OwnerDetailHeader
              title={record ? `Booking for ${record.customer}` : "Booking unavailable"}
              subtitle={record ? `${record.service} · ${record.time}` : "The selected fixture record does not exist."}
              fallbackHref={`/internal/acceptance/owner-workflows${contextQuery()}`}
              status={record?.status || "Unavailable"}
            />
            {record ? (
              <form onSubmit={save} className="rounded-[14px] border border-plum/10 bg-white p-5 shadow-sm">
                <h2 className="font-serif text-2xl text-plum">Focused booking workspace</h2>
                <p className="mt-2 text-sm text-ink/60">The list is no longer competing with the complete record editor.</p>
                <label className="mt-5 block text-xs font-bold">
                  Salon note
                  <textarea defaultValue="Customer requested a gentle braid-down." rows={4} className="mt-2 w-full rounded-lg border border-plum/15 p-3 font-normal" />
                </label>
                <button className="mt-4 min-h-11 rounded-lg bg-magenta px-6 text-xs font-bold text-white">Save booking note</button>
                {saved ? <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-xs font-semibold gc-text-success">Booking note saved. You can return to the filtered list.</p> : null}
              </form>
            ) : null}
          </>
        ) : workspaceId ? (
          <>
            <OwnerDetailHeader
              title={workspace?.title || "Availability workspace unavailable"}
              subtitle={workspace?.description || "The selected fixture workspace does not exist."}
              fallbackHref="/internal/acceptance/owner-workflows"
              status={workspace ? "Focused workspace" : "Unavailable"}
            />
            {workspace ? (
              <section className="rounded-[14px] border border-plum/10 bg-white p-5 shadow-sm">
                <h2 className="font-serif text-2xl text-plum">{workspace.title} controls</h2>
                <p className="mt-2 text-sm text-ink/60">Only this scheduling task is shown; the other availability forms remain on their own workspaces.</p>
              </section>
            ) : null}
          </>
        ) : (
          <>
            <h1 className="font-serif text-4xl text-plum sm:text-5xl">Salon dashboard workflow</h1>
            <p className="mt-2 text-sm text-ink/60">Compact landing areas lead to focused records and preserve list context.</p>
            <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Salon workflow areas">
              <OwnerSectionCard href="#bookings" icon={CalendarDays} title="Bookings" description="Open appointments and manage one record at a time." meta="4 fixture records" />
              <OwnerSectionCard href="#" icon={Scissors} title="Services" description="Manage pricing, options, and media in focused editors." />
              <OwnerSectionCard href="#" icon={UsersRound} title="Stylists" description="Keep profile and portfolio changes together." />
              <OwnerSectionCard href="#" icon={Package} title="Products" description="Edit inventory, pickup, and shipping details." />
              <OwnerSectionCard href="#" icon={ImageIcon} title="Media" description="Choose cover, logo, or gallery before editing." />
            </section>
            <section className="mt-8" aria-labelledby="availability-heading">
              <h2 id="availability-heading" className="font-serif text-2xl text-plum">Availability & Calendar</h2>
              <p className="mt-1 text-xs text-ink/55">The landing is a compact directory, not a stack of every scheduling form.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {availabilityWorkspaces.map((item) => (
                  <OwnerSectionCard key={item.id} href={`/internal/acceptance/owner-workflows?workspace=${item.id}`} icon={item.icon} title={item.title} description={item.description} />
                ))}
              </div>
            </section>
            <section id="bookings" className="mt-8 rounded-[14px] border border-plum/10 bg-white p-5">
              <div>
                <h2 className="font-serif text-2xl text-plum">Bookings</h2>
                <p className="mt-1 text-xs text-ink/55">Search and workflow context are stored in the URL before a record opens.</p>
              </div>
              <form
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  router.replace(`/internal/acceptance/owner-workflows${contextQuery({ query: queryDraft })}`, { scroll: false });
                }}
                className="mt-4 flex flex-col gap-2 sm:flex-row"
              >
                <input aria-label="Search bookings" type="search" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="Customer, reference, service, or status" className="min-h-11 flex-1 rounded-lg border border-plum/15 px-3 text-xs" />
                <button className="min-h-11 rounded-lg bg-magenta px-5 text-xs font-bold text-white">Search</button>
              </form>
              <div role="group" className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Booking workflow groups">
                {workflowGroups.map((item) => <button key={item} type="button" onClick={() => setGroup(item)} aria-pressed={group === item} className={`min-h-10 shrink-0 rounded-lg px-4 text-xs font-bold ${group === item ? "bg-plum text-white" : "border border-plum/15"}`}>{item}</button>)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["All", "Confirmed", "Completed"].map((item) => <button key={item} type="button" onClick={() => setStatus(item)} aria-pressed={status === item} className={`min-h-10 rounded-lg px-4 text-xs font-bold ${status === item ? "bg-blush text-plum" : "border border-plum/15"}`}>{item === "All" ? "All statuses" : item}</button>)}
              </div>
              <div className="mt-4 space-y-3">
                {visible.map((item) => <button key={item.id} type="button" onClick={() => openRecord(item.id)} className="flex min-h-20 w-full items-center justify-between gap-3 rounded-xl border border-plum/10 p-4 text-left"><span><b className="font-serif text-lg text-plum">{item.customer}</b><span className="mt-1 block text-xs text-ink/60">{item.service} · {item.time}</span></span><span className="rounded-full bg-blush px-3 py-1 text-[10px] font-bold text-plum">{item.status}</span></button>)}
                {!visible.length ? <p className="rounded-lg bg-blush/25 p-5 text-center text-xs text-ink/55">No fixture bookings match this filter.</p> : null}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
