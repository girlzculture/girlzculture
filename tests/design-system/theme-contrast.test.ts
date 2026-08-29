import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL(
  "../../src/lib/colorContrast.ts",
  import.meta.url,
).href;
const {
  ENGINE_THEME_COLOR_DEFAULTS,
  accessibleSurfaceColor,
  accessibleTextColor,
  colorContrastRatio,
  hasMinimumColorContrast,
  hasMinimumContrastOnAll,
  resolveAccessibleEngineThemeColors,
  validateEngineThemeContrast,
} = (await import(moduleUrl)) as typeof import("../../src/lib/colorContrast");
type EngineThemeColorKey = import("../../src/lib/colorContrast").EngineThemeColorKey;
const visualTokensUrl = new URL(
  "../../src/lib/nonDomVisualTokens.mjs",
  import.meta.url,
).href;
const { NON_DOM_VISUAL_TOKENS } = (await import(visualTokensUrl)) as typeof import("../../src/lib/nonDomVisualTokens.mjs");

test("the original bright teal is not approved for ordinary white text", () => {
  assert.equal(hasMinimumColorContrast("#FFFFFF", "#0083A6", 4.5), false);
  assert.ok(colorContrastRatio("#FFFFFF", "#0083A6") > 4.3);
});

test("the approved strong teal passes ordinary on-dark text contrast", () => {
  assert.equal(hasMinimumColorContrast("#FFFFFF", "#006B88", 4.5), true);
  assert.ok(colorContrastRatio("#FFFFFF", "#006B88") > 6);
});

test("unsafe configurable text surfaces fall back without changing safe colors", () => {
  assert.equal(
    accessibleSurfaceColor("#0083A6", "#FFFFFF", "#006B88"),
    "#006B88",
  );
  assert.equal(
    accessibleSurfaceColor("#006B88", "#FFFFFF", "#0D1114"),
    "#006B88",
  );
});

test("transactional actions use the approved accessible teal", () => {
  assert.equal(NON_DOM_VISUAL_TOKENS.action, "#006B88");
  assert.equal(
    hasMinimumColorContrast(
      NON_DOM_VISUAL_TOKENS.onAction,
      NON_DOM_VISUAL_TOKENS.action,
    ),
    true,
  );
});

test("semantic text is validated across every configured content surface", () => {
  const lightSurfaces = ["#FFFFFF", "#F5F7F8"];
  assert.equal(hasMinimumContrastOnAll("#0D1114", lightSurfaces), true);
  assert.equal(
    accessibleTextColor("#FF6868", lightSurfaces, ["#795516", "#0D1114"]),
    "#795516",
  );
  assert.equal(
    accessibleTextColor("#FFFFFF", ["#0D1114"], ["#006B88"]),
    "#FFFFFF",
  );
});

test("the two-tone focus strategy has a visible ring on light and dark surfaces", () => {
  assert.equal(hasMinimumColorContrast("#006B88", "#FFFFFF", 3), true);
  assert.equal(hasMinimumColorContrast("#FFFFFF", "#006B88", 3), true);
});

function themeWith(
  changes: Partial<Record<EngineThemeColorKey, string>>,
) {
  return { ...ENGINE_THEME_COLOR_DEFAULTS, ...changes };
}

function issueFor(
  theme: Partial<Record<EngineThemeColorKey, string>>,
  ...keys: EngineThemeColorKey[]
) {
  return validateEngineThemeContrast(theme).find((issue) =>
    keys.every((key) => issue.keys.includes(key)),
  );
}

test("the approved light theme passes every related Engine contrast pair", () => {
  assert.deepEqual(validateEngineThemeContrast(ENGINE_THEME_COLOR_DEFAULTS), []);
});

test("diagnostics identify unsafe body/page, heading/card, and muted/header pairs", () => {
  assert.ok(
    issueFor(
      themeWith({ "branding.body_color": "#FFFFFF" }),
      "branding.body_color",
      "branding.page_background",
    ),
  );
  assert.ok(
    issueFor(
      themeWith({ "branding.heading_color": "#FFFFFF" }),
      "branding.heading_color",
      "branding.card_background",
    ),
  );
  assert.ok(
    issueFor(
      themeWith({ "branding.muted_color": "#FFFFFF" }),
      "branding.muted_color",
      "branding.header_background",
    ),
  );
});

