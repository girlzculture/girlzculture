import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";
import { readBusinessFinances } from "@/lib/businessFinanceServer";
import { assistantAssignedProfessional } from "@/lib/assistantProfessionalScope";
import { assertOperatingBooksScope, financeSalePayable } from "@/lib/businessFinanceCore";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
const limit = 12;
const recordId = /^(sale|booking|order):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function currentScope(context: Context) {
  for (const permission of ["bookings", "client_history"]) {
    const result = await context.admin.rpc("p0_actor_has_permission", { p_salon: context.salon.id, p_user: context.user.id, p_permission: permission });
    if (result.error || result.data !== true) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  }
  const result = await context.admin.rpc("business_finance_scope", { p_salon: context.salon.id, p_user: context.user.id });
  if (result.error || !["business", "own"].includes(result.data?.kind) || result.data.kind === "own" && typeof result.data.stylist_id !== "string") throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  const business = await context.admin.from("salons").select("id,user_id").eq("id", context.salon.id).maybeSingle();
  if (business.error || !business.data || business.data.id !== context.salon.id || (business.data.user_id === context.user.id) !== context.isOwner) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  let assigned: string | null = null;
  if (!context.isOwner) {
    const member = await context.admin.from("salon_team_members").select("salon_id,user_id,stylist_id").eq("salon_id", context.salon.id).eq("user_id", context.user.id).eq("status", "Active").maybeSingle();
    if (member.error || !member.data || member.data.salon_id !== context.salon.id || member.data.user_id !== context.user.id) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
    assigned = member.data.stylist_id ?? null;
    if (assigned !== assistantAssignedProfessional(context)) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  }
  return { kind: result.data.kind as "business" | "own", stylist_id: result.data.stylist_id ?? null, assigned };
}

/** Separate from aggregate earnings: client-linked balances require all three
 * current grants. Never return contacts, account IDs, provider IDs or raw books. */
export async function readAssistantOutstandingBalances(context: Context, args: Record<string, unknown>) {
  const before = await currentScope(context);
  const timeZone = context.salon.time_zone || "America/New_York";
  const day = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
    return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
  };
  const end = Math.min(Date.parse(String(args.end)) - 1, Date.now());
  const period = { from: day(Date.parse(String(args.start))), to: day(end), timeZone };
  let result: Awaited<ReturnType<typeof readBusinessFinances>>;
  try { result = await readBusinessFinances(context, period); }
  catch (error) { if (/ACCESS_DENIED/.test(String((error as { message?: string })?.message))) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403); throw error; }
  const after = await currentScope(context);
  if (JSON.stringify(before) !== JSON.stringify(after) || result.scope.kind !== after.kind || (result.scope.stylist_id ?? null) !== after.stylist_id) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  try { assertOperatingBooksScope(context.salon.id, result.books); }
  catch { throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403); }
  const assigned = assistantAssignedProfessional(context);
  if (assigned && after.kind === "own" && assigned !== after.stylist_id) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  const restricted = assigned || (after.kind === "own" ? after.stylist_id : null);
  const verificationIncomplete = [result.evidence.unverified_deposit_records, result.evidence.unverified_product_payments, result.evidence.unverified_refund_records].some(value => value > 0);
  const balances = new Map(result.summary.balances.map(row => [row.sale_id, row]));
  const records = result.books.sales.filter(sale => !restricted || sale.stylist_id === restricted).flatMap(sale => {
    const balance = balances.get(sale.id);
    if (!balance || balance.unpaid_cents <= 0 || sale.status === "cancelled") return [];
    if (!recordId.test(sale.id) || !Number.isSafeInteger(balance.unpaid_cents) || !Number.isSafeInteger(balance.received_cents)) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
    const href = `/salon/dashboard/earnings?${new URLSearchParams({ finance: "transactions", finance_from: period.from, finance_to: period.to, finance_balance: "unpaid", finance_record: sale.id })}`;
    return [{ record: sale.id, client_name: sale.client_name?.slice(0, 120) || null, service_name: sale.name.slice(0, 200), status: sale.status, occurred_at: sale.occurred_at,
      agreed_cents: financeSalePayable(sale), received_cents: balance.received_cents, unpaid_cents: balance.unpaid_cents, href }];
  }).sort((a, b) => b.unpaid_cents - a.unpaid_cents || a.record.localeCompare(b.record));
  const completed = records.filter(row => row.status === "completed" && Date.parse(row.occurred_at) <= end);
  const pending = records.filter(row => row.status !== "completed" || Date.parse(row.occurred_at) > end);
  return { available: !verificationIncomplete, scope: restricted ? "own_stylist_only" : "authenticated_business_only", scope_stylist_id: restricted, as_of_day: period.to, time_zone: timeZone, currency: "USD", capped_at: limit,
    completed_count: verificationIncomplete ? null : completed.length, completed_unpaid_cents: verificationIncomplete ? null : completed.reduce((sum, row) => sum + row.unpaid_cents, 0), completed: verificationIncomplete ? [] : completed.slice(0, limit),
    pending_count: verificationIncomplete ? null : pending.length, pending_unpaid_cents: verificationIncomplete ? null : pending.reduce((sum, row) => sum + row.unpaid_cents, 0), pending: verificationIncomplete ? [] : pending.slice(0, limit),
    verification_incomplete: verificationIncomplete,
    definitions: "Integer USD cents. Cumulative recorded balances as of the reporting day, including earlier sales. Completed unpaid balances are separate from pending or future agreed amounts, which are not claimed overdue. No due dates or collection right are inferred. Null client name means unnamed; never invent identity. Refunds do not reopen discharged debt. Lists are capped; counts and totals cover the currently permitted records. No messages or payment actions were performed." };
}
