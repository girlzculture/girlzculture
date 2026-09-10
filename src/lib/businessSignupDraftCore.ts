import type { BusinessSignupContent } from "./businessSignupContent";

/** Apply only a callback's edits; delayed uploads cannot overwrite newer fields. */
function mergeChanged(base: unknown, next: unknown, current: unknown): unknown {
  if (JSON.stringify(base) === JSON.stringify(next)) return current;
  if (Array.isArray(base) && Array.isArray(next) && Array.isArray(current) && base.length === next.length && next.length === current.length) {
    return next.map((value, index) => mergeChanged(base[index], value, current[index]));
  }
  if (base && next && current && typeof base === "object" && typeof next === "object" && typeof current === "object" && !Array.isArray(base) && !Array.isArray(next) && !Array.isArray(current)) {
    const before = base as Record<string, unknown>, after = next as Record<string, unknown>;
    const result = { ...current as Record<string, unknown> };
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!(key in after)) delete result[key];
      else result[key] = mergeChanged(before[key], after[key], result[key]);
    }
    return result;
  }
  return next;
}

export function mergeBusinessSignupDraft(base: BusinessSignupContent, next: BusinessSignupContent, current: BusinessSignupContent): BusinessSignupContent {
  return mergeChanged(base, next, current) as BusinessSignupContent;
}
