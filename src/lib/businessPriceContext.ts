/** Published government aggregate only. This module reads no business records. */
export const PRICE_CONTEXT_DEFINITION = {
 schema_version: 1,
 definition_id: "bls-cpi-personal-care-us-nsa-v1",
 series_id: "CUUR0000SEGC",
 publisher: "U.S. Bureau of Labor Statistics",
 source_url: "https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SEGC",
 source_page: "https://www.bls.gov/cpi/",
 metadata_url: "https://fred.stlouisfed.org/series/CUUR0000SEGC",
 methodology_url: "https://www.bls.gov/opub/hom/cpi/design.htm",
 geography: "US_CITY_AVERAGE",
 population: "CPI_U",
 category: "personal_care_services",
 unit: "index_points",
 reference_base: "1982-1984=100",
 seasonal_adjustment: "not_seasonally_adjusted",
 frequency: "monthly",
 sample_count: null,
 sample_count_status: "not_published_in_selected_series",
 currency: null,
 service_dollar_benchmark_available: false,
 local_price_comparison_available: false,
 price_recommendation_available: false,
} as const;
export type PriceObservation = { month: string; index_value: number };
const KNOWN_MISSING_MONTH = "2025-10";
const KNOWN_MISSING_FOOTNOTE = "Data unavailable due to the 2025 lapse in appropriations";
export type UnavailablePriceObservation = {
 month: typeof KNOWN_MISSING_MONTH; reason: "source_data_unavailable";
 source_value: "-"; footnote_code: "X"; footnote_text: typeof KNOWN_MISSING_FOOTNOTE;
};
export type VerifiedPriceContextSnapshot = typeof PRICE_CONTEXT_DEFINITION & {
 status: "verified"; retrieved_at: string; source_release_at: null; source_sha256: string;
 next_expected_release_at: string | null; observations: PriceObservation[]; unavailable_observations: UnavailablePriceObservation[];
};
type ObjectRow = Record<string, unknown>;
const object = (value: unknown): value is ObjectRow => Boolean(value && typeof value === "object" && !Array.isArray(value));
const instant = (value: unknown) => {
 if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
 const stamp = Date.parse(value); return Number.isFinite(stamp) && new Date(stamp).toISOString() === value ? stamp : null;
};
const monthIndex = (value: unknown) => {
 if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
 const [year, month] = value.split("-").map(Number); return year >= 1997 && year <= 9999 ? year * 12 + month - 1 : null;
};
const MAX_AGE_MS = 45 * 86400000;
const fail = (): never => { throw Error("PRICE_CONTEXT_INVALID_SOURCE"); };
function identity(value: ObjectRow) {
 return value.schema_version === 1 && value.definition_id === PRICE_CONTEXT_DEFINITION.definition_id && value.series_id === PRICE_CONTEXT_DEFINITION.series_id && value.source_url === PRICE_CONTEXT_DEFINITION.source_url;
}
function observations(value: unknown, retrievedAt: string): PriceObservation[] {
 if (!Array.isArray(value) || !value.length || value.length > 36) return fail();
 const seen = new Set<string>(), ceiling = monthIndex(retrievedAt.slice(0, 7))!;
 const output = value.map(row => {
  if (!object(row) || Object.keys(row).some(key => !["month", "index_value"].includes(key))) return fail();
  const month = monthIndex(row.month);
  if (month === null || month >= ceiling || month < ceiling - 36 || typeof row.index_value !== "number" || !Number.isFinite(row.index_value) || row.index_value <= 0 || row.index_value > 1e9 || seen.has(row.month as string)) return fail();
  seen.add(row.month as string); return { month: row.month as string, index_value: row.index_value };
 });
 return output.sort((a, b) => b.month.localeCompare(a.month));
}
function unavailableObservations(value: unknown, retrievedAt: string): UnavailablePriceObservation[] {
 if (!Array.isArray(value) || value.length > 1) return fail();
 const ceiling = monthIndex(retrievedAt.slice(0, 7))!;
 return value.map(row => {
  if (!object(row) || Object.keys(row).some(key => !["month", "reason", "source_value", "footnote_code", "footnote_text"].includes(key)) ||
   row.month !== KNOWN_MISSING_MONTH || row.reason !== "source_data_unavailable" || row.source_value !== "-" || row.footnote_code !== "X" || row.footnote_text !== KNOWN_MISSING_FOOTNOTE) return fail();
  const month = monthIndex(row.month)!;
  if (month >= ceiling || month < ceiling - 36) return fail();
  return { month: KNOWN_MISSING_MONTH, reason: "source_data_unavailable", source_value: "-", footnote_code: "X", footnote_text: KNOWN_MISSING_FOOTNOTE };
 });
}
function observationSet(numeric: unknown, missing: unknown, retrievedAt: string) {
 const values = observations(numeric, retrievedAt), unavailable = unavailableObservations(missing, retrievedAt);
 const months = [...values.map(row => row.month), ...unavailable.map(row => row.month)];
 if (months.length > 36 || new Set(months).size !== months.length) return fail();
 return { values, unavailable };
}

