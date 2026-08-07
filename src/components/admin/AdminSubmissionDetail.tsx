"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleSessionBoundary } from "@/components/auth/RoleLogoutButton";
import { readApiResponse } from "@/lib/apiResponseClient";
import { getSessionForScope } from "@/lib/supabase";

type SalonRecord = Record<string, unknown> & {
  id: string;
  name: string;
  status: string;
};

type Revision = {
  id: string;
  revision_number: number;
  change_source: string;
  reason?: string | null;
  changed_by?: string | null;
  created_at: string;
  snapshot: Record<string, unknown>;
};

type AuditEvent = {
  id: string;
  action: string;
  reason?: string | null;
  acting_user_id?: string | null;
  created_at: string;
  dependency_summary?: Record<string, unknown>;
};

type Application = Record<string, unknown> & {
  id: string;
  salon_id: string;
  business_name: string;
  business_email: string;
  status: string;
  archived_at?: string | null;
  archive_reason?: string | null;
  document_count?: number;
  salon?: SalonRecord | SalonRecord[] | null;
  revisions?: Revision[];
  audit_events?: AuditEvent[];
};

type DetailResponse = {
  application?: Application | null;
  is_super_admin?: boolean;
  error?: string;
};

type CurrentForm = {
  name: string;
  owner_name: string;
  email: string;
  phone: string;
  address_street: string;
  address_line2: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  business_type: string;
};

type SnapshotForm = {
  business_name: string;
  owner_name: string;
  business_email: string;
  phone: string;
  street_address: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  business_type: string;
  referral_source: string;
  website_url: string;
  instagram_url: string;
  business_license_number: string;
  cosmetology_license_number: string;
  years_in_operation: string;
  stylist_count: string;
};

const emptyCurrent: CurrentForm = {
  name: "",
  owner_name: "",
  email: "",
  phone: "",
  address_street: "",
  address_line2: "",
  address_city: "",
  address_state: "",
  address_zip: "",
  business_type: "",
};

const emptySnapshot: SnapshotForm = {
  business_name: "",
  owner_name: "",
  business_email: "",
  phone: "",
  street_address: "",
  address_line2: "",
  city: "",
  state: "",
  zip_code: "",
  business_type: "",
  referral_source: "",
  website_url: "",
  instagram_url: "",
  business_license_number: "",
  cosmetology_license_number: "",
  years_in_operation: "",
  stylist_count: "",
};

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function currentSalon(application: Application | null) {
  if (!application) return null;
  return Array.isArray(application.salon)
    ? application.salon[0] || null
    : application.salon || null;
}

function address(parts: unknown[]) {
  return parts.map(stringValue).filter(Boolean).join(", ");
}

