import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const roots = ['src/components/owner/OwnerDashboardApp.tsx', 'src/components/owner/OwnerDashboardShell.tsx', 'src/components/owner/GcAssistant.tsx', 'src/components/owner/BusinessPolicies.tsx'];
const files = new Set();
function visitFile(file) {
  file = file.replaceAll('\\', '/');
  if (files.has(file) || !fs.existsSync(file) || !/\.tsx?$/.test(file)) return;
  if (file.startsWith('src/i18n/') || file.startsWith('src/generated/')) return;
  files.add(file);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    const name = statement.moduleSpecifier.text;
    if (!name.startsWith('@/') && !name.startsWith('.')) continue;
    const base = name.startsWith('@/') ? `src/${name.slice(2)}` : path.resolve(path.dirname(file), name);
    for (const suffix of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (fs.existsSync(base + suffix)) { visitFile(path.relative(process.cwd(), path.resolve(base + suffix))); break; }
  }
}
roots.forEach(visitFile);
const entries = new Map();
const nonCopy = /^(?:https?:|\/|@\/|[a-z0-9_]+(?:[.,:_/-][a-z0-9_]+)*$)|(?:\b(?:bg-|text-|border-|rounded-|grid-|flex-|px-|py-|sm:|md:|lg:|xl:|w-|h-|min-h-|max-w-))|^\s*(?:SELECT|select |INSERT|UPDATE|DELETE|Bearer |image\/|video\/|application\/)/;
function add(raw, file, position, kind, context) {
  const source = raw.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const explicitUi = ['jsx-text', 'jsx-attribute', 'localized-source'].includes(kind);
  if (!/\p{L}/u.test(source) || source.length < 2 || (!explicitUi && (nonCopy.test(source) || /^[A-Z_\d]+$/.test(source) || /^(?:[\w]+,)+[\w,]+$/.test(source)))) return;
  const key = crypto.createHash('sha1').update(source).digest('hex').slice(0, 12);
  const entry = entries.get(key) || { source, occurrences: [] };
  entry.occurrences.push({ file, line: position, kind, context }); entries.set(key, entry);
}
for (const file of [...files].sort()) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const walk = node => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const context = ts.isJsxText(node) || ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)
      ? crypto.createHash('sha256').update(node.parent.getText(source).replace(/\s+/g, ' ').trim()).digest('hex') : '';
    if (ts.isJsxText(node)) add(node.text, file, line, 'jsx-text', context);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      const kind = ts.isJsxAttribute(parent) && ['label', 'title', 'subtitle', 'description', 'placeholder', 'text', 'message', 'aria-label', 'alt', 'emptyText'].includes(parent.name.getText()) ? 'jsx-attribute'
        : ts.isCallExpression(parent) && ['t', 'translateSource'].includes(parent.expression.getText(source)) && parent.arguments[0] === node && !/^[a-z]+\.[a-z_.]+$/.test(node.text) ? 'localized-source' : 'literal';
      if (!ts.isImportDeclaration(parent) && !ts.isLiteralTypeNode(parent) && !(ts.isJsxAttribute(parent) && ['className', 'href', 'src', 'value', 'type', 'id', 'name', 'data-testid'].includes(parent.name.getText()))) add(node.text, file, line, kind, context);
    }
    if (ts.isTemplateExpression(node)) {
      let text = node.head.text; for (let index = 0; index < node.templateSpans.length; index++) text += `{value${index}}${node.templateSpans[index].literal.text}`;
      add(text, file, line, 'template', context);
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
}
const inventory = { generated_by: 'scripts/inventory-owner-translations.mjs', root_routes: ['/salon/dashboard', '/salon/dashboard/[section]', '/salon/dashboard/[section]/[recordId]'], files: [...files].sort(), entries: Object.fromEntries([...entries].sort((a, b) => a[1].source.localeCompare(b[1].source))) };
const output = JSON.stringify(inventory, null, 2) + '\n';
const destination = 'docs/owner-translation-inventory.json';
if (process.argv.includes('--check')) { if (fs.readFileSync(destination, 'utf8') !== output) throw new Error('Owner UI inventory is stale. Regenerate it and cover new strings.'); }
else fs.writeFileSync(destination, output);
console.log(`${files.size} reachable source files; ${entries.size} candidate first-party owner strings (including dynamic templates) inventoried.`);
