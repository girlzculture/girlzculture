import "server-only";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com";

export function openAiApiKey() {
  return String(process.env.OPENAI_API_KEY || "").trim();
}

/** Supports both OpenAI directly and Netlify AI Gateway. Netlify supplies an
 * OPENAI_BASE_URL without the REST version segment, while some compatible
 * gateways include /v1 already. */
export function openAiApiUrl(resource: string) {
  const configuredBase = String(
    process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
  )
    .trim()
    .replace(/\/+$/, "");
  const parsed = new URL(configuredBase);
  if (parsed.protocol !== "https:") {
    throw new Error("OPENAI_BASE_URL_INVALID");
  }
  const apiBase = configuredBase.endsWith("/v1")
    ? configuredBase
    : `${configuredBase}/v1`;
  return `${apiBase}/${resource.replace(/^\/+/, "")}`;
}
