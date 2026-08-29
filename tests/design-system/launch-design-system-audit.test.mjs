import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditFixture,
  auditRepository,
  auditSourceText,
  formatViolation,
} from "../../scripts/lib/launch-design-system-audit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, "../fixtures/design-system");
const validRoot = path.join(fixtureRoot, "valid");
const invalidRoot = path.join(fixtureRoot, "invalid");

function readInvalid(name) {
  return fs.readFileSync(path.join(invalidRoot, name), "utf8");
}

function readValid(name) {
  return fs.readFileSync(path.join(validRoot, name), "utf8");
}

function codes(violations) {
  return violations.map((item) => item.code);
}

function violationsFor(name) {
  return auditSourceText(
    `tests/fixtures/design-system/invalid/${name}`,
    readInvalid(name),
  );
}

test("a semantic fixture repository passes every source and contract rule", () => {
  const result = auditRepository({
    cwd: validRoot,
    roots: ["src"],
    exceptionInventoryPath: null,
  });
  assert.equal(result.filesScanned, 3);
  assert.deepEqual(result.violations, []);
});

test("the fixture API accepts an in-memory semantic contract", () => {
  const files = {
    "src/app/globals.css": readValid("src/app/globals.css"),
    "src/app/layout.tsx": readValid("src/app/layout.tsx"),
    "src/components/SemanticCopy.tsx": readValid(
      "src/components/SemanticCopy.tsx",
    ),
  };
  assert.deepEqual(auditFixture(files), []);
});

test("legacy and unapproved literal colors keep stable rule codes", () => {
  const legacy = violationsFor("legacy-color.tsx");
  assert.ok(codes(legacy).includes("GC_LEGACY_COLOR"));
  assert.ok(codes(legacy).includes("GC_UNAPPROVED_HEX"));
  assert.ok(codes(legacy).includes("GC_ARBITRARY_TEXT_COLOR"));

  const unapproved = violationsFor("unapproved-literals.css");
  assert.deepEqual(
    new Set(codes(unapproved)),
    new Set(["GC_UNAPPROVED_HEX", "GC_UNAPPROVED_RGB"]),
  );
});

test("gray-family utilities are rejected with actionable locations", () => {
  const [item] = violationsFor("gray-utility.tsx");
  assert.equal(item.code, "GC_GRAY_TEXT_UTILITY");
  assert.equal(item.line, 1);
  assert.ok(item.column > 1);
  assert.match(
    formatViolation(item),
    /gray-utility\.tsx:1:\d+ \[GC_GRAY_TEXT_UTILITY\]/,
  );
});

test("every opacity-qualified white foreground is rejected", () => {
  const violations = violationsFor("white-opacity.tsx");
  assert.deepEqual(codes(violations), ["GC_TEXT_WHITE_OPACITY"]);
  assert.equal(violations[0].value, "sm:text-white/65");
});

test("placeholder and disabled low-opacity prefixes are rejected", () => {
  const violations = violationsFor("prefixed-low-opacity.tsx");
  assert.equal(
    violations.filter(
      (item) => item.code === "GC_PREFIXED_LOW_OPACITY_TEXT",
    ).length,
    2,
  );
});

test("arbitrary hex and functional text colors are rejected", () => {
  const violations = violationsFor("arbitrary-text-colors.tsx");
  assert.equal(
    violations.filter((item) => item.code === "GC_ARBITRARY_TEXT_COLOR")
      .length,
    6,
  );
  assert.ok(codes(violations).includes("GC_UNAPPROVED_HEX"));
});

test("hardcoded CSS and inline text colors are rejected", () => {
  const css = violationsFor("hardcoded-text-colors.css");
  assert.equal(
    css.filter((item) => item.code === "GC_HARDCODED_TEXT_COLOR").length,
    2,
  );

  const inline = violationsFor("hardcoded-inline-color.tsx");
  assert.equal(
    inline.filter((item) => item.code === "GC_HARDCODED_TEXT_COLOR")
      .length,
    2,
  );
});

test("raw HSL and inline foreground/background pairs are rejected", () => {
  const violations = violationsFor("hsl-and-inline-pairs.tsx");
  assert.equal(
    violations.filter((item) => item.code === "GC_UNAPPROVED_HSL").length,
    2,
  );
  assert.equal(
    violations.filter((item) => item.code === "GC_INLINE_COLOR_PAIR").length,
    2,
  );
});

test("missing semantic declarations and aliases fail the fixture contract", () => {
  const violations = auditFixture({
    "src/app/globals.css": readInvalid("missing-semantic-contract.css"),
    "src/app/layout.tsx": readValid("src/app/layout.tsx"),
  });
  assert.equal(
    violations.filter((item) => item.code === "GC_SEMANTIC_TOKEN_MISSING")
      .length,
    10,
  );
  assert.equal(
    violations.filter((item) => item.code === "GC_SEMANTIC_ALIAS_MISSING")
      .length,
    10,
  );
  assert.ok(
    codes(violations).includes("GC_SEMANTIC_COMPATIBILITY_ALIAS_MISSING"),
  );
});

test("declared placeholder and on-dark roles must be connected to consumers", () => {
  const violations = auditFixture({
    "src/app/globals.css": readInvalid("disconnected-roles.css"),
    "src/app/layout.tsx": readValid("src/app/layout.tsx"),
  });
  assert.ok(codes(violations).includes("GC_PLACEHOLDER_ROLE_DISCONNECTED"));
  assert.ok(codes(violations).includes("GC_ON_DARK_ROLE_DISCONNECTED"));
});

