export type CatalogOrderable = {
  id?: unknown;
  name?: unknown;
  sort_order?: unknown;
};

const catalogCollator = new Intl.Collator("en", {
  usage: "sort",
  sensitivity: "base",
  numeric: true,
});

const tieBreakerCollator = new Intl.Collator("en", {
  usage: "sort",
  sensitivity: "variant",
  numeric: true,
});

function explicitSortOrder(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function compareCatalogRecords(left: CatalogOrderable, right: CatalogOrderable) {
  const leftOrder = explicitSortOrder(left.sort_order);
  const rightOrder = explicitSortOrder(right.sort_order);

  if (leftOrder !== null || rightOrder !== null) {
    if (leftOrder === null) return 1;
    if (rightOrder === null) return -1;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }

  const leftName = String(left.name || "").trim();
  const rightName = String(right.name || "").trim();
  if (!leftName && rightName) return 1;
  if (leftName && !rightName) return -1;

  const alphabetical = catalogCollator.compare(leftName, rightName);
  if (alphabetical) return alphabetical;

  const exact = tieBreakerCollator.compare(leftName, rightName);
  if (exact) return exact;
  return String(left.id || "").localeCompare(String(right.id || ""));
}

export function sortCatalogRecords<T extends CatalogOrderable>(records: readonly T[] | null | undefined): T[] {
  return [...(records || [])].sort(compareCatalogRecords);
}
