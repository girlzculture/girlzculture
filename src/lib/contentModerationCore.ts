export type ModerationDecision = {
  allowed: boolean;
  reason?: "abusive" | "hate" | "threat" | "terror";
  source: "deterministic" | "provider";
};

const PROFANITY = [
  "fuck",
  "fucking",
  "motherfucker",
  "bitch",
  "cunt",
  "asshole",
];

const HATE_PHRASES = [
  "heil hitler",
  "white power",
  "racial extermination",
  "ethnic cleansing",
  "kill all jews",
  "kill all muslims",
  "kill all christians",
  "kill all black people",
  "kill all white people",
];

const HATE_SLURS = [
  "nigger",
  "kike",
  "spic",
  "chink",
  "faggot",
];

const TERROR_PHRASES = [
  "join isis",
  "join al qaeda",
  "support isis",
  "support al qaeda",
  "build a bomb",
];

function containsPhrase(text: string, phrases: string[]) {
  return phrases.some((phrase) =>
    new RegExp(
      `(?:^|[^\\p{L}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^\\p{L}])`,
      "iu",
    ).test(text),
  );
}

/** Always-available conservative policy used when no provider can be called. */
export function deterministicContentDecision(input: {
  name?: string;
  title?: string;
  body?: string;
}): ModerationDecision {
  const text = [input.name, input.title, input.body]
    .filter(Boolean)
    .join("\n")
    .normalize("NFKC")
    .toLowerCase();
  if (containsPhrase(text, TERROR_PHRASES))
    return { allowed: false, reason: "terror", source: "deterministic" };
  if (containsPhrase(text, HATE_PHRASES) || containsPhrase(text, HATE_SLURS))
    return { allowed: false, reason: "hate", source: "deterministic" };
  if (
    /\b(?:i(?:'| a)?m going to|we (?:are going to|will)|i will)\s+(?:kill|shoot|stab|bomb|burn|hurt)\b/iu.test(text)
  ) return { allowed: false, reason: "threat", source: "deterministic" };
  if (containsPhrase(text, PROFANITY))
    return { allowed: false, reason: "abusive", source: "deterministic" };
  return { allowed: true, source: "deterministic" };
}