test("reviewed supplementary metadata can remain inside the legacy ratchet", () => {
  const violations = auditSourceText(
    "src/components/LegacyMetadata.tsx",
    'export const metadata = <small className="text-ink/45">Updated today</small>;',
  );
  assert.deepEqual(violations, []);
});

test("arbitrary status literals are rejected along with palette bypasses", () => {
  const source =
    'export const statuses = <p className="text-[#147d64] sm:text-[#c83f4a] text-[#795516]">Saved</p>;';
  const statusViolations = auditSourceText("src/statuses.ts", source);
  assert.equal(
    statusViolations.filter((item) => item.code === "GC_ARBITRARY_TEXT_COLOR")
      .length,
    3,
  );

  const paletteBypass = auditSourceText(
    "src/PaletteBypass.tsx",
    'export const copy = <p className="text-[#0d1114]">Copy</p>;',
  );
  assert.ok(codes(paletteBypass).includes("GC_ARBITRARY_TEXT_COLOR"));
});

test("named Tailwind status families must use semantic status roles", () => {
  const violations = violationsFor("named-status-utility.tsx");
  assert.equal(
    violations.filter(
      (item) => item.code === "GC_NAMED_STATUS_TEXT_UTILITY",
    ).length,
    2,
  );
  assert.deepEqual(
    auditSourceText(
      "src/SemanticStatuses.tsx",
      '<p className="gc-text-success gc-text-danger gc-text-warning gc-text-link">Semantic statuses</p>',
    ),
    [],
  );
});

test("important low-opacity copy is rejected while real metadata remains allowed", () => {
  const violations = violationsFor("important-low-opacity.tsx");
  assert.ok(codes(violations).includes("GC_LOW_OPACITY_IMPORTANT_TEXT"));
  assert.deepEqual(
    auditSourceText(
      "src/Metadata.tsx",
      '<small className="text-ink/45">Updated yesterday</small>',
    ),
    [],
  );
});

test("generic opacity requires an exact documented visual-layer exception", () => {
  const generic = violationsFor("generic-opacity.tsx");
  assert.ok(codes(generic).includes("GC_GENERIC_OPACITY_UTILITY"));

  const file = "src/components/DecorativeArtwork.tsx";
  const source = fs.readFileSync(
    path.join(fixtureRoot, "visual-layer-exception.tsx"),
    "utf8",
  );
  const exception = {
    id: "decorative-artwork-fixture",
    rule: "GC_GENERIC_OPACITY_UTILITY",
    file,
    token: "opacity-35",
    context: "scale-110 object-cover opacity-35 blur-xl",
    maxOccurrences: 1,
    classification: "decorative-image-layer",
    reason: "Fixture-only decorative image layer that never changes text or control visibility.",
    owner: "design-system",
  };
  assert.deepEqual(
    auditFixture(
      { [file]: source },
      {
        checkSemanticContracts: false,
        intentionalExceptions: [exception],
        enforceIntentionalInventory: true,
      },
    ),
    [],
  );

  const moved = auditFixture(
    { "src/components/OtherArtwork.tsx": source },
    {
      checkSemanticContracts: false,
      intentionalExceptions: [exception],
      enforceIntentionalInventory: true,
    },
  );
  assert.ok(codes(moved).includes("GC_GENERIC_OPACITY_UTILITY"));
  assert.ok(codes(moved).includes("GC_INTENTIONAL_EXCEPTION_STALE"));
});

test("legacy low-opacity ceilings are exact per file and reject cross-file substitution", () => {
  const budget = {
    file: "src/components/Metadata.tsx",
    token: "text-ink/45",
    maxOccurrences: 1,
    classification: "legacy-metadata-migration-budget",
    reason: "Fixture ratchet for one reviewed supplementary timestamp in one exact source file.",
  };
  assert.deepEqual(
    auditFixture(
      {
        "src/components/Metadata.tsx":
          '<small className="text-ink/45">Updated yesterday</small>',
      },
      {
        checkSemanticContracts: false,
        legacyTextOpacityBudgets: [budget],
        enforceIntentionalInventory: true,
      },
    ),
    [],
  );

  const moved = auditFixture(
    {
      "src/components/OtherMetadata.tsx":
        '<small className="text-ink/45">Updated yesterday</small>',
    },
    {
      checkSemanticContracts: false,
      legacyTextOpacityBudgets: [budget],
      enforceIntentionalInventory: true,
    },
  );
  assert.ok(codes(moved).includes("GC_LEGACY_OPACITY_BUDGET_MISSING"));
  assert.ok(codes(moved).includes("GC_LEGACY_OPACITY_BUDGET_STALE"));
});

test("grouped on-dark selectors remain connected to the semantic role", () => {
  const globals = readValid("src/app/globals.css").replace(
    ".gc-text-on-dark {",
    '.gc-text-on-dark,\n:where([data-visual-state="on-dark"]) {',
  );
  const violations = auditFixture({
    "src/app/globals.css": globals,
    "src/app/layout.tsx": readValid("src/app/layout.tsx"),
  });
  assert.ok(!codes(violations).includes("GC_ON_DARK_ROLE_DISCONNECTED"));
});
