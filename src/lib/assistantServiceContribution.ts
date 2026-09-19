import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { readServiceContribution } from "@/lib/businessServiceContributionServer";
import { dateKeyInTimeZone, isValidTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { AssistantError } from "@/lib/gcAssistantCore";
type Context = Awaited<ReturnType<typeof requireSalonOwner>>;

/** Keep the canonical cost review, individual financial records and client
 * identity outside the model. Only current, authorized service-level advice is
 * projected; a partial-day request never silently expands to a calendar period. */
export async function readAssistantServiceContribution(context: Context, args: Record<string, unknown>) {
 for (const permission of ["earnings", "bookings", "styles"]) {
  const access = await context.admin.rpc("p0_actor_has_permission", { p_salon: context.salon.id, p_user: context.user.id, p_permission: permission });
  if (access.error) throw new AssistantError("ASSISTANT_SERVICE_UNAVAILABLE", 503);
  if (access.data !== true) return null;
 }
 const unavailable = (reason: string) => ({ available: false as const, reason, recommendation_count: null, recommendations: [], net_profit_verified: false,
  definition: "Service contribution evidence is unavailable, not zero or unprofitable. Requires a completed local calendar-date period and current owner-recorded cost evidence. Never infer net profit, demand or capacity." });
 const zone = String(context.salon.time_zone), start = Date.parse(String(args.start)), end = Date.parse(String(args.end));
 if (!isValidTimeZone(zone) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return unavailable("completed_calendar_period_required");
 const from = dateKeyInTimeZone(new Date(start), zone), to = dateKeyInTimeZone(new Date(end - 1), zone), exclusive = dateKeyInTimeZone(new Date(end), zone);
 if (start !== zonedLocalToUtc(from + "T00:00", zone).getTime() || end !== zonedLocalToUtc(exclusive + "T00:00", zone).getTime()
  || to >= dateKeyInTimeZone(new Date(), zone)) return unavailable("completed_calendar_period_required");
 try {
  const data = await readServiceContribution(context, from, to);
  if (data.period.from !== from || data.period.to !== to || data.period.timeZone !== zone) return unavailable("source_changed");
  const qualifying = data.rows.filter(row => row.review_status === "owner_reviewed" && row.completed_count > 0 && row.completed_count < row.previous_count && row.contribution_cents !== null && row.contribution_cents > 0)
   .sort((a, b) => b.contribution_cents! - a.contribution_cents! || a.service_id.localeCompare(b.service_id));
  return { available: true as const, period: data.period, previous_period: data.previous_period, as_of: data.as_of, currency: data.currency,
   reviewed_service_count: data.rows.filter(row => row.review_status === "owner_reviewed").length,
   unverified_service_count: data.rows.filter(row => row.review_status !== "owner_reviewed").length,
   recommendation_count: qualifying.length, is_excerpt: qualifying.length > 2,
   recommendations: qualifying.slice(0, 2).map(row => ({ service_id: row.service_id, service_name: row.name, completed_count: row.completed_count, previous_count: row.previous_count, contribution_cents: row.contribution_cents, href: row.href })),
   review_href: "/salon/dashboard/earnings?" + new URLSearchParams({ finance_from: from, finance_to: to }),
   net_profit_verified: false, cost_completeness_source: "owner_recorded",
   definition: "Own-business completed appointments with saved service identities only, for these exact equal local-date periods. Positive contribution subtracts verified recorded refunds, snapshotted commission, direct costs and owner-allocated expenses/wages. Cost completeness is declared by the owner, not verified by the platform. Fewer appointments than the preceding period do not prove spare capacity, lower demand or genuine net profitability. Never call this most profitable or exact net profit. Review the own service and current calendar before suggesting promotion; no action or contact was performed." };
 } catch (error) {
  const code = String((error as { message?: string })?.message || "");
  if (/ACCESS_DENIED|OWNER_REQUIRED|PLAN_REQUIRED/.test(code)) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  return unavailable(code === "CONTRIBUTION_INVALID_PERIOD" ? "completed_calendar_period_required" : code === "CONTRIBUTION_SOURCE_CHANGED" ? "source_changed" : "incomplete_evidence");
 }
}
