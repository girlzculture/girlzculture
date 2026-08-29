/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";

type Row = Record<string, any>;
type PlacementBasis = "paid" | "platform_credit" | "complimentary_admin";

const defaultSettings = {
  empty_title: "Own a business? Get featured here.",
  empty_body:
    "Put your salon in front of nearby clients with a clearly labeled featured placement.",
  empty_href: "/partner",
};
const statusTabs = [
  "Active",
  "Scheduled",
  "Draft",
  "Paused",
  "Expired",
  "Archived",
  "All",
] as const;

function localDateTime(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function displayDate(value: unknown) {
  if (!value) return "Until I change it";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function basisLabel(value: unknown) {
  if (value === "platform_credit") return "Platform credit";
  if (value === "complimentary_admin") return "Complimentary Admin placement";
  return "Verified paid placement";
}

async function headers(json = false) {
  const session = await getSessionForScope("admin");
  if (!session) throw new Error("Your admin session has expired.");
  return {
    Authorization: `Bearer ${session.access_token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export default function AdminFeaturedCampaigns() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row>(defaultSettings);
  const [salons, setSalons] = useState<Row[]>([]);
  const [salonQuery, setSalonQuery] = useState("");
  const [selectedSalon, setSelectedSalon] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [statusTab, setStatusTab] = useState<(typeof statusTabs)[number]>("Active");
  const [placementBasis, setPlacementBasis] = useState<PlacementBasis>(
    "complimentary_admin",
  );
  const [noEnd, setNoEnd] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [newWindow] = useState(() => ({
    start: localDateTime(),
    end: localDateTime(
      new Date(Date.now() + 8 * 24 * 60 * 60_000).toISOString(),
    ),
  }));

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/featured-campaigns", {
        headers: await headers(),
        cache: "no-store",
      });
      const body = (await readApiResponse(
        response,
        "Unable to load Featured Salon campaigns.",
      )) as { campaigns?: Row[]; settings?: Row; error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Unable to load Featured Salon campaigns.");
      }
      setCampaigns(Array.isArray(body.campaigns) ? body.campaigns : []);
      setSettings(body.settings || defaultSettings);
    } finally {
      setLoading(false);
    }
  }

  async function loadSalons(query = "") {
    const response = await fetch(
      `/api/admin/featured-campaigns?mode=salons&page_size=200&q=${encodeURIComponent(query)}`,
      { headers: await headers(), cache: "no-store" },
    );
    const body = (await readApiResponse(
      response,
      "Unable to load eligible salons.",
    )) as { salons?: Row[]; error?: string };
    if (!response.ok) throw new Error(body.error || "Unable to load eligible salons.");
    setSalons(Array.isArray(body.salons) ? body.salons : []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([load(), loadSalons()]).catch((error) =>
        setNotice(error instanceof Error ? error.message : "Unable to load campaigns."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (editing) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadSalons(salonQuery.trim()).catch(() => undefined);
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [editing, salonQuery]);

  const visibleCampaigns = useMemo(
    () =>
      campaigns.filter(
        (campaign) =>
          statusTab === "All" || String(campaign.status || "Draft") === statusTab,
      ),
    [campaigns, statusTab],
  );

  function resetEditor() {
    setEditing(null);
    setSelectedSalon(null);
    setSalonQuery("");
    setPlacementBasis("complimentary_admin");
    setNoEnd(false);
  }

  function beginEdit(campaign: Row) {
    setEditing(campaign);
    setSelectedSalon(campaign.salon || null);
    setSalonQuery(String(campaign.salon?.name || ""));
    setPlacementBasis(
      ["paid", "platform_credit", "complimentary_admin"].includes(
        String(campaign.placement_basis),
      )
        ? campaign.placement_basis
        : "paid",
    );
    setNoEnd(!campaign.ends_at);
    window.setTimeout(
      () => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const salonId = editing?.salon_id || selectedSalon?.id;
    if (!salonId) {
      setNotice("Choose an eligible salon.");
      return;
    }
    const requestedStatus = String(form.get("status") || "Draft");
    const source = String(form.get("entitlement_source") || "");
    const reference = String(form.get("entitlement_reference") || "").trim();
    if (
      placementBasis === "paid" &&
      ["Scheduled", "Active"].includes(requestedStatus) &&
      (!source || !reference)
    ) {
      setNotice("Choose verified Stripe payment or invoice evidence.");
      return;
    }
    setBusy("save");
    setNotice("");
    try {
      const response = await fetch("/api/admin/featured-campaigns", {
        method: "POST",
        headers: await headers(true),
        body: JSON.stringify({
          action: "save",
          id: editing?.id || null,
          salon_id: salonId,
          status: requestedStatus,
          starts_at: form.get("starts_at"),
          ends_at: noEnd ? null : form.get("ends_at"),
          no_end: noEnd,
          timezone: form.get("timezone"),
          radius_miles: form.get("radius"),
          priority: form.get("priority"),
          rotation_weight: form.get("weight"),
          internal_note: form.get("internal_note"),
          placement_basis: placementBasis,
          entitlement_source: placementBasis === "paid" ? source : null,
          entitlement_reference: placementBasis === "paid" ? reference : null,
          entitlement_amount_minor:
            form.get("amount") === ""
              ? null
              : Math.round(Number(form.get("amount")) * 100),
          note: form.get("optional_note"),
        }),
      });
      const body = (await readApiResponse(
        response,
        "Unable to save the Featured Salon campaign.",
      )) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Unable to save the Featured Salon campaign.");
      }
      await load();
      resetEditor();
      formElement.reset();
      setNotice(
        "Campaign saved. Published customer pages receive the change automatically.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to save the Featured Salon campaign.",
      );
    } finally {
      setBusy("");
    }
  }

  async function saveStatus(campaign: Row, status: string) {
    setBusy(String(campaign.id));
    setNotice("");
    try {
      const response = await fetch("/api/admin/featured-campaigns", {
        method: "POST",
        headers: await headers(true),
        body: JSON.stringify({
          action: "save",
          id: campaign.id,
          salon_id: campaign.salon_id,
          status,
          starts_at: campaign.starts_at,
          ends_at: campaign.ends_at,
          no_end: !campaign.ends_at,
          timezone: campaign.timezone,
          radius_miles: campaign.radius_miles,
          priority: campaign.priority,
          rotation_weight: campaign.rotation_weight,
          internal_note: campaign.internal_note,
          placement_basis: campaign.placement_basis || "paid",
          entitlement_source:
            campaign.placement_basis === "paid"
              ? campaign.entitlement?.source || null
              : null,
          entitlement_reference:
            campaign.placement_basis === "paid"
              ? campaign.entitlement?.external_reference || null
              : null,
          entitlement_amount_minor: campaign.entitlement?.amount_minor ?? null,
          note: null,
        }),
      });
      const body = (await readApiResponse(
        response,
        "Unable to update the campaign.",
      )) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to update the campaign.");
      await load();
      setNotice(`Campaign changed to ${status}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update the campaign.");
    } finally {
      setBusy("");
    }
  }

  async function manage(campaign: Row, action: "archive" | "restore" | "delete") {
    if (
      action === "delete" &&
      !window.confirm(
        `Delete ${campaign.salon?.name || "this campaign"} permanently from operational campaign records? The immutable audit evidence will remain.`,
      )
    ) {
      return;
    }
    setBusy(String(campaign.id));
    setNotice("");
    try {
      const response = await fetch("/api/admin/featured-campaigns", {
        method: "POST",
        headers: await headers(true),
        body: JSON.stringify({
          action: "manage",
          id: campaign.id,
          lifecycle_action: action,
        }),
      });
      const body = (await readApiResponse(
        response,
        `Unable to ${action} the campaign.`,
      )) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Unable to ${action} the campaign.`);
      await load();
      setNotice(`Campaign ${action === "delete" ? "deleted" : `${action}d`}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Unable to ${action} the campaign.`);
    } finally {
      setBusy("");
    }
  }

  async function saveSettings() {
    setBusy("settings");
    try {
      const response = await fetch("/api/admin/featured-campaigns", {
        method: "POST",
        headers: await headers(true),
        body: JSON.stringify({ action: "settings", ...settings }),
      });
      const body = (await readApiResponse(
        response,
        "Unable to save the zero-result card.",
      )) as { settings?: Row; error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to save the zero-result card.");
      setSettings(body.settings || settings);
      setNotice("Zero-result promotional card saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save the zero-result card.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-magenta/20 bg-blush/45 p-3 text-xs text-plum"
        >
          {notice}
        </p>
      ) : null}

      <section ref={editorRef} className="rounded-2xl border border-plum/10 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-plum sm:text-2xl">
              {editing ? "Edit Featured Salon campaign" : "Create Featured Salon campaign"}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-ink/60">
              Select a salon, choose the placement basis, and publish the schedule.
              Platform credit and complimentary Admin placement do not require an
              internal reason or a manually entered reference.
            </p>
          </div>
          {editing ? (
            <button
              type="button"
              onClick={resetEditor}
              className="min-h-10 rounded-lg border border-plum/15 px-4 text-xs font-bold text-plum"
            >
              Cancel edit
            </button>
          ) : null}
        </div>

        <form key={editing?.id || "new"} onSubmit={submit} className="mt-5 space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="relative text-[10px] font-bold md:col-span-2">
              Eligible salon
              <input
                type="search"
                disabled={Boolean(editing)}
                value={editing?.salon?.name || salonQuery}
                onChange={(event) => {
                  setSalonQuery(event.target.value);
                  setSelectedSalon(null);
                }}
                onFocus={() => {
                  if (!editing) void loadSalons(salonQuery.trim()).catch(() => undefined);
                }}
                placeholder="Choose or type a salon name"
                className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs font-normal disabled:bg-cream"
              />
              {!editing && salons.length && !selectedSalon ? (
                <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-plum/10 bg-white p-1 shadow-xl">
                  {salons.map((salon) => (
                    <button
                      type="button"
                      key={salon.id}
                      onClick={() => {
                        setSelectedSalon(salon);
                        setSalonQuery(String(salon.name || ""));
                      }}
                      className="block w-full rounded-lg p-3 text-left text-xs font-normal hover:bg-blush"
                    >
                      <b className="text-plum">{salon.name}</b>
                      <span className="mt-1 block text-[10px] text-ink/50">
                        {[salon.address_city, salon.address_state]
                          .filter(Boolean)
                          .join(", ") || "Location verified"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <Field label="Start" name="starts_at" type="datetime-local" defaultValue={editing?.starts_at ? localDateTime(editing.starts_at) : newWindow.start} />
            <div>
              <Field label="End" name="ends_at" type="datetime-local" disabled={noEnd} defaultValue={editing?.ends_at ? localDateTime(editing.ends_at) : newWindow.end} />
              <label className="mt-2 flex items-center gap-2 text-[10px] font-bold text-plum">
                <input
                  type="checkbox"
                  checked={noEnd}
                  onChange={(event) => setNoEnd(event.target.checked)}
                  className="accent-magenta"
                />
                Until I change it
              </label>
            </div>
            <Select label="Status" name="status" defaultValue={editing?.status || "Draft"} options={["Draft", "Scheduled", "Active", "Paused", "Expired"]} />
            <Select
              label="Placement basis"
              name="placement_basis"
              value={placementBasis}
              onChange={(value) => setPlacementBasis(value as PlacementBasis)}
              options={["complimentary_admin", "platform_credit", "paid"]}
              labels={{
                complimentary_admin: "Complimentary Admin placement",
                platform_credit: "Platform credit",
                paid: "Verified Stripe payment / invoice",
              }}
            />
            <Field label="Timezone" name="timezone" defaultValue={editing?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone} />
            <Field label="Radius (miles)" name="radius" type="number" min="1" max="250" step="1" defaultValue={editing?.radius_miles || 25} />
            <Field label="Priority (0–100)" name="priority" type="number" min="0" max="100" step="1" defaultValue={editing?.priority ?? 50} />
            <Field label="Rotation weight" name="weight" type="number" min="0.1" max="100" step="0.1" defaultValue={editing?.rotation_weight || 1} />
          </div>

          {placementBasis === "paid" ? (
            <div className="grid gap-3 rounded-xl border border-plum/10 bg-cream/35 p-4 md:grid-cols-3">
              <Select
                label="Verified payment evidence"
                name="entitlement_source"
                defaultValue={editing?.entitlement?.source || "stripe_payment"}
                options={["stripe_payment", "verified_invoice"]}
                labels={{
                  stripe_payment: "Stripe PaymentIntent",
                  verified_invoice: "Paid Stripe invoice",
                }}
              />
              <Field
                label="Verified Stripe reference"
                name="entitlement_reference"
                placeholder="pi_… or in_…"
                defaultValue={editing?.entitlement?.external_reference || ""}
              />
              <Field
                label="Amount (optional)"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={
                  editing?.entitlement?.amount_minor != null
                    ? Number(editing.entitlement.amount_minor) / 100
                    : ""
                }
              />
            </div>
          ) : placementBasis === "platform_credit" ? (
            <div className="grid gap-3 rounded-xl border border-plum/10 bg-cream/35 p-4 md:grid-cols-2">
              <p className="text-xs leading-5 text-ink/60">
                Girlz Culture will create the platform-credit reference
                automatically. No reference or internal reason is required.
              </p>
              <Field
                label="Credit value (optional)"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={
                  editing?.entitlement?.amount_minor != null
                    ? Number(editing.entitlement.amount_minor) / 100
                    : ""
                }
              />
            </div>
          ) : (
            <p className="rounded-xl border border-plum/10 bg-cream/35 p-4 text-xs leading-5 text-ink/60">
              Selecting complimentary Admin placement is sufficient. The system
              records your administrator identity and timestamp automatically;
              no internal reason is required.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Internal note (optional)" name="internal_note" defaultValue={editing?.internal_note || ""} />
            <Field label="Audit note (optional)" name="optional_note" placeholder="Optional context for this change" />
          </div>

          <button
            disabled={busy === "save"}
            className="min-h-11 w-full rounded-lg bg-magenta px-6 text-xs font-bold text-white gc-disabled-control sm:w-auto"
          >
            {busy === "save" ? "Saving…" : editing ? "Save campaign" : "Create campaign"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-plum/10 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-plum sm:text-2xl">Campaigns</h2>
            <p className="mt-1 text-xs text-ink/55">
              Compact working lists keep expired and archived records out of the
              active view while preserving their audit history.
            </p>
          </div>
          <span className="text-xs text-ink/50">
            {visibleCampaigns.length} matching campaign{visibleCampaigns.length === 1 ? "" : "s"}
          </span>
        </div>
        <div role="group" className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Campaign status filters">
          {statusTabs.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusTab(status)}
              className={`min-h-10 shrink-0 rounded-lg px-4 text-xs font-bold ${
                statusTab === status
                  ? "bg-plum text-white"
                  : "border border-plum/10 bg-white text-plum"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {visibleCampaigns.map((campaign) => (
            <article key={campaign.id} className="min-w-0 rounded-xl border border-plum/10 bg-cream/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-serif text-lg text-plum">
                    {campaign.salon?.name || "Salon unavailable"}
                  </h3>
                  <p className="mt-1 text-[10px] leading-4 text-ink/50">
                    {displayDate(campaign.starts_at)} → {displayDate(campaign.ends_at)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-magenta">
                  {campaign.status}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg bg-white p-3">
                  <dt className="font-bold uppercase text-ink/45">Basis</dt>
                  <dd className="mt-1 text-plum">{basisLabel(campaign.placement_basis)}</dd>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <dt className="font-bold uppercase text-ink/45">Reach</dt>
                  <dd className="mt-1 text-plum">{campaign.radius_miles} miles · priority {campaign.priority}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                {campaign.status !== "Archived" ? (
                  <button
                    type="button"
                    onClick={() => beginEdit(campaign)}
                    className="min-h-10 rounded-lg border border-magenta px-4 text-[10px] font-bold text-magenta"
                  >
                    Edit
                  </button>
                ) : null}
                {campaign.status === "Active" ? (
                  <button
                    type="button"
                    disabled={busy === campaign.id}
                    onClick={() => void saveStatus(campaign, "Paused")}
                    className="min-h-10 rounded-lg border border-plum/15 px-4 text-[10px] font-bold text-plum"
                  >
                    Pause
                  </button>
                ) : campaign.status === "Paused" ? (
                  <button
                    type="button"
                    disabled={busy === campaign.id}
                    onClick={() => void saveStatus(campaign, "Active")}
                    className="min-h-10 rounded-lg bg-plum px-4 text-[10px] font-bold text-white"
                  >
                    Resume
                  </button>
                ) : null}
                <details className="relative">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-lg border border-plum/15 px-4 text-[10px] font-bold text-plum">
                    More actions
                  </summary>
                  <div className="absolute right-0 z-20 mt-1 min-w-44 rounded-xl border border-plum/10 bg-white p-1 shadow-xl">
                    {campaign.status === "Archived" ? (
                      <button type="button" onClick={() => void manage(campaign, "restore")} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-blush">Restore as draft</button>
                    ) : (
                      <button type="button" onClick={() => void manage(campaign, "archive")} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-blush">Archive</button>
                    )}
                    <button type="button" onClick={() => void manage(campaign, "delete")} className="block w-full rounded-lg px-3 py-2 text-left text-xs gc-text-danger hover:bg-red-50">Delete permanently</button>
                    {campaign.audit?.length ? (
                      <span className="block border-t border-plum/10 px-3 py-2 text-[10px] text-ink/50">
                        {campaign.audit.length} audit event{campaign.audit.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                </details>
              </div>
            </article>
          ))}
          {!loading && !visibleCampaigns.length ? (
            <p className="rounded-xl border border-dashed border-plum/15 p-8 text-center text-xs text-ink/50 xl:col-span-2">
              No campaigns match this status.
            </p>
          ) : null}
          {loading ? (
            <p className="p-8 text-center text-xs text-ink/50 xl:col-span-2">Loading campaigns…</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-plum/10 bg-white p-4 sm:p-5">
        <h2 className="font-serif text-xl text-plum sm:text-2xl">Zero-result promotional card</h2>
        <p className="mt-1 text-xs text-ink/55">
          This editable card appears only when no eligible Featured Salon campaign
          qualifies for the customer.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field controlled label="Title" value={String(settings.empty_title || "")} onChange={(value) => setSettings((current) => ({ ...current, empty_title: value }))} />
          <Field controlled label="Internal destination" value={String(settings.empty_href || "")} onChange={(value) => setSettings((current) => ({ ...current, empty_href: value }))} />
          <label className="text-[10px] font-bold md:col-span-2">
            Description
            <textarea
              rows={3}
              value={String(settings.empty_body || "")}
              onChange={(event) => setSettings((current) => ({ ...current, empty_body: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-plum/15 p-3 text-xs font-normal"
            />
          </label>
        </div>
        <button type="button" disabled={busy === "settings"} onClick={() => void saveSettings()} className="mt-4 min-h-11 rounded-lg bg-plum px-5 text-xs font-bold text-white gc-disabled-control">
          {busy === "settings" ? "Saving…" : "Save zero-result card"}
        </button>
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  min,
  max,
  step,
  disabled = false,
  controlled = false,
  value,
  onChange,
}: {
  label: string;
  name?: string;
  type?: string;
  defaultValue?: any;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
  disabled?: boolean;
  controlled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="text-[10px] font-bold">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={controlled ? undefined : defaultValue}
        value={controlled ? value : undefined}
        onChange={controlled ? (event) => onChange?.(event.target.value) : undefined}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs font-normal disabled:bg-cream gc-disabled-control"
      />
    </label>
  );
}

function Select({
  label,
  name,
  options,
  defaultValue,
  value,
  onChange,
  labels = {},
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <label className="text-[10px] font-bold">
      {label}
      <select
        name={name}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs font-normal"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] || option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
