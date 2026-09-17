/** Safe, actionable descriptions shared by editorial and private-message paths. */
export function translationProviderFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const failures: Record<string, { error: string; status: number }> = {
    DEEPL_NOT_CONFIGURED: { error: "Translation is not configured yet. Keep the original text or enter a reviewed translation.", status: 503 },
    DEEPL_AUTH_FAILED: { error: "The translation account could not be authenticated. Contact platform support; the original text is unchanged.", status: 503 },
    DEEPL_QUOTA_EXHAUSTED: { error: "The free translation allowance is exhausted. Keep the original text or enter a reviewed translation. No paid upgrade was made.", status: 429 },
    DEEPL_LANGUAGE_UNSUPPORTED: { error: "The translation provider does not currently support this language. Keep the original text or enter a reviewed translation.", status: 422 },
    DEEPL_RATE_LIMIT: { error: "The translation provider is busy. Try again later; the original text is unchanged.", status: 429 },
    DEEPL_ALLOWANCE_UNAVAILABLE: { error: "Translation is currently unavailable under the configured limits. Keep the original text or contact platform support.", status: 503 },
    DEEPL_FACTS_CHANGED: { error: "The translation did not preserve the original details and was rejected. The original text is unchanged.", status: 502 },
  };
  if (!/^DEEPL_[A-Z_]+$/.test(code)) return null;
  return { code, ...(failures[code] || { error: "Translation is temporarily unavailable. The original text is unchanged.", status: 503 }) };
}
