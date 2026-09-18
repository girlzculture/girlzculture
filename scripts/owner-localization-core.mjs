import assert from 'node:assert/strict';

export function ownerCoverageReport(inventory, catalogs, exceptions, codeLiterals) {
  const allowed = new Set();
  for (const row of exceptions.entries) {
    assert.ok(row.source && row.reason?.trim(), 'Every untranslated proper name needs an exact reason');
    assert.ok(!allowed.has(row.source), `Duplicate allowlist entry: ${row.source}`); allowed.add(row.source);
  }
  const code = new Map();
  for (const row of codeLiterals.entries) {
    assert.ok(row.source && row.reason?.trim() && row.contexts.length, 'Every non-copy classification requires a reason and exact source contexts');
    assert.ok(!allowed.has(row.source), `Code is not an untranslated UI proper name: ${row.source}`);
    assert.ok(!code.has(row.source), `Duplicate code classification: ${row.source}`);
    code.set(row.source, new Set(row.contexts.map(use => `${use.file}:${use.context}`)));
  }
  const explicitKinds = new Set(['jsx-text', 'jsx-attribute', 'localized-source']);
  const excludedCode = [];
  const ui = Object.values(inventory.entries).filter(row => {
    if (allowed.has(row.source)) return false;
    const contexts = code.get(row.source);
    if (contexts && row.occurrences.every(use => !explicitKinds.has(use.kind) && contexts.has(`${use.file}:${use.context}`))) { excludedCode.push(row.source); return false; }
    // Conservative: an unclassified literal, error or template is copy until
    // its exact source context has been reviewed. No JSX-only shortcut.
    return true;
  });
  const locales = Object.fromEntries(['en', 'fr', 'wo', 'es', 'zh-CN'].map(locale => {
    const missing = locale === 'en' ? [] : ui.filter(row => !catalogs[locale]?.[row.source]?.trim()).map(row => ({ source: row.source, occurrences: row.occurrences }));
    return [locale, { source_count: ui.length, covered: ui.length - missing.length, missing_count: missing.length, missing }];
  }));
  return {
    // Founder explicitly deferred Wolof. Retain its measured gaps without
    // claiming it passed or blocking the four authorized release languages.
    status: ['en', 'fr', 'es', 'zh-CN'].every(locale => !locales[locale].missing_count) ? 'AUTOMATED ONLY' : 'FAIL',
    required_locales: ['en', 'fr', 'es', 'zh-CN'],
    deferred_locales: { wo: 'Founder explicitly deferred Wolof; not release-verified.' },
    scope: 'All inventoried owner graph copy, including dynamic labels, error literals and templates. Only documented proper names and reviewed non-copy source contexts are excluded. Source coverage is not linguistic review or full browser workflow acceptance.',
    candidate_count: Object.keys(inventory.entries).length,
    excluded_code_count: excludedCode.length,
    intentional_untranslated: [...allowed], locales,
  };
}
