"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  History,
  RotateCcw,
  Search,
  ServerCog,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import SalonLifecycleSettings from "@/components/admin/SalonLifecycleSettings";
import SearchLanguageSettings from "@/components/admin/SearchLanguageSettings";
import MediaRulesSettings from "@/components/admin/MediaRulesSettings";
import TranslationManager from "@/components/admin/TranslationManager";
import RecordLifecycleManager from "@/components/admin/RecordLifecycleManager";
import TestDataManager from "@/components/admin/TestDataManager";
import { ENGINE_CATEGORIES } from "@/lib/engineManifest";
import AiAutomationManager from "@/components/admin/AiAutomationManager";
import SystemStatusManager from "@/components/admin/SystemStatusManager";
import ErrorMonitoringManager from "@/components/admin/ErrorMonitoringManager";
import NavigationMenuManager from "@/components/admin/NavigationMenuManager";
import NotificationTemplateManager from "@/components/admin/NotificationTemplateManager";
import BrandAppearanceManager from "@/components/admin/BrandAppearanceManager";

type Setting = {
  id: string;
  setting_key: string;
  category: string;
  display_name: string;
  description: string;
  value_type: string;
  draft_value: unknown;
  published_value: unknown;
  status: string;
  version: number;
  published_version: number;
  impact_level: string;
  validation: Record<string, unknown>;
  help_text: string;
  impact_description: string;
  is_public: boolean;
  is_secret_status: boolean;
  environment: string;
  affected_surfaces?: string[];
};
type Version = {
  id: string;
  setting_id: string;
  version: number;
  action: string;
  value: unknown;
  previous_value: unknown;
  reason?: string;
  environment: string;
  created_at: string;
};
type EnvironmentStatus = { key: string; label: string; configured: boolean };
type ImportPreview = {
  environment: string;
  entries: Array<{
    setting_key: string;
    value: unknown;
    current_draft: unknown;
    impact_level: string;
    affected_surfaces: string[];
  }>;
  errors: string[];
  changed: number;
};
const highImpact = new Set([
  "booking",
  "billing",
  "security",
  "safety",
  "legal",
]);

