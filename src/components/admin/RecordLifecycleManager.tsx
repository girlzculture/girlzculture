"use client";

import { useEffect, useState } from "react";
import { getSessionForScope } from "@/lib/supabase";
import ActionToast from "@/components/ActionToast";
import { readApiResponse } from "@/lib/apiResponseClient";

type Resource = { type: string; label: string; actions: string[] };
type RecordSummary = {
  id: string;
  label: string;
  status: string;
  archived: boolean;
};
type Dependency = { label: string; count: number; retention: string };
type DestructivePreview = {
  eligible: boolean;
  blocker: string | null;
  confirmation_phrase: string;
  retained_history: string[];
  operational_effects: string[];
  test_marker: {
    record_label?: string;
    test_data_batches?: { name?: string; environment?: string };
  } | null;
};

const protectedDeletionPreviewUnavailable = (
  label: string,
  detail?: string,
): DestructivePreview => ({
  eligible: false,
  blocker:
    detail ||
    "Permanent test deletion is disabled because its protected eligibility preview could not be verified. Refresh after the migration, Engine setting, and test-data registry are available.",
  confirmation_phrase: `DELETE TEST SALON ${label}`,
  retained_history: [
    "bookings",
    "payments",
    "refunds",
    "subscriptions",
    "product orders",
    "disputes",
    "audit events",
  ],
  operational_effects: [],
  test_marker: null,
});

const actionLabels: Record<string, string> = {
  archive: "Archive",
  restore: "Restore",
  delete: "Permanently delete",
  delete_test: "Permanently delete registered test salon",
  reassign: "Reassign",
  offboard: "Offboard",
  anonymize: "Anonymize",
  cancel: "Cancel",
};

function safeApiError(body: Record<string, unknown>, fallback: string) {
  const message = String(body.error || fallback);
  const reference = String(body.request_id || body.reference || "").trim();
  return reference && !message.toLowerCase().includes(reference.toLowerCase())
    ? `${message} Reference ${reference}.`
    : message;
}

