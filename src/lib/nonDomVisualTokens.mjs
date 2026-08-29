/**
 * Semantic colors for rendered content that cannot consume the browser's CSS
 * custom properties (transactional email markup and provider-owned DOM).
 *
 * Keep this as the single literal bridge from the approved Girlz Culture
 * palette. Application components should use the `--gc-*` CSS roles instead.
 * The module is plain ESM so both the Next.js runtime and direct Node
 * verification scripts consume the exact same values.
 */
export const NON_DOM_VISUAL_TOKENS = Object.freeze({
  action: "#006B88",
  onAction: "#FFFFFF",
  primaryText: "#0D1114",
  mutedText: "#52616A",
  lightSurface: "#F5F7F8",
});
