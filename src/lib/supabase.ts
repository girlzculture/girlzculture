import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!rawSupabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabaseUrl = rawSupabaseUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
