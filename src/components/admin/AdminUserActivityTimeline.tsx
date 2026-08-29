"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";
import { formatZonedDateTime } from "@/lib/dateTime";

const ACCEPTANCE_MODE =
  process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS === "true";

type Row = Record<string, unknown>;
type Activity = {
  id: string;
  source: string;
  action: string;
  record_type: string;
  record_id: string;
  record_label: string;
  result: string;
  reason: string;
  created_at: string;
  before_values?: unknown;
  after_values?: unknown;
};

type ResponseBody = {
  activity?: Activity[];
  security?: Row[];
  error?: string;
};

const acceptanceActivity: Activity[] = [
  {
    id: "acceptance-admin-permission-change",
    source: "admin_security_events",
    action: "admin_permissions_updated",
    record_type: "administrator",
    record_id: "admin-1",
    record_label: "Jane Admin",
    result: "Succeeded",
    reason: "Permissions were updated through the protected administrator workflow.",
    created_at: "2026-08-01T15:00:00.000Z",
  },
];

const acceptanceSecurity: Row[] = [
  {
    id: "acceptance-security-1",
    action: "admin_permissions_updated",
    result: "Succeeded",
    created_at: "2026-08-01T15:00:00.000Z",
  },
];

function when(value: unknown) {
  return value
    ? formatZonedDateTime(String(value), "America/New_York")
    : "Not recorded";
}
function title(value: unknown) {
  return String(value || "Activity")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function literalAction(value: unknown) {
  return String(value || "activity").replaceAll("_", " ");
}
function compactDifference(before: unknown, after: unknown) {
  const previous = before && typeof before === "object" ? (before as Row) : {};
  const current = after && typeof after === "object" ? (after as Row) : {};
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter(
      (key) =>
        !["updated_at", "created_at", "password", "token", "secret"].some(
          (blocked) => key.toLowerCase().includes(blocked),
        ),
    )
    .filter(
      (key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]),
    )
    .slice(0, 4);
  if (!keys.length) return "";
  return keys
    .map(
      (key) =>
        `${key.replaceAll("_", " ")}: ${String(previous[key] ?? "—").slice(0, 60)} → ${String(current[key] ?? "—").slice(0, 60)}`,
    )
    .join(" · ");
}

export default function AdminUserActivityTimeline({
  memberId,
}: {
  memberId: string;
}) {
  const [activity, setActivity] = useState<Activity[]>(
    ACCEPTANCE_MODE ? acceptanceActivity : [],
  );
  const [security, setSecurity] = useState<Row[]>(
    ACCEPTANCE_MODE ? acceptanceSecurity : [],
  );
  const [loading, setLoading] = useState(!ACCEPTANCE_MODE);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");

  const load = useCallback(async () => {
    if (ACCEPTANCE_MODE) {
      setActivity(acceptanceActivity);
      setSecurity(acceptanceSecurity);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your admin session has expired.");
      const response = await fetch(
        `/api/admin/team/${encodeURIComponent(memberId)}/activity`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        },
      );
      const body = (await readApiResponse(
        response,
        "Unable to load administrator activity.",
      )) as ResponseBody;
      if (!response.ok)
        throw new Error(body.error || "Unable to load administrator activity.");
      setActivity(Array.isArray(body.activity) ? body.activity : []);
      setSecurity(Array.isArray(body.security) ? body.security : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load administrator activity.",
      );
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    if (ACCEPTANCE_MODE) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const sources = useMemo(
    () => [...new Set(activity.map((item) => item.source))].sort(),
    [activity],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return activity.filter(
      (item) =>
        (source === "all" || item.source === source) &&
        (!normalized ||
          [
            item.action,
            item.record_type,
            item.record_label,
            item.record_id,
            item.reason,
            item.result,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalized)),
    );
  }, [activity, query, source]);

  return (
    <section className="rounded-[14px] border border-plum/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-plum">Security audit</h2>
          <p className="mt-1 text-xs leading-5 text-ink/60">
            Retained administrator actions and identity-security evidence. Page
            views and ordinary clicks are intentionally excluded.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/15 px-4 text-xs font-bold text-plum gc-disabled-control"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <section
        aria-labelledby={`security-events-${memberId}`}
        className="mt-5 rounded-xl border border-plum/10 bg-cream/45 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3
            id={`security-events-${memberId}`}
            className="inline-flex items-center gap-2 text-sm font-bold text-plum"
          >
            <ShieldCheck size={17} /> Sign-in &amp; security events
          </h3>
          <span className="text-xs text-ink/55">
            {security.length} retained events
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {security.map((event) => (
            <div
              key={String(event.id)}
              className="rounded-lg border border-plum/10 bg-white p-3 text-xs"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <b className="text-plum">{literalAction(event.action)}</b>
                <span>{String(event.result || "Recorded")}</span>
              </div>
              <p className="mt-1 text-ink/50">{when(event.created_at)}</p>
            </div>
          ))}
          {!security.length ? (
            <p className="text-xs text-ink/55">
              No retained sign-in or identity-security events are linked to this
              administrator.
            </p>
          ) : null}
        </div>
      </section>

      <div className="mt-5">
        <h3 className="font-serif text-xl text-plum">Administrator activity</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_190px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions, records, reasons, or references"
            className="min-h-11 rounded-lg border border-plum/15 px-3 text-xs"
          />
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"
          >
            <option value="all">All action sources</option>
            {sources.map((value) => (
              <option value={value} key={value}>
                {title(value)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-sm gc-text-danger"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-4 max-h-[660px] space-y-3 overflow-y-auto pr-1">
        {filtered.map((item) => {
          const difference = compactDifference(
            item.before_values,
            item.after_values,
          );
          return (
            <article
              key={item.id}
              className="rounded-xl border border-plum/10 p-4 text-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <b className="text-sm text-plum">{title(item.action)}</b>
                  <p className="mt-1 text-ink/60">
                    {title(item.record_type)} · {item.record_label || item.record_id}
                  </p>
                </div>
                <span className="rounded-full bg-blush px-3 py-1 font-bold text-plum">
                  {item.result || "Recorded"}
                </span>
              </div>
              {item.reason ? (
                <p className="mt-3 leading-5 text-ink/70">{item.reason}</p>
              ) : null}
              {difference ? (
                <p className="mt-2 rounded-lg bg-cream p-3 leading-5 text-ink/60">
                  {difference}
                </p>
              ) : null}
              <p className="mt-3 text-ink/45">
                {when(item.created_at)} · Reference {item.record_id || item.id}
              </p>
            </article>
          );
        })}
        {!filtered.length && !loading ? (
          <p className="rounded-xl bg-cream p-5 text-center text-sm text-ink/55">
            No matching platform actions are recorded for this administrator.
          </p>
        ) : null}
        {loading ? (
          <p className="rounded-xl bg-cream p-5 text-center text-sm text-ink/55">
            Loading administrator activity…
          </p>
        ) : null}
      </div>
    </section>
  );
}