function editorText(setting: Setting) {
  const value = setting.draft_value ?? setting.published_value;
  if (
    ["list", "reorderable_list"].includes(setting.value_type) &&
    Array.isArray(value)
  )
    return value.join("\n");
  if (["schedule", "template", "relationship"].includes(setting.value_type))
    return JSON.stringify(value ?? {}, null, 2);
  return value == null ? "" : String(value);
}
function friendlyValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object")
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key.replaceAll("_", " ")}: ${String(item)}`)
      .join(" · ");
  return String(value ?? "Not set");
}

export default function EngineControlCenter() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [history, setHistory] = useState<Version[]>([]);
  const [environmentStatus, setEnvironmentStatus] = useState<
    EnvironmentStatus[]
  >([]);
  const [environment, setEnvironment] = useState("development");
  const [category, setCategory] = useState("branding_design");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importPayload, setImportPayload] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [importConfirmation, setImportConfirmation] = useState("");
  const [emergencyConfirmation, setEmergencyConfirmation] = useState("");
  async function headers() {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Your admin session expired.");
    return { Authorization: `Bearer ${session.access_token}` };
  }
  async function load(preferred?: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/engine/config", {
        headers: await headers(),
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const rows = Array.isArray(body.settings) ? body.settings : [];
      setSettings(rows);
      setHistory(Array.isArray(body.history) ? body.history : []);
      setEnvironmentStatus(
        Array.isArray(body.environmentStatus) ? body.environmentStatus : [],
      );
      setEnvironment(String(body.environment || "development"));
      const id =
        preferred ||
        selectedId ||
        rows.find((row: Setting) => row.category === category)?.id ||
        rows[0]?.id ||
        "";
      setSelectedId(id);
      const row = rows.find((item: Setting) => item.id === id);
      if (row) setEditor(editorText(row));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load Engine configuration.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = settings.find((row) => row.id === selectedId) || null;
  const selectedCategory = ENGINE_CATEGORIES.find(
    (item) => item.id === category,
  );
  const showsRecordLifecycle = [
    "pages_sections",
    "service_taxonomies",
    "salon_lifecycle",
    "markets_service_areas",
    "promotions_campaigns",
    "customer_support",
    "users_roles",
    "configuration_history",
  ].includes(category);
  const hasUnsavedChanges = Boolean(
    selected && !selected.is_secret_status && editor !== editorText(selected),
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);
  const visible = useMemo(
    () =>
      settings.filter(
        (row) =>
          row.setting_key !== "languages.supported" &&
          (query
            ? `${row.display_name} ${row.description} ${row.help_text} ${row.category}`
                .toLowerCase()
                .includes(query.toLowerCase())
            : row.category === category),
      ),
    [settings, category, query],
  );
  const versions = history
    .filter((row) => row.setting_id === selectedId)
    .slice(0, 12);
  function canLeaveDraft() {
    return (
      !hasUnsavedChanges ||
      window.confirm("Discard the unsaved Engine draft currently shown?")
    );
  }
  function choose(row: Setting) {
    if (row.id !== selectedId && !canLeaveDraft()) return;
    setCategory(row.category);
    setSelectedId(row.id);
    setEditor(editorText(row));
    setReason("");
    setConfirmed(false);
    setMessage("");
  }
  function chooseCategory(next: string) {
    if (next === category || !canLeaveDraft()) return;
    setCategory(next);
    const row = settings.find((item) => item.category === next);
    if (row) {
      setSelectedId(row.id);
      setEditor(editorText(row));
    } else {
      setSelectedId("");
      setEditor("");
    }
    setReason("");
    setConfirmed(false);
    setMessage("");
  }
  function requestValue(setting: Setting) {
    if (setting.value_type === "boolean") return editor === "true";
    if (["number", "percentage", "currency"].includes(setting.value_type))
      return editor;
    if (["list", "reorderable_list"].includes(setting.value_type))
      return editor
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    return editor;
  }
  async function change(
    action: "save_draft" | "publish" | "rollback",
    targetVersion?: number,
  ) {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/engine/config", {
        method: "PATCH",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({
          setting_key: selected.setting_key,
          expected_version: selected.version,
          action,
          value: requestValue(selected),
          reason,
          target_version: targetVersion,
          confirm_high_impact: confirmed,
          environment,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(
        action === "save_draft"
          ? "Draft saved. Published behavior has not changed."
          : action === "publish"
            ? "Published successfully. The configuration revision and caches were updated."
            : "The selected version is live again.",
      );
      await load(body.setting?.id);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update this setting.",
      );
    } finally {
      setBusy(false);
    }
  }
  function exportConfiguration() {
    const payload = {
      schema: "girlz-culture-engine-export/v1",
      exported_at: new Date().toISOString(),
      environment,
      settings: settings
        .filter((row) => !row.is_secret_status)
        .map((row) => ({
          setting_key: row.setting_key,
          name: row.display_name,
          category: row.category,
          value: row.published_value,
          value_type: row.value_type,
          published_version: row.published_version,
        })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `girlz-culture-engine-${environment}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function previewImport(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const response = await fetch("/api/admin/engine/config", {
        method: "POST",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_import", payload: parsed }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setImportPayload(parsed);
      setImportPreview(body.preview);
      setImportConfirmation("");
    } catch (error) {
      setImportPayload(null);
      setImportPreview(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "The configuration file could not be previewed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importDrafts() {
    if (!importPayload) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/engine/config", {
        method: "POST",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_drafts",
          payload: importPayload,
          confirmation: importConfirmation,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(
        `${body.result?.imported || 0} setting(s) imported as drafts. Nothing was published.`,
      );
      setImportPayload(null);
      setImportPreview(null);
      setImportConfirmation("");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The drafts could not be imported.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function emergencyRevert() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/engine/config", {
        method: "POST",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "emergency_revert",
          setting_key: selected.setting_key,
          expected_version: selected.version,
          reason,
          confirmation: emergencyConfirmation,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setEmergencyConfirmation("");
      setMessage(
        "Emergency recovery published the immediately preceding known-good version and advanced the configuration revision.",
      );
      await load(body.setting?.id);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Emergency recovery did not run.",
      );
    } finally {
      setBusy(false);
    }
  }
  const impactHigh = selected ? highImpact.has(selected.impact_level) : false;
  return (
    <div className="space-y-5">
      <section className="rounded-[18px] border border-plum/10 bg-[linear-gradient(125deg,#25102d,#5b1a6b)] p-5 text-white shadow-[0_18px_55px_rgba(26,18,32,.12)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10">
              <ServerCog />
            </span>
            <div>
              <h2 className="font-serif text-3xl">The Engine</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-white/70">
                Manage safe platform rules, labels, thresholds, and behavior
                with drafts, review, publication history, and rollback.
                Credentials remain in secure deployment settings.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/25 px-4 text-xs font-bold">
              <Upload size={15} />
              Preview import
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void previewImport(file);
                  event.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={exportConfiguration}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/25 px-4 text-xs font-bold"
            >
              <Download size={15} />
              Export published configuration
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {environmentStatus.map((item) => (
            <div key={item.key} className="rounded-xl bg-white/8 p-3">
              <span className="flex items-center gap-2 text-xs font-bold">
                {item.configured ? (
                  <CheckCircle2 size={15} className="text-green-300" />
                ) : (
                  <AlertTriangle size={15} className="text-amber" />
                )}
                {item.label}
              </span>
              <span className="mt-1 block text-[10px] text-white/60">
                {item.configured ? "Configured securely" : "Not configured"}
              </span>
            </div>
          ))}
        </div>
      </section>
      {importPreview ? (
        <section className="rounded-[15px] border border-amber/30 bg-white p-5">
          <div className="flex items-center gap-2">
            <Upload className="text-magenta" />
            <h3 className="font-serif text-2xl text-plum">Import preview</h3>
          </div>
          <p className="mt-2 text-xs text-ink/60">
            Environment: <b>{importPreview.environment}</b> ·{" "}
            {importPreview.entries.length} valid · {importPreview.changed}{" "}
            changed · {importPreview.errors.length} blocked. <span>Imports create drafts only</span> and never copy secrets or publish behavior.
          </p>
          {importPreview.errors.length ? (
            <ul className="mt-3 list-disc pl-5 text-xs text-red-700">
              {importPreview.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
            {importPreview.entries.map((entry) => (
              <div
                key={entry.setting_key}
                className="rounded-lg border border-plum/10 p-3 text-xs"
              >
                <b>{entry.setting_key}</b>
                <span className="mt-1 block text-[10px] text-ink/50">
                  Impact: {entry.impact_level} ·{" "}
                  {entry.affected_surfaces.join(", ") ||
                    "No affected surfaces recorded"}
                </span>
              </div>
            ))}
          </div>
          <label className="mt-4 block text-xs font-bold">
            Type IMPORT DRAFTS {environment}
            <input
              value={importConfirmation}
              onChange={(event) => setImportConfirmation(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={
                busy ||
                Boolean(importPreview.errors.length) ||
                importConfirmation !== `IMPORT DRAFTS ${environment}`
              }
              onClick={() => void importDrafts()}
              className="min-h-11 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-40"
            >
              Import validated drafts
            </button>
            <button
              type="button"
              onClick={() => {
                setImportPayload(null);
                setImportPreview(null);
                setImportConfirmation("");
              }}
              className="min-h-11 rounded-lg border border-plum/15 px-5 text-xs font-bold"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[15px] border border-plum/10 bg-white p-3">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-plum/15 px-3">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search all Engine controls"
              className="min-w-0 flex-1 text-xs outline-none"
            />
          </label>
          <nav
            aria-label="Engine areas"
            className="mt-3 max-h-[680px] space-y-1 overflow-y-auto"
          >
            {ENGINE_CATEGORIES.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => chooseCategory(item.id)}
                className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-[11px] ${category === item.id ? "bg-blush font-bold text-plum" : "hover:bg-cream"}`}
              >
                <span>{item.label}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[9px]">
                  {settings.filter((row) => row.category === item.id).length}
                </span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 space-y-4">
          <div className="rounded-[15px] border border-plum/10 bg-white p-5">
            <nav
              aria-label="Breadcrumb"
              className="text-[10px] font-bold text-ink/45"
            >
              Platform Admin <span aria-hidden="true">/</span> The Engine{" "}
              <span aria-hidden="true">/</span>{" "}
              <span className="text-magenta">{selectedCategory?.label}</span>
            </nav>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-magenta">
                  {selectedCategory?.label}
                </p>
                <h3 className="mt-1 font-serif text-2xl text-plum">
                  Configuration controls
                </h3>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-ink/55">
                  {selectedCategory?.description}
                </p>
              </div>
              <span className="rounded-full bg-cream px-3 py-1 text-[10px] font-bold text-plum">
                {environment} environment
              </span>
            </div>
            {loading ? (
              <p className="mt-5 text-sm text-ink/55">
                Loading governed settings…
              </p>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {visible.map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    onClick={() => choose(row)}
                    className={`rounded-xl border p-4 text-left ${selectedId === row.id ? "border-magenta bg-blush/25" : "border-plum/10"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <b className="text-sm text-plum">{row.display_name}</b>
                      <span
                        className={`rounded-full px-2 py-1 text-[8px] font-bold ${highImpact.has(row.impact_level) ? "bg-amber/20 text-[#7b4a00]" : "bg-cream text-ink/55"}`}
                      >
                        {row.impact_level}
                      </span>
                    </span>
                    <span className="mt-2 block text-[10px] leading-4 text-ink/55">
                      {row.description}
                    </span>
                    <span className="mt-3 block text-[9px] text-ink/40">
                      Published version {row.published_version} · working
                      version {row.version}
                    </span>
                  </button>
                ))}
                {!visible.length ? (
                  <p className="rounded-xl border border-dashed p-6 text-center text-xs text-ink/50 sm:col-span-2">
                    This area uses the connected specialist workspace below. No
                    generic setting matches the current search.
                  </p>
                ) : null}
              </div>
            )}
          </div>
          {selected && selected.category === category ? (
            <section className="rounded-[15px] border border-plum/10 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-2xl text-plum">
                    {selected.display_name}
                  </h3>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-ink/60">
                    {selected.description}
                  </p>
                </div>
                <span className="rounded-full bg-blush px-3 py-1 text-[9px] font-bold text-plum">
                  {selected.value_type.replaceAll("_", " ")}
                </span>
              </div>
              {selected.is_secret_status ? (
                <div className="mt-5 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-plum">
                  <ShieldCheck className="mr-2 inline" size={18} />
                  This is a safe configuration-status indicator. Secret values
                  can never be viewed or edited in Engine.
                </div>
              ) : (
                <>
                  <div className="mt-5">
                    <TypedEditor
                      setting={selected}
                      value={editor}
                      onChange={setEditor}
                    />
                    <p className="mt-2 text-[10px] text-ink/50">
                      {selected.help_text}
                    </p>
                  </div>
                  <div className="mt-4 rounded-xl bg-cream p-3 text-[10px] leading-4 text-ink/65">
                    <b className="text-plum">Impact:</b>{" "}
                    {selected.impact_description ||
                      "This setting affects future platform behavior after publication."}
                    <span className="mt-1 block">
                      <b>Currently published:</b>{" "}
                      {friendlyValue(selected.published_value)}
                    </span>
                    <span className="mt-1 block">
                      <b>Draft preview:</b>{" "}
                      {friendlyValue(requestValue(selected))}
                    </span>
                    <span className="mt-1 block">
                      <b>Affected surfaces:</b>{" "}
                      {selected.affected_surfaces?.join(", ") ||
                        "No affected surfaces recorded"}
                    </span>
                  </div>
                  {impactHigh ? (
                    <label className="mt-4 flex items-start gap-2 rounded-xl border border-amber/35 bg-amber/10 p-3 text-xs">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                        className="mt-0.5 accent-magenta"
                      />
                      <span>
                        I reviewed the {selected.impact_level} impact and
                        confirm this change is intended. Existing financial and
                        audit history will not be rewritten.
                      </span>
                    </label>
                  ) : null}
                  <label className="mt-4 block text-xs font-bold">
                    Change reason {impactHigh ? "(required)" : "(recommended)"}
                    <textarea
                      value={reason}
                      onChange={(event) =>
                        setReason(event.target.value.slice(0, 500))
                      }
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-plum/15 p-3 font-normal"
                      placeholder="Explain why this configuration is changing"
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void change("save_draft")}
                      className="min-h-11 rounded-lg border border-magenta px-5 text-xs font-bold text-magenta"
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        Boolean(
                          impactHigh &&
                          (!confirmed || reason.trim().length < 8),
                        )
                      }
                      onClick={() => void change("publish")}
                      className="min-h-11 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-45"
                    >
                      Publish change
                    </button>
                  </div>
                </>
              )}
              {message ? (
                <p
                  role="status"
                  className="mt-4 rounded-lg bg-blush p-3 text-xs text-plum"
                >
                  {message}
                </p>
              ) : null}
            </section>
          ) : null}
          {category === "salon_lifecycle" ? <SalonLifecycleSettings /> : null}
          {category === "branding_design" ? <BrandAppearanceManager /> : null}
          {category === "search_discovery" ? <SearchLanguageSettings /> : null}
          {category === "media_uploads" ? <MediaRulesSettings /> : null}
          {category === "languages_translations" ? (
            <TranslationManager />
          ) : null}
          {category === "navigation_menus" ? <NavigationMenuManager /> : null}
          {category === "notifications_templates" ? <NotificationTemplateManager /> : null}
          {category === "ai_automation" ? <AiAutomationManager /> : null}
          {category === "integrations_system" ? <><SystemStatusManager /><ErrorMonitoringManager /></> : null}
          {category === "test_data_maintenance" ? <TestDataManager /> : null}
          {selectedCategory?.links?.length ? (
            <section className="rounded-[15px] border border-plum/10 bg-white p-5">
              <h3 className="font-serif text-xl text-plum">
                Connected management workspaces
              </h3>
              <p className="mt-2 text-xs leading-5 text-ink/60">
                Complex records stay in purpose-built editors so validation,
                relationship previews, and protected history remain clear.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {selectedCategory.links.map((link) => (
                  <Link
                    key={link.href + link.label}
                    href={link.href}
                    className="rounded-xl border border-plum/10 p-4 transition hover:border-magenta hover:bg-blush/20"
                  >
                    <b className="text-sm text-magenta">{link.label}</b>
                    <span className="mt-1 block text-[10px] leading-4 text-ink/55">
                      {link.help}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          {showsRecordLifecycle || category === "test_data_maintenance" ? (
            <RecordLifecycleManager />
          ) : null}
          {category === "configuration_history" ? (
            <section className="rounded-[15px] border border-plum/10 bg-white p-5">
              <div className="flex items-center gap-2">
                <History className="text-magenta" />
                <h3 className="font-serif text-2xl text-plum">
                  Recent configuration history
                </h3>
              </div>
              <div className="mt-4 space-y-2">
                {history.slice(0, 40).map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-plum/10 p-3 text-xs"
                  >
                    <span>
                      <b>
                        {settings.find((row) => row.id === item.setting_id)
                          ?.display_name || "Retired setting"}
                      </b>
                      <span className="ml-2 text-ink/50">
                        {item.action} · version {item.version} ·{" "}
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                      {item.reason ? (
                        <span className="mt-1 block text-[10px] text-ink/50">
                          {item.reason}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
                {!history.length ? (
                  <p className="text-xs text-ink/50">
                    History begins after the first Engine edit.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
          {selected &&
          versions.length &&
          category !== "configuration_history" ? (
            <section className="rounded-[15px] border border-plum/10 bg-white p-5">
              <div className="flex items-center gap-2">
                <Clock3 className="text-magenta" />
                <h3 className="font-serif text-xl text-plum">
                  Version history
                </h3>
              </div>
              <div className="mt-3 space-y-2">
                {versions.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-plum/10 p-3 text-xs"
                  >
                    <span>
                      <b>
                        {item.action} · version {item.version}
                      </b>
                      <span className="mt-1 block text-[10px] text-ink/50">
                        {new Date(item.created_at).toLocaleString()} ·{" "}
                        {friendlyValue(item.value)}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={
                        busy || selected.published_version === item.version
                      }
                      onClick={() => void change("rollback", item.version)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-magenta px-3 text-[10px] font-bold text-magenta disabled:opacity-40"
                    >
                      <RotateCcw size={13} />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
              {versions.some(
                (item) =>
                  item.version < selected.published_version &&
                  ["Published", "Rolled back"].includes(item.action),
              ) ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-4">
                  <h4 className="font-bold text-red-800">
                    Emergency last-known-good recovery
                  </h4>
                  <p className="mt-1 text-[10px] leading-4 text-ink/60">
                    Super Admin only. This immediately republishes the preceding
                    published version, records the reason, and invalidates
                    configuration caches.
                  </p>
                  <label className="mt-3 block text-xs font-bold">
                    Type REVERT {selected.setting_key}
                    <input
                      value={emergencyConfirmation}
                      onChange={(event) =>
                        setEmergencyConfirmation(event.target.value)
                      }
                      className="mt-1 min-h-11 w-full rounded-lg border border-red-200 bg-white px-3 font-normal"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      reason.trim().length < 8 ||
                      emergencyConfirmation !== `REVERT ${selected.setting_key}`
                    }
                    onClick={() => void emergencyRevert()}
                    className="mt-3 min-h-11 rounded-lg bg-red-700 px-5 text-xs font-bold text-white disabled:opacity-40"
                  >
                    <RotateCcw className="mr-2 inline" size={14} />
                    Emergency revert
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function TypedEditor({
  setting,
  value,
  onChange,
}: {
  setting: Setting;
  value: string;
  onChange: (value: string) => void;
}) {
  if (setting.value_type === "boolean")
    return (
      <label className="inline-flex min-h-11 items-center gap-3 rounded-xl border border-plum/15 px-4 text-sm font-bold">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(event) => onChange(String(event.target.checked))}
          className="accent-magenta"
        />
        {value === "true" ? "Enabled" : "Disabled"}
      </label>
    );
  if (setting.value_type === "color")
    return (
      <div className="flex gap-3">
        <input
          aria-label="Choose color"
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#5B1A6B"}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-16 rounded-lg border p-1"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={7}
          className="min-h-11 flex-1 rounded-lg border border-plum/15 px-3"
        />
      </div>
    );
  if (["number", "percentage", "currency"].includes(setting.value_type)) {
    const min = setting.validation?.min as number | undefined;
    const max = setting.validation?.max as number | undefined;
    return (
      <label className="block text-xs font-bold">
        Value
        {setting.value_type === "percentage"
          ? " (%)"
          : setting.value_type === "currency"
            ? " (USD)"
            : ""}
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={setting.validation?.integer ? 1 : 0.01}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              /[eE+]/.test(event.key) ||
              (event.key === "-" && Number(min ?? 0) >= 0)
            )
              event.preventDefault();
          }}
          className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal"
        />
      </label>
    );
  }
  if (
    [
      "rich_text",
      "list",
      "reorderable_list",
      "template",
      "schedule",
      "relationship",
    ].includes(setting.value_type)
  )
    return (
      <label className="block text-xs font-bold">
        {["list", "reorderable_list"].includes(setting.value_type)
          ? "One item per line"
          : "Value"}
        <textarea
          rows={setting.value_type === "rich_text" ? 7 : 5}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 w-full rounded-lg border border-plum/15 p-3 font-normal"
        />
      </label>
    );
  return (
    <label className="block text-xs font-bold">
      Value
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal"
      />
    </label>
  );
}
