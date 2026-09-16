import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTranslationDraft, approvedAiModels, approvedAiProviders, aiProviderConfigured } from "@/lib/aiAutomationServer";
import { protectMessageFacts } from "@/lib/messageTranslationCore";

export async function bookingMessageTranslation(input: { admin: SupabaseClient; messageId: string; bookingId: string; locale: string; userId: string; names: string[] }) {
  const { admin } = input;
  if (!["en", "fr", "wo", "es", "zh-CN"].includes(input.locale)) throw new Error("MESSAGE_LOCALE_INVALID");
  const source = await admin.from("booking_messages").select("id,original_body,body,source_locale").eq("id", input.messageId).eq("booking_id", input.bookingId).single();
  if (source.error || !source.data) throw new Error("MESSAGE_NOT_FOUND");
  const original = String(source.data.original_body || source.data.body);
  if (source.data.source_locale === input.locale) return { translated_body: original, locale: input.locale, original: true, reviewed: false };
  const hash = createHash("sha256").update(original).digest("hex");
  const cached = await admin.from("booking_message_translations").select("translated_body,locale,provider,reviewed,source_hash").eq("message_id", input.messageId).eq("locale", input.locale).maybeSingle();
  if (cached.error) throw cached.error;
  if (cached.data?.source_hash === hash) return { ...cached.data, source_locale: source.data.source_locale, cached: true };
  const feature = await admin.from("ai_automation_features").select("*").eq("feature_key", "translation_drafts").maybeSingle();
  if (feature.error) throw feature.error;
  if (!feature.data?.is_enabled || !approvedAiProviders().includes(feature.data.provider_key) || !approvedAiModels(feature.data.provider_key).includes(feature.data.model_key) || !aiProviderConfigured(feature.data.provider_key)) return { unavailable: true };
  const kill = await admin.from("engine_settings").select("published_value").eq("setting_key", "ai.emergency_kill_switch").maybeSingle();
  if (kill.error || kill.data?.published_value !== false) return { unavailable: true };
  const facts = protectMessageFacts(original, input.names);
  const claim = await admin.rpc("claim_booking_message_translation", { p_message: input.messageId, p_locale: input.locale });
  if (claim.error) throw claim.error;
  if (claim.data !== true) return { pending: true };
  let reservedUsageId: string | undefined;
  if (feature.data.provider_key === "openai") {
    const inputRate = Number(process.env.AI_TRANSLATION_INPUT_USD_PER_MILLION);
    const outputRate = Number(process.env.AI_TRANSLATION_OUTPUT_USD_PER_MILLION);
    if (!Number.isFinite(inputRate) || inputRate <= 0 || !Number.isFinite(outputRate) || outputRate <= 0) return { unavailable: true };
    const cost = Math.max(1, Math.ceil(((Buffer.byteLength(facts.protectedSource) + 1500) * inputRate + 1800 * outputRate) / 10000));
    const reservation = await admin.rpc("reserve_governed_ai_usage", { p_feature: "translation_drafts", p_user: input.userId, p_cost_cents: cost });
    if (reservation.error || !reservation.data) return { unavailable: true };
    reservedUsageId = reservation.data;
  } else if (!["test", "deepl"].includes(feature.data.provider_key)) return { unavailable: true };
  const generated = await generateTranslationDraft(admin, feature.data, input.userId, facts.protectedSource, input.locale, { messageDisplay: true, reservedUsageId });
  const translated = facts.restore(generated.translatedText);
  if (translated.length > 4000) throw new Error("MESSAGE_TRANSLATION_TOO_LONG");
  const row = { message_id: input.messageId, locale: input.locale, translated_body: translated, source_hash: hash, provider: generated.provider, reviewed: false };
  const saved = await admin.from("booking_message_translations").upsert(row, { onConflict: "message_id,locale", ignoreDuplicates: true });
  if (saved.error) throw saved.error;
  return { ...row, source_locale: source.data.source_locale, cached: false };
}
