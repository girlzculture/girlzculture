import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { aiProviderConfigured, approvedAiModels, approvedAiProviders, runAiSandbox } from "@/lib/aiAutomationServer";

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "settings");
    const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
    const [{ data: features, error }, { data: prompts }, { data: usage }, { data: drafts }, { data: kill }] = await Promise.all([
      admin.from("ai_automation_features").select("*").order("display_name"),
      admin.from("ai_prompt_versions").select("id,feature_key,version,status,change_reason,created_at,published_at").order("created_at", { ascending: false }).limit(100),
      admin.from("ai_usage_events").select("feature_key,outcome,input_units,output_units,estimated_cost_cents,created_at").gte("created_at", month.toISOString()).order("created_at", { ascending: false }).limit(500),
      admin.from("ai_generation_drafts").select("id,feature_key,status,output_text,safety_flags,created_at").order("created_at", { ascending: false }).limit(25),
      admin.from("engine_settings").select("published_value").eq("setting_key", "ai.emergency_kill_switch").maybeSingle(),
    ]);
    if (error) throw error;
    const providers = approvedAiProviders().map((key) => ({ key, configured: aiProviderConfigured(key), models: approvedAiModels(key) }));
    return Response.json({ features: features || [], prompts: prompts || [], usage: usage || [], drafts: drafts || [], providers, killSwitch: kill?.published_value !== false });
  } catch (error) {
    console.error("AI Engine load failed", error);
    return errorResponse(error, "Unable to load AI and automation controls.");
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "settings");
    const body = await request.json() as Record<string, unknown>;
    const featureKey = cleanText(body.feature_key, 120);
    const { data: existing, error: loadError } = await admin.from("ai_automation_features").select("*").eq("feature_key", featureKey).single();
    if (loadError || !existing) throw loadError || new Error("Choose a valid AI feature.");
    const provider = cleanText(body.provider_key ?? existing.provider_key, 40).toLowerCase();
    const model = cleanText(body.model_key ?? existing.model_key, 120);
    if (!approvedAiProviders().includes(provider)) throw new Error("Choose a provider approved in secure deployment configuration.");
    if (!approvedAiModels(provider).includes(model)) throw new Error("Choose a model approved for this provider.");
    const daily = Number(body.daily_request_limit ?? existing.daily_request_limit);
    const budget = Number(body.monthly_budget_cents ?? existing.monthly_budget_cents);
    const timeout = Number(body.timeout_ms ?? existing.timeout_ms);
    if (!Number.isInteger(daily) || daily < 0 || daily > 10_000) throw new Error("Daily request limit must be between 0 and 10,000.");
    if (!Number.isInteger(budget) || budget < 0 || budget > 10_000_000) throw new Error("Monthly budget must be between $0 and $100,000.");
    if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) throw new Error("Timeout must be between 1 and 120 seconds.");
    const patch = { is_enabled: body.is_enabled === true, provider_key: provider, model_key: model, approved_models: approvedAiModels(provider), human_review_required: true, daily_request_limit: daily, monthly_budget_cents: budget, timeout_ms: timeout, fallback_behavior: cleanText(body.fallback_behavior ?? existing.fallback_behavior, 30), pii_policy: cleanText(body.pii_policy ?? existing.pii_policy, 30), moderation_required: body.moderation_required !== false, updated_by: user.id, updated_at: new Date().toISOString() };
    const { data, error } = await admin.from("ai_automation_features").update(patch).eq("feature_key", featureKey).select().single();
    if (error) throw error;
    await admin.from("admin_security_events").insert({ actor_user_id: user.id, action: "ai_feature_configuration_updated", result: "Allowed", details: { feature_key: featureKey, before: existing, after: data } });
    return Response.json({ feature: data });
  } catch (error) {
    console.error("AI Engine configuration failed", error);
    return errorResponse(error, "Unable to save AI feature configuration.");
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "settings");
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 40);
    if (action !== "sandbox") throw new Error("Choose a supported AI Engine action.");
    const featureKey = cleanText(body.feature_key, 120);
    const { data: feature, error } = await admin.from("ai_automation_features").select("*").eq("feature_key", featureKey).single();
    if (error || !feature) throw error || new Error("Choose a valid AI feature.");
    const result = await runAiSandbox(admin, feature, user.id, body.input);
    await admin.from("admin_security_events").insert({ actor_user_id: user.id, action: "ai_sandbox_run", result: result.outcome, details: { feature_key: featureKey, outcome: result.outcome } });
    return Response.json({ result });
  } catch (error) {
    console.error("AI Engine sandbox failed", error);
    return errorResponse(error, "The AI sandbox could not complete this test.");
  }
}
