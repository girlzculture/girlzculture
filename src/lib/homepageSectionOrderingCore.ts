export const REQUIRED_HOMEPAGE_SECTION_KEYS = [
  "promo_rail",
  "salons_near_you",
  "featured_salons",
  "trending_picks",
] as const;

export type RequiredHomepageSectionKey =
  (typeof REQUIRED_HOMEPAGE_SECTION_KEYS)[number];

export type HomepageSectionOrderRow = {
  section_key: RequiredHomepageSectionKey;
  title: string;
  is_visible: boolean;
  sort_order: number;
};

export const HOMEPAGE_SECTION_DEFAULTS: Record<
  RequiredHomepageSectionKey,
  Omit<HomepageSectionOrderRow, "section_key">
> = {
  promo_rail: {
    title: "Featured",
    is_visible: true,
    sort_order: 1,
  },
  salons_near_you: {
    title: "Salons Near You",
    is_visible: true,
    sort_order: 2,
  },
  featured_salons: {
    title: "Featured Salons",
    is_visible: true,
    sort_order: 3,
  },
  trending_picks: {
    title: "Trending Picks This Week",
    is_visible: true,
    sort_order: 4,
  },
};

export function normalizeHomepageSectionOrder(
  value: unknown,
): HomepageSectionOrderRow[] {
  const rows = Array.isArray(value) ? value : [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const key = String(record.section_key || "");
    if (
      REQUIRED_HOMEPAGE_SECTION_KEYS.includes(
        key as RequiredHomepageSectionKey,
      ) &&
      !byKey.has(key)
    ) {
      byKey.set(key, record);
    }
  }
  return REQUIRED_HOMEPAGE_SECTION_KEYS.map((key) => {
    const row = byKey.get(key);
    const defaults = HOMEPAGE_SECTION_DEFAULTS[key];
    return {
      section_key: key,
      title: String(row?.title || defaults.title).trim().slice(0, 90),
      is_visible:
        typeof row?.is_visible === "boolean"
          ? row.is_visible
          : defaults.is_visible,
      sort_order: Number.isInteger(Number(row?.sort_order))
        ? Number(row?.sort_order)
        : defaults.sort_order,
    };
  })
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((row, index) => ({ ...row, sort_order: index + 1 }));
}

export function moveHomepageSection(
  rows: HomepageSectionOrderRow[],
  key: RequiredHomepageSectionKey,
  targetIndex: number,
) {
  const currentIndex = rows.findIndex((row) => row.section_key === key);
  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= rows.length ||
    currentIndex === targetIndex
  ) {
    return rows;
  }
  const next = [...rows];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next.map((row, index) => ({ ...row, sort_order: index + 1 }));
}

/**
 * Search is a core marketplace function, not promotional content. Place it
 * immediately after the promo rail when that optional section is visible, or
 * first when the rail is hidden.
 */
export function homepageSearchInsertIndex(
  visibleSections: readonly { section_key: string }[],
) {
  const promoIndex = visibleSections.findIndex(
    (section) => section.section_key === "promo_rail",
  );
  return promoIndex < 0 ? 0 : promoIndex + 1;
}

export function validateHomepageSectionPublication(value: unknown) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("All four required homepage sections must be included.");
  }
  const keys = value.map((row) =>
    String((row as Record<string, unknown>)?.section_key || ""),
  );
  if (
    new Set(keys).size !== REQUIRED_HOMEPAGE_SECTION_KEYS.length ||
    REQUIRED_HOMEPAGE_SECTION_KEYS.some((key) => !keys.includes(key))
  ) {
    throw new Error(
      "Homepage section order contains a duplicate or missing section.",
    );
  }
  return normalizeHomepageSectionOrder(value);
}
