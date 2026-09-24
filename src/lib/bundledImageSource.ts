// These allowlisted assets ship with every deployment. Keep their stored
// canonical URLs unchanged; render the identical local file on held candidates
// as well as the public origin, without widening img-src or rewriting uploads.
const BUNDLED_IMAGE = /^https:\/\/girlzculture\.com(\/images\/(?:salon-warm|salon-modern|salon-dark|salon-blush|hero-braids|braids-box|braids-cornrows|braids-knotless)\.jpg)$/;

const CULTURE_IMAGE = /^https:\/\/girlzculture\.com(\/images\/culture-house\/(?:(?:cover|amara|nia|zuri|imani|leila|sienna|boho-braids|box-braids|loc-retwist|cornrows|two-strand-twists|feed-in-braids|moisture-shampoo|leave-in-conditioner|scalp-oil|satin-bonnet)\.webp|logo\.svg))$/;

export function bundledImageSource(source: string): string {
  return source.match(BUNDLED_IMAGE)?.[1] || source.match(CULTURE_IMAGE)?.[1] || source;
}
