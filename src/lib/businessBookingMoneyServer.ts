import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { operatingBooksFromData, type BusinessFinanceData } from "@/lib/businessFinanceData";
import type { FinancePeriod } from "@/lib/businessFinanceCore";
import { bookingMoneyCohort, businessBookingMoney } from "@/lib/businessBookingMoney";
type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
const projection = "id,salon_id,status,appointment_datetime,estimated_total,subtotal_before_promotion,deposit_amount,deposit_status,payment_mode,payment_verified_at,refund_status,refund_amount,refund_completed_at,salon_promotion_id,promotion_snapshot,promotion_discount_amount";
async function authorize(context: Context) {
 const permissions = context.teamMember?.permissions as Record<string, boolean> | undefined;
 if (!context.isOwner && !(permissions?.earnings === true && permissions?.bookings === true)) throw Error("BOOKING_MONEY_ACCESS_DENIED");
 for (const permission of ["earnings", "bookings"]) {
  const result = await context.admin.rpc("p0_actor_has_permission", { p_salon: context.salon.id, p_user: context.user.id, p_permission: permission });
  if (result.error) throw result.error;
  if (result.data !== true) throw Error("BOOKING_MONEY_ACCESS_DENIED");
 }
}
export async function readBusinessBookingMoney(context: Context, period: FinancePeriod) {
 await authorize(context);
 const response = await context.admin.rpc("read_business_finance", { p_salon: context.salon.id, p_user: context.user.id });
 if (response.error) throw response.error;
 const data = response.data as BusinessFinanceData;
 if (!data || data.scope?.kind !== "business") throw Error("BOOKING_MONEY_ACCESS_DENIED");
 if (Object.values(data).filter(Array.isArray).reduce((sum, rows) => sum + rows.length, 0) > 20000) throw Error("BOOKING_MONEY_RANGE_TOO_LARGE");
 const { books } = operatingBooksFromData(context.salon.id, data);
 const candidates = bookingMoneyCohort(context.salon.id, data, period);
 const rows: Record<string, unknown>[] = [];
 const deadline = AbortSignal.timeout(40_000);
 for (let index = 0; index < candidates.length; index += 100) {
  const result = await context.admin.from("bookings").select(projection).eq("salon_id", context.salon.id).in("id", candidates.slice(index, index + 100).map(row => String(row.id))).limit(101).abortSignal(deadline);
  if (result.error) throw result.error;
  if (!Array.isArray(result.data) || result.data.length > 100) throw Error("BOOKING_MONEY_CHANGED");
  rows.push(...result.data);
 }
 // Revocation during a multi-chunk read must not release the former scope.
 await authorize(context);
 return businessBookingMoney(context.salon.id, books, data, rows, period);
}
