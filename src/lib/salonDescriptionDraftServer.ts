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
  const row = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };
  if (typeof row.output_text === "string") return row.output_text;
  return (row.output || [])
    .flatMap((entry) => entry.content || [])
    .map((entry) => (typeof entry.text === "string" ? entry.text : ""))
    .join("")
    .trim();
}

function limitWords(value: string, maximum = 200) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, maximum)
    .join(" ");
}

function truthfulFallback(salonName: string, keywords: string) {
  const details = keywords
    .replace(/[.;]+/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,+/g, ",")
    .trim()
    .replace(/^,|,$/g, "");
  return limitWords(
    `${salonName} describes its services and qualities as: ${details}. This description uses only details supplied by the salon team. Customers can review the salon’s published services, prices, availability, and policies before booking.`,
  );
}

async function saveDraft(
  admin: SupabaseClient,
  values: {
    provider: string;
    model: string;
    keywords: string;
    output: string;
    userId: string;
    aiAssisted: boolean;
  },
) {
  const { data: draft, error } = await admin
    .from("ai_generation_drafts")
    .insert({
      feature_key: "salon_description",
      provider_key: values.provider,
      model_key: values.model,
      input_summary: values.keywords.slice(0, 500),
      output_text: values.output,
      requested_by: values.userId,
      safety_flags: values.keywords.includes("[REDACTED]")
        ? ["pii_redacted"]
        : [],
    })
    .select("id,status,created_at")
    .single();
  if (error) return null;
  return draft;
}

async function recordUsage(
  admin: SupabaseClient,
  values: {
    provider: string;
    model: string;
    outcome: string;
    userId: string;
    inputUnits?: number;
    outputUnits?: number;
    safeErrorCode?: string;
  },
) {
  await admin.from("ai_usage_events").insert({
    feature_key: "salon_description",
    provider_key: values.provider,
    model_key: values.model,
    outcome: values.outcome,
    input_units: values.inputUnits || 0,
    output_units: values.outputUnits || 0,
    requested_by: values.userId,
    safe_error_code: values.safeErrorCode || null,
  });
}

/** Returns an editable draft only. It never updates or publishes the salon. */
export async function createSalonDescriptionDraft(
  admin: SupabaseClient,
  userId: string,
  salonName: string,
  rawKeywords: string,
) {
  const keywords = redactSensitiveText(rawKeywords)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
  if (keywords.length < 3)
    throw new Error("Enter a few services, qualities, or details about the salon.");

  const fallback = async (code: string) => {
    const output = truthfulFallback(salonName, keywords);
    const draft = await saveDraft(admin, {
      provider: "deterministic",
      model: "truthful-template-v1",
      keywords,
      output,
      userId,
      aiAssisted: false,
    });
    await recordUsage(admin, {
      provider: "deterministic",
      model: "truthful-template-v1",
      outcome: "fallback",
      userId,
      inputUnits: keywords.length,
      outputUnits: output.length,
      safeErrorCode: code,
    });
    return {
      text: output,
      draftId: draft?.id || "",
      humanReviewRequired: true,
      aiAssisted: false,
      fallbackUsed: true,
    };
  };

  const { data: feature, error } = await admin
    .from("ai_automation_features")
    .select(
      "feature_key,is_enabled,provider_key,model_key,timeout_ms,daily_request_limit,monthly_budget_cents",
    )
    .eq("feature_key", "salon_description")
    .maybeSingle<Feature>();
  if (error || !feature) return fallback("FEATURE_UNAVAILABLE");

  const { data: killSetting, error: killError } = await admin
    .from("engine_settings")
    .select("published_value")
    .eq("setting_key", "ai.emergency_kill_switch")
    .maybeSingle();
  if (killError) return fallback("KILL_SWITCH_UNAVAILABLE");
  if (killSetting?.published_value !== false || !feature.is_enabled)
    return fallback(
      killSetting?.published_value !== false ? "KILL_SWITCH" : "FEATURE_DISABLED",
    );

  if (
    feature.provider_key !== "openai" ||
    !approvedAiProviders().includes(feature.provider_key) ||
    !approvedAiModels(feature.provider_key).includes(feature.model_key) ||
    !aiProviderConfigured(feature.provider_key)
  )
    return fallback("PROVIDER_UNAVAILABLE");

  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const month = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  const [daily, monthly] = await Promise.all([
    admin
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("feature_key", feature.feature_key)
      .gte("created_at", day.toISOString()),
    admin
      .from("ai_usage_events")
      .select("estimated_cost_cents")
      .eq("feature_key", feature.feature_key)
      .gte("created_at", month.toISOString()),
  ]);
  if (daily.error || monthly.error) return fallback("USAGE_LOOKUP_FAILED");
  const spent = (monthly.data || []).reduce(
    (sum, row) => sum + Number(row.estimated_cost_cents || 0),
    0,
  );
  if (
    Number(daily.count || 0) >= feature.daily_request_limit ||
    feature.monthly_budget_cents <= 0 ||
    spent >= feature.monthly_budget_cents
  )
    return fallback("LIMIT_REACHED");

  let output = "";
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(Math.max(Number(feature.timeout_ms || 12_000), 1_000), 30_000),
  );
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
        instructions:
          "Write a truthful, warm salon profile description using only the supplied salon name and owner-provided details. Do not invent credentials, awards, prices, guarantees, services, or locations. Use 70 to 140 words and never exceed 200 words. Return only the description.",
        input: `Salon name: ${salonName}\nOwner-provided details: ${keywords}`,
        max_output_tokens: 400,
      }),
    });
    if (!response.ok) return fallback(`PROVIDER_${response.status}`);
    output = limitWords(responseText(await response.json()));
    if (output.split(/\s+/u).filter(Boolean).length < 25)
      return fallback("PROVIDER_OUTPUT_INVALID");
  } catch {
    return fallback("PROVIDER_FAILED");
  } finally {
    clearTimeout(timeout);
  }

  const draft = await saveDraft(admin, {
    provider: feature.provider_key,
    model: feature.model_key,
    keywords,
    output,
    userId,
    aiAssisted: true,
  });
  await recordUsage(admin, {
    provider: feature.provider_key,
    model: feature.model_key,
    outcome: "completed",
    userId,
    inputUnits: keywords.length,
    outputUnits: output.length,
  });
  return {
    text: output,
    draftId: draft?.id || "",
    humanReviewRequired: true,
    aiAssisted: true,
    fallbackUsed: false,
  };
}
