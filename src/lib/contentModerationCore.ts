export type ModerationField = "name" | "title" | "body";
export type ModerationOutcome = "allow" | "block" | "review";

export type ModerationDecision = {
  allowed: boolean;
  outcome: ModerationOutcome;
  reason?: "abusive" | "harassment" | "hate" | "threat" | "terror" | "unsafe";
  source: "deterministic" | "provider";
  field?: ModerationField;
  /** Canonical prohibited phrase. The full submitted text is never logged here. */
  matchedText?: string;
  /** Short matching excerpt in the customer's own spelling for inline repair. */
  matchedInput?: string;
};

type ProhibitedEntry = {
  phrase: string;
  reason: NonNullable<ModerationDecision["reason"]>;
};

const PROHIBITED: ProhibitedEntry[] = [
  ...["fuck", "fucking", "motherfucker", "bitch", "cunt", "asshole"].map((phrase) => ({ phrase, reason: "abusive" as const })),
  ...["stupid", "idiot", "moron", "dumb bitch", "worthless"].map((phrase) => ({ phrase, reason: "harassment" as const })),
  ...[
    "heil hitler", "white power", "racial extermination", "ethnic cleansing",
    "kill all jews", "kill all muslims", "kill all christians",
    "kill all black people", "kill all white people",
  ].map((phrase) => ({ phrase, reason: "hate" as const })),
  ...["nigger", "kike", "spic", "chink", "faggot"].map((phrase) => ({ phrase, reason: "hate" as const })),
  ...["join isis", "join al qaeda", "support isis", "support al qaeda", "build a bomb"].map((phrase) => ({ phrase, reason: "terror" as const })),
];

const CONFUSABLES: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u0456": "i", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0445": "x", "\u0443": "y",
  "\u0410": "a", "\u0412": "b", "\u0415": "e", "\u041a": "k", "\u041c": "m", "\u041d": "h", "\u041e": "o", "\u0420": "p", "\u0421": "c", "\u0422": "t", "\u0425": "x",
  "\u03b1": "a", "\u03b5": "e", "\u03b9": "i", "\u03bf": "o", "\u03c1": "p", "\u03c7": "x",
};

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "2": "z", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "@": "a", "$": "s", "!": "i",
};

/**
 * Produces a comparison-only representation. It deliberately removes invisible
 * characters and separators, maps common Unicode lookalikes/number swaps, and
 * collapses repeated letters. The submitted customer text is never rewritten.
 */
export function normalizeForModeration(value: string) {
  const visible = value
    .replace(/[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .split("")
    .map((character) => CONFUSABLES[character] || LEET[character] || character)
    .join("")
    .toLowerCase();
  const words = visible
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/([a-z])\1{2,}/g, "$1");
  return {
    words,
    compact: words.replace(/\s+/g, ""),
  };
}

function safeMatchedInput(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, "")
    .trim()
    .slice(0, 80);
}

function findNormalizedMatch(value: string, phrase: string) {
  const target = normalizeForModeration(phrase);
  if (!target.compact) return null;
  const tokens = [...value.matchAll(/\S+/gu)];
  for (let start = 0; start < tokens.length; start += 1) {
    const startIndex = tokens[start].index || 0;
    for (
      let end = start;
      end < tokens.length && end < start + target.compact.length;
      end += 1
    ) {
      const endIndex = (tokens[end].index || 0) + tokens[end][0].length;
      const candidate = value.slice(startIndex, endIndex);
      const normalized = normalizeForModeration(candidate);
      if (
        normalized.words === target.words ||
        normalized.compact === target.compact
      ) {
        return safeMatchedInput(candidate);
      }
      if (
        normalized.compact.length > target.compact.length ||
        !target.compact.startsWith(normalized.compact)
      ) {
        break;
      }
    }
  }
  return null;
}

function threatMatch(value: string) {
  const normalized = normalizeForModeration(value).words;
  return /\b(?:i(?:\s+(?:m|am))?\s+going\s+to|i\s+(?:will|ll)|we(?:\s+(?:re|are))?\s+going\s+to|we\s+will|you(?:\s+(?:re|are))?\s+going\s+to|you\s+should)\s+(?:kill|shoot|stab|bomb|burn|hurt|die)\b/u.test(normalized)
    || /\b(?:kill|shoot|stab|bomb|burn|hurt) you\b/u.test(normalized);
}

/** Always-available policy used before any optional provider call. */
export function deterministicContentDecision(input: {
  name?: string;
  title?: string;
  body?: string;
}): ModerationDecision {
  const fields: Array<[ModerationField, string]> = [
    ["name", input.name || ""],
    ["title", input.title || ""],
    ["body", input.body || ""],
  ];
  for (const [field, value] of fields) {
    if (!value) continue;
    for (const entry of PROHIBITED) {
      const matchedInput = findNormalizedMatch(value, entry.phrase);
      if (matchedInput) {
        return {
          allowed: false,
          outcome: "block",
          reason: entry.reason,
          source: "deterministic",
          field,
          matchedText: entry.phrase,
          matchedInput,
        };
      }
    }
    if (threatMatch(value)) {
      return {
        allowed: false,
        outcome: "block",
        reason: "threat",
        source: "deterministic",
        field,
        matchedText: "threatening language",
      };
    }
  }
  return { allowed: true, outcome: "allow", source: "deterministic" };
}
