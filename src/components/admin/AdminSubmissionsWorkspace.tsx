"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { RoleSessionBoundary } from "@/components/auth/RoleLogoutButton";
import {
  rememberAdminListScroll,
  useAdminListScrollRestoration,
  useAdminQueryParam,
} from "@/components/admin/useAdminListContext";
import { readApiResponse } from "@/lib/apiResponseClient";
import { getSessionForScope } from "@/lib/supabase";
import { US_STATES } from "@/lib/usStates";

type SalonSummary = {
  id?: string;
  name?: string | null;
  status?: string | null;
  address_street?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  is_discoverable?: boolean | null;
  deleted_at?: string | null;
};

type SubmissionRow = {
  id: string;
  salon_id: string;
  business_name: string;
  business_email: string;
  owner_name?: string | null;
  phone?: string | null;
  street_address?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  status: string;
  rejection_reason?: string | null;
  selected_plan?: string | null;
  submitted_at: string;
  updated_at?: string | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  salon?: SalonSummary | SalonSummary[] | null;
};

type ListResponse = {
  applications?: SubmissionRow[];
  next_cursor?: string | null;
  is_super_admin?: boolean;
  error?: string;
};

function currentSalon(row: SubmissionRow) {
  return Array.isArray(row.salon) ? row.salon[0] || null : row.salon || null;
}

