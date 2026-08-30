export type PublicContentSource = "managed" | "editorial-fallback";
export type PublicPromotionSource = "managed" | "editorial";

/**
 * `getContentPage` returns its exact fallback object only when the provider
 * read fails. A database snapshot is independently deserialized even when its
 * visible fields happen to match the editorial default.
 */
export function publicContentSource(
  content: object,
  editorialFallback: object,
): PublicContentSource {
  return content === editorialFallback ? "editorial-fallback" : "managed";
}

/** Published managed cards are normalized with `editorial_fallback: false`. */
export function homepagePromotionSource(card: {
  editorial_fallback?: boolean;
  [key: string]: unknown;
}): PublicPromotionSource {
  return card.editorial_fallback === true ? "editorial" : "managed";
}

export function homepagePromotionCollectionSource(
  cards: Array<{
    editorial_fallback?: boolean;
    [key: string]: unknown;
  }>,
): PublicPromotionSource {
  return cards.some((card) => homepagePromotionSource(card) === "managed")
    ? "managed"
    : "editorial";
}
