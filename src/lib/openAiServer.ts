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

type OpenAiChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: Record<string, unknown>;
};

/** Read the assistant text from the Chat Completions response shape used by
 * both OpenAI directly and Netlify AI Gateway. */
export function openAiChatCompletionText(payload: unknown) {
  const row = payload as OpenAiChatCompletionPayload | null;
  const content = row?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? String((part as { text: string }).text)
          : "",
      )
      .join("")
      .trim();
    if (text) return text;
  }
  throw new Error("OPENAI_CHAT_COMPLETION_EMPTY");
}

/** Normalize Chat Completions token names to the internal Responses-style
 * names already used by the governed budget ledger. */
export function openAiChatCompletionUsage(payload: unknown) {
  const usage = (payload as OpenAiChatCompletionPayload | null)?.usage || {};
  const numeric = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  return {
    input_tokens: numeric(usage.prompt_tokens),
    output_tokens: numeric(usage.completion_tokens),
  };
}
