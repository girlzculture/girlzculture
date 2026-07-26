import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { errorResponse } from "@/lib/requestSecurity";
import {
  aiProviderConfigured,
  approvedAiProviders,
} from "@/lib/aiAutomationServer";
import {
  testVideoTranscoderConnection,
  videoTranscoderConfigured,
} from "@/lib/videoProcessingServer";

const EXPECTED_MIGRATION = "20260725107000";
type State = "healthy" | "degraded" | "not_configured";
type HealthRow = {
  integration_key: string;
  state: State;
  last_checked_at: string;
  last_success_at?: string | null;
  safe_error?: string | null;
};
type Status = {
  key: string;
  label: string;
  state: State;
  detail: string;
  required: boolean;
  envNames: string[];
  setup: string;
  lastChecked?: string | null;
  lastSuccess?: string | null;
  safeError?: string | null;
  canTest: boolean;
};

function environmentName() {
  return (
    process.env.CONTEXT ||
    process.env.DEPLOY_CONTEXT ||
    process.env.NODE_ENV ||
    "unknown"
  );
}

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]));
}

function status(
  input: Omit<
    Status,
    "state" | "lastChecked" | "lastSuccess" | "safeError"
  > & {
    configured: boolean;
    verified?: boolean;
    detail: string;
  },
  previous?: HealthRow,
): Status {
  const state: State = !input.configured
    ? "not_configured"
    : previous?.state === "healthy" || input.verified
      ? "healthy"
      : previous?.state === "degraded"
        ? "degraded"
        : "degraded";
  return {
    key: input.key,
    label: input.label,
    state,
    detail: input.detail,
    required: input.required,
    envNames: input.envNames,
    setup: input.setup,
    canTest: input.canTest,
    lastChecked: previous?.last_checked_at || null,
    lastSuccess:
      input.verified
        ? new Date().toISOString()
        : previous?.last_success_at || null,
    safeError: previous?.safe_error || null,
  };
}