function dateLabel(value: unknown) {
  const date = new Date(String(value || ""));
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

function currentValues(salon: SalonRecord | null): CurrentForm {
  if (!salon) return emptyCurrent;
  return {
    name: stringValue(salon.name),
    owner_name: stringValue(salon.owner_name),
    email: stringValue(salon.email),
    phone: stringValue(salon.phone),
    address_street: stringValue(salon.address_street),
    address_line2: stringValue(salon.address_line2),
    address_city: stringValue(salon.address_city),
    address_state: stringValue(salon.address_state),
    address_zip: stringValue(salon.address_zip),
    business_type: stringValue(salon.business_type),
  };
}

function snapshotValues(application: Application): SnapshotForm {
  return {
    business_name: stringValue(application.business_name),
    owner_name: stringValue(application.owner_name),
    business_email: stringValue(application.business_email),
    phone: stringValue(application.phone),
    street_address: stringValue(application.street_address),
    address_line2: stringValue(application.address_line2),
    city: stringValue(application.city),
    state: stringValue(application.state),
    zip_code: stringValue(application.zip_code),
    business_type: stringValue(application.business_type),
    referral_source: stringValue(application.referral_source),
    website_url: stringValue(application.website_url),
    instagram_url: stringValue(application.instagram_url),
    business_license_number: stringValue(application.business_license_number),
    cosmetology_license_number: stringValue(
      application.cosmetology_license_number,
    ),
    years_in_operation: stringValue(application.years_in_operation),
    stylist_count: stringValue(application.stylist_count),
  };
}

function changedPatch<T extends Record<string, string>>(before: T, after: T) {
  return Object.fromEntries(
    Object.keys(after)
      .filter((key) => after[key] !== before[key])
      .map((key) => [key, after[key]]),
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "number" | "url";
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-bold text-plum">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-[8px] border border-plum/15 bg-white px-3 text-sm outline-none focus:border-magenta"
      />
    </label>
  );
}

export default function AdminSubmissionDetail({ id }: { id: string }) {
  const [application, setApplication] = useState<Application | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [currentForm, setCurrentForm] = useState<CurrentForm>(emptyCurrent);
  const [currentBaseline, setCurrentBaseline] = useState<CurrentForm>(emptyCurrent);
  const [snapshotForm, setSnapshotForm] = useState<SnapshotForm>(emptySnapshot);
  const [snapshotBaseline, setSnapshotBaseline] = useState<SnapshotForm>(emptySnapshot);
  const [applicationConfirmation, setApplicationConfirmation] = useState("");
  const [salonConfirmation, setSalonConfirmation] = useState("");

  const load = useCallback(async () => {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Admin sign-in required.");
    const response = await fetch(`/api/admin/submissions/${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const body = (await readApiResponse(
      response,
      "We couldn't load this salon application.",
    )) as DetailResponse;
    if (!response.ok || !body.application)
      throw new Error(body.error || "Application not found.");
    const nextApplication = body.application;
    const nextSalon = currentSalon(nextApplication);
    const nextCurrent = currentValues(nextSalon);
    const nextSnapshot = snapshotValues(nextApplication);
    setApplication(nextApplication);
    setIsSuperAdmin(body.is_super_admin === true);
    setCurrentForm(nextCurrent);
    setCurrentBaseline(nextCurrent);
    setSnapshotForm(nextSnapshot);
    setSnapshotBaseline(nextSnapshot);
  }, [id]);

  useEffect(() => {
    // The loader owns the initial request state for this route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Application not found.",
        ),
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function submissionAction(
    action: string,
    values: Record<string, unknown> = {},
  ) {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Your admin session expired.");
    const response = await fetch(`/api/admin/submissions/${id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, reason, ...values }),
    });
    const body = (await readApiResponse(
      response,
      "This submission action could not be completed.",
    )) as DetailResponse & { ok?: boolean; url?: string };
    if (!response.ok) throw new Error(body.error || "This submission action could not be completed.");
    return body;
  }

  function notifyOtherTabs() {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("girlz-culture-admin-records");
    channel.postMessage({ type: "submission-changed", id });
    channel.close();
  }

  async function run(
    action: string,
    values: Record<string, unknown> = {},
    success = "Changes saved.",
  ) {
    setSaving(true);
    setMessage("Saving…");
    try {
      await submissionAction(action, values);
      if (["delete_application", "delete_salon"].includes(action)) {
        notifyOtherTabs();
        window.location.assign("/admin/submissions");
        return;
      }
      await load();
      notifyOtherTabs();
      setReason("");
      setApplicationConfirmation("");
      setSalonConfirmation("");
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This submission action could not be completed.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function decide(
    decision: "approve" | "reject" | "activate",
    pilotOverride = false,
  ) {
    const session = await getSessionForScope("admin");
    if (!session) {
      setMessage("Your admin session expired.");
      return;
    }
    const decisionReason = pilotOverride ? overrideReason : reason;
    setSaving(true);
    setMessage("Saving decision…");
    try {
      const response = await fetch(`/api/admin/submissions/${id}/decision`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision,
          reason: decisionReason,
          pilot_override: pilotOverride,
        }),
      });
      const body = await readApiResponse(
        response,
        "Unable to save this application decision.",
      );
      if (!response.ok)
        throw new Error(body.error || "Unable to save this application decision.");
      await load();
      notifyOtherTabs();
      setReason("");
      setOverrideReason("");
      setMessage(
        decision === "activate"
          ? "Publication decision saved."
          : `Application is now ${String(body.status || decision).toLowerCase()}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save this application decision.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function openDocument(index: number) {
    setSaving(true);
    setMessage("Opening private document…");
    try {
      const body = await submissionAction("document", { index });
      if (!body.url) throw new Error("Document link was not returned.");
      window.open(body.url, "_blank", "noopener,noreferrer");
      setMessage("Private document opened in a new tab.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Document could not be opened.");
    } finally {
      setSaving(false);
    }
  }

  const salon = currentSalon(application);
  const currentAddress = useMemo(
    () =>
      salon
        ? address([
            salon.address_street,
            salon.address_line2,
            salon.address_city,
            salon.address_state,
            salon.address_zip,
          ])
        : "No current salon record",
    [salon],
  );
  const submittedAddress = useMemo(
    () =>
      application
        ? address([
            application.street_address,
            application.address_line2,
            application.city,
            application.state,
            application.zip_code,
          ])
        : "",
    [application],
  );

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-cream text-plum">
        Loading application…
      </div>
    );
  if (!application)
    return (
      <div className="grid min-h-screen place-items-center bg-cream p-5 text-center">
        <div className="rounded-[14px] bg-white p-8">
          <p>{message || "Application not found."}</p>
          <Link href="/admin/submissions" className="mt-4 inline-flex font-bold text-magenta">
            Back to submissions
          </Link>
        </div>
      </div>
    );

  const operationalStatus = salon?.deleted_at
    ? "Deleted from operations"
    : stringValue(salon?.status) || "No current salon";
  const appDeletePhrase = `DELETE APPLICATION ${application.business_name}`;
  const salonDeletePhrase = `DELETE SALON ${stringValue(salon?.name)}`;
  const currentPatch = changedPatch(currentBaseline, currentForm);
  const snapshotPatch = changedPatch(snapshotBaseline, snapshotForm);

  return (
    <main className="min-h-screen bg-cream px-3 py-4 text-ink sm:px-6 lg:px-10">
      <RoleSessionBoundary scope="admin" />
      <div className="mx-auto max-w-[1450px]">
        <Link href="/admin/submissions" className="inline-flex min-h-10 items-center font-bold text-magenta">
          Back to submissions
        </Link>

        <header className="mt-2 rounded-[16px] border border-plum/10 bg-white p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-magenta">
                Current operational salon
              </p>
              <h1 className="mt-1 break-words font-serif text-3xl font-semibold text-plum sm:text-4xl">
                {stringValue(salon?.name) || application.business_name}
              </h1>
              <p className="mt-2 text-base font-semibold text-ink">{currentAddress}</p>
              <p className="mt-1 text-sm text-ink/60">Current salon address</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-plum px-3 py-2 text-xs font-bold text-white">
                Current: {operationalStatus}
              </span>
              <span className="rounded-full bg-blush px-3 py-2 text-xs font-bold text-plum">
                Application: {application.status}
              </span>
              {application.archived_at ? (
                <span className="rounded-full border border-plum/20 bg-white px-3 py-2 text-xs font-bold text-plum">
                  Archived
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-5 border-t border-plum/10 pt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/55">
              Submitted snapshot
            </p>
            <p className="mt-1 text-sm text-ink/75">{submittedAddress}</p>
            <p className="mt-1 text-xs text-ink/55">
              Submitted {dateLabel(application.submitted_at)} · {application.business_email}
            </p>
          </div>
        </header>

        {message ? (
          <p
            role="status"
            aria-live="polite"
            className={`sticky top-3 z-40 mt-4 rounded-[10px] border p-3 text-sm font-semibold shadow-lg ${
              /could not|unable|permission|only a super|not found|enter|type the/i.test(message)
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            {message}
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
          <section className="space-y-4">
            <details open className="rounded-[14px] border border-plum/10 bg-white p-4 sm:p-5">
              <summary className="cursor-pointer font-serif text-xl font-semibold text-plum">
                Edit current salon information
              </summary>
              <p className="mt-2 text-sm leading-6 text-ink/65">
                These values are the present-day source of truth. Saving here does not change subscription, billing, publication, suspension, or offboarding state.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(Object.keys(currentForm) as Array<keyof CurrentForm>).map((key) => (
                  <Field
                    key={key}
                    label={key.replaceAll("_", " ")}
                    type={key === "email" ? "email" : "text"}
                    value={currentForm[key]}
                    onChange={(value) =>
                      setCurrentForm((current) => ({ ...current, [key]: value }))
                    }
                  />
                ))}
              </div>
              <button
                type="button"
                disabled={saving || !Object.keys(currentPatch).length || reason.trim().length < 5}
                onClick={() =>
                  void run(
                    "update_current",
                    { patch: currentPatch },
                    "Current salon information saved.",
                  )
                }
                className="mt-4 min-h-11 rounded-[9px] bg-magenta px-5 text-sm font-bold text-white disabled:opacity-45"
              >
                Save current salon changes
              </button>
            </details>

            {isSuperAdmin ? (
              <details className="rounded-[14px] border border-plum/10 bg-white p-4 sm:p-5">
                <summary className="cursor-pointer font-serif text-xl font-semibold text-plum">
                  Correct submitted snapshot
                </summary>
                <p className="mt-2 text-sm leading-6 text-ink/65">
                  The corrected version becomes the current snapshot. Every earlier version remains immutable in Submission history.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(Object.keys(snapshotForm) as Array<keyof SnapshotForm>).map((key) => (
                    <Field
                      key={key}
                      label={key.replaceAll("_", " ")}
                      type={
                        key.includes("email")
                          ? "email"
                          : key.includes("url")
                            ? "url"
                            : key === "years_in_operation" || key === "stylist_count"
                              ? "number"
                              : "text"
                      }
                      value={snapshotForm[key]}
                      onChange={(value) =>
                        setSnapshotForm((current) => ({ ...current, [key]: value }))
                      }
                    />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={saving || !Object.keys(snapshotPatch).length || reason.trim().length < 5}
                  onClick={() =>
                    void run(
                      "update_snapshot",
                      { patch: snapshotPatch },
                      "Submitted snapshot corrected; prior revision retained.",
                    )
                  }
                  className="mt-4 min-h-11 rounded-[9px] border border-magenta bg-white px-5 text-sm font-bold text-magenta disabled:opacity-45"
                >
                  Save snapshot correction
                </button>
              </details>
            ) : null}

            <details className="rounded-[14px] border border-plum/10 bg-white p-4 sm:p-5">
              <summary className="cursor-pointer font-serif text-xl font-semibold text-plum">
                Submission history
              </summary>
              <div className="mt-4 space-y-3">
                {(application.revisions || []).map((revision) => (
                  <details key={revision.id} className="rounded-[10px] border border-plum/10 bg-blush/15 p-3">
                    <summary className="cursor-pointer text-sm font-bold text-plum">
                      Revision {revision.revision_number} · {dateLabel(revision.created_at)}
                    </summary>
                    <p className="mt-2 text-xs text-ink/60">
                      {revision.change_source}
                      {revision.reason ? ` · ${revision.reason}` : ""}
                    </p>
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-white p-3 text-[11px] leading-5 text-ink/75">
                      {JSON.stringify(revision.snapshot, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            </details>
          </section>

          <aside className="space-y-4">
            <section className="rounded-[14px] border border-plum/10 bg-white p-4 sm:p-5">
              <h2 className="font-serif text-xl font-semibold text-plum">Reason for this action</h2>
              <p className="mt-2 text-sm text-ink/65">
                The reason is retained with the administrator, time, previous values, and resulting values.
              </p>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Enter a specific internal reason"
                className="mt-3 w-full rounded-[8px] border border-plum/15 bg-white p-3 text-sm outline-none focus:border-magenta"
              />
            </section>

            <section className="rounded-[14px] border border-plum/10 bg-white p-4 sm:p-5">
              <h2 className="font-serif text-xl font-semibold text-plum">Application lifecycle</h2>
              <div className="mt-4 grid gap-2">
                {application.archived_at ? (
                  <button
                    type="button"
                    disabled={saving || reason.trim().length < 5}
                    onClick={() => void run("restore", {}, "Application restored.")}
                    className="min-h-11 rounded-[9px] bg-plum px-4 text-sm font-bold text-white disabled:opacity-45"
                  >
                    Restore application
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving || reason.trim().length < 5}
                    onClick={() => void run("archive", {}, "Application archived without changing salon status.")}
                    className="min-h-11 rounded-[9px] border border-plum/20 bg-white px-4 text-sm font-bold text-plum disabled:opacity-45"
                  >
                    Archive application
                  </button>
                )}
                {!application.archived_at && application.status === "Pending" ? (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void decide("approve")}
                      className="min-h-11 rounded-[9px] bg-magenta px-4 text-sm font-bold text-white disabled:opacity-45"
                    >
                      Approve application
                    </button>
                    <button
                      type="button"
                      disabled={saving || reason.trim().length < 5}
                      onClick={() => void decide("reject")}
                      className="min-h-11 rounded-[9px] border border-red-300 bg-white px-4 text-sm font-bold text-red-700 disabled:opacity-45"
                    >
                      Reject and offboard atomically
                    </button>
                  </>
                ) : null}
                {!application.archived_at && application.status === "Approved" ? (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void decide("activate")}
                      className="min-h-11 rounded-[9px] bg-plum px-4 text-sm font-bold text-white disabled:opacity-45"
                    >
                      Recheck gates and publish if ready
                    </button>
                    <textarea
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      rows={3}
                      placeholder="Specific founding-pilot override reason"
                      className="rounded-[8px] border border-plum/15 bg-white p-3 text-sm outline-none focus:border-magenta"
                    />
                    <button
                      type="button"
                      disabled={saving || overrideReason.trim().length < 12}
                      onClick={() => void decide("activate", true)}
                      className="min-h-11 rounded-[9px] border border-magenta bg-white px-4 text-sm font-bold text-magenta disabled:opacity-45"
                    >
                      Publish with audited pilot override
                    </button>
                  </>
                ) : null}
              </div>
            </section>

            <section className="rounded-[14px] border border-plum/10 bg-white p-4 sm:p-5">
              <h2 className="font-serif text-xl font-semibold text-plum">Private documents</h2>
              <p className="mt-2 text-sm text-ink/65">
                Documents are signed only when an authorized administrator opens one.
              </p>
              <div className="mt-3 grid gap-2">
                {Array.from({ length: Number(application.document_count || 0) }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    disabled={saving}
                    onClick={() => void openDocument(index)}
                    className="min-h-10 rounded-[8px] border border-magenta bg-white px-3 text-left text-sm font-bold text-magenta"
                  >
                    Open private document {index + 1}
                  </button>
                ))}
                {!application.document_count ? (
                  <p className="text-sm text-ink/55">No supporting documents supplied.</p>
                ) : null}
              </div>
            </section>

            {isSuperAdmin ? (
              <section className="rounded-[14px] border border-red-200 bg-red-50 p-4 sm:p-5">
                <h2 className="font-serif text-xl font-semibold text-red-900">Super Admin permanent actions</h2>
                <p className="mt-2 text-sm leading-6 text-red-800">
                  These confirmations protect against an accidental click; they do not transfer authority away from the Super Admin. Immutable revisions and financial/audit evidence remain available where required.
                </p>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-bold text-red-900">Type exactly: {appDeletePhrase}</p>
                    <input
                      value={applicationConfirmation}
                      onChange={(event) => setApplicationConfirmation(event.target.value)}
                      className="mt-2 min-h-11 w-full rounded-[8px] border border-red-300 bg-white px-3 text-sm outline-none"
                    />
                    <button
                      type="button"
                      disabled={
                        saving ||
                        reason.trim().length < 8 ||
                        applicationConfirmation !== appDeletePhrase
                      }
                      onClick={() =>
                        void run(
                          "delete_application",
                          { confirmation: applicationConfirmation },
                          "Application deleted.",
                        )
                      }
                      className="mt-2 min-h-11 w-full rounded-[9px] border border-red-500 bg-white px-4 text-sm font-bold text-red-800 disabled:opacity-45"
                    >
                      Permanently delete application
                    </button>
                  </div>
                  {salon && !salon.deleted_at ? (
                    <div className="border-t border-red-200 pt-4">
                      <p className="text-xs font-bold text-red-900">Type exactly: {salonDeletePhrase}</p>
                      <input
                        value={salonConfirmation}
                        onChange={(event) => setSalonConfirmation(event.target.value)}
                        className="mt-2 min-h-11 w-full rounded-[8px] border border-red-300 bg-white px-3 text-sm outline-none"
                      />
                      <button
                        type="button"
                        disabled={
                          saving ||
                          reason.trim().length < 8 ||
                          salonConfirmation !== salonDeletePhrase
                        }
                        onClick={() =>
                          void run(
                            "delete_salon",
                            { confirmation: salonConfirmation },
                            "Salon removed from operational records.",
                          )
                        }
                        className="mt-2 min-h-11 w-full rounded-[9px] bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-45"
                      >
                        Remove salon from operational records
                      </button>
                      <p className="mt-2 text-xs leading-5 text-red-800">
                        Public identity, access, services, availability, promotions, and applications are removed or archived. Financial, booking, refund, subscription, dispute, and audit history remains anchored to a hidden tombstone.
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <details className="rounded-[14px] border border-plum/10 bg-white p-4 sm:p-5">
              <summary className="cursor-pointer font-serif text-xl font-semibold text-plum">Administrative audit</summary>
              <div className="mt-4 space-y-3">
                {(application.audit_events || []).map((event) => (
                  <div key={event.id} className="rounded-[9px] bg-blush/20 p-3">
                    <p className="text-sm font-bold text-plum">
                      {event.action} · {dateLabel(event.created_at)}
                    </p>
                    <p className="mt-1 text-xs text-ink/65">
                      {event.reason || "No reason recorded"}
                    </p>
                    <p className="mt-1 break-all text-[11px] text-ink/50">
                      Administrator: {event.acting_user_id || "System"}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </aside>
        </div>
      </div>
    </main>
  );
}
