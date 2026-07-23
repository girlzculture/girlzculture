import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { capturePlatformError } from "@/lib/platformErrors";
import {
  cleanText,
  enforceRateLimit,
  publicErrorResponse,
} from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const SAFE_PROVIDER_CODES = /^[A-Z0-9_.:-]{1,80}$/i;
const SAFE_OPERATION = /^[a-z0-9_.:/-]{1,120}$/i;
const SAFE_PAGE = /^\/[a-z0-9_./[\]-]{0,159}$/i;
const ALLOWED_PROVIDERS = new Set([
  "supabase",
  "supabase-realtime",
  "google-maps",
  "web-push",
  "service-worker",
]);

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "client-provider-monitor", 20, 60_000);
    const body = await request.json() as Record<string, unknown>;
    const status = Number(body.status);
    const codeInput = cleanText(body.code, 80);
    const operationInput = cleanText(body.operation, 120);
    const pageInput = cleanText(body.page, 160);
    const providerInput = cleanText(body.provider, 40).toLowerCase();
    if (!Number.isInteger(status) || status < 400 || status > 599) {
      return Response.json({ error: "Choose a valid provider status." }, { status: 400 });
    }
    const code = SAFE_PROVIDER_CODES.test(codeInput)
      ? codeInput
      : `HTTP_${status}`;
    const operation = SAFE_OPERATION.test(operationInput)
      ? operationInput
      : "client-provider-request";
    const page = SAFE_PAGE.test(pageInput) ? pageInput : null;
    const provider = ALLOWED_PROVIDERS.has(providerInput)
      ? providerInput
      : "supabase";
    const admin = getSupabaseAdmin();
    const token = request.headers.get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();
    let actorId: string | null = null;
    let actorRole = "public";
    if (token) {
      const auth = await admin.auth.getUser(token);
      actorId = auth.data.user?.id || null;
      if (actorId) {
        const identity = await admin
          .from("platform_identities")
          .select("primary_role")
          .eq("user_id", actorId)
          .maybeSingle();
        if (!identity.error && identity.data?.primary_role) {
          actorRole = String(identity.data.primary_role).slice(0, 40);
        }
      }
    }
    const reference = await capturePlatformError({
      request,
      admin,
      error: Object.assign(
        new Error(`CLIENT_PROVIDER_FAILURE:${status}`),
        { code },
      ),
      feature: "client-provider",
      action: operation,
      actorRole,
      actorId,
      provider,
      safeMessage: "This operation could not be completed.",
      severity: status === 401 ? "low" : "high",
      metadata: {
        provider_status: status,
        client_page: page,
        authenticated_actor: Boolean(actorId),
      },
    });
    return Response.json(
      {
        error: `This operation could not be completed. Please try again or contact support with reference ${reference}.`,
        request_id: reference,
      },
      {
        status: 202,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-ID": reference,
        },
      },
    );
  } catch (error) {
    return publicErrorResponse(
      error,
      "This operation could not be recorded.",
      500,
    );
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/monitor/client-provider", "POST", {
    classification: "provider-backed",
    feature: "client-provider",
    provider: "supabase",
    safeMessage: "This client provider failure could not be recorded.",
  }),
  POSTHandler,
);
