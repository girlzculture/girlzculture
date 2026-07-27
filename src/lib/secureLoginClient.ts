import type { AuthScope } from "@/lib/supabase";

export type LoginChallenge = { challenge_id: string; channel: "email" | "sms"; destination: string };
export type LoginSession = { access_token: string; refresh_token: string; expires_at?: number };
type LoginResponse = {
  error?: string;
  requires_mfa?: boolean;
  challenge_id?: string;
  channel?: "email" | "sms";
  destination?: string;
  session?: LoginSession;
};

const LOGIN_TIMEOUT_MS = 25_000;

function safeLoginFailure(status: number, result?: LoginResponse) {
  if (typeof result?.error === "string" && result.error.trim()) {
    return result.error.trim();
  }
  if (status === 401) return "Your sign-in could not be verified. Start again.";
  if (status === 403) return "This account cannot use that sign-in area.";
  if (status === 429) return "Too many sign-in attempts. Wait a moment and try again.";
  if (status >= 500) return "The secure sign-in service is temporarily unavailable. Try again.";
  return "Unable to sign in.";
}

export async function secureLoginRequest(
  path: string,
  body: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
  try {
    const response = await fetcher(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Requested-With": "GirlzCultureAuth",
      },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      body: JSON.stringify({ ...body, website: "" }),
    });
    const contentType = response.headers.get("content-type") || "";
    if (
      response.type === "opaqueredirect" ||
      (response.status >= 300 && response.status < 400)
    ) {
      throw new Error(
        "The sign-in page changed during an update. Refresh this page and try again.",
      );
    }
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error(
        response.status === 401 || response.status === 403
          ? "Your sign-in could not be verified. Refresh this page and start again."
          : "The sign-in service returned an invalid response. Refresh this page and try again.",
      );
    }
    let result: LoginResponse;
    try {
      result = (await response.json()) as LoginResponse;
    } catch {
      throw new Error(
        "The sign-in service returned an invalid response. Refresh this page and try again.",
      );
    }
    if (!response.ok) throw new Error(safeLoginFailure(response.status, result));
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "The secure sign-in service took too long to respond. Check your connection and try again.",
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        "We couldn't reach the secure sign-in service. Check your connection, refresh this page, and try again.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function startSecureLogin(role: AuthScope, email: string, password: string) {
  const result = await secureLoginRequest("/api/auth/login/start", { role, email, password });
  return {
    session: result.session || null,
    challenge: result.requires_mfa && result.challenge_id && result.channel
      ? { challenge_id: result.challenge_id, channel: result.channel, destination: result.destination || "your account" } satisfies LoginChallenge
      : null,
  };
}

export async function verifySecureLogin(role: AuthScope, email: string, password: string, challenge: LoginChallenge, code: string) {
  const result = await secureLoginRequest("/api/auth/login/verify", { role, email, password, challenge_id: challenge.challenge_id, code });
  if (!result.session) throw new Error("The server did not return an authenticated session.");
  return result.session;
}
