export const ASSISTANT_LANGUAGES = ["en", "fr", "es", "wo", "zh-CN"] as const;
export type AssistantLanguage = typeof ASSISTANT_LANGUAGES[number];
export function isAssistantLanguage(value: unknown): value is AssistantLanguage {
  return typeof value === "string" && ASSISTANT_LANGUAGES.some(locale => locale === value);
}
