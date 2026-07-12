import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!rawSupabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabaseUrl = rawSupabaseUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const resolvedSupabaseAnonKey: string = supabaseAnonKey;

export const AUTH_STORAGE_KEYS = {
  customer: "supabase-default-auth",
  salon: "girlz-culture-salon-auth",
  admin: "girlz-culture-admin-auth",
} as const;

function createBrowserClient(storageKey?: string) {
  return createClient(supabaseUrl, resolvedSupabaseAnonKey, {
    auth: {
      ...(storageKey ? { storageKey } : {}),
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
      // Only the legacy/customer client processes confirmation links. The
      // verified role is then migrated to the matching scoped client.
      detectSessionInUrl: !storageKey && typeof window !== "undefined",
    },
  });
}

// Each product area has an independent browser session. Signing into the
// platform admin never replaces a salon owner's session (and vice versa).
export const supabase = createBrowserClient();
export const salonSupabase = createBrowserClient(AUTH_STORAGE_KEYS.salon);
export const adminSupabase = createBrowserClient(AUTH_STORAGE_KEYS.admin);

export type AuthScope = keyof typeof AUTH_STORAGE_KEYS;
export function getSupabaseForScope(scope: AuthScope = "customer"): SupabaseClient {
  if (scope === "admin") return adminSupabase;
  if (scope === "salon") return salonSupabase;
  return supabase;
}

// Existing installations used Supabase's default session key for every role.
// Migrate a matching legacy role into its dedicated client once, without
// signing out or altering the other role's session.
export async function getSessionForScope(scope: AuthScope): Promise<Session | null> {
  const scopedClient = getSupabaseForScope(scope);
  const { data: scopedData } = await scopedClient.auth.getSession();
  if (scopedData.session || scope === "customer" || typeof window === "undefined") return scopedData.session;
  const { data: legacyData } = await supabase.auth.getSession();
  const legacySession = legacyData.session;
  if (!legacySession) return null;
  try {
    const response = await fetch("/api/auth/destination", { method: "POST", headers: { Authorization: `Bearer ${legacySession.access_token}` } });
    const destination = await response.json() as { role?: string };
    const expectedRole = scope === "admin" ? "admin" : "salon_owner";
    if (!response.ok || destination.role !== expectedRole) return null;
    const { data } = await scopedClient.auth.setSession({ access_token: legacySession.access_token, refresh_token: legacySession.refresh_token });
    return data.session;
  } catch (error) {
    console.error("Legacy role session migration failed", { scope, error });
    return null;
  }
}
