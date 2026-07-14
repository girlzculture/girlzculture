import type { AuthScope } from "@/lib/supabase";

export type LoginChallenge = { challenge_id: string; channel: "email" | "sms"; destination: string };
export type LoginSession = { access_token: string; refresh_token: string; expires_at?: number };

async function request(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, website: "" }) });
  const result = await response.json() as { error?: string; requires_mfa?: boolean; challenge_id?: string; channel?: "email" | "sms"; destination?: string; session?: LoginSession };
  if (!response.ok) throw new Error(result.error || "Unable to sign in.");
  return result;
}

export async function startSecureLogin(role: AuthScope, email: string, password: string) {
  const result = await request("/api/auth/login/start", { role, email, password });
  return {
    session: result.session || null,
    challenge: result.requires_mfa && result.challenge_id && result.channel
      ? { challenge_id: result.challenge_id, channel: result.channel, destination: result.destination || "your account" } satisfies LoginChallenge
      : null,
  };
}

export async function verifySecureLogin(role: AuthScope, email: string, password: string, challenge: LoginChallenge, code: string) {
  const result = await request("/api/auth/login/verify", { role, email, password, challenge_id: challenge.challenge_id, code });
  if (!result.session) throw new Error("The server did not return an authenticated session.");
  return result.session;
}
