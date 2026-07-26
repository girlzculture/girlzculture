import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roots = ["src", "public", "netlify"];
const extensions = new Set([".ts", ".tsx", ".css", ".svg", ".mjs"]);
const forbidden = new Map([
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
const requiredTokens = [
  ["--gc-charcoal", "#0d1114"],
  ["--gc-teal", "#0083a6"],
  ["--gc-coral", "#ff6868"],
  ["--gc-light-gray", "#f5f7f8"],
  ["--gc-mist-gray", "#e6eaed"],
  ["--gc-white", "#ffffff"],
];
// Non-brand literals are deliberately narrow and must be tied to a semantic
// status/readability role. Uploaded user media is binary and is not scanned.
const allowedHex = new Map([
  ["#0d1114", "charcoal"],
  ["#0083a6", "teal"],
  ["#ff6868", "coral"],
  ["#f5f7f8", "light gray"],
  ["#e6eaed", "mist gray"],
  ["#ffffff", "white"],
  ["#fff", "white shorthand"],
  ["#006b88", "accessible teal hover"],
  ["#52616a", "muted copy"],
  ["#667681", "form placeholder"],
  ["#147d64", "success"],
  ["#c83f4a", "error/destructive"],
  ["#e0a34e", "recognizable star rating"],
  ["#795516", "accessible warning text"],
  ["#7a4b00", "accessible warning text"],
  ["#7b4a00", "accessible warning text"],
  ["#805000", "accessible warning text"],
  ["#8b5500", "accessible warning text"],
  ["#8b5b12", "accessible warning text"],
  ["#9b5a00", "accessible warning text"],
]);
const allowedRgb = new Map([
  ["0,131,166", "teal shadow"],
  ["13,17,20", "charcoal shadow"],
  ["224,163,78", "star-rating halo"],
  ["230,234,237", "mist overlay"],
  ["245,247,248", "light-gray overlay"],
  ["255,255,255", "white overlay"],
]);

function filesAt(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const location = path.join(root, entry.name);
    if (entry.isDirectory()) return filesAt(location);
    return extensions.has(path.extname(entry.name).toLowerCase())
      ? [location]
      : [];
  });
}

const violations = [];
for (const file of roots.flatMap(filesAt)) {
  const source = fs.readFileSync(file, "utf8").toLowerCase();
  for (const [value, label] of forbidden) {
    if (source.includes(value)) violations.push(`${file}: ${label} ${value}`);
  }
  for (const match of source.matchAll(/(?<!&)#[0-9a-f]{3,8}\b/g)) {
    if (!allowedHex.has(match[0])) {
      violations.push(`${file}: unapproved hexadecimal color ${match[0]}`);
    }
  }
  for (const match of source.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    const channels = `${match[1]},${match[2]},${match[3]}`;
    if (!allowedRgb.has(channels)) {
      violations.push(`${file}: unapproved RGB color rgb(${channels})`);
    }
  }
}
assert.deepEqual(
  violations,
  [],
  `Forbidden or unapproved launch colors remain:\n${violations.join("\n")}`,
);

const globals = fs.readFileSync("src/app/globals.css", "utf8").toLowerCase();
for (const [token, value] of requiredTokens) {
  assert.match(
    globals,
    new RegExp(`${token}:\\s*${value.replace("#", "\\#")}`),
    `${token} must remain ${value}`,
  );
}
assert.equal(
  (globals.match(/#e0a34e/g) || []).length,
  1,
  "Gold is allowlisted only once as the recognizable star-rating token.",
);
assert.match(
  globals,
  /--gc-plum:\s*var\(--gc-charcoal\)/,
  "The legacy plum alias must resolve to charcoal.",
);
assert.match(
  globals,
  /--color-plum:\s*var\(--gc-plum\)/,
  "The legacy utility name must resolve through its semantic alias.",
);
const runtimeLayout = fs.readFileSync("src/app/layout.tsx", "utf8");
assert.match(
  runtimeLayout,
  /"--gc-plum":\s*brand\.heading/,
  "The runtime compatibility alias must resolve to the semantic heading role.",
);
assert.match(
  runtimeLayout,
  /"--gc-teal":\s*brand\.primary/,
  "The runtime primary role must resolve through the teal semantic token.",
);
assert.doesNotMatch(
  runtimeLayout,
  /"--gc-plum":\s*brand\.primary/,
  "Runtime branding must not restore a legacy primary/heading coupling.",
);

console.log(
  `Launch design-system audit passed (${roots.flatMap(filesAt).length} source assets; ${allowedHex.size} documented color literals and ${allowedRgb.size} documented RGB roles).`,
);
