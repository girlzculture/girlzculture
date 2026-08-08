import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aiProviderConfigured,
  approvedAiModels,
  approvedAiProviders,
} from "@/lib/aiAutomationServer";
import {
  deterministicContentDecision,
  type ModerationDecision,
} from "@/lib/contentModerationCore";
import { noteOperationalFailure } from "@/lib/operationalTelemetryContext";

type ModerationFeature = {
  is_enabled?: boolean;
  provider_key?: string;
  model_key?: string;
  timeout_ms?: number;
  moderation_required?: boolean;
};

function providerFlagged(payload: unknown) {
  const result = (payload as { results?: Array<{ flagged?: unknown }> })?.results?.[0];
  return result?.flagged === true;
}

/**
 * Moderates untrusted public content on the server. Provider errors, response
 * bodies, and credentials are deliberately never returned to the caller. The
 * deterministic policy remains authoritative whenever the provider is absent,
 * disabled, times out, or returns an unusable response.
 */
export async function moderatePublicContent(
  admin: SupabaseClient,
  input: { name?: string; title?: string; body?: string },
): Promise<ModerationDecision> {
  const deterministic = deterministicContentDecision(input);
  if (!deterministic.allowed) return deterministic;

  try {
    const { data: feature, error } = await admin
      .from("ai_automation_features")
      .select("is_enabled,provider_key,model_key,timeout_ms,moderation_required")
      .eq("feature_key", "moderation_assist")
      .maybeSingle<ModerationFeature>();
    if (error) {
      noteOperationalFailure(
        "Review moderation configuration could not be read",
        new Error("REVIEW_MODERATION_CONFIG_READ_FAILED"),
      );
      return deterministic;
    }
    if (!feature?.is_enabled || feature.moderation_required === false)
      return deterministic;

    const provider = String(feature.provider_key || "test");
    if (provider !== "openai") return deterministic;
    if (
      !approvedAiProviders().includes(provider) ||
      !approvedAiModels(provider).includes(String(feature.model_key || "")) ||
      !aiProviderConfigured(provider)
    ) {
      noteOperationalFailure(
        "Review moderation provider is not configured",
        new Error("REVIEW_MODERATION_PROVIDER_NOT_CONFIGURED"),
      );
      return deterministic;
    }

    const content = [
      input.name ? `Public first name: ${input.name}` : "",
      input.title ? `Review title: ${input.title}` : "",
      input.body ? `Review body: ${input.body}` : "",
    ].filter(Boolean).join("\n").slice(0, 4_000);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(Math.max(Number(feature.timeout_ms || 8_000), 1_000), 15_000),
    );
    try {
      const response = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: feature.model_key,
          input: content,
        }),
      });
      if (!response.ok) {
        noteOperationalFailure(
          "Review moderation provider returned an error",
          new Error(`REVIEW_MODERATION_PROVIDER_HTTP_${response.status}`),
        );
        return deterministic;
      }
      return providerFlagged(await response.json())
        ? { allowed: false, outcome: "review", reason: "unsafe", source: "provider" }
        : { allowed: true, outcome: "allow", source: "provider" };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    noteOperationalFailure(
      "Review moderation provider request failed",
      new Error(
        error instanceof Error && error.name === "AbortError"
          ? "REVIEW_MODERATION_PROVIDER_TIMEOUT"
          : "REVIEW_MODERATION_PROVIDER_FAILURE",
      ),
    );
    return deterministic;
  }
}
