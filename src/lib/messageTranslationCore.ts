/** Protect exact business facts before display-only translation. No restored
 * translation may add, lose or duplicate a protected token. */
export function protectMessageFacts(source: string, properNames: string[]) {
  if (/__GC_KEEP_[A-Z]+__/u.test(source)) throw new Error("TRANSLATION_RESERVED_TOKEN");
  const names = [...new Set(properNames.filter(name => name.trim().length >= 2))].sort((a,b) => b.length-a.length);
  const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const expressions = [
    ...escaped,
    "https?:\\/\\/[^\\s<>]+", "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}",
    "\\bGC[A-Z0-9-]{2,}\\b", "\\b(?:USD|EUR|GBP|CFA|XOF|CNY|RMB)\\b",
    "(?:[$€£¥]\\s*)?\\d+(?:[.,:/-]\\d+)*(?:\\s*(?:AM|PM|a\\.m\\.|p\\.m\\.|USD|EUR|GBP|CFA|XOF|CNY|RMB))?",
  ];
  const tokens = new Map<string, string>();
  const encode = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : encode(Math.floor(index / 26) - 1) + encode(index % 26);
  const protectedSource = source.replace(new RegExp(expressions.join("|"), "giu"), value => {
    if (tokens.size >= 150) throw new Error("TRANSLATION_TOO_MANY_FACTS");
    const key = `__GC_KEEP_${encode(tokens.size)}__`; tokens.set(key, value); return key;
  });
  return {
    protectedSource,
    restore(translated: string) {
      if (!translated.trim() || translated.length > 8000) throw new Error("TRANSLATION_INVALID_RESULT");
      const found = translated.match(/__GC_KEEP_[A-Z]+__/gu) || [];
      if (found.length !== tokens.size || new Set(found).size !== tokens.size || found.some(token => !tokens.has(token))) throw new Error("TRANSLATION_FACTS_CHANGED");
      // Any newly generated numeral, URL or currency sign is an invented fact.
      const prose = translated.replace(/__GC_KEEP_[A-Z]+__/gu, "");
      if (/\d|https?:\/\/|[$€£¥]/u.test(prose)) throw new Error("TRANSLATION_FACTS_CHANGED");
      return translated.replace(/__GC_KEEP_[A-Z]+__/gu, token => tokens.get(token)!);
    },
  };
}
