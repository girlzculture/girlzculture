export type ResponsiveMediaSources = {
  desktop: string;
  tablet: string;
  mobile: string;
  thumbnail: string;
};

const CANONICAL_DESKTOP_FILE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-desktop-(.+\.(?:jpe?g|png|img))$/i;

/**
 * Canonical uploaded images use the same UUID and file name for each generated
 * device slot. Restrict derivation to that exact file shape so ordinary URLs
 * containing the word "desktop" are never rewritten.
 *
 * New server-generated renditions use the neutral `.img` suffix because the
 * response Content-Type (not the source extension) truthfully identifies a
 * PNG or JPEG after size-aware encoding.
 */
export function responsiveMediaSources(
  source: string,
): ResponsiveMediaSources | null {
  const suffixIndex = source.search(/[?#]/);
  const path =
    suffixIndex === -1 ? source : source.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : source.slice(suffixIndex);
  const slashIndex = path.lastIndexOf("/");
  const directory = slashIndex === -1 ? "" : path.slice(0, slashIndex + 1);
  const fileName =
    slashIndex === -1 ? path : path.slice(slashIndex + 1);
  const match = fileName.match(CANONICAL_DESKTOP_FILE);
  if (!match) return null;

  const identifier = match[1];
  const tail = match[2];
  return {
    desktop: source,
    tablet: `${directory}${identifier}-tablet-${tail}${suffix}`,
    mobile: `${directory}${identifier}-mobile-${tail}${suffix}`,
    thumbnail: `${directory}${identifier}-thumbnail-${tail}${suffix}`,
  };
}
