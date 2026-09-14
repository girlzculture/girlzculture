import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Reuse the registered-test classification, including while a deployment is
 * transitioning to the forward migration that also hardens discovery SQL. */
export async function isRegisteredTestBusiness(admin: SupabaseClient, salonId: string) {
  const result = await admin.from("test_data_registry").select("id").eq("record_type", "salon").eq("record_id", salonId).limit(1);
  if (result.error) throw new Error("MARKETPLACE_ELIGIBILITY_UNAVAILABLE");
  return Boolean(result.data?.length);
}
export async function rejectRegisteredTestCheckout(admin: SupabaseClient, salonId: string) {
  if (await isRegisteredTestBusiness(admin, salonId)) return Response.json({ code: "BUSINESS_NOT_AVAILABLE", error: "This business is not available for customer booking or payment." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  return null;
}
