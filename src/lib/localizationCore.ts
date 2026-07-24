export type TranslationWorkflowEntry = {
  status: string;
  machine_generated?: boolean;
};

export function translationWorkflowState(entry: TranslationWorkflowEntry) {
  if (entry.status === "Missing") return "Untranslated";
  if (entry.status === "Draft" && entry.machine_generated) return "Generated";
  if (entry.status === "Reviewed") return "Reviewed";
  if (entry.status === "Published") return "Published";
  return "Draft";
}

export function resolveSourceTranslation(
  source: string,
  remote: Record<string, string> = {},
  bundled: Record<string, string> = {},
) {
  const normalized = String(source || "").replace(/\s+/g, " ").trim();
  return remote[normalized] || bundled[normalized] || normalized;
}

export function canGenerateTranslationDraft(impactLevel: string) {
  return !new Set(["booking", "billing", "security", "safety", "legal"]).has(
    impactLevel,
  );
}

export function translatedMessageFields(input: {
  original: string;
  translated?: string;
  locale?: string;
  provider?: string;
  previewed: boolean;
  now: string;
}) {
  const original = input.original.trim();
  const translated = input.translated?.trim() || "";
  if (!original) throw new Error("Enter a message before sending.");
  if (translated && !input.previewed)
    throw new Error("Preview the translation before sending it.");
  return {
    body: original,
    original_body: original,
    translated_body: translated || null,
    translation_locale: translated ? input.locale || null : null,
    translation_provider: translated ? input.provider || "provider" : null,
    translation_previewed_at: translated ? input.now : null,
  };
}
