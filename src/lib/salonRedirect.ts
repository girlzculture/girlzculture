import { salonSupabase as supabase } from "@/lib/supabase";

type SalonDestinationResult = {
  path: "/salon/dashboard" | "/salon/onboarding" | "/salon/apply" | "/pending";
  salonExists: boolean;
  reason: "matched-salon" | "missing-user-id" | "no-salon" | "lookup-error";
};

export async function getSalonDestinationForUserId(userId: string | null | undefined): Promise<SalonDestinationResult> {
  const normalizedUserId = userId?.trim();

  if (!normalizedUserId) {
    return { path: "/salon/onboarding", salonExists: false, reason: "missing-user-id" };
  }

  const { data, error } = await supabase
    .from("salons")
    .select("id,status")
    .eq("user_id", normalizedUserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { path: "/salon/onboarding", salonExists: false, reason: "lookup-error" };
  }

  const salonExists = Boolean(data?.id);
  let path: SalonDestinationResult["path"] = salonExists ? "/salon/dashboard" : "/salon/onboarding";
  if (data?.id && data.status?.toLowerCase() === "pending") {
    const { data: application } = await supabase.from("salon_applications").select("id").eq("salon_id", data.id).maybeSingle();
    path = application?.id ? "/pending" : "/salon/apply";
  }

  return {
    path,
    salonExists,
    reason: salonExists ? "matched-salon" : "no-salon",
  };
}
