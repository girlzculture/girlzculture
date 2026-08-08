export type NavigationVisibilityRow = {
  is_enabled?: boolean | null;
  archived_at?: string | null;
};

/**
 * Defaults are bootstrap data, not a way to override an administrator's
 * decision. An absent collection is unconfigured; an existing collection
 * whose rows are all disabled/archived is intentionally empty.
 */
export function resolveConfiguredNavigation<T extends NavigationVisibilityRow>(
  rows: T[] | null | undefined,
  fallback: T[],
) {
  if (!rows?.length) return fallback;
  return rows.filter(
    (item) => item.is_enabled === true && !item.archived_at,
  );
}