export default function RecordLifecycleManager() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [resource, setResource] = useState("");
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [recordId, setRecordId] = useState("");
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState("");
  const [replacement, setReplacement] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledgeRetention, setAcknowledgeRetention] = useState(false);
  const [destructive, setDestructive] =
    useState<DestructivePreview | null>(null);
  const [ownerConfirmation, setOwnerConfirmation] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);

  async function auth() {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Your admin session expired.");
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function json(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: { ...(init?.headers || {}), ...(await auth()) },
      cache: "no-store",
    });
    const body = await readApiResponse(
      response,
      "Unable to load record management.",
    );
    if (!response.ok || body.error)
      throw new Error(
        safeApiError(body, "Unable to load record management."),
      );
    return body;
  }

  async function loadResources() {
    try {
      const body = (await json("/api/admin/records")) as {
        resources?: Resource[];
      };
      setResources(Array.isArray(body.resources) ? body.resources : []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load record types.",
      );
    }
  }

  async function loadRecords(type: string) {
    setBusy(true);
    setMessage("");
    setRecordId("");
    setDependencies([]);
    setDestructive(null);
    setOwnerConfirmation("");
    setIsSuperAdmin(false);
    setPreviewUnavailable(false);
    setAcknowledgeRetention(false);
    try {
      const body = (await json(
        `/api/admin/records?resource=${encodeURIComponent(type)}`,
      )) as {
        records?: RecordSummary[];
        resource?: { actions?: string[] };
      };
      setRecords(Array.isArray(body.records) ? body.records : []);
      setActions(
        Array.isArray(body.resource?.actions) ? body.resource.actions : [],
      );
      setAction(body.resource?.actions?.[0] || "");
    } catch (error) {
      setRecords([]);
      setMessage(
        error instanceof Error ? error.message : "Unable to load records.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function preview(id: string) {
    setRecordId(id);
    setDependencies([]);
    setConfirmation("");
    setReason("");
    setReplacement("");
    setDestructive(null);
    setOwnerConfirmation("");
    setIsSuperAdmin(false);
    setPreviewUnavailable(false);
    setAcknowledgeRetention(false);
    if (!id) return;
    setBusy(true);
    try {
      const body = (await json(
        `/api/admin/records?resource=${encodeURIComponent(resource)}&id=${encodeURIComponent(id)}`,
      )) as {
        dependencies?: { details?: Dependency[] };
        destructive?: DestructivePreview | null;
        owner_confirmation_phrase?: string;
        is_super_admin?: boolean;
        resource?: { actions?: string[] };
        record?: RecordSummary;
      };
      setDependencies(
        Array.isArray(body.dependencies?.details)
          ? body.dependencies.details
          : [],
      );
      setDestructive(
        body.destructive ||
          (resource === "salon"
            ? protectedDeletionPreviewUnavailable(
                body.record?.label || "selected salon",
              )
            : null),
      );
      setOwnerConfirmation(body.owner_confirmation_phrase || "");
      setIsSuperAdmin(body.is_super_admin === true);
      const nextActions = Array.isArray(body.resource?.actions)
        ? body.resource.actions
        : [];
      setActions(nextActions);
      setAction(
        body.record?.archived && nextActions.includes("restore")
          ? "restore"
          : nextActions.find((item) => item !== "restore") || "",
      );
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : "Unable to preview dependencies.";
      setMessage(detail);
      setPreviewUnavailable(true);
      if (resource === "salon") {
        const label =
          records.find((item) => item.id === id)?.label || "selected salon";
        setActions(["offboard", "delete", "delete_test"]);
        setDestructive(
          protectedDeletionPreviewUnavailable(
            label,
            `Protected test deletion is unavailable because its preview failed. ${detail}`,
          ),
        );
        setOwnerConfirmation(`DELETE SALON ${label.split(" · ")[0]}`);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadResources(), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = records.find((item) => item.id === recordId);
  const availableActions = selected?.archived
    ? actions.filter((item) => item === "restore" || item === "delete")
    : actions.filter((item) => item !== "restore");
  const testDelete = action === "delete_test";
  const ownerDelete =
    action === "delete" &&
    (resource === "salon" || resource === "salon_application");
  const destructiveAction = testDelete || ownerDelete;
  const requiredConfirmation = testDelete
    ? destructive?.confirmation_phrase || ""
    : ownerDelete
      ? ownerConfirmation
      : selected?.label || "";
  const requiresRetentionAcknowledgement =
    testDelete || (ownerDelete && resource === "salon");

  async function execute() {
    if (!selected || !action) return;
    setBusy(true);
    setMessage("");
    try {
      const body = (await json("/api/admin/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource,
          id: recordId,
          action,
          reason,
          confirmation,
          acknowledge_retention: acknowledgeRetention,
          reassign_to: replacement || null,
        }),
      })) as { result?: { message?: string; label?: string } };
      setMessage(
        body.result?.message ||
          `${body.result?.label || selected.label} was changed safely. The audit event was recorded.`,
      );
      await loadRecords(resource);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The record was not changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[15px] border border-plum/10 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl text-plum">
            Safe record management
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/65">
            Preview related records before changing anything. Safeguards prevent accidental clicks, while Super Admin retains final authority. Financial, booking, refund, dispute, subscription, and audit history is retained where reconciliation requires it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => resource && void loadRecords(resource)}
          className="min-h-10 rounded-lg border border-plum/15 px-4 text-sm font-bold text-plum"
        >
          Refresh
        </button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <label className="text-sm font-bold">
          Record type
          <select
            value={resource}
            onChange={(event) => {
              const value = event.target.value;
              setResource(value);
              void loadRecords(value);
            }}
            className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3"
          >
            <option value="">Choose a record type</option>
            {resources.map((item) => (
              <option key={item.type} value={item.type}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Record
          <select
            value={recordId}
            onChange={(event) => void preview(event.target.value)}
            disabled={!resource || busy}
            className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 disabled:bg-cream"
          >
            <option value="">Choose a record</option>
            {records.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.status}
                {item.archived ? " · Archived" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Action
          <select
            value={
              availableActions.includes(action)
                ? action
                : availableActions[0] || ""
            }
            onChange={(event) => {
              setAction(event.target.value);
              setConfirmation("");
              setAcknowledgeRetention(false);
            }}
            disabled={!selected}
            className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 disabled:bg-cream"
          >
            {availableActions.map((item) => {
              const protectedActionUnavailable =
                item === "delete_test" && !destructive?.eligible;
              return (
                <option
                  key={item}
                  value={item}
                  disabled={protectedActionUnavailable}
                >
                  {actionLabels[item] || item}
                  {protectedActionUnavailable ? " — unavailable" : ""}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {selected ? (
        <div
          className={`mt-5 rounded-xl border p-4 ${
            destructiveAction
              ? "border-red-200 bg-red-50/60"
              : "border-plum/10 bg-cream/55"
          }`}
        >
          <b className="text-sm text-plum">
            Dependency preview for {selected.label}
          </b>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {dependencies.map((item) => (
              <div key={item.label} className="rounded-lg bg-white p-3">
                <b className="font-serif text-xl text-plum">{item.count}</b>
                <span className="ml-2 text-sm">{item.label}</span>
                <span className="mt-1 block text-xs text-ink/55">
                  Effect: {item.retention}
                </span>
              </div>
            ))}
            {!dependencies.length ? (
              <p className="text-sm text-ink/60">
                {previewUnavailable
                  ? "Dependency counts could not be verified. Refresh before a destructive action."
                  : "No registered dependent records were found."}
              </p>
            ) : null}
          </div>

          {destructive?.blocker && !destructive.eligible && testDelete ? (
            <p className="mt-4 rounded-lg border border-amber/30 bg-white p-3 text-sm font-bold text-amber">
              Registered test deletion unavailable: {destructive.blocker}
            </p>
          ) : null}

          {ownerDelete ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-white p-3">
              <b className="text-sm gc-text-danger">
                Super Admin permanent action
              </b>
              <p className="mt-2 text-sm leading-6 text-ink/70">
                {resource === "salon"
                  ? "The salon will disappear from public and operational records. Access is disabled, current marketplace content is archived, and applications are removed. Financial, booking, refund, subscription, dispute, and audit evidence remains attached to a hidden tombstone."
                  : "The application is permanently removed from the active records. Its immutable revision and administrative audit evidence remains available."}
              </p>
              {!isSuperAdmin ? (
                <p className="mt-2 font-bold gc-text-danger">
                  This action requires Super Admin.
                </p>
              ) : null}
            </div>
          ) : null}

          {testDelete && destructive ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-red-200 bg-white p-3">
                <b className="text-sm gc-text-danger">
                  Operational records changed
                </b>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-5 text-ink/70">
                  {destructive.operational_effects.map((effect) => (
                    <li key={effect}>{effect}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-white p-3">
                <b className="text-sm gc-text-success">
                  History explicitly retained
                </b>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-5 text-ink/70">
                  {destructive.retained_history.map((history) => (
                    <li key={history}>{history}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {action === "reassign" ? (
            <label className="mt-4 block text-sm font-bold">
              Replacement record
              <select
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3"
              >
                <option value="">Choose the replacement</option>
                {records
                  .filter((item) => item.id !== selected.id && !item.archived)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}

          <label className="mt-4 block text-sm font-bold">
            Reason
            <textarea
              rows={3}
              value={reason}
              onChange={(event) =>
                setReason(event.target.value.slice(0, 500))
              }
              className="mt-1 w-full rounded-lg border border-plum/15 bg-white p-3 font-normal"
              placeholder={
                destructiveAction
                  ? "Explain why this record must be permanently removed"
                  : "Explain why this change is needed"
              }
            />
          </label>

          {requiresRetentionAcknowledgement ? (
            <label className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-white p-3 text-sm font-bold gc-text-danger">
              <input
                type="checkbox"
                checked={acknowledgeRetention}
                onChange={(event) =>
                  setAcknowledgeRetention(event.target.checked)
                }
                className="mt-0.5 size-4"
              />
              I understand that operational identity and content is removed while immutable financial, booking, refund, subscription, dispute, and audit history remains available for reconciliation.
            </label>
          ) : null}

          <label className="mt-3 block text-sm font-bold">
            Type{" "}
            <span
              className={destructiveAction ? "gc-text-danger" : "text-magenta"}
            >
              {requiredConfirmation}
            </span>{" "}
            to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"
            />
          </label>

          <button
            type="button"
            onClick={() => void execute()}
            disabled={
              busy ||
              confirmation !== requiredConfirmation ||
              reason.trim().length < (destructiveAction ? 8 : 5) ||
              (action === "reassign" && !replacement) ||
              (testDelete && (!acknowledgeRetention || !destructive?.eligible)) ||
              (ownerDelete && !isSuperAdmin) ||
              (requiresRetentionAcknowledgement && !acknowledgeRetention)
            }
            className={`mt-4 min-h-11 rounded-lg px-6 text-sm font-bold text-white gc-disabled-control ${
              destructiveAction ? "bg-red-700" : "bg-magenta"
            }`}
          >
            {busy
              ? "Checking dependencies…"
              : `${actionLabels[action] || action} ${selected.label}`}
          </button>
        </div>
      ) : null}
      <ActionToast message={message} onDismiss={() => setMessage("")} />
    </section>
  );
}