/** Accept only the documented raw aggregate, never source prose or a dollar price. */
export function parseBlsPriceContext(raw: unknown, evidence: { retrievedAt: string; sha256: string }): VerifiedPriceContextSnapshot {
 if (instant(evidence.retrievedAt) === null || !/^[a-f0-9]{64}$/.test(evidence.sha256) || !object(raw) || raw.status !== "REQUEST_SUCCEEDED" || !Array.isArray(raw.message) || raw.message.length) return fail();
 // BLS v2 documentation shows a one-element Results array; current API clients
 // also receive its object form. Neither permits multiple result/series objects.
 const result = Array.isArray(raw.Results) && raw.Results.length === 1 ? raw.Results[0] : raw.Results;
 if (!object(result) || !Array.isArray(result.series) || result.series.length !== 1) return fail();
 const series = result.series[0];
 if (!object(series) || series.seriesID !== PRICE_CONTEXT_DEFINITION.series_id || !Array.isArray(series.data) || !series.data.length || series.data.length > 36) return fail();
 const rows: PriceObservation[] = [], missing: UnavailablePriceObservation[] = [];
 for (const row of series.data) {
  if (!object(row) || typeof row.year !== "string" || !/^\d{4}$/.test(row.year) || typeof row.period !== "string" || !/^M(0[1-9]|1[0-2])$/.test(row.period) || typeof row.value !== "string" || !Array.isArray(row.footnotes)) return fail();
  const month = `${row.year}-${row.period.slice(1)}`;
  if (row.value === "-") {
   // One exact published absence is reviewed, not a general footnote bypass.
   // Retain its provenance without fabricating an index or filling the gap.
   const note = row.footnotes[0];
   if (month !== KNOWN_MISSING_MONTH || row.footnotes.length !== 1 || !object(note) || Object.keys(note).length !== 2 || note.code !== "X" || note.text !== KNOWN_MISSING_FOOTNOTE) return fail();
   missing.push({ month, reason: "source_data_unavailable", source_value: "-", footnote_code: "X", footnote_text: KNOWN_MISSING_FOOTNOTE });
   continue;
  }
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(row.value)) return fail();
  // Provisional or unknown footnotes require explicit definition review; no
  // automatic interpretation or untrusted text is passed into the workspace.
  if (row.footnotes.some(note => !object(note) || Object.keys(note).some(key => !["code", "text"].includes(key)) || Object.values(note).some(text => text !== ""))) return fail();
  rows.push({ month, index_value: Number(row.value) });
 }
 const checked = observationSet(rows, missing, evidence.retrievedAt);
 return { ...PRICE_CONTEXT_DEFINITION, status: "verified", retrieved_at: evidence.retrievedAt, source_release_at: null, source_sha256: evidence.sha256, next_expected_release_at: null, observations: checked.values, unavailable_observations: checked.unavailable };
}

/** The same bounded view is suitable for UI and an authorized summary projection. */
export function businessPriceContext(raw: unknown, now: string | number = Date.now()) {
 const base = { ...PRICE_CONTEXT_DEFINITION, current: null as PriceObservation | null, comparison: null as PriceObservation | null, change_percent: null as number | null, change_status: "unavailable" as "unavailable" | "missing_comparison" | "calculated", retrieved_at: null as string | null, source_release_at: null as string | null, valid_until: null as string | null, observation_count: 0, observation_count_definition: "published_months_not_survey_sample" as const, source_month_count: 0, unavailable_observation_count: 0, unavailable_observations: [] as { month: string; reason: "source_data_unavailable" }[] };
 try {
  const at = typeof now === "number" ? now : instant(now);
  if (at === null || !Number.isFinite(at) || !object(raw) || !identity(raw)) return { ...base, status: "unavailable" as const, reason: "invalid_source" as const };
  if (raw.status === "unavailable") return { ...base, status: "unavailable" as const, reason: "source_not_verified" as const };
  const fetched = instant(raw.retrieved_at);
  if (raw.status !== "verified" || Object.entries(PRICE_CONTEXT_DEFINITION).some(([key, value]) => raw[key] !== value) || fetched === null || fetched > at || raw.source_release_at !== null || typeof raw.source_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.source_sha256)) return fail();
  if (raw.next_expected_release_at !== null && instant(raw.next_expected_release_at) === null) return fail();
  const next = raw.next_expected_release_at === null ? null : instant(raw.next_expected_release_at)!;
  if (next !== null && next <= fetched) return fail();
  const { values, unavailable } = observationSet(raw.observations, raw.unavailable_observations, raw.retrieved_at as string);
  const [latestYear, latestMonth] = values[0].month.split("-").map(Number);
  const observationExpiry = Date.UTC(latestYear, latestMonth + 2, 1);
  const expiry = Math.min(fetched + MAX_AGE_MS, observationExpiry, next === null ? Infinity : next + 7 * 86400000);
  const meta = { ...base, retrieved_at: raw.retrieved_at as string, valid_until: new Date(expiry).toISOString(), observation_count: values.length, source_month_count: values.length + unavailable.length, unavailable_observation_count: unavailable.length, unavailable_observations: unavailable.map(row => ({ month: row.month, reason: row.reason })) };
  const nowMonth = monthIndex(new Date(at).toISOString().slice(0, 7))!;
  // Fresh retrieval does not make an old observation current. No numeric
  // comparison is returned once either freshness boundary is exceeded.
  if (at >= expiry || nowMonth - monthIndex(values[0].month)! > 2) return { ...meta, status: "stale" as const, reason: "source_outdated" as const };
  const current = values[0], comparison = values.find(row => monthIndex(row.month) === monthIndex(current.month)! - 12) || null;
  const change = comparison ? Math.round((current.index_value / comparison.index_value - 1) * 1e4) / 100 : null;
  if (change !== null && !Number.isFinite(change)) return fail();
  return { ...meta, status: "available" as const, reason: null, current, comparison, change_percent: change, change_status: comparison ? "calculated" as const : "missing_comparison" as const };
 } catch { return { ...base, status: "unavailable" as const, reason: "invalid_source" as const }; }
}
export type BusinessPriceContext = ReturnType<typeof businessPriceContext>;
