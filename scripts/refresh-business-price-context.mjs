import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PRICE_CONTEXT_DEFINITION, parseBlsPriceContext, businessPriceContext } from '../src/lib/businessPriceContext.ts';

const MAX_BYTES = 128 * 1024;
/** Revalidate an original saved response without fetching or rewriting it.
 * expectedSha256 pins reviewed offline evidence; it never substitutes for hashing. */
export function validateBlsPriceBytes(raw, { retrievedAt, sourceUrl, expectedSha256 } = {}) {
 if (!(raw instanceof Uint8Array) || !raw.byteLength || raw.byteLength > MAX_BYTES || sourceUrl !== PRICE_CONTEXT_DEFINITION.source_url) throw Error('PRICE_CONTEXT_INVALID_SOURCE');
 const bytes = Buffer.from(raw), sha256 = createHash('sha256').update(bytes).digest('hex');
 if (expectedSha256 !== undefined && expectedSha256 !== sha256) throw Error('PRICE_CONTEXT_SOURCE_HASH_MISMATCH');
 const snapshot = parseBlsPriceContext(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), { retrievedAt, sha256 });
 if (businessPriceContext(snapshot, retrievedAt).status !== 'available') throw Error('PRICE_CONTEXT_SOURCE_OUTDATED');
 return { snapshot, raw: bytes };
}
/** Fixed public source only. No key, business input, user URL or request payload. */
export async function fetchBlsPriceSnapshot({ fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
 const response = await fetchImpl(PRICE_CONTEXT_DEFINITION.source_url, { method: 'GET', redirect: 'error', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
 if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '') || !response.body) throw Error('PRICE_CONTEXT_SOURCE_UNAVAILABLE');
 const length = response.headers.get('content-length');
 if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) { await response.body.cancel(); throw Error('PRICE_CONTEXT_SOURCE_TOO_LARGE'); }
 const reader = response.body.getReader(), chunks = []; let size = 0;
 try {
  for (;;) {
   const { done, value } = await reader.read(); if (done) break;
   size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw Error('PRICE_CONTEXT_SOURCE_TOO_LARGE'); } chunks.push(value);
  }
 } finally { reader.releaseLock(); }
 return validateBlsPriceBytes(Buffer.concat(chunks), { retrievedAt: now(), sourceUrl: PRICE_CONTEXT_DEFINITION.source_url });
}

export async function refreshBlsPriceSnapshot({ fetchImpl = fetch, now = () => new Date().toISOString(), commit } = {}) {
 // A failed read/validation never invokes the writer or destroys prior evidence.
 const result = await fetchBlsPriceSnapshot({ fetchImpl, now });
 if (commit) await commit(result);
 return result.snapshot;
}

async function main() {
 if (process.argv.slice(2).some(value => value !== '--check') || process.argv.slice(2).filter(value => value === '--check').length > 1) throw Error('PRICE_CONTEXT_INVALID_ARGUMENT');
 const check = process.argv.includes('--check'), root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
 await refreshBlsPriceSnapshot({ commit: check ? undefined : async ({ snapshot, raw }) => {
  // Archive the source bytes first. A reviewed git change publishes the snapshot.
  const evidence = resolve(root, '../redesign-evidence'), output = resolve(root, 'src/data/business-price-context.v1.json');
  await mkdir(evidence, { recursive: true });
  await writeFile(resolve(evidence, `bls-personal-care-${snapshot.source_sha256}.json`), raw);
  const temporary = `${output}.tmp`; await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`); await rename(temporary, output);
 } });
 process.stdout.write(check ? 'BLS reference validated; snapshot unchanged.\n' : 'BLS reference validated; reviewed snapshot candidate written.\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
 const allowed = new Set(['PRICE_CONTEXT_SOURCE_UNAVAILABLE', 'PRICE_CONTEXT_SOURCE_TOO_LARGE', 'PRICE_CONTEXT_INVALID_SOURCE', 'PRICE_CONTEXT_SOURCE_OUTDATED', 'PRICE_CONTEXT_INVALID_ARGUMENT']);
 process.stderr.write(`${allowed.has(error?.message) ? error.message : error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'PRICE_CONTEXT_SOURCE_TIMEOUT' : 'PRICE_CONTEXT_SOURCE_UNAVAILABLE'}; prior snapshot retained.\n`); process.exitCode = 1;
});
