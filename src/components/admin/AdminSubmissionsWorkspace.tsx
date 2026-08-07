"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { RoleSessionBoundary } from "@/components/auth/RoleLogoutButton";
import { readApiResponse } from "@/lib/apiResponseClient";
import { getSessionForScope } from "@/lib/supabase";

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

export default function AdminSubmissionsWorkspace() {
  const [view, setView] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [applications, setApplications] = useState<SubmissionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (options: { append?: boolean; cursor?: string | null } = {}) => {
      const append = options.append === true;
      append ? setLoadingMore(true) : setLoading(true);
      setMessage("");
      try {
        const session = await getSessionForScope("admin");
        if (!session) throw new Error("Admin sign-in required.");
        const params = new URLSearchParams({ view, limit: "25" });
        if (submittedQuery) params.set("q", submittedQuery);
        if (options.cursor) params.set("cursor", options.cursor);
        const response = await fetch(`/api/admin/submissions?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const body = (await readApiResponse(
          response,
          "We couldn't load salon applications.",
        )) as ListResponse;
        if (!response.ok) throw new Error(body.error || "We couldn't load salon applications.");
        const rows = Array.isArray(body.applications) ? body.applications : [];
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
        setMessage(
          error instanceof Error
            ? error.message
            : "We couldn't load salon applications.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [submittedQuery, view],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("girlz-culture-admin-records");
    channel.onmessage = () => void load();
    return () => channel.close();
  }, [load]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  }

  return (
    <main className="min-h-screen bg-cream px-3 py-4 text-ink sm:px-6 lg:px-10">
      <RoleSessionBoundary scope="admin" />
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col gap-3 border-b border-plum/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-magenta">
              Platform administration
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-plum sm:text-4xl">
              Submissions
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
              Current salon information appears first. The submitted application remains available as historical evidence.
            </p>
          </div>
          <div className="text-sm text-ink/65">
            {isSuperAdmin ? "Super Admin authority active" : "Delegated submissions access"}
          </div>
        </header>

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
            <button
              type="button"
              onClick={() => setView("active")}
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
              onClick={() => setView("archived")}
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
          <p role="alert" className="mt-4 rounded-[10px] border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {message}
          </p>
        ) : null}

        {loading ? (
          <div className="mt-5 rounded-[14px] border border-plum/10 bg-white p-8 text-center text-sm text-ink/65">
            Loading submissions…
          </div>
        ) : applications.length ? (
          <div className="mt-4 space-y-3">
            {applications.map((application) => {
              const salon = currentSalon(application);
              const currentAddress = salon
                ? address([
                    salon.address_street,
                    salon.address_line2,
                    salon.address_city,
                    salon.address_state,
                    salon.address_zip,
                  ])
                : "No current salon record";
              const submittedAddress = address([
                application.street_address,
                application.address_line2,
                application.city,
                application.state,
                application.zip_code,
              ]);
              const operationalStatus = salon?.deleted_at
                ? "Deleted from operations"
                : salon?.status || "No current salon";
              return (
                <article
                  key={application.id}
                  className="rounded-[14px] border border-plum/10 bg-white p-3 shadow-[0_5px_18px_rgba(13,17,20,.05)] sm:p-4"
                >
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-serif text-xl font-semibold text-plum">
                          {salon?.name || application.business_name}
                        </h2>
                        <span className="rounded-full bg-plum px-2.5 py-1 text-[10px] font-bold text-white">
                          Current: {operationalStatus}
                        </span>
                        <span className="rounded-full bg-blush px-2.5 py-1 text-[10px] font-bold text-plum">
                          Application: {application.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-ink">
                        {currentAddress}
                      </p>
                      <p className="mt-1 text-xs text-ink/60">
                        Current salon address
                      </p>
                    </div>
                    <div className="min-w-0 border-t border-plum/10 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                      <p className="truncate text-sm text-ink/75">
                        {submittedAddress || "No submitted address"}
                      </p>
                      <p className="mt-1 text-xs text-ink/55">
                        Submitted snapshot · {readableDate(application.submitted_at)}
                      </p>
                      <p className="mt-1 truncate text-xs text-ink/55">
                        {application.business_email}
                      </p>
                    </div>
                    <Link
                      href={`/admin/submissions/${application.id}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-[9px] bg-magenta px-5 text-sm font-bold text-white"
                    >
                      Manage record
                    </Link>
                  </div>
                </article>
              );
            })}
            {nextCursor ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load({ append: true, cursor: nextCursor })}
                className="min-h-12 w-full rounded-[10px] border border-magenta bg-white text-sm font-bold text-magenta disabled:opacity-55"
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
    </main>
  );
}
