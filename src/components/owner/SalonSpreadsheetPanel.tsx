"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { readApiResponse } from "@/lib/apiResponseClient";
import { getSessionForScope } from "@/lib/supabase";

type SpreadsheetKind = "services" | "products";
type ImportedRecord = Record<string, unknown> & { id?: string };
type ValidationError = { row: number; messages: string[] };

export default function SalonSpreadsheetPanel({
  kind,
  onImported,
}: {
  kind: SpreadsheetKind;
  onImported: (records: ImportedRecord[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<"success" | "error">("success");
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const label = kind === "services" ? "Styles & Pricing" : "Products";

  async function authorization() {
    const session = await getSessionForScope("salon");
    if (!session?.access_token) {
      throw new Error("Your salon session expired. Please sign in again.");
    }
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function downloadWorkbook(mode: "template" | "export") {
    setBusy(true);
    setNotice("");
    setNoticeKind("success");
    setErrors([]);
    try {
      const response = await fetch(
        `/api/salon/catalog-spreadsheet?kind=${kind}&mode=${mode}`,
        {
          headers: await authorization(),
          cache: "no-store",
        },
      );
      if (!response.ok) {
        const body = await readApiResponse(
          response,
          `The ${label} spreadsheet could not be downloaded.`,
        );
        throw new Error(
          String(
            body.error || `The ${label} spreadsheet could not be downloaded.`,
          ),
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        mode === "template"
          ? `girlz-culture-salon-${kind}-template.xlsx`
          : `girlz-culture-salon-${kind}-${new Date()
              .toISOString()
              .slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(
        mode === "template"
          ? `${label} template downloaded.`
          : `Current ${label.toLowerCase()} exported.`,
      );
    } catch (error) {
      setNoticeKind("error");
      setNotice(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  async function importAndSave() {
    if (!file) {
      setNoticeKind("error");
      setNotice("Choose an .xlsx or .csv file first.");
      return;
    }
    setBusy(true);
    setNotice("");
    setNoticeKind("success");
    setErrors([]);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const response = await fetch("/api/salon/catalog-spreadsheet", {
        method: "POST",
        headers: await authorization(),
        body: form,
      });
      const body = await readApiResponse(
        response,
        `The ${label} spreadsheet could not be imported.`,
      );
      const validationErrors = Array.isArray(body.validation_errors)
        ? (body.validation_errors as ValidationError[])
        : [];
      if (!response.ok) {
        setErrors(validationErrors);
        setNoticeKind("error");
        throw new Error(
          String(body.error || `${label} import failed.`),
        );
      }
      const records = Array.isArray(body.records)
        ? (body.records as ImportedRecord[])
        : [];
      const result =
        body.result && typeof body.result === "object"
          ? (body.result as Record<string, unknown>)
          : {};
      onImported(records);
      setFile(null);
      setInputKey((value) => value + 1);
      setNotice(
        `${label} import saved and verified: ${Number(
          result.created || 0,
        )} created and ${Number(result.updated || 0)} updated.`,
      );
    } catch (error) {
      setNoticeKind("error");
      setNotice(
        error instanceof Error ? error.message : `${label} import failed.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 rounded-[12px] border border-teal/25 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-teal">
            <FileSpreadsheet size={15} aria-hidden="true" />
            Spreadsheet import & export
          </div>
          <h2 className="mt-1 font-serif text-xl text-plum">{label}</h2>
          <p className="mt-1 max-w-2xl text-xs text-ink/60">
            Download the template, fill it in, choose the completed file, then
            select Import &amp; Save. Images remain managed separately.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void downloadWorkbook("template")}
            className="inline-flex min-h-10 items-center gap-2 rounded-[8px] border border-teal px-4 text-xs font-bold text-teal gc-disabled-control"
          >
            <Download size={14} />
            Download Template
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void downloadWorkbook("export")}
            className="inline-flex min-h-10 items-center gap-2 rounded-[8px] border border-plum/20 px-4 text-xs font-bold text-plum gc-disabled-control"
          >
            <Download size={14} />
            Export Current {kind === "services" ? "Services" : "Products"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold">
            Completed Excel or CSV file
          </span>
          <input
            key={inputKey}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setErrors([]);
              setNotice("");
              setNoticeKind("success");
            }}
            className="block min-h-11 w-full rounded-[8px] border border-plum/15 bg-white px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-teal/10 file:px-3 file:py-1.5 file:font-bold file:text-teal"
          />
        </label>
        <button
          type="button"
          disabled={busy || !file}
          onClick={() => void importAndSave()}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-[8px] bg-teal px-6 text-xs font-bold text-white gc-disabled-control"
        >
          <Upload size={15} />
          {busy ? "Working…" : "Import & Save"}
        </button>
      </div>

      {notice ? (
        <div
          role="status"
          className={`mt-3 rounded-[8px] border px-3 py-2 text-xs ${
            noticeKind === "error"
              ? "border-red-200 bg-red-50 gc-text-danger"
              : "border-teal/20 bg-teal/5 text-ink"
          }`}
        >
          {notice}
        </div>
      ) : null}

      {errors.length ? (
        <div className="mt-3 max-h-64 overflow-auto rounded-[8px] border border-red-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-[11px]">
            <thead className="sticky top-0 bg-red-50 gc-text-danger">
              <tr>
                <th className="p-3">Spreadsheet row</th>
                <th className="p-3">What needs to be corrected</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((error) => (
                <tr key={error.row} className="border-t border-red-100">
                  <td className="p-3 font-bold">{error.row}</td>
                  <td className="p-3">{error.messages.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
