import "server-only";

const FREE_ORIGIN = "https://api-free.deepl.com";
const TARGETS: Record<string, string> = { en: "en-US", fr: "fr", es: "es", wo: "wo", "zh-CN": "zh-Hans" };
type Language = { lang: string; usable_as_target?: boolean; status?: string };
type Usage = { character_count: number; character_limit: number };

export function deepLConfigured() {
  return Boolean(process.env.DEEPL_AUTH_KEY?.trim());
}

function configuration() {
  // This release is authorized for API Free only. No redirect, paid endpoint,
  // caller-selected URL or paid fallback may receive the application key.
  const endpoint = (process.env.DEEPL_API_URL || FREE_ORIGIN).trim().replace(/\/+$/, "");
  if (endpoint !== FREE_ORIGIN) throw new Error("DEEPL_FREE_ENDPOINT_REQUIRED");
  const key = process.env.DEEPL_AUTH_KEY?.trim();
  if (!key) throw new Error("DEEPL_NOT_CONFIGURED");
  return { endpoint, key };
}

async function request(path: string, timeoutMs: number, body?: object) {
  const { endpoint, key } = configuration();
  let response: Response;
  try {
    response = await fetch(`${endpoint}${path}`, {
      method: body ? "POST" : "GET", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(Math.min(20000, Math.max(1000, timeoutMs))),
      headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new Error("DEEPL_UNAVAILABLE"); }
  // No automatic retry: an interrupted POST might already have consumed quota.
  if (!response.ok) throw new Error(({ 401: "DEEPL_AUTH_FAILED", 403: "DEEPL_AUTH_FAILED", 429: "DEEPL_RATE_LIMIT", 456: "DEEPL_QUOTA_EXHAUSTED" } as Record<number, string>)[response.status] || "DEEPL_UNAVAILABLE");
  const text = await response.text();
  if (text.length > 128000) throw new Error("DEEPL_INVALID_RESPONSE");
  try { return JSON.parse(text); } catch { throw new Error("DEEPL_INVALID_RESPONSE"); }
}

/** Account metadata only; never returns the credential or translated text. */
export async function deepLAccountStatus(timeoutMs = 8000) {
  const [rawLanguages, rawUsage] = await Promise.all([
    request("/v3/languages?resource=translate_text", timeoutMs), request("/v2/usage", timeoutMs),
  ]);
  if (!Array.isArray(rawLanguages)) throw new Error("DEEPL_INVALID_RESPONSE");
  const languages: Language[] = rawLanguages.filter(row => row && typeof row.lang === "string");
  const usage = rawUsage as Usage;
  if (!Number.isSafeInteger(usage?.character_count) || usage.character_count < 0 || !Number.isSafeInteger(usage?.character_limit) || usage.character_limit <= 0) throw new Error("DEEPL_INVALID_RESPONSE");
  const supportedLocales = Object.entries(TARGETS).filter(([, code]) => languages.some(row => row.lang.toLowerCase() === code.toLowerCase() && row.usable_as_target === true && row.status === "stable")).map(([locale]) => locale);
  return { endpoint: FREE_ORIGIN, characterCount: usage.character_count, characterLimit: Math.min(usage.character_limit, 500000), remainingCharacters: Math.max(0, Math.min(usage.character_limit, 500000) - usage.character_count), supportedLocales };
}

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tokenLetters = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : tokenLetters(Math.floor(index / 26) - 1) + tokenLetters(index % 26);

function protect(source: string) {
  if (/__GC_DL_[A-Z]+__/u.test(source)) throw new Error("DEEPL_RESERVED_TOKEN");
  const values = new Map<string, string>();
  // Booking callers have already protected participant names. Ordinary UI
  // copy additionally freezes product names, placeholders, links and numbers.
  const pattern = /__GC_KEEP_[A-Z]+__|Girlz Culture|GC Assistant|\$?\{\{?[^{}\n]+\}\}?|%(?:\d+\$)?[sdf]|https?:\/\/[^\s<>]+|(?:[$€£¥]\s*)?\d+(?:[.,:/-]\d+)*(?:\s*(?:AM|PM|USD|EUR|GBP|CFA|XOF|CNY|RMB))?/giu;
  const replaced = source.replace(pattern, value => {
    const token = `__GC_DL_${tokenLetters(values.size)}__`;
    values.set(token, value); return token;
  });
  const xml = `<text>${escapeXml(replaced).replace(/__GC_DL_[A-Z]+__/gu, token => `<keep>${token}</keep>`)}</text>`;
  return { xml, restore(result: string) {
    if (!/^<text>[\s\S]*<\/text>$/u.test(result)) throw new Error("DEEPL_FACTS_CHANGED");
    const content = result.slice(6, -7).replace(/<keep>(__GC_DL_[A-Z]+__)<\/keep>/gu, "$1");
    if (/[<>]/u.test(content)) throw new Error("DEEPL_FACTS_CHANGED");
    const found = content.match(/__GC_DL_[A-Z]+__/gu) || [];
    if (found.length !== values.size || new Set(found).size !== values.size || found.some(token => !values.has(token))) throw new Error("DEEPL_FACTS_CHANGED");
    const decoded = content.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    if (/\d|https?:\/\/|[$€£¥]/u.test(decoded.replace(/__GC_DL_[A-Z]+__/gu, ""))) throw new Error("DEEPL_FACTS_CHANGED");
    return decoded.replace(/__GC_DL_[A-Z]+__/gu, token => values.get(token)!);
  } };
}

export async function translateWithDeepL(source: string, locale: string, options: {
  timeoutMs?: number;
  reserve: (input: { characters: number; remoteCount: number; remoteLimit: number }) => Promise<void>;
}) {
  if (!source.trim() || source.length > 12000 || !Object.hasOwn(TARGETS, locale)) throw new Error("DEEPL_INVALID_INPUT");
  const status = await deepLAccountStatus(options.timeoutMs);
  if (!status.supportedLocales.includes(locale)) throw new Error("DEEPL_LANGUAGE_UNSUPPORTED");
  const protectedText = protect(source);
  const characters = Array.from(protectedText.xml).length;
  if (characters > status.remainingCharacters) throw new Error("DEEPL_QUOTA_EXHAUSTED");
  await options.reserve({ characters, remoteCount: status.characterCount, remoteLimit: status.characterLimit });
  const payload = await request("/v2/translate", options.timeoutMs || 15000, {
    text: [protectedText.xml], target_lang: TARGETS[locale], preserve_formatting: true,
    tag_handling: "xml", ignore_tags: ["keep"], show_billed_characters: true,
  });
  const translation = payload?.translations?.[0];
  if (payload?.translations?.length !== 1 || typeof translation?.text !== "string" || !translation.text.trim() || translation.text.length > 24000) throw new Error("DEEPL_INVALID_RESPONSE");
  const text = protectedText.restore(translation.text);
  const billedCharacters = Number.isSafeInteger(translation.billed_characters) && translation.billed_characters >= 0 ? translation.billed_characters : characters;
  return { text, billedCharacters, reservedCharacters: characters };
}
