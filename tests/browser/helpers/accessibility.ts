import { expect, type Locator, type Page } from "@playwright/test";

export type EffectiveContrast = {
  ratio: number;
  requiredRatio: number;
  foreground: string;
  background: string;
  backgroundImages: string[];
  fontSize: number;
  fontWeight: number;
};

export function formatAxeViolations(
  violations: Array<{
    id: string;
    impact?: string | null;
    help: string;
    nodes: Array<{ target: unknown; failureSummary?: string | null }>;
  }>,
) {
  return violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      failure: node.failureSummary,
    })),
  }));
}

export async function getEffectiveContrast(
  locator: Locator,
  options: { pseudo?: "::placeholder" } = {},
): Promise<EffectiveContrast> {
  return locator.evaluate((element, pseudo) => {
    type Rgba = { r: number; g: number; b: number; a: number };

    function parseColor(value: string): Rgba {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas color parser is unavailable");
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "rgba(0, 0, 0, 0)";
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
      return {
        r,
        g,
        b,
        a: alpha / 255,
      };
    }

    function composite(foreground: Rgba, background: Rgba): Rgba {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
        a: alpha,
      };
    }

    function linear(value: number) {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }

    function luminance(color: Rgba) {
      return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
    }

    function contrast(first: Rgba, second: Rgba) {
      const firstLuminance = luminance(first);
      const secondLuminance = luminance(second);
      return (Math.max(firstLuminance, secondLuminance) + 0.05) /
        (Math.min(firstLuminance, secondLuminance) + 0.05);
    }

    function css(color: Rgba) {
      return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.a.toFixed(3)})`;
    }

    const ancestors: Element[] = [];
    for (let current = element.parentElement; current; current = current.parentElement) {
      ancestors.push(current);
    }

    const backgroundImages: string[] = [];
    const style = getComputedStyle(element, pseudo || null);
    const elementStyle = getComputedStyle(element);
    if (elementStyle.backgroundImage !== "none") {
      backgroundImages.push(elementStyle.backgroundImage);
    }

    // CSS opacity is a group-compositing operation. Build two pixels through
    // the same nested groups: the painted background without the glyph and the
    // painted foreground with the glyph. Applying opacity to each completed
    // group exactly once avoids the previous element-opacity double count.
    const localBackground = parseColor(elementStyle.backgroundColor);
    const localForeground = parseColor(style.color);
    if (pseudo) {
      const pseudoOpacity = Number.parseFloat(style.opacity || "1");
      localForeground.a *= Number.isFinite(pseudoOpacity) ? pseudoOpacity : 1;
    }
    let backgroundPixel = localBackground;
    let foregroundPixel = composite(localForeground, localBackground);

    const applyGroupOpacity = (color: Rgba, rawOpacity: string): Rgba => {
      const parsed = Number.parseFloat(rawOpacity || "1");
      const opacity = Number.isFinite(parsed) ? parsed : 1;
      return { ...color, a: color.a * opacity };
    };

    backgroundPixel = applyGroupOpacity(backgroundPixel, elementStyle.opacity);
    foregroundPixel = applyGroupOpacity(foregroundPixel, elementStyle.opacity);

    for (const ancestor of ancestors) {
      const ancestorStyle = getComputedStyle(ancestor);
      if (ancestorStyle.backgroundImage !== "none") {
        backgroundImages.push(ancestorStyle.backgroundImage);
      }
      const ancestorBackground = parseColor(ancestorStyle.backgroundColor);
      backgroundPixel = composite(backgroundPixel, ancestorBackground);
      foregroundPixel = composite(foregroundPixel, ancestorBackground);
      backgroundPixel = applyGroupOpacity(backgroundPixel, ancestorStyle.opacity);
      foregroundPixel = applyGroupOpacity(foregroundPixel, ancestorStyle.opacity);
    }

    const canvasBackground: Rgba = { r: 255, g: 255, b: 255, a: 1 };
    const effectiveBackground = composite(backgroundPixel, canvasBackground);
    const paintedForeground = composite(foregroundPixel, canvasBackground);
    const fontSize = Number.parseFloat(style.fontSize);
    const parsedWeight = Number.parseInt(style.fontWeight, 10);
    const fontWeight = Number.isFinite(parsedWeight)
      ? parsedWeight
      : style.fontWeight === "bold"
        ? 700
        : 400;
    const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);

    return {
      ratio: contrast(paintedForeground, effectiveBackground),
      requiredRatio: isLargeText ? 3 : 4.5,
      foreground: css(paintedForeground),
      background: css(effectiveBackground),
      backgroundImages,
      fontSize,
      fontWeight,
    };
  }, options.pseudo);
}

export async function expectReadableContrast(
  locator: Locator,
  label: string,
  options: { pseudo?: "::placeholder"; minimum?: number; requireSolidBackground?: boolean } = {},
) {
  const result = await getEffectiveContrast(locator, { pseudo: options.pseudo });
  if (options.requireSolidBackground !== false) {
    expect(
      result.backgroundImages,
      `${label} uses a background image, so this solid-color contrast assertion cannot prove readability`,
    ).toEqual([]);
  }
  expect(
    result.ratio,
    `${label} contrast ${result.ratio.toFixed(2)}:1 (${result.foreground} on ${result.background}); expected at least ${(options.minimum ?? result.requiredRatio).toFixed(1)}:1`,
  ).toBeGreaterThanOrEqual(options.minimum ?? result.requiredRatio);
  return result;
}

export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length ? `.${[...element.classList].slice(0, 3).join(".")}` : ""}`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.left < -1 || item.right > viewport + 1)
      .sort((left, right) => right.width - left.width)
      .slice(0, 8);
    return {
      viewport,
      document: Math.max(
        document.documentElement.scrollWidth,
        document.body?.scrollWidth ?? 0,
      ),
      offenders,
    };
  });
  expect(
    dimensions.document,
    `${label} overflows horizontally: document ${dimensions.document}px, viewport ${dimensions.viewport}px; widest out-of-bounds elements: ${JSON.stringify(dimensions.offenders)}`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

export async function expectVisibleFocusIndicator(locator: Locator, label: string) {
  const indicator = await locator.evaluate((element) => {
    type Rgba = { r: number; g: number; b: number; a: number };
    type Candidate = {
      source: "outline" | "box-shadow";
      color: string;
      thickness: number;
      ratio: number;
    };

    function parseColor(value: string): Rgba {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return { r: 0, g: 0, b: 0, a: 0 };
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "rgba(0, 0, 0, 0)";
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: alpha / 255 };
    }

    function composite(foreground: Rgba, background: Rgba): Rgba {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (!alpha) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
        a: alpha,
      };
    }

    function linear(value: number) {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }

    function luminance(color: Rgba) {
      return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
    }

    function contrast(foreground: Rgba, background: Rgba) {
      const foregroundLuminance = luminance(composite(foreground, background));
      const backgroundLuminance = luminance(background);
      return (
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
      );
    }

    function splitShadowLayers(value: string) {
      const layers: string[] = [];
      let depth = 0;
      let start = 0;
      for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === "(") depth += 1;
        if (character === ")") depth -= 1;
        if (character === "," && depth === 0) {
          layers.push(value.slice(start, index).trim());
          start = index + 1;
        }
      }
      layers.push(value.slice(start).trim());
      return layers.filter((layer) => layer && layer !== "none");
    }

    const style = getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth || "0");
    const outlineColor = parseColor(style.outlineColor);
    const ancestors: Element[] = [];
    for (let current = element.parentElement; current; current = current.parentElement) {
      ancestors.unshift(current);
    }
    let outside: Rgba = { r: 255, g: 255, b: 255, a: 1 };
    for (const ancestor of ancestors) {
      outside = composite(parseColor(getComputedStyle(ancestor).backgroundColor), outside);
    }
    const candidates: Candidate[] = [];
    if (style.outlineStyle !== "none" && outlineWidth >= 2 && outlineColor.a > 0) {
      candidates.push({
        source: "outline",
        color: style.outlineColor,
        thickness: outlineWidth,
        ratio: contrast(outlineColor, outside),
      });
    }

    for (const layer of splitShadowLayers(style.boxShadow)) {
      if (/\binset\b/.test(layer)) continue;
      const colorText = layer.match(/(?:rgba?|color)\([^)]*\)/)?.[0];
      if (!colorText) continue;
      const shadowColor = parseColor(colorText);
      const lengths = layer
        .replace(colorText, "")
        .match(/-?[\d.]+px/g)
        ?.map((value) => Number.parseFloat(value)) ?? [];
      const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = lengths;
      const thickness = Math.max(0, spread) + Math.max(0, blur / 2);
      const reachesElementEdge = Math.abs(offsetX) <= thickness && Math.abs(offsetY) <= thickness;
      if (shadowColor.a <= 0 || thickness < 2 || !reachesElementEdge) continue;
      candidates.push({
        source: "box-shadow",
        color: colorText,
        thickness,
        ratio: contrast(shadowColor, outside),
      });
    }

    const best = candidates.sort((left, right) => right.ratio - left.ratio)[0] ?? null;
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth,
      boxShadow: style.boxShadow,
      candidates,
      best,
      ratio: best?.ratio ?? 1,
    };
  });

  expect(
    indicator.best,
    `${label} needs a visible focus outline or outer box-shadow edge of at least 2px; received ${indicator.outlineStyle} ${indicator.outlineWidth}px and box-shadow ${indicator.boxShadow}`,
  ).not.toBeNull();
  expect(
    indicator.ratio,
    `${label} focus indicator contrast must be at least 3:1; candidates: ${JSON.stringify(indicator.candidates)}`,
  ).toBeGreaterThanOrEqual(3);
  expect(
    indicator.best?.thickness ?? 0,
    `${label} focus indicator needs a painted edge at least 2px thick`,
  ).toBeGreaterThanOrEqual(2);
  expect(
    indicator.best?.source === "outline" || indicator.best?.source === "box-shadow",
    `${label} focus indicator must come from the computed outline or outer box shadow`,
  ).toBe(true);
  return indicator;
}
