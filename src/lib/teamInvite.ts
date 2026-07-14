import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function inviteOrFindUser(admin: SupabaseClient, email: string, role: "admin" | "salon_staff") {
  const redirectTo = `${(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "")}/reset-password?invited=${role}`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { role, invitation_pending: true } });
  if (!error && data.user) return { user: data.user, invited: true };
  if (!/already|registered|exists/i.test(error?.message || "")) throw error || new Error("Unable to create invitation.");
  let page = 1;
  while (page <= 10) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    const found = result.data.users.find((user) => user.email?.trim().toLowerCase() === email);
    if (found) return { user: found as User, invited: false };
    if (result.data.users.length < 1000) break;
    page += 1;
  }
  throw new Error("An account with this email exists but could not be linked.");
}