function providerSpecs(
  history: Map<string, HealthRow>,
  directlyVerified: {
    database: boolean;
    storage: boolean;
    migrations: boolean;
    localeCount: number;
  },
) {
  const aiConfigured = approvedAiProviders().some(
    (provider) => provider !== "test" && aiProviderConfigured(provider),
  );
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "");
  return [
    status(
      {
        key: "database",
        label: "Supabase database & Auth",
        configured: configured(
          "NEXT_PUBLIC_SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
        ),
        verified: directlyVerified.database,
        detail: directlyVerified.database
          ? "The authenticated server connection is responding."
          : "The database connection could not be verified.",
        required: true,
        envNames: [
          "NEXT_PUBLIC_SUPABASE_URL",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
        ],
        setup:
          "Use the Supabase project URL and anon key for public clients. Keep the service-role key server-only in Netlify.",
        canTest: true,
      },
      history.get("database"),
    ),
    status(
      {
        key: "migrations",
        label: "Database migrations",
        configured: true,
        verified: directlyVerified.migrations,
        detail: directlyVerified.migrations
          ? `The connected database declares repository schema ${EXPECTED_MIGRATION}.`
          : `The connected database does not declare repository schema ${EXPECTED_MIGRATION}.`,
        required: true,
        envNames: [],
        setup:
          "Apply migrations through the protected GitHub database workflow after preview verification. Never mark an unapplied migration as complete.",
        canTest: true,
      },
      history.get("migrations"),
    ),
    status(
      {
        key: "storage",
        label: "Supabase media storage",
        configured: configured(
          "NEXT_PUBLIC_SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
        ),
        verified: directlyVerified.storage,
        detail: directlyVerified.storage
          ? "Storage buckets are available to the authenticated server."
          : "Storage could not be verified.",
        required: true,
        envNames: [
          "NEXT_PUBLIC_SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
        ],
        setup:
          "Create the repository-defined buckets and policies through migrations; never make private source buckets public.",
        canTest: true,
      },
      history.get("storage"),
    ),
    status(
      {
        key: "stripe",
        label: "Stripe payments",
        configured: configured(
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
        ),
        detail:
          "Stripe handles subscriptions, booking deposits, combined checkout, Stripe Tax, refunds, and Connect evidence.",
        required: true,
        envNames: [
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
          "STRIPE_TAX_ENABLED",
        ],
        setup:
          "Configure test-mode server credentials and the webhook endpoint. Register the required tax jurisdictions and product tax behavior before enabling STRIPE_TAX_ENABLED. Subscribe to checkout, invoice, subscription, refund, and dispute events.",
        canTest: true,
      },
      history.get("stripe"),
    ),
    status(
      {
        key: "email",
        label: "Transactional email",
        configured: configured("RESEND_API_KEY", "EMAIL_FROM"),
        detail:
          "Email sends booking, account, support, and commerce communications.",
        required: true,
        envNames: ["RESEND_API_KEY", "EMAIL_FROM"],
        setup:
          "Verify the sending domain in Resend and use a branded sender address. Keep the API key server-only.",
        canTest: true,
      },
      history.get("email"),
    ),
    status(
      {
        key: "sms",
        label: "Transactional SMS",
        configured: configured(
          "TWILIO_ACCOUNT_SID",
          "TWILIO_AUTH_TOKEN",
          "TWILIO_PHONE_NUMBER",
        ),
        detail:
          "SMS is an optional notification channel; email and in-app delivery remain available.",
        required: false,
        envNames: [
          "TWILIO_ACCOUNT_SID",
          "TWILIO_AUTH_TOKEN",
          "TWILIO_PHONE_NUMBER",
        ],
        setup:
          "Configure a Twilio account, approved sending number, and server-only credentials.",
        canTest: true,
      },
      history.get("sms"),
    ),
    status(
      {
        key: "maps",
        label: "Maps & geocoding",
        configured: Boolean(
          process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
            process.env.GOOGLE_MAPS_API_KEY,
        ),
        detail:
          "Maps enrich location selection and results; structured list discovery remains the fallback.",
        required: false,
        envNames: [
          "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
          "GOOGLE_MAPS_API_KEY",
        ],
        setup:
          "Restrict the browser key by approved domains and APIs. Keep any server geocoding key server-only.",
        canTest: true,
      },
      history.get("maps"),
    ),
    status(
      {
        key: "openai",
        label: "OpenAI",
        configured: aiConfigured,
        detail:
          "AI assistance remains optional and deterministic fallback stays active when no provider is configured.",
        required: false,
        envNames: ["OPENAI_API_KEY"],
        setup:
          "Add a server-only provider key, keep Engine assistance disabled until reviewed, and set explicit budgets and use-case gates.",
        canTest: true,
      },
      history.get("openai"),
    ),
    status(
      {
        key: "transcoder",
        label: "Video transcoder",
        configured: videoTranscoderConfigured(),
        detail:
          "Cloudinary creates H.264/AAC MP4 derivatives and poster images for ordinary phone and browser uploads. A private custom endpoint remains a supported fallback.",
        required: true,
        envNames: [
          "CLOUDINARY_CLOUD_NAME",
          "CLOUDINARY_API_KEY",
          "CLOUDINARY_API_SECRET",
        ],
        setup:
          "Create a Cloudinary account, configure the three server-only environment variables, then use Test Connection. Never expose the API secret to the browser.",
        canTest: true,
      },
      history.get("transcoder"),
    ),
    status(
      {
        key: "media_cleanup",
        label: "Scheduled media cleanup",
        configured: configured("CRON_SECRET") && Boolean(process.env.NETLIFY),
        detail:
          "The protected scheduled function expires abandoned sources and stale reservations.",
        required: true,
        envNames: ["CRON_SECRET", "NETLIFY"],
        setup:
          "Set CRON_SECRET in Netlify and keep the repository media-cleanup scheduled function enabled.",
        canTest: true,
      },
      history.get("media_cleanup"),
    ),
    status(
      {
        key: "push",
        label: "Web push",
        configured: configured(
          "VAPID_PRIVATE_KEY",
          "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
        ),
        detail:
          "Web push is optional; private signing material remains server-only.",
        required: false,
        envNames: ["VAPID_PRIVATE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY"],
        setup:
          "Generate one VAPID key pair and store the private key only in Netlify.",
        canTest: true,
      },
      history.get("push"),
    ),
    status(
      {
        key: "netlify",
        label: "Netlify deployment",
        configured: Boolean(process.env.NETLIFY || process.env.URL),
        detail:
          "Netlify provides the production runtime, deploy identity, functions, TLS, and aliases.",
        required: true,
        envNames: ["NETLIFY", "URL", "COMMIT_REF", "CONTEXT"],
        setup:
          "Connect the repository, configure scoped environment variables, enable skew protection, and require passing preview checks.",
        canTest: true,
      },
      history.get("netlify"),
    ),
    status(
      {
        key: "domains",
        label: "Domains & TLS",
        configured: /^https:\/\//i.test(siteUrl),
        detail:
          "The canonical public URL and dashboard aliases must resolve over valid HTTPS before subdomain routing is enabled.",
        required: true,
        envNames: [
          "NEXT_PUBLIC_SITE_URL",
          "NEXT_PUBLIC_SITE_HOST",
          "NEXT_PUBLIC_SALON_DASHBOARD_HOST",
          "NEXT_PUBLIC_ADMIN_HOST",
          "DASHBOARD_SUBDOMAINS_ENABLED",
        ],
        setup:
          "Follow docs/DASHBOARD_SUBDOMAIN_SETUP.md for Netlify aliases, DNS CNAMEs, TLS, redirects, and role-isolated session testing.",
        canTest: true,
      },
      history.get("domains"),
    ),
    status(
      {
        key: "translations",
        label: "Language registry",
        configured: directlyVerified.localeCount > 0,
        verified: directlyVerified.localeCount > 0,
        detail: `${directlyVerified.localeCount} enabled language(s) were returned; English remains the fallback.`,
        required: true,
        envNames: [],
        setup:
          "Enable languages and publish reviewed translations in Languages & Translations.",
        canTest: true,
      },
      history.get("translations"),
    ),
  ] satisfies Status[];
}

