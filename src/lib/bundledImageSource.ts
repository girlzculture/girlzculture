// These eight assets are shipped with every deployment. Keep their stored
// canonical URLs unchanged; render the identical local file on held candidates
// as well as the public origin, without widening img-src or rewriting uploads.
const BUNDLED_IMAGE = /^https:\/\/girlzculture\.com(\/images\/(?:salon-warm|salon-modern|salon-dark|salon-blush|hero-braids|braids-box|braids-cornrows|braids-knotless)\.jpg)$/;

export function bundledImageSource(source: string): string {
  return source.match(BUNDLED_IMAGE)?.[1] || source;
}