test("diagnostics identify a surface invisible to both focus rings", () => {
  const unsafeTheme = themeWith({
    "branding.footer_background": "#AAAAAA",
    "branding.focus_color": "#AAAAAA",
  });
  assert.ok(
    issueFor(
      unsafeTheme,
      "branding.focus_color",
      "branding.footer_background",
    ),
  );
});

test("diagnostics identify unsafe status and link colors", () => {
  const roles: EngineThemeColorKey[] = [
    "branding.success_color",
    "branding.error_color",
    "branding.warning_color",
    "branding.link_color",
  ];
  for (const role of roles) {
    assert.ok(
      issueFor(
        themeWith({ [role]: "#FFFFFF" }),
        role,
        "branding.page_background",
      ),
      `${role} should be reported on the white page surface`,
    );
  }
});

test("a complete safe dark Engine theme has no contrast issues", () => {
  const darkTheme = themeWith({
    "branding.page_background": "#0D1114",
    "branding.card_background": "#0D1114",
    "branding.header_background": "#0D1114",
    "branding.footer_background": "#0D1114",
    "branding.heading_color": "#FFFFFF",
    "branding.body_color": "#FFFFFF",
    "branding.muted_color": "#FFFFFF",
    "branding.link_color": "#FFFFFF",
    "branding.success_color": "#FFFFFF",
    "branding.warning_color": "#FFFFFF",
    "branding.error_color": "#FFFFFF",
    "branding.focus_color": "#006B88",
  });
  assert.deepEqual(validateEngineThemeContrast(darkTheme), []);
});

test("runtime preserves a complete coherent dark palette", () => {
  const darkTheme = themeWith({
    "branding.page_background": "#0D1114",
    "branding.card_background": "#0D1114",
    "branding.header_background": "#0D1114",
    "branding.footer_background": "#0D1114",
    "branding.heading_color": "#FFFFFF",
    "branding.body_color": "#FFFFFF",
    "branding.muted_color": "#FFFFFF",
    "branding.link_color": "#FFFFFF",
    "branding.success_color": "#FFFFFF",
    "branding.warning_color": "#FFFFFF",
    "branding.error_color": "#FFFFFF",
    "branding.focus_color": "#006B88",
  });
  const resolved = resolveAccessibleEngineThemeColors(darkTheme);

  assert.deepEqual(
    [resolved.page, resolved.card, resolved.header, resolved.footer],
    ["#0D1114", "#0D1114", "#0D1114", "#0D1114"],
  );
  assert.deepEqual(
    [
      resolved.heading,
      resolved.body,
      resolved.muted,
      resolved.link,
      resolved.success,
      resolved.warning,
      resolved.error,
    ],
    Array(7).fill("#FFFFFF"),
  );
});

test("runtime clamps an unsafe partial surface change as one coherent group", () => {
  const resolved = resolveAccessibleEngineThemeColors(themeWith({
    "branding.page_background": "#0D1114",
  }));

  assert.deepEqual(
    [resolved.page, resolved.card, resolved.header],
    ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
  );
  assert.equal(resolved.heading, "#0D1114");
  assert.equal(resolved.body, "#0D1114");
  assert.equal(resolved.muted, "#52616A");
  assert.equal(
    hasMinimumContrastOnAll(resolved.body, [resolved.page, resolved.card, resolved.header]),
    true,
  );
});

test("runtime clamps unsafe role colors while preserving safe configured values", () => {
  const resolved = resolveAccessibleEngineThemeColors(themeWith({
    "branding.primary_color": "#0083A6",
    "branding.cta_color": "#005A70",
    "branding.link_color": "#FFFFFF",
    "branding.focus_color": "#FFFFFF",
    "branding.disabled_color": "#52616A",
  }));

  assert.equal(resolved.primary, "#006B88");
  assert.equal(resolved.cta, "#005A70");
  assert.equal(resolved.link, "#006B88");
  assert.equal(resolved.focus, "#006B88");
  assert.equal(resolved.disabled, "#E6EAED");
});
