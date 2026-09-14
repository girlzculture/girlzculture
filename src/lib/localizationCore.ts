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

const templateCache = new WeakMap<Record<string, string>, { parts: string[]; names: string[]; target: string }[]>();
function translatedTemplate(source: string, catalog: Record<string, string>) {
  if (source.length > 4096) return null;
  let templates = templateCache.get(catalog);
  if (!templates) {
    templates = Object.entries(catalog).flatMap(([original, target]) => {
      // Only explicitly cataloged templates with real interface wording. An
      // arbitrary value/name or punctuation-only string is never a template.
      if (!/\{value\d+\}/.test(original) || !/[A-Za-z]{2}/.test(original.replace(/\{value\d+\}/g, ""))) return [];
      const names: string[] = []; const parts: string[] = []; let offset = 0;
      for (const match of original.matchAll(/\{(value\d+)\}/g)) {
        parts.push(original.slice(offset, match.index));
        names.push(match[1]); offset = match.index! + match[0].length;
      }
      parts.push(original.slice(offset));
      // Adjacent unknown values cannot be split safely. Such callers must
      // translate the explicit source before interpolating the known values.
      if (names.length > 12 || parts.slice(1, -1).some(part => !part)) return [];
      return [{ parts, names, target }];
    });
    // A broad prefix such as "Choose {value0}" must not swallow a complete
    // cataloged sentence and preserve the rest of its English as a value.
    // Prefer the template with the most literal interface wording; stable
    // sorting keeps catalog precedence for equally specific candidates.
    templates.sort((a, b) => b.parts.join('').length - a.parts.join('').length);
    templateCache.set(catalog, templates);
  }
  for (const template of templates) {
    if (!source.startsWith(template.parts[0])) continue;
    let offset = template.parts[0].length; const values: string[] = [];
    // Literal delimiters give bounded linear matching, without a backtracking
    // regex over owner-authored values. Empty plural/optional suffixes work.
    for (let index = 0; index < template.names.length; index++) {
      const delimiter = template.parts[index + 1];
      const last = index === template.names.length - 1;
      const end = last ? (source.endsWith(delimiter) ? source.length - delimiter.length : -1) : source.indexOf(delimiter, offset);
      if (end < offset) break;
      values.push(source.slice(offset, end)); offset = end + delimiter.length;
    }
    if (values.length === template.names.length && offset === source.length) return template.target.replace(/\{(value\d+)\}/g, (token, name: string) => {
      const index = template.names.indexOf(name); return index < 0 ? token : values[index];
    });
  }
  return null;
}
export function resolveSourceTranslation(
  source: string,
  remote: Record<string, string> = {},
  bundled: Record<string, string> = {},
) {
  const normalized = String(source || "").replace(/\s+/g, " ").trim();
  return remote[normalized] || bundled[normalized] || translatedTemplate(normalized, remote) || translatedTemplate(normalized, bundled) || normalized;
}

export function interpolateInterfaceValues(template: string, values: Record<string, string | number> = {}) {
  // One pass: an original value containing another placeholder is literal data,
  // never a second template to evaluate. This also preserves $ and backslashes.
  return template.replace(/\{([\w]+)\}/g, (token, name: string) => Object.hasOwn(values, name) ? String(values[name]) : token);
}

export function canGenerateTranslationDraft(impactLevel: string) {
  return !new Set(["booking", "billing", "security", "safety", "legal"]).has(
    impactLevel,
  );
}

export function resolveInterfaceMessage(input: {
  locale: string; key: string; fallback?: string;
  remote: Record<string, string>; english: Record<string, string>;
  bundled?: Record<string, string>; sourceMessages?: Record<string, string>;
  sourceCatalog?: Record<string, string>;
}) {
  const { locale, key, fallback = "", remote, english, bundled = {}, sourceMessages = {}, sourceCatalog = {} } = input;
  if (remote[key]) return remote[key];
  if (locale === "en") return fallback || english[key] || "";
  return bundled[key] || resolveSourceTranslation(fallback || english[key] || "", sourceMessages, sourceCatalog);
}

export function translatedMessageFields(input: {
  original: string;
  translated?: string;
  locale?: string;
  provider?: string;
  previewed: boolean;
  now: string;
}) {
  const original = input.original;
  const translated = input.translated?.trim() || "";
  if (!original.trim()) throw new Error("Enter a message before sending.");
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
