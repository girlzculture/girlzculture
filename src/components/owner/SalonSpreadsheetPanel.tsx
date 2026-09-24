"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { readApiResponse } from "@/lib/apiResponseClient";
import { getSessionForScope } from "@/lib/supabase";

type SpreadsheetKind = "services" | "products";
type ImportedRecord = Record<string, unknown> & { id?: string };
type ValidationError = { row: number; messages: string[] };
type Sheet = { name: string; header_row: number; headers: { column: number; label: string; field: string }[]; rows: number };
type Mapping = { sheet: string; header_row: number; columns: Record<string, number>; duration_unit: "hours" | "minutes"; category: string; service_group: string; source_headers: { column: number; label: string }[] };
type Inspection = { fields: string[]; sheets: Sheet[]; catalog?: { categories: { id: string; name: string }[]; groups: { id: string; category_id: string; name: string }[] } };

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
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [preview, setPreview] = useState<ImportedRecord[] | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const label = kind === "services" ? "Services & Pricing" : "Products";

  function selectSheet(sheet: Sheet) {
    const columns: Record<string, number> = {};
    for (const header of sheet.headers) if (header.field && !columns[header.field]) columns[header.field] = header.column;
    setMapping({ sheet: sheet.name, header_row: sheet.header_row, columns, duration_unit: sheet.headers.some(header => /duration.*min/i.test(header.label)) ? "minutes" : "hours", category: "", service_group: "", source_headers: sheet.headers.map(({ column, label }) => ({ column, label })) });
    setPreview(null); setReviewed(false);
  }
  function updateMapping(change: Partial<Mapping>) {
    setMapping(current => current ? { ...current, ...change } : current); setPreview(null); setReviewed(false);
  }

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

  async function importAndSave(mode: "inspect" | "preview" | "save", reloadHeading = false) {
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
      form.set("mode", mode);
      if (reloadHeading && mapping) { form.set("heading_sheet", mapping.sheet); form.set("heading_row", String(mapping.header_row)); }
      if (mapping) form.set("mapping", JSON.stringify(mapping));
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
      if (mode === "inspect") {
        const inspected = body as unknown as Inspection;
        setInspection(inspected);
        const selected = reloadHeading ? inspected.sheets.find(sheet => sheet.name === mapping?.sheet) : inspected.sheets[0];
        if (selected) selectSheet(selected);
        setNotice("Match your own headings to the fields below. Unmapped columns are not imported. Nothing has been saved.");
        return;
      }
      if (mode === "preview") {
        setPreview((Array.isArray(body.preview) ? body.preview : []) as ImportedRecord[]); setPreviewPage(0); setReviewed(false);
        setNotice("Review the parsed rows, prices and durations. Nothing has been saved yet.");
        return;
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
      setInspection(null); setMapping(null); setPreview(null); setReviewed(false);
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
            Use your own Excel or CSV headings and column order. Match the fields,
            review the parsed rows, then save. The template is optional. Images remain managed separately.
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
              setInspection(null); setMapping(null); setPreview(null); setReviewed(false);
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
          onClick={() => void importAndSave("inspect")}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-[8px] bg-teal px-6 text-xs font-bold text-white gc-disabled-control"
        >
          <Upload size={15} />
          {busy ? "Working…" : "Review columns"}
        </button>
      </div>

      {inspection && mapping ? <section className="mt-5 rounded-xl border border-border p-4" aria-label="Spreadsheet column mapping">
        <div className="mb-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Worksheet<select disabled={busy} value={mapping.sheet} onChange={event => { const sheet = inspection.sheets.find(item => item.name === event.target.value); if (sheet) selectSheet(sheet); }} className="mt-1 min-h-11 w-full border bg-white px-3">{inspection.sheets.map(sheet => <option key={sheet.name}>{sheet.name}</option>)}</select></label><label className="text-sm font-semibold">Heading row<input disabled={busy} type="number" min={1} max={100} value={mapping.header_row} onChange={event => updateMapping({ header_row: Number(event.target.value) })} className="mt-1 min-h-11 w-full border px-3"/></label></div>
        <button type="button" disabled={busy} onClick={() => void importAndSave("inspect", true)} className="mb-4 min-h-10 rounded-lg border px-4 text-sm font-semibold">Reload headings from this row</button>
        <div className="grid gap-3 sm:grid-cols-2">{inspection.sheets.find(sheet => sheet.name === mapping.sheet)?.headers.map(header => <label key={header.column} className="text-sm font-semibold"><span data-no-translate>{header.label || `Column ${header.column}`}</span><select disabled={busy} value={Object.entries(mapping.columns).find(([, column]) => column === header.column)?.[0] || ""} onChange={event => { const columns = Object.fromEntries(Object.entries(mapping.columns).filter(([, column]) => column !== header.column)); if (event.target.value) columns[event.target.value] = header.column; updateMapping({ columns }); }} className="mt-1 min-h-11 w-full border bg-white px-3"><option value="">Not imported</option>{inspection.fields.map(field => <option key={field} value={field}>{field.replaceAll("_", " ")}</option>)}</select></label>)}</div>
        {kind === "services" ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold">Numeric duration unit<select disabled={busy} value={mapping.duration_unit} onChange={event => updateMapping({ duration_unit: event.target.value as "hours" | "minutes" })} className="mt-1 min-h-11 w-full border bg-white px-3"><option value="hours">Hours (e.g. 1.5)</option><option value="minutes">Minutes (e.g. 90)</option></select></label><label className="text-sm font-semibold">Category for blank cells<select disabled={busy} value={mapping.category} onChange={event => updateMapping({ category: event.target.value, service_group: "" })} className="mt-1 min-h-11 w-full border bg-white px-3"><option value="">Use spreadsheet category</option>{inspection.catalog?.categories.map(category => <option key={category.id}>{category.name}</option>)}</select></label><label className="text-sm font-semibold">Service group for blank cells<select disabled={busy} value={mapping.service_group} onChange={event => updateMapping({ service_group: event.target.value })} className="mt-1 min-h-11 w-full border bg-white px-3"><option value="">Use spreadsheet group</option>{inspection.catalog?.groups.filter(group => !mapping.category || group.category_id === inspection.catalog?.categories.find(category => category.name === mapping.category)?.id).map(group => <option key={group.id}>{group.name}</option>)}</select></label></div> : null}
        <button disabled={busy} onClick={() => void importAndSave("preview")} className="mt-5 min-h-11 rounded-lg border border-teal px-5 font-semibold text-text-link">Validate and preview rows</button>
      </section> : null}
      {preview ? <section className="mt-5" aria-label="Import review"><h3 className="text-lg font-bold">{preview.length} rows ready for review</h3><p className="mt-1 text-sm">Source order is preserved. Existing records matched by ID or catalog identity will be updated.</p><div className="gc-table-scroll mt-3"><table><thead><tr><th>Row</th><th>Name</th><th>Price (USD)</th><th>Duration (hours)</th></tr></thead><tbody>{preview.slice(previewPage * 50, (previewPage + 1) * 50).map((row,index) => <tr key={index}><td>{previewPage * 50 + index + 1}</td><td>{String(row.name || "")}</td><td>{String(row.base_price ?? row.price ?? "")}</td><td>{row.duration_min_hours ? `${row.duration_min_hours}–${row.duration_max_hours}` : "Not applicable"}</td></tr>)}</tbody></table></div>{preview.length > 50 ? <nav aria-label="Import preview pages" className="mt-3 flex flex-wrap items-center gap-4 text-sm"><button disabled={previewPage === 0} onClick={() => setPreviewPage(page => page - 1)} className="min-h-10 rounded-lg border px-3 gc-disabled-control">Previous rows</button><span>Page {previewPage + 1} of {Math.ceil(preview.length / 50)}</span><button disabled={(previewPage + 1) * 50 >= preview.length} onClick={() => setPreviewPage(page => page + 1)} className="min-h-10 rounded-lg border px-3 gc-disabled-control">Next rows</button></nav> : null}<label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="mt-1 h-5 w-5"/>I reviewed the field mapping, units, prices and rows. Save these changes to this business.</label><button disabled={busy || !reviewed || !preview.length} onClick={() => void importAndSave("save")} className="mt-4 min-h-11 rounded-lg bg-primary-hover px-6 font-bold text-white gc-disabled-control">Import &amp; Save</button></section> : null}

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
