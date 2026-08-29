import fs from "node:fs";
import path from "node:path";

export const DEFAULT_ROOTS = ["src", "public", "netlify"];
export const DEFAULT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".css",
  ".svg",
  ".mjs",
]);

export const FORBIDDEN_COLORS = new Map([
  ["#5b1a6b", "legacy plum"],
  ["#d6186b", "legacy magenta"],
  ["#fbf4ee", "legacy cream"],
  ["#f3d9e4", "legacy blush"],
  ["#1a1220", "legacy ink"],
  ["#311138", "legacy purple gradient"],
  ["#25102d", "legacy purple gradient"],
  ["#251029", "legacy purple gradient"],
  ["#2f1038", "legacy purple gradient"],
  ["#32123b", "legacy purple gradient"],
]);

export const REQUIRED_CORE_TOKENS = [
  ["--gc-charcoal", "#0d1114"],
  ["--gc-teal", "#0083a6"],
  ["--gc-coral", "#ff6868"],
  ["--gc-light-gray", "#f5f7f8"],
  ["--gc-mist-gray", "#e6eaed"],
  ["--gc-white", "#ffffff"],
];

export const SEMANTIC_TEXT_ROLES = [
  "primary",
  "secondary",
  "muted",
  "placeholder",
  "disabled",
  "on-dark",
  "link",
  "danger",
  "success",
  "warning",
];

// Literal exceptions are intentionally narrow. They are palette/status source
// values, not permission to bypass semantic foreground roles in component CSS.
export const ALLOWED_HEX = new Map([
  ["#0d1114", "charcoal"],
  ["#0083a6", "teal"],
  ["#ff6868", "coral"],
  ["#f5f7f8", "light gray surface"],
  ["#e6eaed", "mist gray surface"],
  ["#ffffff", "white"],
  ["#fff", "white shorthand"],
  ["#006b88", "accessible teal hover"],
  ["#52616a", "muted copy token source"],
  ["#667681", "placeholder token source"],
  ["#147d64", "success status"],
  ["#c83f4a", "error/destructive status"],
  ["#e0a34e", "recognizable star rating"],
  ["#795516", "accessible warning text"],
  ["#7a4b00", "accessible warning text"],
  ["#7b4a00", "accessible warning text"],
  ["#805000", "accessible warning text"],
  ["#8b5500", "accessible warning text"],
  ["#8b5b12", "accessible warning text"],
  ["#9b5a00", "accessible warning text"],
]);

export const ALLOWED_RGB = new Map([
  ["0,131,166", "teal shadow"],
  ["13,17,20", "charcoal shadow"],
  ["224,163,78", "star-rating halo"],
  ["230,234,237", "mist overlay"],
  ["245,247,248", "light-gray overlay"],
  ["255,255,255", "white overlay"],
]);

export const DEFAULT_EXCEPTION_INVENTORY_PATH =
  "docs/workstreams/workstream-1/intentional-visual-exceptions.json";

export const STATUS_COLOR_FAMILIES = [
  "red",
  "green",
  "emerald",
  "amber",
  "yellow",
  "orange",
  "blue",
  "cyan",
  "lime",
  "rose",
  "pink",
  "violet",
  "purple",
  "indigo",
];

const IMPORTANT_TEXT_CONTEXT =
  /\b(?:appointment|availability|balance|booking|cancel(?:lation|led)?|checkout|deposit|earnings|fee|inventory|legal|password|payment|permission|policy|price|refund|reschedul(?:e|ing)|revenue|security|shipping|sign-in|subscription|tax|total|transaction|two-factor|verification)\b/i;

const LOW_OPACITY_INK_EXPRESSION =
  /((?:(?:[a-z0-9_-]+):)*text-ink\/(?:20|25|30|35|40|45))/g;

const LEGACY_OPACITY_BUDGET_EXPRESSION =
  /((?:(?:[a-z0-9_-]+):)*text-ink\/(?:20|25|30|35|40|45|50|55|60|65))/g;

