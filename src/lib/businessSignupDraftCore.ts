import { upgradeBusinessSignupContent, type BusinessSignupContent } from "./businessSignupContent";

type Identified = { id: string };
function isIdentifiedList(value: unknown[]): value is Identified[] {
  return value.every(item => item && typeof item === "object" && !Array.isArray(item) && typeof (item as Identified).id === "string")
    && new Set(value.map(item => (item as Identified).id)).size === value.length;
}

/** Apply only a callback's edits; delayed uploads cannot overwrite newer fields. */
function mergeChanged(base: unknown, next: unknown, current: unknown): unknown {
  if (JSON.stringify(base) === JSON.stringify(next)) return current;
  // A delayed callback must not recreate an optional field removed since it began.
  if (current === undefined && base !== undefined) return undefined;
  if (Array.isArray(base) && Array.isArray(next) && Array.isArray(current) && isIdentifiedList(base) && isIdentifiedList(next) && isIdentifiedList(current)) {
    const before = new Map(base.map(item => [item.id, item]));
    const after = new Map(next.map(item => [item.id, item]));
    const present = new Map(current.map(item => [item.id, item]));
    const retained = current.filter(item => !before.has(item.id) || after.has(item.id));
    const added = next.filter(item => !before.has(item.id) && !present.has(item.id));
    const baseOrder = base.filter(item => after.has(item.id)).map(item => item.id);
    const nextOrder = next.filter(item => before.has(item.id)).map(item => item.id);
    const reordered = JSON.stringify(baseOrder) !== JSON.stringify(nextOrder);
    const order = reordered
      ? [...next.filter(item => present.has(item.id) || !before.has(item.id)), ...retained.filter(item => !after.has(item.id))]
      : [...retained, ...added];
    return order.map(item => before.has(item.id) && after.has(item.id)
      ? mergeChanged(before.get(item.id), after.get(item.id), present.get(item.id))
      : present.get(item.id) ?? item);
  }
  if (Array.isArray(base) && Array.isArray(next) && Array.isArray(current) && base.length === next.length && next.length === current.length) {
    return next.map((value, index) => mergeChanged(base[index], value, current[index]));
  }
  if (base && next && current && typeof base === "object" && typeof next === "object" && typeof current === "object" && !Array.isArray(base) && !Array.isArray(next) && !Array.isArray(current)) {
    const before = base as Record<string, unknown>, after = next as Record<string, unknown>;
    const result = { ...current as Record<string, unknown> };
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!(key in after)) delete result[key];
      else {
        const merged = mergeChanged(before[key], after[key], result[key]);
        if (merged === undefined) delete result[key];
        else result[key] = merged;
      }
    }
    return result;
  }
  return next;
}

export function mergeBusinessSignupDraft(base: BusinessSignupContent, next: BusinessSignupContent, current: BusinessSignupContent): BusinessSignupContent {
  if ([base, next, current].some(content => content.version === 2)) {
    return mergeChanged(upgradeBusinessSignupContent(base), upgradeBusinessSignupContent(next), upgradeBusinessSignupContent(current)) as BusinessSignupContent;
  }
  return mergeChanged(base, next, current) as BusinessSignupContent;
}
