type RgbColor = {
  red: number;
  green: number;
  blue: number;
};

const HEX_COLOR = /^#([0-9a-f]{6})$/i;

export function parseHexColor(value: string): RgbColor | null {
  const match = value.trim().match(HEX_COLOR);
  if (!match) return null;
  return {
    red: Number.parseInt(match[1].slice(0, 2), 16),
    green: Number.parseInt(match[1].slice(2, 4), 16),
    blue: Number.parseInt(match[1].slice(4, 6), 16),
  };
}

function linearChannel(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: RgbColor) {
  return (
    0.2126 * linearChannel(color.red) +
    0.7152 * linearChannel(color.green) +
    0.0722 * linearChannel(color.blue)
  );
}

export function colorContrastRatio(foreground: string, background: string) {
  const foregroundRgb = parseHexColor(foreground);
  const backgroundRgb = parseHexColor(background);
  if (!foregroundRgb || !backgroundRgb) return 0;
  const foregroundLuminance = relativeLuminance(foregroundRgb);
  const backgroundLuminance = relativeLuminance(backgroundRgb);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

export function hasMinimumColorContrast(
  foreground: string,
  background: string,
  minimum = 4.5,
) {
  return colorContrastRatio(foreground, background) >= minimum;
}

export function hasMinimumContrastOnAll(
  foreground: string,
  backgrounds: string[],
  minimum = 4.5,
) {
  return (
    backgrounds.length > 0 &&
    backgrounds.every((background) =>
      hasMinimumColorContrast(foreground, background, minimum),
    )
  );
}

/**
 * Retains a configured foreground only when it remains readable on every
 * surface where the role is used. Ordered fallbacks let valid dark themes use
 * an on-dark role without weakening the ordinary-text contrast requirement.
 */
export function accessibleTextColor(
  candidate: string,
  backgrounds: string[],
  fallbacks: string[],
  minimum = 4.5,
) {
  const approved = [candidate, ...fallbacks].find((color) =>
    hasMinimumContrastOnAll(color, backgrounds, minimum),
  );
  return approved || fallbacks[0] || candidate;
}

export function accessibleSurfaceColor(
  candidate: string,
  foreground: string,
  fallback: string,
  minimum = 4.5,
) {
  return hasMinimumColorContrast(foreground, candidate, minimum)
    ? candidate
    : fallback;
}

export const ENGINE_THEME_COLOR_DEFAULTS = {
  "branding.primary_color": "#006B88",
  "branding.accent_color": "#E0A34E",
  "branding.cta_color": "#006B88",
  "branding.page_background": "#FFFFFF",
  "branding.card_background": "#FFFFFF",
  "branding.header_background": "#FFFFFF",
  "branding.footer_background": "#006B88",
  "branding.heading_color": "#0D1114",
  "branding.body_color": "#0D1114",
  "branding.muted_color": "#52616A",
  "branding.link_color": "#006B88",
  "branding.success_color": "#147D64",
  "branding.warning_color": "#795516",
  "branding.error_color": "#C83F4A",
  "branding.hover_color": "#006B88",
  "branding.focus_color": "#006B88",
  "branding.disabled_color": "#E6EAED",
} as const;

export type EngineThemeColorKey = keyof typeof ENGINE_THEME_COLOR_DEFAULTS;

export const ENGINE_THEME_COLOR_KEYS = Object.freeze(
  Object.keys(ENGINE_THEME_COLOR_DEFAULTS) as EngineThemeColorKey[],
);

export type EngineThemeContrastIssue = {
  keys: EngineThemeColorKey[];
  message: string;
  minimum: number;
};

type ThemeSurface = {
  key: EngineThemeColorKey;
  label: string;
};

const CONTENT_SURFACES: ThemeSurface[] = [
  { key: "branding.page_background", label: "page" },
  { key: "branding.card_background", label: "card" },
  { key: "branding.header_background", label: "header" },
];

const TEXT_ROLES: Array<{
  key: EngineThemeColorKey;
  label: string;
}> = [
  { key: "branding.heading_color", label: "Heading text" },
  { key: "branding.body_color", label: "Body text" },
  { key: "branding.muted_color", label: "Muted text" },
  { key: "branding.link_color", label: "Link text" },
  { key: "branding.success_color", label: "Success status text" },
  { key: "branding.warning_color", label: "Warning status text" },
  { key: "branding.error_color", label: "Error status text" },
];

const WHITE_TEXT_SURFACES: Array<{
  key: EngineThemeColorKey;
  label: string;
}> = [
  { key: "branding.primary_color", label: "Primary action background" },
  { key: "branding.cta_color", label: "Call-to-action background" },
  { key: "branding.footer_background", label: "Footer background" },
  { key: "branding.hover_color", label: "Hover background" },
];

function resolvedThemeColors(
  values: Partial<Record<EngineThemeColorKey, unknown>>,
) {
  return Object.fromEntries(
    ENGINE_THEME_COLOR_KEYS.map((key) => {
      const candidate = String(values[key] ?? "");
      return [
        key,
        HEX_COLOR.test(candidate)
          ? candidate
          : ENGINE_THEME_COLOR_DEFAULTS[key],
      ];
    }),
  ) as Record<EngineThemeColorKey, string>;
}

export type AccessibleEngineThemeColors = {
  primary: string;
  accent: string;
  cta: string;
  page: string;
  card: string;
  header: string;
  footer: string;
  heading: string;
  body: string;
  muted: string;
  link: string;
  success: string;
  warning: string;
  error: string;
  hover: string;
  focus: string;
  disabled: string;
};

/**
 * Resolves stored presentation settings into one coherent runtime palette.
 * Complete readable light and dark themes pass through unchanged. If a legacy
 * or partial configuration makes the core text/surface group unreadable, all
 * content surfaces fall back together before individual text and action roles
 * are clamped to accessible defaults.
 */
export function resolveAccessibleEngineThemeColors(
  values: Partial<Record<EngineThemeColorKey, unknown>>,
): AccessibleEngineThemeColors {
  const colors = resolvedThemeColors(values);
  const rawPage = colors["branding.page_background"];
  const rawCard = colors["branding.card_background"];
  const rawHeader = colors["branding.header_background"];
  const rawHeading = colors["branding.heading_color"];
  const rawBody = colors["branding.body_color"];
  const rawMuted = colors["branding.muted_color"];
  const configuredSurfaces = [rawPage, rawCard, rawHeader];
  const corePaletteIsReadable = [rawHeading, rawBody, rawMuted].every((color) =>
    hasMinimumContrastOnAll(color, configuredSurfaces),
  );
  const page = corePaletteIsReadable
    ? rawPage
    : ENGINE_THEME_COLOR_DEFAULTS["branding.page_background"];
  const card = corePaletteIsReadable
    ? rawCard
    : ENGINE_THEME_COLOR_DEFAULTS["branding.card_background"];
  const header = corePaletteIsReadable
    ? rawHeader
    : ENGINE_THEME_COLOR_DEFAULTS["branding.header_background"];
  const contentSurfaces = [page, card, header];
  const heading = accessibleTextColor(rawHeading, contentSurfaces, [
    ENGINE_THEME_COLOR_DEFAULTS["branding.heading_color"],
    "#FFFFFF",
  ]);
  const body = accessibleTextColor(rawBody, contentSurfaces, [
    ENGINE_THEME_COLOR_DEFAULTS["branding.body_color"],
    "#FFFFFF",
  ]);
  const muted = accessibleTextColor(rawMuted, contentSurfaces, [
    ENGINE_THEME_COLOR_DEFAULTS["branding.muted_color"],
    body,
    "#FFFFFF",
  ]);
  const onAction = "#FFFFFF";
  const surface = (
    key:
      | "branding.primary_color"
      | "branding.cta_color"
      | "branding.footer_background"
      | "branding.hover_color",
  ) => accessibleSurfaceColor(
    colors[key],
    onAction,
    ENGINE_THEME_COLOR_DEFAULTS[key],
  );
  const text = (
    key:
      | "branding.link_color"
      | "branding.success_color"
      | "branding.warning_color"
      | "branding.error_color",
  ) => accessibleTextColor(colors[key], contentSurfaces, [
    ENGINE_THEME_COLOR_DEFAULTS[key],
    body,
    "#FFFFFF",
  ]);

  return {
    primary: surface("branding.primary_color"),
    accent: colors["branding.accent_color"],
    cta: surface("branding.cta_color"),
    page,
    card,
    header,
    footer: surface("branding.footer_background"),
    heading,
    body,
    muted,
    link: text("branding.link_color"),
    success: text("branding.success_color"),
    warning: text("branding.warning_color"),
    error: text("branding.error_color"),
    hover: surface("branding.hover_color"),
    // CSS supplies a white outer ring on dark surfaces; the inner ring only
    // needs the required non-text contrast against the light edge.
    focus: accessibleSurfaceColor(
      colors["branding.focus_color"],
      "#FFFFFF",
      ENGINE_THEME_COLOR_DEFAULTS["branding.focus_color"],
      3,
    ),
    disabled: accessibleSurfaceColor(
      colors["branding.disabled_color"],
      ENGINE_THEME_COLOR_DEFAULTS["branding.muted_color"],
      ENGINE_THEME_COLOR_DEFAULTS["branding.disabled_color"],
    ),
  };
}

/**
 * Reports related contrast issues for design-system diagnostics. Runtime theme
 * rendering uses resolveAccessibleEngineThemeColors so persistence and Engine
 * publication behavior remain unchanged even when stored values need clamping.
 */
export function validateEngineThemeContrast(
  values: Partial<Record<EngineThemeColorKey, unknown>>,
): EngineThemeContrastIssue[] {
  const colors = resolvedThemeColors(values);
  const issues: EngineThemeContrastIssue[] = [];

  for (const role of TEXT_ROLES) {
    const failedSurfaces = CONTENT_SURFACES.filter(
      (surface) =>
        !hasMinimumColorContrast(colors[role.key], colors[surface.key], 4.5),
    );
    if (failedSurfaces.length) {
      issues.push({
        keys: [role.key, ...failedSurfaces.map((surface) => surface.key)],
        minimum: 4.5,
        message: `${role.label} must provide at least 4.5:1 contrast on the ${failedSurfaces
          .map((surface) => surface.label)
          .join(", ")} background${failedSurfaces.length === 1 ? "" : "s"}.`,
      });
    }
  }

  for (const surface of WHITE_TEXT_SURFACES) {
    if (!hasMinimumColorContrast("#FFFFFF", colors[surface.key], 4.5)) {
      issues.push({
        keys: [surface.key],
        minimum: 4.5,
        message: `${surface.label} must provide at least 4.5:1 contrast with white text.`,
      });
    }
  }

  if (
    !hasMinimumColorContrast(
      ENGINE_THEME_COLOR_DEFAULTS["branding.muted_color"],
      colors["branding.disabled_color"],
      4.5,
    )
  ) {
    issues.push({
      keys: ["branding.disabled_color"],
      minimum: 4.5,
      message:
        "Disabled controls must provide at least 4.5:1 contrast with standard disabled text.",
    });
  }

  const focusKey: EngineThemeColorKey = "branding.focus_color";
  const focusSurfaces: ThemeSurface[] = [
    ...CONTENT_SURFACES,
    { key: "branding.footer_background", label: "footer" },
  ];
  const failedFocusSurfaces = focusSurfaces.filter((surface) => {
    const background = colors[surface.key];
    // The global focus treatment has a configured inner ring and a white
    // outer ring. Either edge may supply the required non-text contrast.
    return (
      !hasMinimumColorContrast(colors[focusKey], background, 3) &&
      !hasMinimumColorContrast("#FFFFFF", background, 3)
    );
  });
  if (failedFocusSurfaces.length) {
    issues.push({
      keys: [focusKey, ...failedFocusSurfaces.map((surface) => surface.key)],
      minimum: 3,
      message: `The two-tone focus indicator must remain visible at 3:1 on the ${failedFocusSurfaces
        .map((surface) => surface.label)
        .join(", ")} background${failedFocusSurfaces.length === 1 ? "" : "s"}.`,
    });
  }

  return issues;
}
