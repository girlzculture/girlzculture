import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aiProviderConfigured,
  approvedAiModels,
  approvedAiProviders,
  redactSensitiveText,
} from "@/lib/aiAutomationServer";

type Feature = {
  feature_key: string;
  is_enabled: boolean;
  provider_key: string;
  model_key: string;
  timeout_ms: number;
  daily_request_limit: number;
  monthly_budget_cents: number;
};

function responseText(payload: unknown) {
  const row = payload as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
  if (typeof row.output_text === "string") return row.output_text;
  return (row.output || []).flatMap((entry) => entry.content || []).map((entry) => typeof entry.text === "string" ? entry.text : "").join("").trim();
}

function limitWords(value: string, maximum = 300) {
  return value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, maximum).join(" ");
}

/** Returns an editable draft only. It never updates or publishes the salon. */
export async function createSalonDescriptionDraft(
  admin: SupabaseClient,
  userId: string,
  salonName: string,
  rawKeywords: string,
) {
  const keywords = redactSensitiveText(rawKeywords).replace(/\s+/g, " ").trim().slice(0, 600);
  if (keywords.length < 3) throw new Error("Enter a few services, qualities, or details about the salon.");

  const { data: feature, error } = await admin
    .from("ai_automation_features")
    .select("feature_key,is_enabled,provider_key,model_key,timeout_ms,daily_request_limit,monthly_budget_cents")
    .eq("feature_key", "salon_description")
    .maybeSingle<Feature>();
  if (error) throw error;
  if (!feature) throw new Error("SALON_DESCRIPTION_FEATURE_UNAVAILABLE");

  const { data: killSetting, error: killError } = await admin
    .from("engine_settings")
    .select("published_value")
    .eq("setting_key", "ai.emergency_kill_switch")
    .maybeSingle();
  if (killError) throw killError;
  const killed = killSetting?.published_value !== false;
  if (killed || !feature.is_enabled) {
    const { error: usageError } = await admin.from("ai_usage_events").insert({
      feature_key: feature.feature_key,
      provider_key: feature.provider_key,
      model_key: feature.model_key,
      outcome: "blocked",
      requested_by: userId,
      safe_error_code: killed ? "KILL_SWITCH" : "FEATURE_DISABLED",
    });
    if (usageError) throw usageError;
    throw new Error("SALON_DESCRIPTION_FEATURE_UNAVAILABLE");
  }
  if (
    feature.provider_key !== "openai" ||
    !approvedAiProviders().includes(feature.provider_key) ||
    !approvedAiModels(feature.provider_key).includes(feature.model_key) ||
    !aiProviderConfigured(feature.provider_key)
  ) throw new Error("SALON_DESCRIPTION_PROVIDER_UNAVAILABLE");

  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const month = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  const [daily, monthly] = await Promise.all([
    admin.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("feature_key", feature.feature_key).gte("created_at", day.toISOString()),
    admin.from("ai_usage_events").select("estimated_cost_cents").eq("feature_key", feature.feature_key).gte("created_at", month.toISOString()),
  ]);
  if (daily.error) throw daily.error;
  if (monthly.error) throw monthly.error;
  const spent = (monthly.data || []).reduce((sum, row) => sum + Number(row.estimated_cost_cents || 0), 0);
  if (Number(daily.count || 0) >= feature.daily_request_limit || feature.monthly_budget_cents <= 0 || spent >= feature.monthly_budget_cents)
    throw new Error("SALON_DESCRIPTION_LIMIT_REACHED");

  let output = "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(Number(feature.timeout_ms || 12_000), 1_000), 30_000));
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: feature.model_key,
        instructions: "Write a truthful, warm salon profile description using only the supplied salon name and owner-provided details. Do not invent credentials, awards, prices, guarantees, or locations. Use 70 to 140 words. Return only the description.",
        input: `Salon name: ${salonName}\nOwner-provided details: ${keywords}`,
        max_output_tokens: 400,
      }),
    });
    if (!response.ok) throw new Error("SALON_DESCRIPTION_PROVIDER_FAILED");
    output = limitWords(responseText(await response.json()));
    if (output.split(/\s+/u).filter(Boolean).length < 25)
      throw new Error("SALON_DESCRIPTION_PROVIDER_FAILED");
  } catch {
    await admin.from("ai_usage_events").insert({
      feature_key: feature.feature_key,
      provider_key: feature.provider_key,
      model_key: feature.model_key,
      outcome: "failed",
      requested_by: userId,
      safe_error_code: "PROVIDER_FAILED",
    });
    throw new Error("SALON_DESCRIPTION_PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }

  const { data: draft, error: draftError } = await admin
    .from("ai_generation_drafts")
    .insert({
      feature_key: "salon_description",
      provider_key: feature.provider_key,
      model_key: feature.model_key,
      input_summary: keywords.slice(0, 500),
      output_text: output,
      requested_by: userId,
      safety_flags: keywords.includes("[REDACTED]") ? ["pii_redacted"] : [],
    })
    .select("id,status,created_at")
    .single();
  if (draftError) throw draftError;
  const { error: usageError } = await admin.from("ai_usage_events").insert({
    feature_key: feature.feature_key,
    provider_key: feature.provider_key,
    model_key: feature.model_key,
    outcome: "completed",
    input_units: keywords.length,
    output_units: output.length,
    requested_by: userId,
  });
  if (usageError) throw usageError;
  return { text: output, draftId: draft.id, humanReviewRequired: true, aiAssisted: true };
}
