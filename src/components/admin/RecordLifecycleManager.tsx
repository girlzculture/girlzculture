"use client";

import { useEffect, useState } from "react";
import { Archive, ArrowRightLeft, RefreshCw, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import ActionToast from "@/components/ActionToast";
import { readApiResponse } from "@/lib/apiResponseClient";

type Resource = { type: string; label: string; actions: string[] };
type RecordSummary = { id: string; label: string; status: string; archived: boolean };
type Dependency = { label: string; count: number; retention: string };
type DestructivePreview = {
  eligible: boolean;
  blocker: string | null;
  confirmation_phrase: string;
  retained_history: string[];
  operational_effects: string[];
  test_marker: { record_label?: string; test_data_batches?: { name?: string; environment?: string } } | null;
};

const protectedDeletionPreviewUnavailable=(label:string,detail?:string):DestructivePreview=>({
  eligible:false,
  blocker:detail||"Permanent test deletion is disabled because its protected eligibility preview could not be verified. Refresh after the migration, Engine setting, and test-data registry are available.",
  confirmation_phrase:`DELETE TEST SALON ${label}`,
  retained_history:["bookings","payments","refunds","subscriptions","product orders","disputes","audit events"],
  operational_effects:[],
  test_marker:null,
});

const actionLabels: Record<string, string> = {
  archive: "Archive",
  restore: "Restore",
  delete: "Delete",
  delete_test: "Permanently delete test salon",
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
  const [destructive, setDestructive] = useState<DestructivePreview | null>(null);
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
    const body = await readApiResponse(response, "Unable to load record management.");
    if (!response.ok || body.error) throw new Error(safeApiError(body, "Unable to load record management."));
    return body;
  }

  async function loadResources() {
    try {
      const body = await json("/api/admin/records") as { resources?: Resource[] };
      setResources(Array.isArray(body.resources) ? body.resources : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load record types.");
    }
  }

  async function loadRecords(type: string) {
    setBusy(true);
    setMessage("");
    setRecordId("");
    setDependencies([]);
    setDestructive(null);
    setPreviewUnavailable(false);
    setAcknowledgeRetention(false);
    try {
      const body = await json(`/api/admin/records?resource=${encodeURIComponent(type)}`) as { records?: RecordSummary[]; resource?: { actions?: string[] } };
      setRecords(Array.isArray(body.records) ? body.records : []);
      setActions(Array.isArray(body.resource?.actions) ? body.resource.actions : []);
      setAction(body.resource?.actions?.[0] || "");
    } catch (error) {
      setRecords([]);
      setMessage(error instanceof Error ? error.message : "Unable to load records.");
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
    setPreviewUnavailable(false);
    setAcknowledgeRetention(false);
    if (!id) return;
    setBusy(true);
    try {
      const body = await json(`/api/admin/records?resource=${encodeURIComponent(resource)}&id=${encodeURIComponent(id)}`) as {
        dependencies?: { details?: Dependency[] };
        destructive?: DestructivePreview | null;
        resource?: { actions?: string[] };
        record?: RecordSummary;
      };
      setDependencies(Array.isArray(body.dependencies?.details) ? body.dependencies.details : []);
      setDestructive(body.destructive || (resource === "salon"
        ? protectedDeletionPreviewUnavailable(body.record?.label || "selected salon")
        : null));
      const nextActions = Array.isArray(body.resource?.actions) ? body.resource.actions : [];
      setActions(nextActions);
      setAction(body.record?.archived && nextActions.includes("restore")
        ? "restore"
        : nextActions.find((item: string) => item !== "restore") || "");
    } catch (error) {
      const detail=error instanceof Error ? error.message : "Unable to preview dependencies.";
      setMessage(detail);
      setPreviewUnavailable(true);
      if(resource==="salon"){
        const label=records.find((item)=>item.id===id)?.label||"selected salon";
        setActions(["offboard","delete_test"]);
        setDestructive(protectedDeletionPreviewUnavailable(label,`Permanent test deletion is disabled because the protected preview failed. ${detail}`));
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
    ? actions.filter((item) => item === "restore")
    : actions.filter((item) => item !== "restore");
  const destructiveAction = action === "delete_test";
  const requiredConfirmation = destructiveAction
    ? destructive?.confirmation_phrase || ""
    : selected?.label || "";

  async function execute() {
    if (!selected || !action) return;
    setBusy(true);
    setMessage("");
    try {
      const body = await json("/api/admin/records", {
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
      }) as { result?: { message?: string; label?: string } };
      setMessage(body.result?.message || `${body.result?.label || selected.label} was changed safely. The audit event was recorded.`);
      await loadRecords(resource);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The record was not changed.");
    } finally {
      setBusy(false);
    }
  }

  const actionIcon = destructiveAction || action === "delete"
    ? Trash2
    : action === "reassign"
      ? ArrowRightLeft
      : action === "restore"
        ? RotateCcw
        : Archive;
  const ActionIcon = actionIcon;

  return <section className="rounded-[15px] border border-plum/10 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-serif text-2xl text-plum">Safe record management</h3>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-ink/60">Preview related records before changing anything. Financial, booking, refund, dispute, subscription, and audit history is retained; those records are cancelled, offboarded, archived, or anonymized instead of being erased.</p>
      </div>
      <button type="button" onClick={() => resource && void loadRecords(resource)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/15 px-4 text-xs font-bold text-plum"><RefreshCw size={14} />Refresh</button>
    </div>

    <div className="mt-5 grid gap-3 lg:grid-cols-3">
      <label className="text-xs font-bold">Record type
        <select value={resource} onChange={(event) => { const value = event.target.value; setResource(value); void loadRecords(value); }} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3">
          <option value="">Choose a record type</option>
          {resources.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold">Record
        <select value={recordId} onChange={(event) => void preview(event.target.value)} disabled={!resource || busy} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 disabled:bg-cream">
          <option value="">Choose a record</option>
          {records.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.status}{item.archived ? " · Archived" : ""}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold">Safe action
        <select value={availableActions.includes(action) ? action : availableActions[0] || ""} onChange={(event) => { setAction(event.target.value); setConfirmation(""); setAcknowledgeRetention(false); }} disabled={!selected} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 disabled:bg-cream">
          {availableActions.map((item) => {
            const protectedActionUnavailable=item==="delete_test"&&!destructive?.eligible;
            return <option key={item} value={item} disabled={protectedActionUnavailable}>{actionLabels[item] || item}{protectedActionUnavailable?" — unavailable":""}</option>;
          })}
        </select>
      </label>
    </div>

    {selected ? <div className={`mt-5 rounded-xl border p-4 ${destructiveAction ? "border-red-200 bg-red-50/60" : "border-plum/10 bg-cream/55"}`}>
      <div className="flex items-center gap-2"><ShieldAlert size={18} className={destructiveAction ? "text-red-700" : "text-amber"} /><b className="text-sm text-plum">Dependency preview for {selected.label}</b></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {dependencies.map((item) => <div key={item.label} className="rounded-lg bg-white p-3"><b className="font-serif text-xl text-plum">{item.count}</b><span className="ml-2 text-xs">{item.label}</span><span className="mt-1 block text-[9px] text-ink/50">Effect: {item.retention}</span></div>)}
        {!dependencies.length ? <p className="text-xs text-ink/55">{previewUnavailable?"Dependency counts could not be verified. No destructive action is available until this preview loads successfully.":"No registered dependent records were found."}</p> : null}
      </div>

      {destructive?.blocker && !destructive.eligible ? <p className="mt-4 rounded-lg border border-amber/30 bg-white p-3 text-xs font-bold text-amber">Permanent deletion unavailable: {destructive.blocker}</p> : null}

      {destructiveAction && destructive ? <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-red-200 bg-white p-3">
          <b className="text-xs text-red-800">Operational records changed</b>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-4 text-ink/65">{destructive.operational_effects.map((effect) => <li key={effect}>{effect}</li>)}</ul>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <b className="text-xs text-emerald-800">History explicitly retained</b>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-4 text-ink/65">{destructive.retained_history.map((history) => <li key={history}>{history}</li>)}</ul>
          <p className="mt-2 text-[10px] leading-4 text-ink/55">No payment, refund, subscription, booking, dispute, or audit history is silently deleted. A hidden anonymized tombstone retains the salon UUID for reconciliation.</p>
        </div>
      </div> : null}

      {action === "reassign" ? <label className="mt-4 block text-xs font-bold">Replacement record
        <select value={replacement} onChange={(event) => setReplacement(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3"><option value="">Choose the replacement</option>{records.filter((item) => item.id !== selected.id && !item.archived).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      </label> : null}

      <label className="mt-4 block text-xs font-bold">Reason
        <textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value.slice(0, 500))} className="mt-1 w-full rounded-lg border border-plum/15 bg-white p-3 font-normal" placeholder={destructiveAction ? "Explain why this offboarded test salon must be permanently removed" : "Explain why this change is needed"} />
      </label>

      {destructiveAction ? <label className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-white p-3 text-xs font-bold text-red-800">
        <input type="checkbox" checked={acknowledgeRetention} onChange={(event) => setAcknowledgeRetention(event.target.checked)} className="mt-0.5 size-4" />
        I understand that the salon disappears from operational records while immutable booking, payment, refund, subscription, and audit history remains available for reconciliation.
      </label> : null}

      <label className="mt-3 block text-xs font-bold">Type <span className={destructiveAction ? "text-red-700" : "text-magenta"}>{requiredConfirmation}</span> to confirm
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal" />
      </label>

      <button type="button" onClick={() => void execute()} disabled={busy || confirmation !== requiredConfirmation || reason.trim().length < (destructiveAction ? 8 : 5) || (action === "reassign" && !replacement) || (destructiveAction && (!acknowledgeRetention || !destructive?.eligible))} className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-6 text-xs font-bold text-white disabled:opacity-40 ${destructiveAction ? "bg-red-700" : "bg-magenta"}`}>
        <ActionIcon size={15} />{busy ? "Checking dependencies…" : `${actionLabels[action] || action} ${selected.label}`}
      </button>
    </div> : null}
    <ActionToast message={message} onDismiss={() => setMessage("")} />
  </section>;
}
