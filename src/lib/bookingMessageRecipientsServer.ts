import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Device notification subscriptions can outlive a team invitation, permission
 * or canonical identity. Recheck the same authorization used by conversations
 * immediately before selecting destinations; fail closed on lookup failure. */
export async function authorizedMessageRecipients(admin: SupabaseClient, salonId: string, userIds: string[]) {
  const candidates = [...new Set(userIds.filter(Boolean))];
  const checks = await Promise.all(candidates.map(async userId => {
    const result = await admin.rpc("p0_actor_has_permission", { p_salon: salonId, p_user: userId, p_permission: "bookings" });
    if (result.error) throw result.error;
    return result.data === true ? userId : null;
  }));
  return checks.filter((id): id is string => id !== null);
}
