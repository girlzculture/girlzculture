import { operatingBooksFromData, type BusinessFinanceData } from "@/lib/businessFinanceData";
import { validateFinancePeriod, type FinancePeriod } from "@/lib/businessFinanceCore";
import { dateKeyInTimeZone } from "@/lib/dateTime";
export type CostAllocation = { kind: "expense" | "wage"; id: string; cents: number };
export type ContributionReview = { service_id: string; revision: number; fingerprint: string; complete: boolean; zero_confirmed: boolean; note: string; allocations: CostAllocation[] };
export type ContributionEvidence = { salon_id: string; period: FinancePeriod; as_of: string; fingerprint: string; finance: BusinessFinanceData;
 services: { id: string; salon_id: string; name: string }[]; booking_services: { id: string; salon_id: string; style_id: string | null }[]; reviews: ContributionReview[] };
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cents = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 100_000_000;
const shift = (value: string, count: number) => { const date = new Date(value + "T12:00:00Z"); date.setUTCDate(date.getUTCDate() + count); return date.toISOString().slice(0, 10); };
export function contributionPreviousPeriod(period: FinancePeriod) {
 try { validateFinancePeriod(period); } catch { throw Error("CONTRIBUTION_INVALID_PERIOD"); }
 const days = Math.round((Date.parse(period.to + "T12:00:00Z") - Date.parse(period.from + "T12:00:00Z")) / 86400000) + 1;
 if (days > 366) throw Error("CONTRIBUTION_INVALID_PERIOD");
 return { ...period, from: shift(period.from, -days), to: shift(period.from, -1) };
}
/** A recorded contribution for an explicitly reviewed appointment cohort.
 * It never asserts net profit, market demand or service-specific capacity. */