function address(parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

function readableDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

export default function AdminSubmissionsWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [viewParam, setViewParam] = useAdminQueryParam("view", "active");
  const view: "active" | "archived" = viewParam === "archived" ? "archived" : "active";
  const [query, setQuery] = useAdminQueryParam("q", "");
  const [state, setState] = useAdminQueryParam("state", "");
  const [status, setStatus] = useAdminQueryParam("status", "");
  const requestVersion = useRef(0);
  const [applications, setApplications] = useState<SubmissionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  useAdminListScrollRestoration(!loading);

  const load = useCallback(
    async (options: { append?: boolean; cursor?: string | null } = {}) => {
      const append = options.append === true;
      const version = ++requestVersion.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setMessage("");
      try {
        const session = await getSessionForScope("admin");
        if (!session) throw new Error("Admin sign-in required.");
        const params = new URLSearchParams({ view, limit: "25" });
        if (query) params.set("q", query);
        if (state) params.set("state", state);
        if (status) params.set("status", status);
        if (options.cursor) params.set("cursor", options.cursor);
        const response = await fetch(`/api/admin/submissions?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const body = (await readApiResponse(
          response,
          "We couldn't load business applications.",
        )) as ListResponse;
        if (!response.ok) throw new Error(body.error || "We couldn't load salon applications.");
        const rows = Array.isArray(body.applications) ? body.applications : [];
        if (version !== requestVersion.current) return;
        setApplications((current) =>
          append
            ? [
                ...current,
                ...rows.filter(
                  (row) => !current.some((existing) => existing.id === row.id),
                ),
              ]
            : rows,
        );
        setNextCursor(body.next_cursor || null);
        setIsSuperAdmin(body.is_super_admin === true);
      } catch (error) {
        if (version !== requestVersion.current) return;
        setMessage(
          error instanceof Error
            ? error.message
            : "We couldn't load salon applications.",
        );
      } finally {
        if (version === requestVersion.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [query, view, state, status],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => { window.clearTimeout(timer); requestVersion.current += 1; };
  }, [load, query]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("girlz-culture-admin-records");
    channel.onmessage = () => void load();
    return () => channel.close();
  }, [load]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(query.trim());
  }

  const returnParams = new URLSearchParams();
  if (query) returnParams.set("q", query);
  if (state) returnParams.set("state", state);
  if (status) returnParams.set("status", status);
  if (view !== "active") returnParams.set("view", view);
  const returnPath = `/admin/submissions${returnParams.size ? `?${returnParams.toString()}` : ""}`;

  return (
    <section className={embedded ? "gc-dashboard" : "gc-dashboard min-h-screen bg-white px-3 py-4 text-ink sm:px-6 lg:px-10"}>
      <RoleSessionBoundary scope="admin" />
      <div className="mx-auto max-w-[1500px]">
        {!embedded ? <header className="flex flex-col gap-3 border-b border-plum/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-magenta">
              Platform administration
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-plum sm:text-4xl">
              Submissions
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
              Current business information appears first. The submitted application remains available as historical evidence.
            </p>
          </div>
          <div className="text-sm text-ink/65">
            {isSuperAdmin ? "Super Admin authority active" : "Delegated submissions access"}
          </div>
        </header> : null}

        <section className="sticky top-0 z-20 -mx-3 mt-4 border-y border-plum/10 bg-cream/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-[12px] sm:border sm:bg-white">
          <form onSubmit={submitSearch} className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search submissions</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search business, owner, email, city, state, or ZIP"
                className="min-h-11 w-full rounded-[9px] border border-plum/15 bg-white px-3 text-sm outline-none focus:border-magenta"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-[9px] bg-magenta px-4 text-sm font-bold text-white"
            >
              Search
            </button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-sm font-semibold">Application state<select aria-label="Application state" value={state} onChange={event => setState(event.target.value)} className="ml-2 min-h-10 max-w-56 rounded-lg border bg-white px-3"><option value="">All states</option>{US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            <label className="text-sm font-semibold">Status<select aria-label="Application status" value={status} onChange={event => setStatus(event.target.value)} className="ml-2 min-h-10 rounded-lg border bg-white px-3"><option value="">All statuses</option>{["Pending", "Approved", "Rejected", "Needs Changes", "Offboarded"].map(value => <option key={value}>{value}</option>)}</select></label>
            <button
              type="button"
              onClick={() => setViewParam("active")}
              aria-pressed={view === "active"}
              className={`min-h-10 rounded-[8px] px-4 text-sm font-bold ${
                view === "active"
                  ? "bg-plum text-white"
                  : "border border-plum/15 bg-white text-plum"
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setViewParam("archived")}
              aria-pressed={view === "archived"}
              className={`min-h-10 rounded-[8px] px-4 text-sm font-bold ${
                view === "archived"
                  ? "bg-plum text-white"
                  : "border border-plum/15 bg-white text-plum"
              }`}
            >
              Archived
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="ml-auto min-h-10 rounded-[8px] border border-magenta bg-white px-4 text-sm font-bold text-magenta"
            >
              Refresh
            </button>
          </div>
        </section>

        {message ? (
          <p role="alert" className="mt-4 rounded-[10px] border border-red-200 bg-red-50 p-3 text-sm gc-text-danger">
            {message}
          </p>
        ) : null}

        {loading ? (
          <div className="mt-5 rounded-[14px] border border-plum/10 bg-white p-8 text-center text-sm text-ink/65">
            Loading submissions…
          </div>
        ) : applications.length ? (
          <div className="mt-4 space-y-3" onClickCapture={rememberAdminListScroll}>
            <p className="text-sm">{applications.length} loaded application{applications.length === 1 ? "" : "s"}{nextCursor ? " · More records available below" : ""}. Filters use the submitted application; the current record is shown alongside it.</p>
            <div className="gc-table-scroll" role="region" aria-label="Business submissions" tabIndex={0}>
              <table className="w-full text-left text-sm"><thead><tr>{["Business", "Owner / contact", "Current location", "Submitted location", "Application", "Operations", "Plan", "Submitted", "Actions"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
                <tbody>{applications.map(application => {
                  const salon = currentSalon(application);
                  return <tr key={application.id}>
                    <th scope="row"><span className="block min-w-40 font-bold">{salon?.name || application.business_name}</span>{salon?.name && salon.name !== application.business_name ? <span className="mt-1 block text-xs font-normal">Applied as {application.business_name}</span> : null}</th>
                    <td><b className="block">{application.owner_name || "Not provided"}</b><span className="mt-1 block break-all">{application.business_email}</span><span className="mt-1 block whitespace-nowrap">{application.phone || ""}</span></td>
                    <td className="min-w-40">{salon ? address([salon.address_street, salon.address_line2, salon.address_city, salon.address_state, salon.address_zip]) || "Not recorded" : "No current business record"}</td>
                    <td className="min-w-40">{address([application.street_address, application.address_line2, application.city, application.state, application.zip_code]) || "Not recorded"}</td>
                    <td><span className="inline-flex whitespace-nowrap rounded-full border border-border bg-subtle px-3 py-1 text-xs font-bold">{application.status}</span></td>
                    <td>{salon?.deleted_at ? "Deleted from operations" : salon?.status || "No current business"}</td>
                    <td>{salon?.subscription_tier || application.selected_plan || "Not selected"}<span className="mt-1 block text-xs">{salon?.subscription_status || ""}</span></td>
                    <td className="min-w-36">{readableDate(application.submitted_at)}</td>
                    <td><Link href={`/admin/submissions/${application.id}?return=${encodeURIComponent(returnPath)}`} className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg bg-primary-hover px-4 font-bold text-white">Manage record</Link></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {nextCursor ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load({ append: true, cursor: nextCursor })}
                className="min-h-12 w-full rounded-[10px] border border-magenta bg-white text-sm font-bold text-magenta gc-disabled-control"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 rounded-[14px] border border-dashed border-plum/20 bg-white p-8 text-center">
            <h2 className="font-serif text-xl text-plum">No matching submissions</h2>
            <p className="mt-2 text-sm text-ink/65">
              Change the search or switch between Active and Archived records.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
