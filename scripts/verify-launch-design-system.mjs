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
}
assert.deepEqual(
  violations,
  [],
  `Forbidden launch colors remain:\n${violations.join("\n")}`,
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

console.log(
  `Launch design-system audit passed (${roots.flatMap(filesAt).length} source assets; one documented star-gold exception).`,
);