async function GETHandler(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "settings");
    const [
      engineResult,
      storageResult,
      localeResult,
      healthResult,
    ] = await Promise.all([
      admin
        .from("engine_settings")
        .select("published_value")
        .eq("setting_key", "integrations.expected_migration")
        .maybeSingle(),
      admin.storage.listBuckets(),
      admin
        .from("supported_locales")
        .select("locale", { count: "exact", head: true })
        .eq("is_enabled", true),
      admin.from("integration_health_checks").select(
        "integration_key,state,last_checked_at,last_success_at,safe_error",
      ),
    ]);
    const declaredMigration = String(
      engineResult.data?.published_value || "",
    ).replaceAll('"', "");
    const history = new Map(
      ((healthResult.data || []) as HealthRow[]).map((row) => [
        row.integration_key,
        row,
      ]),
    );
    const statuses = providerSpecs(history, {
      database: !engineResult.error,
      storage: !storageResult.error,
      migrations:
        !engineResult.error && declaredMigration === EXPECTED_MIGRATION,
      localeCount: localeResult.error ? 0 : localeResult.count || 0,
    });
    return Response.json({
      expectedMigration: EXPECTED_MIGRATION,
      checkedAt: new Date().toISOString(),
      statuses,
    });
  } catch (error) {
    noteOperationalFailure("Engine system status failed", error);
    return errorResponse(
      error,
      "Unable to check connected platform systems.",
    );
  }
}