const GENERIC_LOW_OPACITY_EXPRESSION =
  /((?:(?:[a-z0-9_-]+):)*opacity-(?:0|[1-9]|[1-9][0-9]))(?![0-9])/g;

const NAMED_STATUS_TEXT_EXPRESSION = new RegExp(
  `((?:(?:[a-z0-9_-]+):)*text-(?:${STATUS_COLOR_FAMILIES.join("|")})-(?:50|100|200|300|400|500|600|700|800|900|950))`,
  "g",
);

function normalizeFile(file) {
  return String(file).replaceAll("\\", "/");
}

function sourceLocation(source, index) {
  const prefix = source.slice(0, Math.max(0, index));
  const lines = prefix.split("\n");
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function violation(file, source, index, code, message, value = "") {
  const location = sourceLocation(source, index);
  return {
    code,
    file: normalizeFile(file),
    line: location.line,
    column: location.column,
    message,
    value,
  };
}

function pushMatches(violations, file, source, expression, create) {
  for (const match of source.matchAll(expression)) {
    const next = create(match);
    if (!next) continue;
    violations.push(
      violation(
        file,
        source,
        match.index ?? 0,
        next.code,
        next.message,
        next.value ?? match[0],
      ),
    );
  }
}

function opacityValue(token) {
  const raw = token.slice(token.lastIndexOf("/") + 1).replace(/^\[|\]$/g, "");
  if (/^\d{1,3}$/.test(raw)) return Number(raw);
  if (/^\d{1,3}%$/.test(raw)) return Number(raw.slice(0, -1));
  if (/^(?:0?\.\d+|1(?:\.0+)?)$/.test(raw)) return Number(raw) * 100;
  return null;
}

function sourceLine(source, index) {
  const start = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const end = source.indexOf("\n", index);
  return source.slice(start, end < 0 ? source.length : end);
}

function enclosingElementContext(source, index) {
  const tagStart = source.lastIndexOf("<", index);
  const tagEnd = source.indexOf(">", index);
  if (tagStart < 0 || tagEnd < 0) {
    return source.slice(Math.max(0, index - 120), index + 240);
  }

  const tagName = source
    .slice(tagStart + 1, tagEnd)
    .match(/^([a-z][a-z0-9-]*)\b/i)?.[1];
  if (!tagName) return sourceLine(source, index);
  const closing = source.indexOf(`</${tagName}>`, tagEnd + 1);
  if (closing < 0 || closing - tagEnd > 900) {
    return source.slice(tagStart, Math.min(source.length, tagEnd + 360));
  }
  return source.slice(tagStart, closing + tagName.length + 3);
}

function intentionalExceptionFor({ file, source, match, rule, exceptions }) {
  const normalizedFile = normalizeFile(file);
  const line = sourceLine(source, match.index ?? 0);
  return exceptions.find(
    (entry) =>
      entry.rule === rule &&
      normalizeFile(entry.file) === normalizedFile &&
      entry.token === match[1] &&
      typeof entry.context === "string" &&
      entry.context.length >= 16 &&
      line.includes(entry.context),
  );
}

function recordExceptionUsage(usage, entry) {
  if (!usage || !entry?.id) return;
  usage.set(entry.id, (usage.get(entry.id) || 0) + 1);
}

function hasInlineLiteralColorPair(styleBody) {
  const hasLiteralBackground =
    /\bbackground(?:-?color)?\s*:\s*["'`]?(?:#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|(?:white|black|gray|grey)\b)/.test(
      styleBody,
    );
  const hasForeground =
    /(?<!background-)\bcolor\s*:\s*["'`]?(?:#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|var\(|(?:white|black|gray|grey)\b)/.test(
      styleBody,
    );
  return hasLiteralBackground && hasForeground;
}

export function auditSourceText(
  file,
  source,
  { intentionalExceptions = [], exceptionUsage = null } = {},
) {
  const violations = [];
  const lower = source.toLowerCase();

  for (const [value, label] of FORBIDDEN_COLORS) {
    let offset = lower.indexOf(value);
    while (offset >= 0) {
      violations.push(
        violation(
          file,
          source,
          offset,
          "GC_LEGACY_COLOR",
          `Forbidden ${label} literal remains.`,
          value,
        ),
      );
      offset = lower.indexOf(value, offset + value.length);
    }
  }

  pushMatches(
    violations,
    file,
    lower,
    /(?<!&)#[0-9a-f]{3,8}\b/g,
    (match) =>
      ALLOWED_HEX.has(match[0])
        ? null
        : {
            code: "GC_UNAPPROVED_HEX",
            message: "Unapproved hexadecimal color literal.",
            value: match[0],
          },
  );

  pushMatches(
    violations,
    file,
    lower,
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g,
    (match) => {
      const channels = `${match[1]},${match[2]},${match[3]}`;
      return ALLOWED_RGB.has(channels)
        ? null
        : {
            code: "GC_UNAPPROVED_RGB",
            message: "Unapproved RGB color literal.",
            value: `rgb(${channels})`,
          };
    },
  );

  // HSL/HSLA literals are never part of the documented launch palette. Keep
  // this rule independent from `color:` so backgrounds, borders, shadows and
  // JSX style values cannot bypass the literal-color audit.
  pushMatches(
    violations,
    file,
    lower,
    /hsla?\([^)]*\)/g,
    (match) => ({
      code: "GC_UNAPPROVED_HSL",
      message: "Unapproved HSL/HSLA color literal.",
      value: match[0],
    }),
  );

  pushMatches(
    violations,
    file,
    source,
    NAMED_STATUS_TEXT_EXPRESSION,
    (match) => ({
      code: "GC_NAMED_STATUS_TEXT_UTILITY",
      message:
        "Named Tailwind status foregrounds bypass the semantic danger, success, warning, and link roles.",
      value: match[1],
    }),
  );

  // Inline foreground/background pairs couple contrast to one component and
  // bypass both the Engine theme and the semantic role contract. The pair is
  // rejected even when each individual literal is otherwise allowlisted.
  pushMatches(
    violations,
    file,
    lower,
    /style\s*=\s*\{\{([\s\S]*?)\}\}/g,
    (match) => {
      const styleBody = match[1];
      return hasInlineLiteralColorPair(styleBody)
        ? {
            code: "GC_INLINE_COLOR_PAIR",
            message:
              "Inline foreground/background pair bypasses approved semantic tokens.",
            value: match[0],
          }
        : null;
    },
  );

  pushMatches(
    violations,
    file,
    source,
    LOW_OPACITY_INK_EXPRESSION,
    (match) => {
      const context = enclosingElementContext(source, match.index ?? 0);
      if (!IMPORTANT_TEXT_CONTEXT.test(context)) return null;
      return {
        code: "GC_LOW_OPACITY_IMPORTANT_TEXT",
        message:
          "Booking, financial, security, policy, or operational copy cannot use a low-opacity metadata foreground.",
        value: match[1],
      };
    },
  );

  pushMatches(
    violations,
    file,
    source,
    GENERIC_LOW_OPACITY_EXPRESSION,
    (match) => {
      const exception = intentionalExceptionFor({
        file,
        source,
        match,
        rule: "GC_GENERIC_OPACITY_UTILITY",
        exceptions: intentionalExceptions,
      });
      if (exception) {
        recordExceptionUsage(exceptionUsage, exception);
        return null;
      }
      return {
        code: "GC_GENERIC_OPACITY_UTILITY",
        message:
          "Generic opacity can make inherited text or controls faint; use semantic foreground/state roles or an exact documented visual-layer exception.",
        value: match[1],
      };
    },
  );

  pushMatches(
    violations,
    file,
    lower,
    /style\s*=\s*["']([^"']*)["']/g,
    (match) =>
      hasInlineLiteralColorPair(match[1])
        ? {
            code: "GC_INLINE_COLOR_PAIR",
            message:
              "Inline foreground/background pair bypasses approved semantic tokens.",
            value: match[0],
          }
        : null,
  );

  pushMatches(
    violations,
    file,
    lower,
    /((?:(?:[a-z0-9_-]+):)*text-(?:slate|gray|grey|neutral|zinc|stone)(?:-[a-z0-9[\]./%_-]+)?)/g,
    (match) => ({
      code: "GC_GRAY_TEXT_UTILITY",
      message: "Gray-family foreground utilities bypass semantic text roles.",
      value: match[1],
    }),
  );

  pushMatches(
    violations,
    file,
    lower,
    /((?:(?:[a-z0-9_-]+):)*text-white\/(?:\d{1,3}|\[[^\]]+\]))/g,
    (match) => ({
      code: "GC_TEXT_WHITE_OPACITY",
      message:
        "Opacity-qualified white foregrounds are background-dependent; use the semantic on-dark role.",
      value: match[1],
    }),
  );

  pushMatches(
    violations,
    file,
    lower,
    /((?:(?:[a-z0-9_-]+):)*(?:placeholder|disabled):text-[a-z0-9_-]+\/(?:\d{1,3}|\[[^\]]+\]))/g,
    (match) => {
      const opacity = opacityValue(match[1]);
      if (opacity !== null && opacity >= 100) return null;
      return {
        code: "GC_PREFIXED_LOW_OPACITY_TEXT",
        message:
          "Placeholder and disabled foregrounds must use their semantic roles, not local opacity.",
        value: match[1],
      };
    },
  );

  pushMatches(
    violations,
    file,
    lower,
    /((?:(?:[a-z0-9_-]+):)*text-\[(?:#|rgba?\(|hsla?\(|oklch\(|lab\(|color\()[^\]]+\])/g,
    (match) => ({
      code: "GC_ARBITRARY_TEXT_COLOR",
      message:
        "Arbitrary text-color utilities bypass the semantic foreground contract, including status literals.",
      value: match[1],
    }),
  );

  // Match a real CSS/JS `color:` property, but not `background-color`,
  // `--color-*`, objectPosition, or dynamic semantic theme interpolation.
  pushMatches(
    violations,
    file,
    lower,
    /(?<![-\w])color\s*:\s*["']?(#[0-9a-f]{3,8}|(?:rgba?|hsla?|hsl|oklch|lab)\([^;}"']+\)|(?:gray|grey|slategray|lightslategray|darkslategray|white|black))["']?/gm,
    (match) => ({
      code: "GC_HARDCODED_TEXT_COLOR",
      message:
        "Hardcoded CSS or inline text color bypasses the semantic foreground contract.",
      value: match[1],
    }),
  );

  return sortViolations(violations);
}

function requirePattern(violations, file, source, pattern, code, message, value) {
  if (pattern.test(source)) return;
  violations.push(violation(file, source, 0, code, message, value));
}

export function auditSemanticContracts({
  globalsFile = "src/app/globals.css",
  globalsSource = "",
  runtimeFile = "src/app/layout.tsx",
  runtimeSource = "",
} = {}) {
  const violations = [];
  const globals = globalsSource.toLowerCase();

  for (const [token, value] of REQUIRED_CORE_TOKENS) {
    requirePattern(
      violations,
      globalsFile,
      globals,
      new RegExp(`${token}:\\s*${value.replace("#", "\\#")}`),
      "GC_CORE_TOKEN_MISSING",
      `${token} must remain ${value}.`,
      token,
    );
  }

  for (const role of SEMANTIC_TEXT_ROLES) {
    requirePattern(
      violations,
      globalsFile,
      globals,
      new RegExp(`--gc-text-${role}:\\s*[^;]+;`),
      "GC_SEMANTIC_TOKEN_MISSING",
      `Semantic foreground token --gc-text-${role} is required.`,
      `--gc-text-${role}`,
    );
    requirePattern(
      violations,
      globalsFile,
      globals,
      new RegExp(`--color-text-${role}:\\s*var\\(--gc-text-${role}\\)`),
      "GC_SEMANTIC_ALIAS_MISSING",
      `Tailwind compatibility alias --color-text-${role} must resolve to --gc-text-${role}.`,
      `--color-text-${role}`,
    );
  }

  const compatibilityAliases = [
    [
      /--gc-text-primary:\s*var\(--gc-body\)/,
      "--gc-text-primary must follow the Engine-controlled --gc-body value.",
      "--gc-text-primary",
    ],
    [
      /--gc-text-muted:\s*var\(--gc-muted\)/,
      "--gc-text-muted must follow the Engine-controlled --gc-muted value.",
      "--gc-text-muted",
    ],
    [
      /--gc-text-danger:\s*var\(--gc-error\)/,
      "--gc-text-danger must resolve through the error status role.",
      "--gc-text-danger",
    ],
    [
      /--gc-text-success:\s*var\(--gc-success\)/,
      "--gc-text-success must resolve through the success status role.",
      "--gc-text-success",
    ],
    [
      /--color-ink:\s*var\(--gc-text-primary\)/,
      "The legacy ink utility must resolve through the semantic primary-text role.",
      "--color-ink",
    ],
    [
      /--gc-plum:\s*var\(--gc-charcoal\)/,
      "The legacy plum alias must resolve to charcoal.",
      "--gc-plum",
    ],
    [
      /--color-plum:\s*var\(--gc-plum\)/,
      "The legacy plum utility must resolve through its compatibility alias.",
      "--color-plum",
    ],
  ];
  for (const [pattern, message, value] of compatibilityAliases) {
    requirePattern(
      violations,
      globalsFile,
      globals,
      pattern,
      "GC_SEMANTIC_COMPATIBILITY_ALIAS_MISSING",
      message,
      value,
    );
  }

  requirePattern(
    violations,
    globalsFile,
    globals,
    /::placeholder\s*\{[^}]*color:\s*var\(--gc-text-placeholder\)/s,
    "GC_PLACEHOLDER_ROLE_DISCONNECTED",
    "The global placeholder selector must consume --gc-text-placeholder.",
    "--gc-text-placeholder",
  );
  requirePattern(
    violations,
    globalsFile,
    globals,
    /\.gc-text-on-dark[^{]*\{[^}]*color:\s*var\(--gc-text-on-dark\)/s,
    "GC_ON_DARK_ROLE_DISCONNECTED",
    "The on-dark compatibility class must consume --gc-text-on-dark.",
    "--gc-text-on-dark",
  );

  const goldCount = (globals.match(/#e0a34e/g) || []).length;
  if (goldCount !== 1) {
    violations.push(
      violation(
        globalsFile,
        globalsSource,
        0,
        "GC_STAR_TOKEN_MULTIPLICITY",
        "Gold is allowlisted exactly once as the recognizable star-rating token.",
        String(goldCount),
      ),
    );
  }

  requirePattern(
    violations,
    runtimeFile,
    runtimeSource,
    /"--gc-plum":\s*brand\.heading/,
    "GC_RUNTIME_ALIAS_MISSING",
    "The runtime plum compatibility alias must resolve to the heading role.",
    "--gc-plum",
  );
  requirePattern(
    violations,
    runtimeFile,
    runtimeSource,
    /"--gc-teal":\s*brand\.primary/,
    "GC_RUNTIME_ALIAS_MISSING",
    "The runtime primary role must resolve through the teal semantic token.",
    "--gc-teal",
  );
  if (/"--gc-plum":\s*brand\.primary/.test(runtimeSource)) {
    const index = runtimeSource.search(/"--gc-plum":\s*brand\.primary/);
    violations.push(
      violation(
        runtimeFile,
        runtimeSource,
        Math.max(0, index),
        "GC_RUNTIME_ALIAS_COUPLED",
        "Runtime branding must not restore legacy primary/heading coupling.",
        "--gc-plum",
      ),
    );
  }

  return sortViolations(violations);
}

export function filesAt(root, extensions = DEFAULT_EXTENSIONS) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const location = path.join(root, entry.name);
    if (entry.isDirectory()) return filesAt(location, extensions);
    return extensions.has(path.extname(entry.name).toLowerCase())
      ? [location]
      : [];
  });
}

function inventoryViolation(file, source, code, message, value = "") {
  return violation(file, source, 0, code, message, value);
}

export function parseIntentionalExceptionInventory(
  file,
  source,
  { required = true } = {},
) {
  if (!source) {
    return {
      inventory: { exceptions: [], legacyTextOpacityBudgets: [] },
      violations: required
        ? [
            inventoryViolation(
              file,
              "",
              "GC_EXCEPTION_INVENTORY_MISSING",
              "The Workstream 1 intentional visual-exception inventory is required.",
            ),
          ]
        : [],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return {
      inventory: { exceptions: [], legacyTextOpacityBudgets: [] },
      violations: [
        inventoryViolation(
          file,
          source,
          "GC_EXCEPTION_INVENTORY_INVALID",
          "The intentional visual-exception inventory must be valid JSON.",
        ),
      ],
    };
  }

  const violations = [];
  const exceptions = Array.isArray(parsed.exceptions) ? parsed.exceptions : [];
  const budgets = Array.isArray(parsed.legacyTextOpacityBudgets)
    ? parsed.legacyTextOpacityBudgets
    : [];
  if (parsed.schemaVersion !== 1) {
    violations.push(
      inventoryViolation(
        file,
        source,
        "GC_EXCEPTION_INVENTORY_INVALID",
        "The intentional visual-exception inventory must use schemaVersion 1.",
      ),
    );
  }

  const ids = new Set();
  for (const entry of exceptions) {
    const valid =
      typeof entry?.id === "string" &&
      entry.id.length >= 8 &&
      !ids.has(entry.id) &&
      entry.rule === "GC_GENERIC_OPACITY_UTILITY" &&
      typeof entry.file === "string" &&
      normalizeFile(entry.file).startsWith("src/") &&
      typeof entry.token === "string" &&
      GENERIC_LOW_OPACITY_EXPRESSION.test(entry.token) &&
      typeof entry.context === "string" &&
      entry.context.length >= 16 &&
      Number.isInteger(entry.maxOccurrences) &&
      entry.maxOccurrences > 0 &&
      entry.maxOccurrences <= 5 &&
      typeof entry.classification === "string" &&
      entry.classification.length >= 8 &&
      typeof entry.reason === "string" &&
      entry.reason.length >= 20 &&
      typeof entry.owner === "string" &&
      entry.owner.length >= 3;
    GENERIC_LOW_OPACITY_EXPRESSION.lastIndex = 0;
    if (!valid) {
      violations.push(
        inventoryViolation(
          file,
          source,
          "GC_EXCEPTION_INVENTORY_INVALID",
          "Every exception must be exact, bounded, classified, justified, and owned.",
          String(entry?.id || "unnamed exception"),
        ),
      );
      continue;
    }
    ids.add(entry.id);
  }

  const budgetKeys = new Set();
  for (const budget of budgets) {
    const budgetKey = `${normalizeFile(budget?.file || "")}::${budget?.token || ""}`;
    const valid =
      typeof budget?.file === "string" &&
      normalizeFile(budget.file).startsWith("src/") &&
      typeof budget?.token === "string" &&
      /^text-ink\/(?:20|25|30|35|40|45|50|55|60|65)$/.test(budget.token) &&
      !budgetKeys.has(budgetKey) &&
      Number.isInteger(budget.maxOccurrences) &&
      budget.maxOccurrences >= 0 &&
      typeof budget.classification === "string" &&
      budget.classification.length >= 8 &&
      typeof budget.reason === "string" &&
      budget.reason.length >= 20;
    if (!valid) {
      violations.push(
        inventoryViolation(
          file,
          source,
          "GC_EXCEPTION_INVENTORY_INVALID",
          "Every legacy text-opacity budget must name one source file and token and be unique, bounded, classified, and justified.",
          budgetKey,
        ),
      );
      continue;
    }
    budgetKeys.add(budgetKey);
  }

  return {
    inventory: { exceptions, legacyTextOpacityBudgets: budgets },
    violations,
  };
}

export function auditIntentionalExceptionUsage({
  entries,
  inventory,
  inventoryFile,
  inventorySource,
  exceptionUsage,
}) {
  const violations = [];
  for (const entry of inventory.exceptions) {
    const used = exceptionUsage.get(entry.id) || 0;
    if (used === 0) {
      violations.push(
        inventoryViolation(
          inventoryFile,
          inventorySource,
          "GC_INTENTIONAL_EXCEPTION_STALE",
          "Documented visual-layer exception no longer matches source and must be removed or corrected.",
          entry.id,
        ),
      );
    } else if (used > entry.maxOccurrences) {
      violations.push(
        inventoryViolation(
          inventoryFile,
          inventorySource,
          "GC_INTENTIONAL_EXCEPTION_EXCEEDED",
          "Documented visual-layer exception exceeds its narrow occurrence limit.",
          `${entry.id}: ${used}/${entry.maxOccurrences}`,
        ),
      );
    }
  }

  const observed = new Map();
  for (const [file, source] of entries) {
    for (const match of String(source).matchAll(LEGACY_OPACITY_BUDGET_EXPRESSION)) {
      const key = `${normalizeFile(file)}::${match[1]}`;
      observed.set(key, (observed.get(key) || 0) + 1);
    }
  }
  const budgets = new Map(
    inventory.legacyTextOpacityBudgets.map((budget) => [
      `${normalizeFile(budget.file)}::${budget.token}`,
      budget,
    ]),
  );
  for (const [key, count] of observed) {
    const budget = budgets.get(key);
    if (!budget) {
      violations.push(
        inventoryViolation(
          inventoryFile,
          inventorySource,
          "GC_LEGACY_OPACITY_BUDGET_MISSING",
          "A legacy low-opacity ink utility is not represented in the migration budget.",
          `${key}: ${count}`,
        ),
      );
    } else if (count > budget.maxOccurrences) {
      violations.push(
        inventoryViolation(
          inventoryFile,
          inventorySource,
          "GC_LEGACY_OPACITY_BUDGET_EXCEEDED",
          "The repository introduced more legacy low-opacity ink utilities than the reviewed migration budget allows.",
          `${key}: ${count}/${budget.maxOccurrences}`,
        ),
      );
    }
  }
  for (const [key] of budgets) {
    if (!observed.has(key)) {
      violations.push(
        inventoryViolation(
          inventoryFile,
          inventorySource,
          "GC_LEGACY_OPACITY_BUDGET_STALE",
          "A completed legacy opacity migration must be removed from the inventory.",
          key,
        ),
      );
    }
  }
  return sortViolations(violations);
}

export function auditFixture(
  files,
  {
    checkSemanticContracts = true,
    intentionalExceptions = [],
    legacyTextOpacityBudgets = [],
    enforceIntentionalInventory = false,
  } = {},
) {
  const entries = files instanceof Map ? [...files.entries()] : Object.entries(files);
  const exceptionUsage = new Map();
  const violations = entries.flatMap(([file, source]) =>
    auditSourceText(file, String(source), {
      intentionalExceptions,
      exceptionUsage,
    }),
  );
  if (checkSemanticContracts) {
    const globalsEntry = entries.find(([file]) =>
      normalizeFile(file).endsWith("src/app/globals.css"),
    );
    const runtimeEntry = entries.find(([file]) =>
      normalizeFile(file).endsWith("src/app/layout.tsx"),
    );
    violations.push(
      ...auditSemanticContracts({
        globalsFile: globalsEntry?.[0] || "src/app/globals.css",
        globalsSource: String(globalsEntry?.[1] || ""),
        runtimeFile: runtimeEntry?.[0] || "src/app/layout.tsx",
        runtimeSource: String(runtimeEntry?.[1] || ""),
      }),
    );
  }
  if (enforceIntentionalInventory) {
    violations.push(
      ...auditIntentionalExceptionUsage({
        entries,
        inventory: {
          exceptions: intentionalExceptions,
          legacyTextOpacityBudgets,
        },
        inventoryFile: "fixture-intentional-visual-exceptions.json",
        inventorySource: JSON.stringify({
          exceptions: intentionalExceptions,
          legacyTextOpacityBudgets,
        }),
        exceptionUsage,
      }),
    );
  }
  return sortViolations(violations);
}

export function auditRepository({
  cwd = process.cwd(),
  roots = DEFAULT_ROOTS,
  extensions = DEFAULT_EXTENSIONS,
  globalsPath = "src/app/globals.css",
  runtimeLayoutPath = "src/app/layout.tsx",
  exceptionInventoryPath = DEFAULT_EXCEPTION_INVENTORY_PATH,
} = {}) {
  const absoluteRoots = roots.map((root) => path.resolve(cwd, root));
  const files = absoluteRoots.flatMap((root) => filesAt(root, extensions));
  const violations = [];
  const inventoryFile = exceptionInventoryPath
    ? path.resolve(cwd, exceptionInventoryPath)
    : "";
  const inventorySource =
    inventoryFile && fs.existsSync(inventoryFile)
      ? fs.readFileSync(inventoryFile, "utf8")
      : "";
  const parsedInventory = parseIntentionalExceptionInventory(
    exceptionInventoryPath || DEFAULT_EXCEPTION_INVENTORY_PATH,
    inventorySource,
    { required: Boolean(exceptionInventoryPath) },
  );
  violations.push(...parsedInventory.violations);
  const exceptionUsage = new Map();
  const entries = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const relativeFile = path.relative(cwd, file);
    entries.push([relativeFile, source]);
    violations.push(
      ...auditSourceText(relativeFile, source, {
        intentionalExceptions: parsedInventory.inventory.exceptions,
        exceptionUsage,
      }),
    );
  }
  const globalsFile = path.resolve(cwd, globalsPath);
  const runtimeFile = path.resolve(cwd, runtimeLayoutPath);
  violations.push(
    ...auditSemanticContracts({
      globalsFile: globalsPath,
      globalsSource: fs.existsSync(globalsFile)
        ? fs.readFileSync(globalsFile, "utf8")
        : "",
      runtimeFile: runtimeLayoutPath,
      runtimeSource: fs.existsSync(runtimeFile)
        ? fs.readFileSync(runtimeFile, "utf8")
        : "",
    }),
  );
  if (exceptionInventoryPath && !parsedInventory.violations.length) {
    violations.push(
      ...auditIntentionalExceptionUsage({
        entries,
        inventory: parsedInventory.inventory,
        inventoryFile: exceptionInventoryPath,
        inventorySource,
        exceptionUsage,
      }),
    );
  }
  return {
    filesScanned: files.length,
    violations: sortViolations(violations),
  };
}

export function sortViolations(violations) {
  return [...violations].sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.code.localeCompare(right.code) ||
      left.value.localeCompare(right.value),
  );
}

export function formatViolation(item) {
  const suffix = item.value ? ` (${item.value})` : "";
  return `${item.file}:${item.line}:${item.column} [${item.code}] ${item.message}${suffix}`;
}

export function formatViolations(violations) {
  return violations.map(formatViolation).join("\n");
}
