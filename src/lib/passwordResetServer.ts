import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function secret() {
  const value = process.env.PASSWORD_RESET_SECRET || process.env.INTERNAL_API_SECRET;
  if (!value || value.length < 24) throw new Error("Password reset is not configured.");
  return value;
}

export function resetHash(value: string) {
  return createHash("sha256").update(`${secret()}:${value}`).digest("hex");
}

export function createResetCode() { return String(randomInt(100000, 1000000)); }
export function createResetTicket() { return randomBytes(32).toString("base64url"); }

export async function findAuthUserByEmail(email: string) {
  const admin = getSupabaseAdmin();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find(item => item.email?.trim().toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) break;
  }
  return null;
}
