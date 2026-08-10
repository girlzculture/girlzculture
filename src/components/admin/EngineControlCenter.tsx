"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { ENGINE_CATEGORIES, ENGINE_SECTIONS } from "@/lib/engineManifest";
import AiAutomationManager from "@/components/admin/AiAutomationManager";
import SystemStatusManager from "@/components/admin/SystemStatusManager";
import ErrorMonitoringManager from "@/components/admin/ErrorMonitoringManager";
import NavigationMenuManager from "@/components/admin/NavigationMenuManager";
import NotificationTemplateManager from "@/components/admin/NotificationTemplateManager";
import BrandAppearanceManager from "@/components/admin/BrandAppearanceManager";
import NumericInput from "@/components/forms/NumericInput";

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
type EngineSearchResult =
  | {
      key: string;
      kind: "setting";
      label: string;
      detail: string;
      setting: Setting;
    }
  | {
      key: string;
      kind: "section";
      label: string;
      detail: string;
      sectionId: string;
    }
  | {
      key: string;
      kind: "route";
      label: string;
      detail: string;
      href: string;
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

function previewDestination(setting: Setting) {
  if (setting.category === "branding_design") return "/";
  if (
    ["pages_sections", "navigation_menus", "homepage_composition"].includes(
      setting.category,
    )
  )
    return "/";
  if (
    ["search_discovery", "markets_service_areas", "service_taxonomies"].includes(
      setting.category,
    )
  )
    return "/salons";
  if (setting.category === "payments_subscriptions") return "/pricing";
  if (setting.category === "languages_translations") return "/";
  return "";
}

export default function EngineControlCenter({ initialRecordId }: { initialRecordId?: string } = {}) {
  const initialSettingId = initialRecordId?.startsWith("setting-") ? initialRecordId.slice("setting-".length) : "";
  const initialCategory = initialRecordId?.startsWith("category-") ? initialRecordId.slice("category-".length) : "overview";
  const isSettingRoute = Boolean(initialSettingId);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [history, setHistory] = useState<Version[]>([]);
  const [environmentStatus, setEnvironmentStatus] = useState<
    EnvironmentStatus[]
  >([]);
  const [environment, setEnvironment] = useState("development");
  const [category, setCategory] = useState(initialCategory);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
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
  const searchRoot = useRef<HTMLDivElement>(null);
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
        preferred || initialSettingId ||
        selectedId ||
        rows.find((row: Setting) =>
          ENGINE_SECTIONS.find((section) => section.id === category)
            ?.categories.includes(row.category),
        )?.id ||
        rows[0]?.id ||
        "";
      setSelectedId(id);
      const row = rows.find((item: Setting) => item.id === id);
      if (row) {
        const section = ENGINE_SECTIONS.find((item) => item.categories.includes(row.category));
        if (section) setCategory(section.id);
        setEditor(editorText(row));
      }
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
    const timer = window.setTimeout(() => void load(initialSettingId), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = settings.find((row) => row.id === selectedId) || null;
  const selectedCategory = ENGINE_SECTIONS.find(
    (item) => item.id === category,
  );
  const activeCategories = selectedCategory?.categories || [];
  const searchResults = useMemo<EngineSearchResult[]>(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    const settingResults: EngineSearchResult[] = settings
      .filter((row) =>
        [
          row.display_name,
          row.description,
          row.help_text,
          row.setting_key,
          row.category,
          ...(row.affected_surfaces || []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 8)
      .map((setting) => ({
        key: `setting:${setting.id}`,
        kind: "setting" as const,
        label: setting.display_name,
        detail: `${setting.setting_key} · ${setting.category.replaceAll("_", " ")}`,
        setting,
      }));
    const sectionResults: EngineSearchResult[] = ENGINE_SECTIONS.filter(
      (section) =>
        `${section.label} ${section.description} ${section.categories.join(" ")}`
          .toLowerCase()
          .includes(normalized),
    )
      .slice(0, 5)
      .map((section) => ({
        key: `section:${section.id}`,
        kind: "section" as const,
        label: section.label,
        detail: section.description,
        sectionId: section.id,
      }));
    const linkedRoutes = [
      ...ENGINE_SECTIONS.flatMap((section) => section.links || []),
      ...ENGINE_CATEGORIES.flatMap((item) => item.links || []),
      {
        label: "Founder handbook",
        href: "#founder-handbook",
        help: "Search publishing, integrations, recovery, security, and operational-error guidance.",
      },
      {
        label: "System status and provider health",
        href: "#system-status",
        help: "Inspect connected-provider configuration and operational readiness.",
      },
      {
        label: "Operational errors",
        href: "#operational-errors",
        help: "Inspect deduplicated protected Engine events and their reference IDs.",
      },
    ];
    const routeResults: EngineSearchResult[] = linkedRoutes
      .filter((item) =>
        `${item.label} ${item.help} ${item.href}`
          .toLowerCase()
          .includes(normalized),
      )
      .filter(
        (item, index, array) =>
          array.findIndex((candidate) => candidate.href === item.href) === index,
      )
      .slice(0, 5)
      .map((item) => ({
        key: `route:${item.href}`,
        kind: "route" as const,
        label: item.label,
        detail: item.help,
        href: item.href,
      }));
    return [...settingResults, ...sectionResults, ...routeResults].slice(0, 15);
  }, [query, settings]);
  useEffect(() => {
    function closeSearch(event: PointerEvent) {
      if (!searchRoot.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeSearch);
    return () => document.removeEventListener("pointerdown", closeSearch);
  }, []);
  const showsRecordLifecycle = [
    "pages_navigation",
    "content_wording",
    "services_catalog",
    "salon_operations",
    "promotions",
    "locations",
    "data_management",
    "security_access",
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
  const visible = settings.filter(
    (row) =>
      row.setting_key !== "languages.supported" &&
      (query
        ? `${row.display_name} ${row.description} ${row.help_text} ${row.category}`
            .toLowerCase()
            .includes(query.toLowerCase())
        : activeCategories.includes(row.category)),
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
    if (initialRecordId && !isSettingRoute) {
      const context = `/admin/engine/category-${encodeURIComponent(category)}`;
      window.location.assign(`/admin/engine/setting-${encodeURIComponent(String(row.id))}?return=${encodeURIComponent(context)}`);
      return;
    }
    if (row.id !== selectedId && !canLeaveDraft()) return;
    const section = ENGINE_SECTIONS.find((item) =>
      item.categories.includes(row.category),
    );
    if (section) setCategory(section.id);
    setSelectedId(row.id);
    setEditor(editorText(row));
    setReason("");
    setConfirmed(false);
    setMessage("");
  }
  function chooseCategory(next: string) {
    if (next === category || !canLeaveDraft()) return;
    setCategory(next);
    const section = ENGINE_SECTIONS.find((item) => item.id === next);
    const row = settings.find((item) =>
      section?.categories.includes(item.category),
    );
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
  function chooseSearchResult(result: EngineSearchResult) {
    if (result.kind === "setting") {
      choose(result.setting);
      setQuery("");
      setSearchOpen(false);
      window.requestAnimationFrame(() =>
        document
          .getElementById("engine-selected-control")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
      return;
    }
    if (result.kind === "section") {
      chooseCategory(result.sectionId);
      setQuery("");
      setSearchOpen(false);
      return;
    }
    if (result.href.startsWith("#")) {
      if (result.href === "#founder-handbook") chooseCategory("help");
      if (result.href === "#system-status") chooseCategory("system_health");
      setQuery("");
      setSearchOpen(false);
      window.requestAnimationFrame(() =>
        document
          .querySelector(result.href)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
      return;
    }
    window.location.assign(result.href);
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
      <section className={`${isSettingRoute ? "hidden" : ""} rounded-[18px] border border-teal/20 bg-[linear-gradient(125deg,#0D1114,#0083A6)] p-5 text-white shadow-[0_18px_55px_rgba(13,17,20,.12)] sm:p-7`}>
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
      <div className={`grid gap-5 ${isSettingRoute ? "" : "xl:grid-cols-[280px_minmax(0,1fr)]"}`}>
        <aside className={`${isSettingRoute ? "hidden" : ""} rounded-[15px] border border-plum/10 bg-white p-3`}>
          <div ref={searchRoot} className="relative">
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-plum/15 px-3 focus-within:border-teal">
              <Search size={15} />
              <input
                type="search"
                role="combobox"
                aria-label="Search all Engine controls"
                aria-autocomplete="list"
                aria-expanded={searchOpen && searchResults.length > 0}
                aria-controls="engine-control-search-results"
                aria-activedescendant={
                  searchOpen && searchResults[activeSearchIndex]
                    ? `engine-search-result-${activeSearchIndex}`
                    : undefined
                }
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  setActiveSearchIndex(0);
                  setQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setSearchOpen(false);
                    return;
                  }
                  if (event.key === "ArrowDown" && searchResults.length) {
                    event.preventDefault();
                    setSearchOpen(true);
                    setActiveSearchIndex((index) =>
                      Math.min(searchResults.length - 1, index + 1),
                    );
                    return;
                  }
                  if (event.key === "ArrowUp" && searchResults.length) {
                    event.preventDefault();
                    setSearchOpen(true);
                    setActiveSearchIndex((index) => Math.max(0, index - 1));
                    return;
                  }
                  if (event.key === "Enter" && searchResults.length) {
                    event.preventDefault();
                    chooseSearchResult(
                      searchResults[
                        searchOpen
                          ? Math.min(
                              activeSearchIndex,
                              searchResults.length - 1,
                            )
                          : 0
                      ],
                    );
                  }
                }}
                placeholder="Search all Engine controls"
                className="min-w-0 flex-1 text-xs outline-none"
              />
            </label>
            {searchOpen && query.trim().length >= 2 ? (
              <div
                id="engine-control-search-results"
                role="listbox"
                className="absolute inset-x-0 top-full z-40 mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-charcoal/10 bg-white p-1 shadow-[0_18px_45px_rgba(13,17,20,.18)]"
              >
                {searchResults.length ? (
                  searchResults.map((result, index) => (
                    <button
                      id={`engine-search-result-${index}`}
                      key={result.key}
                      type="button"
                      role="option"
                      aria-selected={index === activeSearchIndex}
                      onMouseEnter={() => setActiveSearchIndex(index)}
                      onClick={() => chooseSearchResult(result)}
                      className={`block min-h-12 w-full rounded-lg px-3 py-2 text-left ${
                        index === activeSearchIndex
                          ? "bg-subtle"
                          : "hover:bg-subtle/70"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <b className="text-xs text-charcoal">{result.label}</b>
                        <span className="rounded-full bg-mist px-2 py-0.5 text-[9px] font-bold uppercase text-charcoal/65">
                          {result.kind}
                        </span>
                      </span>
                      <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-charcoal/55">
                        {result.detail}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="p-4 text-center text-xs text-charcoal/55">
                    No Engine control, section, integration, or handbook entry
                    matches this search.
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <nav
            aria-label="Engine areas"
            className="mt-3 max-h-[680px] space-y-1 overflow-y-auto"
          >
            {ENGINE_SECTIONS.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => chooseCategory(item.id)}
                className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-[11px] ${category === item.id ? "bg-blush font-bold text-plum" : "hover:bg-cream"}`}
              >
                <span>{item.label}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[9px]">
                  {
                    settings.filter((row) =>
                      item.categories.includes(row.category),
                    ).length
                  }
                </span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 space-y-4">
          <div className={`${isSettingRoute ? "hidden" : ""} rounded-[15px] border border-plum/10 bg-white p-5`}>
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
                      <span className="flex flex-wrap justify-end gap-1">
                        <span className="rounded-full bg-blush px-2 py-1 text-[8px] font-bold text-plum">
                          {row.status || "Draft"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-[8px] font-bold ${highImpact.has(row.impact_level) ? "bg-amber/20 text-[#7b4a00]" : "bg-cream text-ink/55"}`}
                        >
                          {row.impact_level}
                        </span>
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
          {selected && activeCategories.includes(selected.category) ? (
            <section id="engine-selected-control" className="scroll-mt-24 rounded-[15px] border border-plum/10 bg-white p-5">
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
                  {selected.status || "Draft"} ·{" "}
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
                      onClick={() => {
                        const destination = previewDestination(selected);
                        if (destination) {
                          window.open(destination, "_blank", "noopener");
                          setMessage(
                            "Preview opened in a new tab. Draft-only values remain private until published.",
                          );
                        } else {
                          setMessage(
                            `Draft preview: ${friendlyValue(requestValue(selected))}. Review the affected surfaces below before publication.`,
                          );
                        }
                      }}
                      className="min-h-11 rounded-lg border border-plum/15 px-5 text-xs font-bold text-plum"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void change("save_draft")}
                      className="min-h-11 rounded-lg border border-magenta px-5 text-xs font-bold text-magenta"
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      disabled={busy || (impactHigh && reason.trim().length < 8)}
                      onClick={() => {
                        setConfirmed(true);
                        setMessage(
                          `Review ready: ${selected.display_name} affects ${selected.affected_surfaces?.join(", ") || "the listed platform behavior"}. Publish only after checking the preview and change reason.`,
                        );
                      }}
                      className="min-h-11 rounded-lg border border-magenta px-5 text-xs font-bold text-magenta disabled:opacity-45"
                    >
                      Review
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
                      Publish
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
          {!isSettingRoute && category === "overview" ? (
            <EngineOverview
              settings={settings}
              environmentStatus={environmentStatus}
              onNavigate={chooseCategory}
            />
          ) : null}
          {!isSettingRoute && category === "salon_operations" ? <SalonLifecycleSettings /> : null}
          {!isSettingRoute && category === "brand_design" ? <><BrandAppearanceManager /><MediaRulesSettings /></> : null}
          {!isSettingRoute && category === "locations" ? <SearchLanguageSettings /> : null}
          {!isSettingRoute && category === "languages" ? (
            <TranslationManager />
          ) : null}
          {!isSettingRoute && category === "pages_navigation" ? <NavigationMenuManager /> : null}
          {!isSettingRoute && category === "notifications" ? <NotificationTemplateManager /> : null}
          {!isSettingRoute && category === "ai" ? <AiAutomationManager /> : null}
          {!isSettingRoute && category === "integrations" ? <SystemStatusManager /> : null}
          {!isSettingRoute && category === "system_health" ? (
            <>
              <div id="operational-errors" className="scroll-mt-24">
                <ErrorMonitoringManager />
              </div>
              <div id="system-status" className="scroll-mt-24">
                <SystemStatusManager />
              </div>
            </>
          ) : null}
          {!isSettingRoute && category === "data_management" ? <TestDataManager /> : null}
          {!isSettingRoute && category === "help" ? <FounderHandbook /> : null}
          {!isSettingRoute && selectedCategory?.links?.length ? (
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
          {!isSettingRoute && showsRecordLifecycle ? (
            <RecordLifecycleManager />
          ) : null}
          {!isSettingRoute && category === "data_management" ? (
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
          category !== "data_management" ? (
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

function EngineOverview({
  settings,
  environmentStatus,
  onNavigate,
}: {
  settings: Setting[];
  environmentStatus: EnvironmentStatus[];
  onNavigate: (section: string) => void;
}) {
  const [urgentEvents, setUrgentEvents] = useState<
    Array<{
      id: string;
      severity: string;
      occurrence_count?: number;
      presentation?: { title?: string };
      user_safe_message?: string;
    }>
  >([]);
  const [errorStatus, setErrorStatus] = useState("Checking monitored errors…");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const session = await getSessionForScope("admin");
        if (!session) throw new Error("Admin session expired.");
        const response = await fetch("/api/admin/engine/errors?status=Open", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok) throw new Error("Unable to check monitored errors.");
        if (!active) return;
        const events = Array.isArray(body.events) ? body.events : [];
        setUrgentEvents(
          events.filter((event: { severity?: unknown }) =>
            ["critical", "high"].includes(String(event.severity).toLowerCase()),
          ),
        );
        setErrorStatus("Current deduplicated operational events");
      } catch {
        if (active)
          setErrorStatus(
            "Error status could not be checked. Open System Health & Errors.",
          );
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const draftCount = settings.filter((setting) =>
    /draft/i.test(setting.status),
  ).length;
  const unpublishedCount = settings.filter(
    (setting) => setting.version > setting.published_version,
  ).length;
  const missingIntegrations = environmentStatus.filter(
    (status) => !status.configured,
  ).length;
  const urgentOccurrences = urgentEvents.reduce(
    (total, event) => total + Number(event.occurrence_count || 1),
    0,
  );

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Working drafts",
            value: draftCount,
            help: "Saved changes that are not live.",
            section: "content_wording",
          },
          {
            label: "Awaiting publication",
            value: unpublishedCount,
            help: "Settings whose working version is newer than the published version.",
            section: "data_management",
          },
          {
            label: "Configuration needed",
            value: missingIntegrations,
            help: "Deployment integrations without a configured status.",
            section: "integrations",
          },
          {
            label: "Urgent error occurrences",
            value: urgentOccurrences,
            help: errorStatus,
            section: "system_health",
          },
        ].map((card) => (
          <button
            type="button"
            key={card.label}
            onClick={() => onNavigate(card.section)}
            className={`rounded-[15px] border p-5 text-left transition hover:border-magenta ${
              card.section === "system_health" && card.value
                ? "border-red-300 bg-red-50"
                : "border-plum/10 bg-white"
            }`}
          >
            <p className="text-[9px] font-bold uppercase tracking-[.12em] text-ink/45">
              {card.label}
            </p>
            <p className="mt-2 font-serif text-3xl text-plum">{card.value}</p>
            <p className="mt-2 text-[10px] leading-4 text-ink/55">
              {card.help}
            </p>
          </button>
        ))}
      </section>

      <section
        className={`rounded-[15px] border p-5 ${
          urgentEvents.length
            ? "border-red-300 bg-red-50"
            : "border-plum/10 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle
                size={20}
                className={
                  urgentEvents.length ? "text-red-700" : "text-green-700"
                }
              />
              <h3 className="font-serif text-xl text-plum">
                Critical and high errors
              </h3>
            </div>
            <p className="mt-1 text-xs text-ink/55">{errorStatus}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("system_health")}
            className="min-h-10 rounded-lg bg-magenta px-4 text-xs font-bold text-white"
          >
            Open Error Monitoring
          </button>
        </div>
        {urgentEvents.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {urgentEvents.slice(0, 4).map((event) => (
              <article
                key={event.id}
                className="rounded-xl border border-red-200 bg-white p-3"
              >
                <span className="rounded-full bg-red-100 px-2 py-1 text-[8px] font-bold uppercase text-red-800">
                  {event.severity}
                </span>
                <p className="mt-2 text-xs font-bold text-plum">
                  {event.presentation?.title ||
                    event.user_safe_message ||
                    "Platform operation needs attention"}
                </p>
                <p className="mt-1 text-[9px] text-ink/50">
                  {event.occurrence_count || 1} grouped occurrence
                  {Number(event.occurrence_count || 1) === 1 ? "" : "s"}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-cream p-4 text-xs text-ink/60">
            No open critical or high operational event was returned.
          </p>
        )}
      </section>

      <section className="rounded-[15px] border border-plum/10 bg-white p-5">
        <h3 className="font-serif text-xl text-plum">Founder workflow</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["1. Preview", "Review the affected public or dashboard surface."],
            ["2. Save Draft", "Keep work private while wording and impact are reviewed."],
            ["3. Review", "Confirm affected surfaces, validation, and high-impact warnings."],
            ["4. Publish", "Make the reviewed version active and record the actor and reason."],
            ["5. Restore", "Return to a known-good published version without deleting history."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl bg-cream p-4">
              <b className="text-xs text-plum">{title}</b>
              <p className="mt-1 text-[10px] leading-4 text-ink/55">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FounderHandbook() {
  const [handbookQuery, setHandbookQuery] = useState("");
  const workflowEntries = [
    {
      title: "Preview, Save Draft, Review, Publish, and Restore",
      body: "Preview checks the affected surface without making a change live. Save Draft stores private working values. Review the impact, validation, affected surfaces, and change reason. Publish activates the reviewed version and records who did it. Restore republishes a known-good historical version without deleting audit history.",
    },
    {
      title: "Understanding fields and status",
      body: "Editable controls are clearly separated from read-only provider or database facts. Each setting explains what it changes, where it appears, its working version, published version, validation limits, impact level, and Draft or Published state. Secret-status controls never reveal the secret value.",
    },
    {
      title: "Connecting an integration",
      body: "Open Integrations, read the required environment-variable names and setup instructions, configure values only in the approved deployment provider, then use Test Connection. Never paste a token, password, private key, card detail, or full provider payload into an Engine field or support ticket.",
    },
    {
      title: "Responding to an operational error",
      body: "Open System Health & Errors from the visible Overview alert. Use the matching reference ID, affected feature, route or action, salon context, occurrence count, impact, and recommended action. Assign the event, record sanitized notes, verify the fix, then resolve it. Repeated root causes stay grouped while counts and timestamps advance.",
    },
    {
      title: "Configuration recovery",
      body: "Use ordinary Restore for a reviewed historical version. Emergency last-known-good recovery is Super Admin only, requires the exact confirmation phrase and reason, advances the revision, invalidates configuration caches, and preserves every prior version.",
    },
    {
      title: "Imports, exports, and protected data",
      body: "Exports contain published non-secret configuration. Imports are validated previews and create drafts only. Financial history, authentication secrets, provider credentials, production records, and audit evidence cannot be overwritten through configuration import.",
    },
  ];
  const entries = [
    ...ENGINE_SECTIONS.map((section) => ({
      title: section.label,
      body: `${section.description} Open this section from the Engine index. Controls explain their affected surfaces and publication impact; connected record workspaces are linked when a structured editor is safer than a generic field.`,
    })),
    ...workflowEntries,
  ];
  const normalized = handbookQuery.trim().toLowerCase();
  const visibleEntries = entries.filter(
    (entry) =>
      !normalized ||
      `${entry.title} ${entry.body}`.toLowerCase().includes(normalized),
  );
  return (
    <section
      id="founder-handbook"
      className="rounded-[15px] border border-plum/10 bg-white p-5"
    >
      <h3 className="font-serif text-2xl text-plum">Founder handbook</h3>
      <p className="mt-1 max-w-3xl text-xs leading-5 text-ink/55">
        Plain-language guidance for Engine sections, controls, publishing,
        integrations, recovery, and monitored errors.
      </p>
      <label className="mt-4 flex min-h-11 items-center gap-2 rounded-lg border border-plum/15 px-3">
        <Search size={15} className="text-magenta" />
        <span className="sr-only">Search founder handbook</span>
        <input
          type="search"
          value={handbookQuery}
          onChange={(event) => setHandbookQuery(event.target.value)}
          placeholder="Search sections, publishing, integrations, or errors"
          className="min-w-0 flex-1 text-xs outline-none"
        />
      </label>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {visibleEntries.map((entry) => (
          <details
            key={entry.title}
            className="rounded-xl border border-plum/10 p-4 open:bg-cream/40"
          >
            <summary className="cursor-pointer text-xs font-bold text-plum">
              {entry.title}
            </summary>
            <p className="mt-3 text-[11px] leading-5 text-ink/65">
              {entry.body}
            </p>
          </details>
        ))}
      </div>
      {!visibleEntries.length ? (
        <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-xs text-ink/50">
          No handbook topic matches that search.
        </p>
      ) : null}
    </section>
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
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#0083A6"}
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
        <NumericInput
          integer={setting.validation?.integer === true}
          allowNegative={Number(min ?? 0) < 0}
          decimalPlaces={setting.validation?.integer ? 0 : 2}
          min={min}
          max={max}
          value={value}
          onValueChange={onChange}
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