export function businessServiceContribution(salonId: string, evidence: ContributionEvidence) {
 if (!evidence || evidence.salon_id !== salonId || !idPattern.test(salonId) || evidence.finance?.scope?.kind !== "business") throw Error("CONTRIBUTION_ACCESS_DENIED");
 const previous = contributionPreviousPeriod(evidence.period), now = Date.parse(evidence.as_of);
 if (!Number.isFinite(now) || !/^[0-9a-f]{32}$/.test(evidence.fingerprint) || evidence.period.to >= dateKeyInTimeZone(evidence.as_of, evidence.period.timeZone)) throw Error("CONTRIBUTION_INVALID_PERIOD");
 const within = (at: string, period = evidence.period) => { const day = dateKeyInTimeZone(at, period.timeZone); return day >= period.from && day <= period.to; };
 const financeCount = Object.values(evidence.finance).filter(Array.isArray).reduce((n, rows) => n + rows.length, 0);
 if (financeCount > 20000 || evidence.services.length > 200 || evidence.booking_services.length > 5000 || evidence.reviews.length > 200) throw Error("CONTRIBUTION_EVIDENCE_INCOMPLETE");
 const { books, evidence: payments } = operatingBooksFromData(salonId, evidence.finance);
 if (books.payments.some(row => !Number.isFinite(Date.parse(row.occurred_at)))) throw Error("CONTRIBUTION_EVIDENCE_INCOMPLETE");
 const paymentUnverified = payments.unverified_deposit_records + payments.unverified_product_payments + payments.unverified_refund_records > 0;
 const services = new Map(evidence.services.map(row => [row.id, row]));
 if (services.size !== evidence.services.length || evidence.services.some(row => row.salon_id !== salonId || !idPattern.test(row.id) || typeof row.name !== "string" || row.name.length > 200)) throw Error("CONTRIBUTION_ACCESS_DENIED");
 const mapping = new Map(evidence.booking_services.map(row => [row.id, row]));
 if (mapping.size !== evidence.booking_services.length || evidence.booking_services.some(row => row.salon_id !== salonId || !idPattern.test(row.id) || row.style_id !== null && !services.has(row.style_id))) throw Error("CONTRIBUTION_ACCESS_DENIED");
 if (evidence.finance.bookings.length !== mapping.size || evidence.finance.bookings.some(row => !mapping.has(String(row.id)))) throw Error("CONTRIBUTION_EVIDENCE_INCOMPLETE");
 const sources = [
  ...books.expenses.filter(row => row.treatment === "operating" && within(row.occurred_at)).map(row => ({ kind: "expense" as const, id: row.id, amount_cents: row.amount_cents, label: row.category, at: row.occurred_at })),
  ...books.obligations.filter(row => row.kind === "wage" && within(row.due_at)).map(row => ({ kind: "wage" as const, id: row.id, amount_cents: row.amount_cents, label: "Recorded wage obligation", at: row.due_at })),
 ];
 if (sources.length > 200) throw Error("CONTRIBUTION_EVIDENCE_INCOMPLETE");
 const budgets = new Map(sources.map(row => [`${row.kind}:${row.id}`, row.amount_cents]));
 const allocated = new Map<string, number>(), reviewByService = new Map<string, ContributionReview>();
 for (const review of evidence.reviews) {
  if (!services.has(review.service_id) || reviewByService.has(review.service_id) || !Number.isSafeInteger(review.revision) || review.revision < 1) throw Error("CONTRIBUTION_REVIEW_INVALID");
  reviewByService.set(review.service_id, review);
  if (review.fingerprint !== evidence.fingerprint) continue;
  if (review.complete !== true || !Array.isArray(review.allocations) || review.allocations.length > 40 || !review.note?.trim() || review.note.length > 1000 || typeof review.zero_confirmed !== "boolean" || !review.allocations.length && !review.zero_confirmed) throw Error("CONTRIBUTION_REVIEW_INVALID");
  const seen = new Set<string>();
  for (const item of review.allocations) {
   const key = `${item.kind}:${item.id}`;
   if (!idPattern.test(item.id) || !cents(item.cents) || !item.cents || seen.has(key) || !budgets.has(key)) throw Error("CONTRIBUTION_ALLOCATION_INVALID");
   seen.add(key); allocated.set(key, (allocated.get(key) || 0) + item.cents);
   if (allocated.get(key)! > budgets.get(key)!) throw Error("CONTRIBUTION_ALLOCATION_EXCEEDS_SOURCE");
  }
 }
 const completed = books.sales.filter(row => row.kind === "service" && row.status === "completed" && Date.parse(row.occurred_at) <= now);
 const appointments = completed.filter(row => row.id.startsWith("booking:") && mapping.get(row.id.slice(8))?.style_id);
 const rows = [...services.values()].map(service => {
  const own = appointments.filter(row => mapping.get(row.id.slice(8))?.style_id === service.id), current = own.filter(row => within(row.occurred_at));
  const priorCount = own.filter(row => within(row.occurred_at, previous)).length;
  const review = reviewByService.get(service.id), valid = review?.fingerprint === evidence.fingerprint;
  let net = 0, commission = 0, recordedCosts = 0;
  for (const sale of current) {
   const refund = books.payments.filter(row => row.sale_id === sale.id && row.stage === "refund" && Date.parse(row.occurred_at) <= now).reduce((n, row) => n + row.amount_cents, 0);
   net += sale.agreed_cents - refund; recordedCosts += sale.cost_cents || 0;
   if (sale.compensation.kind === "commission") {
    const earned = Math.round((sale.compensation.basis === "before_discount" ? sale.list_cents : sale.agreed_cents) * sale.compensation.percent / 100);
    commission += earned - (sale.agreed_cents ? Math.round(earned * refund / sale.agreed_cents) : 0);
   }
  }
  const booth = current.some(row => row.compensation.kind === "booth"), allocatedCost = valid ? review!.allocations.reduce((n, row) => n + row.cents, 0) : null;
  const status = paymentUnverified ? "payment_unverified" : booth ? "booth" : !review ? "missing" : !valid ? "stale" : "owner_reviewed";
  return { service_id: service.id, name: service.name, completed_count: current.length, previous_count: priorCount, net_recorded_value_cents: net, commission_cents: commission, recorded_cost_cents: recordedCosts,
   allocated_cost_cents: allocatedCost, contribution_cents: status === "owner_reviewed" ? net - commission - recordedCosts - allocatedCost! : null,
   review_status: status, review: review || null, href: `/salon/dashboard/services/${service.id}` };
 }).filter(row => row.completed_count || row.previous_count).sort((a, b) => b.completed_count - a.completed_count || a.name.localeCompare(b.name));
 const recommendations = rows.filter(row => row.completed_count > 0 && row.completed_count < row.previous_count && row.contribution_cents !== null && row.contribution_cents > 0).sort((a, b) => b.contribution_cents! - a.contribution_cents!).slice(0, 2);
 return { period: evidence.period, previous_period: previous, as_of: evidence.as_of, fingerprint: evidence.fingerprint, currency: "USD", rows, recommendations,
  cost_sources: sources.map(row => ({ ...row, allocated_cents: allocated.get(`${row.kind}:${row.id}`) || 0 })),
  excluded_unattributed_service_records: completed.filter(row => within(row.occurred_at) && (!row.id.startsWith("booking:") || !mapping.get(row.id.slice(8))?.style_id)).length,
  net_profit_verified: false as const, cost_completeness_source: "owner_recorded" as const,
  definition: "Completed appointments with canonical service IDs only. Equal local calendar-day periods. Service value less verified recorded refunds, snapshotted commission, recorded direct costs and owner-allocated canonical expenses/wages. Owner declares the allocation complete; the platform does not verify cost completeness. This is recorded contribution, not net profit, cash settlement, spare capacity, demand or a forecast. Unattributed manual sales and booth turnover cannot support this recommendation." };
}
export type BusinessServiceContribution = ReturnType<typeof businessServiceContribution>;