async function safeFetch(
  input: string,
  init: RequestInit,
  timeoutMilliseconds = 10_000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function testIntegration(
  key: string,
  admin: Awaited<
    ReturnType<typeof requireAdminPermission>
  >["admin"],
) {
  if (key === "database" || key === "migrations") {
    const { data, error } = await admin
      .from("engine_settings")
      .select("published_value")
      .eq("setting_key", "integrations.expected_migration")
      .maybeSingle();
    if (error) throw error;
    if (
      key === "migrations" &&
      String(data?.published_value || "").replaceAll('"', "") !==
        EXPECTED_MIGRATION
    )
      throw new Error("MIGRATION_VERSION_MISMATCH");
    return;
  }
  if (key === "storage") {
    const { error } = await admin.storage.listBuckets();
    if (error) throw error;
    return;
  }
  if (key === "stripe") {
    if (!process.env.STRIPE_SECRET_KEY)
      throw new Error("NOT_CONFIGURED");
    const response = await safeFetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    if (!response.ok) throw new Error("PROVIDER_CONNECTION_FAILED");
    return;
  }
  if (key === "email") {
    if (!process.env.RESEND_API_KEY) throw new Error("NOT_CONFIGURED");
    const response = await safeFetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!response.ok) throw new Error("PROVIDER_CONNECTION_FAILED");
    return;
  }
  if (key === "sms") {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error("NOT_CONFIGURED");
    const response = await safeFetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        },
      },
    );
    if (!response.ok) throw new Error("PROVIDER_CONNECTION_FAILED");
    return;
  }
  if (key === "maps") {
    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error("NOT_CONFIGURED");
    const response = await safeFetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=New%20York&key=${encodeURIComponent(apiKey)}`,
      {},
    );
    if (!response.ok) throw new Error("PROVIDER_CONNECTION_FAILED");
    const body = (await response.json()) as { status?: string };
    if (!["OK", "ZERO_RESULTS"].includes(String(body.status)))
      throw new Error("PROVIDER_CONNECTION_FAILED");
    return;
  }
  if (key === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("NOT_CONFIGURED");
    const response = await safeFetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });
    if (!response.ok) throw new Error("PROVIDER_CONNECTION_FAILED");
    return;
  }
  if (key === "transcoder") {
    await testVideoTranscoderConnection();
    return;
  }
  if (key === "domains") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl || !/^https:\/\//i.test(siteUrl))
      throw new Error("NOT_CONFIGURED");
    const response = await safeFetch(siteUrl, {
      method: "HEAD",
      redirect: "follow",
    });
    if (!response.ok) throw new Error("PROVIDER_CONNECTION_FAILED");
    return;
  }
  if (key === "netlify") {
    if (!process.env.NETLIFY && !process.env.URL)
      throw new Error("NOT_CONFIGURED");
    return;
  }
  if (key === "media_cleanup") {
    if (!process.env.CRON_SECRET || !process.env.NETLIFY)
      throw new Error("NOT_CONFIGURED");
    return;
  }
  if (key === "push") {
    if (
      !process.env.VAPID_PRIVATE_KEY ||
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    )
      throw new Error("NOT_CONFIGURED");
    return;
  }
  if (key === "translations") {
    const { count, error } = await admin
      .from("supported_locales")
      .select("locale", { count: "exact", head: true })
      .eq("is_enabled", true);
    if (error) throw error;
    if (!count) throw new Error("NO_ENABLED_LOCALES");
    return;
  }
  throw new Error("UNKNOWN_INTEGRATION");
}

async function POSTHandler(request: Request) {
  const context = await requireAdminPermission(request, "settings");
  const body = (await request.json()) as { key?: unknown };
  const key = String(body.key || "").trim();
  if (!/^[a-z][a-z0-9_]{1,49}$/.test(key))
    return Response.json(
      { error: "Choose a valid integration." },
      { status: 400 },
    );
  const allowed = new Set([
    "database",
    "migrations",
    "storage",
    "stripe",
    "email",
    "sms",
    "maps",
    "openai",
    "transcoder",
    "media_cleanup",
    "push",
    "netlify",
    "domains",
    "translations",
  ]);
  if (!allowed.has(key))
    return Response.json(
      { error: "Choose a supported integration." },
      { status: 400 },
    );
  const now = new Date().toISOString();
  let state: State = "healthy";
  let safeError: string | null = null;
  try {
    await testIntegration(key, context.admin);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    state = code === "NOT_CONFIGURED" ? "not_configured" : "degraded";
    safeError =
      state === "not_configured"
        ? "Required deployment configuration is missing."
        : "The provider did not confirm a healthy connection.";
    if (state === "degraded")
      noteOperationalFailure(`Engine ${key} connection test failed`, error);
  }
  const { data, error } = await context.admin
    .from("integration_health_checks")
    .upsert(
      {
        integration_key: key,
        state,
        last_checked_at: now,
        ...(state === "healthy" ? { last_success_at: now } : {}),
        safe_error: safeError,
        environment: environmentName(),
        checked_by: context.user.id,
        updated_at: now,
      },
      { onConflict: "integration_key" },
    )
    .select(
      "integration_key,state,last_checked_at,last_success_at,safe_error",
    )
    .single();
  if (error) throw error;
  return Response.json({ result: data });
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/engine/system-status", "GET", {
    classification: "protected",
    feature: "engine-system-health",
    actorRole: "admin",
    safeMessage: "The platform systems could not be checked.",
  }),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/engine/system-status", "POST", {
    classification: "provider-backed",
    feature: "engine-integration-test",
    actorRole: "admin",
    safeMessage: "The integration test could not be completed.",
  }),
  POSTHandler,
);
