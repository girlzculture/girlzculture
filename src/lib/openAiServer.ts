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

/** Classify an HTTP rejection without retaining provider prose, headers, keys
 * or echoed input. Unknown codes stay OTHER; this is never a retry signal. */
export async function openAiHttpFailure(response: Response) {
  const categories: Record<string, string> = {
    invalid_api_key: "AUTHENTICATION", insufficient_permissions: "PERMISSION",
    model_not_found: "MODEL_ACCESS", insufficient_quota: "QUOTA",
    rate_limit_exceeded: "RATE_LIMIT", invalid_json_schema: "SCHEMA",
    unsupported_parameter: "PARAMETER", unsupported_value: "PARAMETER",
    invalid_parameter: "PARAMETER",
  };
  let category = "OTHER";
  const reader = response.body?.getReader();
  if (reader) {
    try {
      const decoder = new TextDecoder(); let body = "", bytes = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 16_384) { await reader.cancel(); body = ""; break; }
        body += decoder.decode(next.value, { stream: true });
      }
      body += decoder.decode();
      const error = JSON.parse(body)?.error;
      if (typeof error?.code === "string" && Object.hasOwn(categories, error.code)) category = categories[error.code];
      else if (response.status === 401) category = "AUTHENTICATION";
      else if (response.status === 403) category = "PERMISSION";
      else if (response.status === 400 && typeof error?.message === "string" && /^Invalid schema for response_format\b/i.test(error.message)) category = "SCHEMA";
    } catch { /* Unreadable/non-JSON failures retain only their HTTP status. */ }
    finally { reader.releaseLock(); }
  }
  const destination = new URL(openAiApiUrl("chat/completions")).origin === "https://api.openai.com" ? "DIRECT" : "COMPATIBLE";
  return `OPENAI_${destination}_HTTP_${response.status}_${category}`;
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
