import { ACTIVE_BUSINESS_CATEGORIES } from "@/lib/businessCategories";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Count the existing structured waitlist tickets without exposing contact data,
 * changing intake questions, or confusing appointment waitlists with recruitment. */
export async function businessWaitlistDemand(admin: SupabaseClient) {
  return Promise.all(ACTIVE_BUSINESS_CATEGORIES.filter(category => !category.live).map(async category => {
    const { count, error } = await admin.from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("category", "Partnerships")
      .like("subject", "Business waitlist — %")
      .like("message", `%\nBusiness category ID: ${category.slug}\n%`);
    if (error) throw error;
    if (count === null) throw new Error("WAITLIST_COUNT_UNAVAILABLE");
    return { category: category.slug, name: category.name, requests: count };
  }));
}
