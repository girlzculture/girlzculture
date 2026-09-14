import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PolicyDisclosure } from "@/components/booking/BusinessPolicyDisclosure";
import { validateBusinessPolicy } from "@/lib/businessPolicyCore";

export async function currentBusinessPolicy(admin: SupabaseClient, salonId: string): Promise<PolicyDisclosure | null> {
  const business = await admin.from("salons").select("business_policy_revision_id").eq("id", salonId).maybeSingle();
  if (business.error) throw business.error;
  if (!business.data?.business_policy_revision_id) return null;
  const revision = await admin.from("business_policy_revisions").select("id,policy,version,source_locale").eq("id", business.data.business_policy_revision_id).eq("salon_id", salonId).not("published_at", "is", null).single();
  if (revision.error) throw revision.error;
  return { ...revision.data, policy: validateBusinessPolicy(revision.data.policy) } as PolicyDisclosure;
}
