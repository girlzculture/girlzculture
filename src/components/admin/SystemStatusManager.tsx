"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  DatabaseZap,
  RefreshCw,
} from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";

type State = "healthy" | "degraded" | "not_configured";
type Status = {
  key: string;
  label: string;
  state: State;
  detail: string;
  required: boolean;
  envNames: string[];
  setup: string;
  lastChecked?: string | null;
  lastSuccess?: string | null;
  safeError?: string | null;
  canTest: boolean;
  diagnostic?: {
    provider: "cloudinary" | "custom" | "none";
    configured: boolean;
    cloudinaryConfigured: boolean;
    customFallbackConfigured: boolean;
    runtime: "nodejs";
    variables: Array<{ name: string; present: boolean }>;
    missingVariables: string[];
  };
};

const presentation = {
  healthy: {
    label: "Healthy",
    className: "bg-green-100 gc-text-success",
    Icon: CheckCircle2,
  },
  degraded: {
    label: "Degraded",
    className: "bg-amber/15 gc-text-warning",
    Icon: AlertTriangle,
  },
  not_configured: {
    label: "Not configured",
    className: "bg-cream text-ink/55",
    Icon: CircleHelp,
  },
};

function checked(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

export default function SystemStatusManager() {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [checkedAt, setCheckedAt] = useState("");
  const [expectedMigration, setExpectedMigration] = useState("");
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState("");
  const [message, setMessage] = useState("");

  async function authHeader() {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Your admin session expired.");
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function load(options: { preserveMessage?: boolean } = {}) {
    setLoading(true);
    if (!options.preserveMessage) setMessage("");
    try {
      const response = await fetch("/api/admin/engine/system-status", {
        headers: await authHeader(),
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to check platform systems.");
      setStatuses(Array.isArray(body.statuses) ? body.statuses : []);
      setCheckedAt(String(body.checkedAt || ""));
      setExpectedMigration(String(body.expectedMigration || ""));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to check platform systems.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function testConnection(status: Status) {
    setTesting(status.key);
    setMessage("");
    try {
      const response = await fetch("/api/admin/engine/system-status", {
        method: "POST",
        headers: {
          ...(await authHeader()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: status.key }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ||
            `The ${status.label} connection test could not be completed.`,
        );
      setMessage(
        body.result?.state === "healthy"
          ? `${status.label} confirmed a healthy connection.`
          : `${status.label} needs attention. Review its safe status and setup instructions.${
              body.request_id ? ` Reference ${body.request_id}.` : ""
            }`,
      );
      await load({ preserveMessage: true });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The connection test could not be completed.",
      );
    } finally {
      setTesting("");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="rounded-[15px] border border-plum/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <DatabaseZap className="text-magenta" />
          <div>
            <h3 className="font-serif text-2xl text-plum">
              Integrations & System Status
            </h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-ink/55">
              Safe health summaries and connection tests only. Credentials,
              connection strings, provider responses, raw SQL, tokens, and
              secret values are never returned to the browser.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta gc-disabled-control"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Check again
        </button>
      </div>
      {expectedMigration ? (
        <p className="mt-4 rounded-lg bg-cream p-3 text-[10px] text-ink/55">
          Repository migration target:{" "}
          <b className="text-plum">{expectedMigration}</b>
          {checkedAt ? ` · checked ${new Date(checkedAt).toLocaleString()}` : ""}
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {statuses.map((status) => {
          const view = presentation[status.state];
          const Icon = view.Icon;
          return (
            <article
              key={status.key}
              className="rounded-xl border border-plum/10 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-2">
                  <Icon
                    size={17}
                    className={
                      status.state === "healthy"
                        ? "gc-text-success"
                        : status.state === "degraded"
                          ? "text-amber"
                          : "text-ink/35"
                    }
                  />
                  <div>
                    <h4 className="text-xs font-bold text-plum">
                      {status.label}
                    </h4>
                    <p className="mt-1 text-[10px] leading-4 text-ink/55">
                      {status.detail}
                    </p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-bold ${view.className}`}
                >
                  {view.label}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 rounded-lg bg-cream/60 p-3 text-[9px] sm:grid-cols-2">
                <div>
                  <dt className="font-bold uppercase text-ink/40">
                    Last checked
                  </dt>
                  <dd className="mt-1 text-ink/65">
                    {checked(status.lastChecked)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase text-ink/40">
                    Last success
                  </dt>
                  <dd className="mt-1 text-ink/65">
                    {checked(status.lastSuccess)}
                  </dd>
                </div>
              </dl>
              {status.diagnostic ? (
                <div className="mt-3 rounded-lg border border-plum/10 bg-cream/35 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-plum">
                    Netlify function variable presence
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {status.diagnostic.variables.map((variable) => (
                      <div
                        key={variable.name}
                        className="rounded-md bg-white px-2 py-2 text-[8px]"
                      >
                        <code className="break-all text-ink/65">
                          {variable.name}
                        </code>
                        <span
                          className={`mt-1 block font-bold ${
                            variable.present
                              ? "gc-text-success"
                              : "gc-text-danger"
                          }`}
                        >
                          {variable.present ? "Present" : "Missing"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-ink/50">
                    Presence only from the request-time Node function. No
                    credential values are returned, logged, hashed, or
                    partially displayed.
                  </p>
                </div>
              ) : null}
              {status.safeError ? (
                <p className="mt-3 rounded-lg bg-amber/10 p-3 text-[10px] gc-text-warning">
                  {status.safeError}
                </p>
              ) : null}
              <details className="mt-3 rounded-lg border border-plum/10 p-3">
                <summary className="cursor-pointer text-[10px] font-bold text-plum">
                  Setup instructions
                </summary>
                <p className="mt-2 text-[10px] leading-4 text-ink/60">
                  {status.setup}
                </p>
                <p className="mt-2 text-[9px] text-ink/45">
                  Required environment variables:{" "}
                  {status.envNames.length
                    ? status.envNames.join(", ")
                    : "None"}
                </p>
              </details>
              <button
                type="button"
                disabled={!status.canTest || Boolean(testing)}
                onClick={() => void testConnection(status)}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta px-4 text-[10px] font-bold text-magenta gc-disabled-control"
              >
                <RefreshCw
                  size={13}
                  className={testing === status.key ? "animate-spin" : ""}
                />
                {testing === status.key
                  ? "Testing connection…"
                  : "Test Connection"}
              </button>
            </article>
          );
        })}
        {!statuses.length && !loading ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-xs text-ink/50 lg:col-span-2">
            No health records were returned.
          </p>
        ) : null}
      </div>
      {message ? (
        <p
          role="status"
          className="mt-4 rounded-lg bg-blush/50 p-3 text-xs text-plum"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
