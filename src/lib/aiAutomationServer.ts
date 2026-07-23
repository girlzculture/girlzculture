import type { SupabaseClient } from "@supabase/supabase-js";

type AiFeature = {
  feature_key: string;
  is_enabled: boolean;
  provider_key: string;
  model_key: string;
  approved_models: unknown;
  human_review_required: boolean;
  daily_request_limit: number;
  monthly_budget_cents: number;
  timeout_ms: number;
  fallback_behavior: string;
  pii_policy: string;
  moderation_required: boolean;
};

const SAFE_PROVIDERS = new Set(["test", "openai", "anthropic", "google"]);
const SENSITIVE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b(?:\d[ -]*?){13,19}\b/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
];

export function approvedAiProviders() {
  const configured = String(process.env.AI_APPROVED_PROVIDERS || "test").split(",").map((value) => value.trim().toLowerCase()).filter((value) => SAFE_PROVIDERS.has(value));
  return [...new Set(["test", ...configured])];
}

export function approvedAiModels(provider: string) {
  if (provider === "test") return ["deterministic-test"];
  try {
    const parsed = JSON.parse(process.env.AI_APPROVED_MODELS || "{}") as Record<string, unknown>;
    return Array.isArray(parsed[provider]) ? (parsed[provider] as unknown[]).map(String).filter(Boolean).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function aiProviderConfigured(provider: string) {
  if (provider === "test") return true;
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === "google") return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  return false;
}

export function redactSensitiveText(value: unknown) {
  let text = String(value || "").slice(0, 12_000);
  for (const pattern of SENSITIVE_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text;
}

function deterministicDraft(featureKey: string, input: string) {
  const clean = input.replace(/\s+/g, " ").trim();
  if (featureKey === "search_vocabulary" || featureKey === "search_suggestions") {
    const words = [...new Set(clean.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2))].slice(0, 12);
    return `AI-generated draft (test adapter)\nSuggested review terms: ${words.join(", ") || "No safe terms detected"}.`;
  }
  if (featureKey === "support_response") return `AI-generated draft (test adapter)\nThank you for contacting Girlz Culture. We reviewed the information you shared: “${clean.slice(0, 240)}”. A support team member must review this draft before sending.`;
  return `AI-generated draft (test adapter)\nReview summary: ${clean.slice(0, 500) || "No source text was provided."}`;
}

export async function runAiSandbox(admin: SupabaseClient, feature: AiFeature, userId: string, rawInput: unknown) {
  const input = redactSensitiveText(rawInput);
  if (input.length < 3) throw new Error("Enter at least three characters for the sandbox test.");
  const { data: killSetting, error: killError } = await admin.from("engine_settings").select("published_value").eq("setting_key", "ai.emergency_kill_switch").maybeSingle();
  if (killError) throw killError;
  const killed = killSetting?.published_value !== false;
  if (killed || !feature.is_enabled) {
    const { error } = await admin.from("ai_usage_events").insert({ feature_key: feature.feature_key, provider_key: feature.provider_key, model_key: feature.model_key, outcome: "blocked", requested_by: userId, safe_error_code: killed ? "KILL_SWITCH" : "FEATURE_DISABLED" });
    if (error) throw error;
    return { outcome: "blocked" as const, fallback: feature.fallback_behavior, message: killed ? "AI is disabled by the emergency kill switch. Core behavior continues with its deterministic fallback." : "This AI feature is disabled. Core behavior continues with its configured fallback." };
  }
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfDay.getUTCMonth(), 1));
  const [dailyResult, monthlyResult] = await Promise.all([
    admin.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("feature_key", feature.feature_key).gte("created_at", startOfDay.toISOString()),
    admin.from("ai_usage_events").select("estimated_cost_cents").eq("feature_key", feature.feature_key).gte("created_at", startOfMonth.toISOString()),
  ]);
  if (dailyResult.error) throw dailyResult.error;
  if (monthlyResult.error) throw monthlyResult.error;
  const dayCount = dailyResult.count;
  const monthUsage = monthlyResult.data;
  const spent = (monthUsage || []).reduce((sum, row) => sum + Number(row.estimated_cost_cents || 0), 0);
  if (Number(dayCount || 0) >= feature.daily_request_limit || spent >= feature.monthly_budget_cents) {
    const { error } = await admin.from("ai_usage_events").insert({ feature_key: feature.feature_key, provider_key: feature.provider_key, model_key: feature.model_key, outcome: "blocked", requested_by: userId, safe_error_code: "LIMIT_REACHED" });
    if (error) throw error;
    return { outcome: "blocked" as const, fallback: feature.fallback_behavior, message: "The configured request or budget limit has been reached. No provider request was made." };
  }
  const allowedModels = approvedAiModels(feature.provider_key);
  if (!approvedAiProviders().includes(feature.provider_key) || !allowedModels.includes(feature.model_key) || !aiProviderConfigured(feature.provider_key)) {
    const { error } = await admin.from("ai_usage_events").insert({ feature_key: feature.feature_key, provider_key: feature.provider_key, model_key: feature.model_key, outcome: "fallback", requested_by: userId, safe_error_code: "PROVIDER_UNAVAILABLE" });
    if (error) throw error;
    return { outcome: "fallback" as const, fallback: feature.fallback_behavior, message: "The approved provider is not configured. No external request was made." };
  }
  // The repository intentionally ships only a deterministic adapter. External
  // adapters are enabled only after their reviewed package and data agreement
  // are added; selecting an external provider cannot silently transmit data.
  if (feature.provider_key !== "test") {
    const { error } = await admin.from("ai_usage_events").insert({ feature_key: feature.feature_key, provider_key: feature.provider_key, model_key: feature.model_key, outcome: "fallback", requested_by: userId, safe_error_code: "ADAPTER_NOT_INSTALLED" });
    if (error) throw error;
    return { outcome: "fallback" as const, fallback: feature.fallback_behavior, message: "This provider is approved but its reviewed server adapter is not installed. No data was transmitted." };
  }
  const output = deterministicDraft(feature.feature_key, input);
  const { data: draft, error } = await admin.from("ai_generation_drafts").insert({ feature_key: feature.feature_key, provider_key: feature.provider_key, model_key: feature.model_key, input_summary: input.slice(0, 500), output_text: output, requested_by: userId, safety_flags: input.includes("[REDACTED]") ? ["pii_redacted"] : [] }).select("id,status,output_text,safety_flags,created_at").single();
  if (error) throw error;
  const { error: usageError } = await admin.from("ai_usage_events").insert({ feature_key: feature.feature_key, provider_key: feature.provider_key, model_key: feature.model_key, outcome: "completed", input_units: input.length, output_units: output.length, requested_by: userId });
  if (usageError) throw usageError;
  return { outcome: "completed" as const, draft, humanReviewRequired: true };
}
