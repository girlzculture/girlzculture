import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { operatingBooksFromData, type BusinessFinanceData } from "@/lib/businessFinanceData";
import { summarizeOperatingBooks, type FinancePeriod } from "@/lib/businessFinanceCore";

export async function readBusinessFinances(context: Awaited<ReturnType<typeof requireSalonOwner>>, period: FinancePeriod) {
  const result = await context.admin.rpc("read_business_finance", { p_salon: context.salon.id, p_user: context.user.id });
  if (result.error) throw result.error;
  const data = result.data as BusinessFinanceData;
  const { books, evidence } = operatingBooksFromData(context.salon.id, data);
  const summary = summarizeOperatingBooks(context.salon.id, books, period);
  return { scope: data.scope, books, summary, evidence, stylists: data.stylists, arrangements: data.arrangements };
}
