type CatalogRow = Record<string, unknown>;
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// These are search hints, never replacement record names or write targets.
// Mermaid, goddess, knotless and other distinct techniques remain distinct.
const aliases: Record<string, string> = { bohemian: 'boho', braids: 'braid', tresse: 'braid', tresses: 'braid', trenza: 'braid', trenzas: 'braid', tressage: 'braid', twists: 'twist', locks: 'loc', locs: 'loc', coupe: 'cut', corte: 'cut', cheveux: 'hair', cabello: 'hair' };
const generic = new Set(['braid', 'hair', 'service', 'services', 'style', 'styles', 'de', 'des', 'the', 'my', 'mes', 'mis', 'and', 'et', 'y']);
const tokens = (value: string) => normalize(value).split(/\s+/u).filter(Boolean).map(token => aliases[token] || token);
function closeSpelling(left: string, right: string) {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4 || Math.abs(left.length - right.length) > 1) return false;
  const rows = [Array.from({ length: right.length + 1 }, (_, index) => index)];
  for (let i = 1; i <= left.length; i++) {
    const row = [i];
    for (let j = 1; j <= right.length; j++) row[j] = Math.min(row[j - 1] + 1, rows[i - 1][j] + 1, rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    rows.push(row);
  }
  return rows[left.length][right.length] <= 1;
}

/** Pure matching over records that the server has already scoped/authorized. */
export function matchBusinessCatalog<T extends CatalogRow>(records: T[], query: string) {
  const requested = query.trim();
  const needle = normalize(requested);
  const wanted = tokens(requested);
  const distinctive = wanted.filter(token => !generic.has(token));
  const literalSymbols = /[%_]/u.test(requested);
  const matches = records.flatMap(record => {
    const name = String(record.name || '');
    const direct = name.toLocaleLowerCase('en').includes(requested.toLocaleLowerCase('en'));
    if (!requested) return [{ record, exact: true, score: 1 }];
    if (literalSymbols) return direct ? [{ record, exact: true, score: 1000 }] : [];
    const nameTokens = tokens(name);
    const compact = needle.length >= 4 && normalize(name).replaceAll(' ', '') === needle.replaceAll(' ', '');
    if (direct || compact) return [{ record, exact: true, score: 1000 + requested.length }];
    const has = (token: string) => nameTokens.some(candidate => closeSpelling(token, candidate));
    if (!wanted.length || (distinctive.length ? !distinctive.some(has) : !wanted.some(has))) return [];
    const score = wanted.reduce((sum, token) => sum + (has(token) ? generic.has(token) ? 1 : 10 : 0), 0);
    return [{ record, exact: false, score }];
  });
  return matches.sort((a, b) => b.score - a.score || String(a.record.name).localeCompare(String(b.record.name)));
}
