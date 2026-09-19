import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadNodeTypescript } from './helpers/load-node-typescript.mjs';
const load = loadNodeTypescript(process.cwd());
const now = '2026-09-19T19:00:00.000Z';
// Deliberately synthetic numeric observations; never shipped as BLS evidence.
const rows = Array.from({ length: 13 }, (_, i) => { const date = new Date(Date.UTC(2025, 7 + i, 1)); return { year: String(date.getUTCFullYear()), period: `M${String(date.getUTCMonth() + 1).padStart(2, '0')}`, value: String(100 + i), footnotes: [{}] }; });
const raw = (data = rows) => ({ status: 'REQUEST_SUCCEEDED', message: [], Results: { series: [{ seriesID: 'CUUR0000SEGC', data }] } });
// Exact original public BLS v2 response, retrieved 2026-09-19T19:26:29.133Z.
// Public aggregate only. Preserve byte identity, including the explicit missing month.
const officialRawBytes = Buffer.from("{\"status\":\"REQUEST_SUCCEEDED\",\"responseTime\":157,\"message\":[],\"Results\":{\n\"series\":\n[{\"seriesID\":\"CUUR0000SEGC\",\"data\":[{\"year\":\"2026\",\"period\":\"M08\",\"periodName\":\"August\",\"latest\":\"true\",\"value\":\"374.865\",\"footnotes\":[{}]},{\"year\":\"2026\",\"period\":\"M07\",\"periodName\":\"July\",\"value\":\"373.473\",\"footnotes\":[{}]},{\"year\":\"2026\",\"period\":\"M06\",\"periodName\":\"June\",\"value\":\"373.279\",\"footnotes\":[{}]},{\"year\":\"2026\",\"period\":\"M05\",\"periodName\":\"May\",\"value\":\"368.328\",\"footnotes\":[{}]},{\"year\":\"2026\",\"period\":\"M04\",\"periodName\":\"April\",\"value\":\"366.634\",\"footnotes\":[{}]},{\"year\":\"2026\",\"period\":\"M03\",\"periodName\":\"March\",\"value\":\"369.354\",\"footnotes\":[{}]},{\"year\":\"2026\",\"period\":\"M02\",\"periodName\":\"February\",\"value\":\"370.310\",\"footnotes\":[{}]},{\"year\":\"2026\",\"period\":\"M01\",\"periodName\":\"January\",\"value\":\"369.200\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M12\",\"periodName\":\"December\",\"value\":\"366.953\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M11\",\"periodName\":\"November\",\"value\":\"364.342\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M10\",\"periodName\":\"October\",\"value\":\"-\",\"footnotes\":[{\"code\":\"X\",\"text\":\"Data unavailable due to the 2025 lapse in appropriations\"}]},{\"year\":\"2025\",\"period\":\"M09\",\"periodName\":\"September\",\"value\":\"362.968\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M08\",\"periodName\":\"August\",\"value\":\"359.588\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M07\",\"periodName\":\"July\",\"value\":\"357.824\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M06\",\"periodName\":\"June\",\"value\":\"357.641\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M05\",\"periodName\":\"May\",\"value\":\"355.642\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M04\",\"periodName\":\"April\",\"value\":\"353.939\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M03\",\"periodName\":\"March\",\"value\":\"353.554\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M02\",\"periodName\":\"February\",\"value\":\"353.165\",\"footnotes\":[{}]},{\"year\":\"2025\",\"period\":\"M01\",\"periodName\":\"January\",\"value\":\"351.736\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M12\",\"periodName\":\"December\",\"value\":\"350.024\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M11\",\"periodName\":\"November\",\"value\":\"349.909\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M10\",\"periodName\":\"October\",\"value\":\"347.814\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M09\",\"periodName\":\"September\",\"value\":\"347.077\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M08\",\"periodName\":\"August\",\"value\":\"346.821\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M07\",\"periodName\":\"July\",\"value\":\"344.819\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M06\",\"periodName\":\"June\",\"value\":\"344.506\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M05\",\"periodName\":\"May\",\"value\":\"342.450\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M04\",\"periodName\":\"April\",\"value\":\"341.653\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M03\",\"periodName\":\"March\",\"value\":\"337.564\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M02\",\"periodName\":\"February\",\"value\":\"337.358\",\"footnotes\":[{}]},{\"year\":\"2024\",\"period\":\"M01\",\"periodName\":\"January\",\"value\":\"336.316\",\"footnotes\":[{}]}]}]\n}}");
const officialSha256 = '021e118095c85fd3258894056d6c56b2ffb76bd58876f1264e073aac99841e43';
const officialRetrievedAt = '2026-09-19T19:26:29.133Z';
const knownGap = { year: '2025', period: 'M10', periodName: 'October', value: '-', footnotes: [{ code: 'X', text: 'Data unavailable due to the 2025 lapse in appropriations' }] };

test('exact official BLS v2 bytes preserve the documented unavailable month separately from numeric observations', () => {
 const api = load('src/lib/businessPriceContext.ts');
 assert.equal(officialRawBytes.byteLength, 3025); assert.equal(createHash('sha256').update(officialRawBytes).digest('hex'), officialSha256);
 const snapshot = api.parseBlsPriceContext(JSON.parse(officialRawBytes), { retrievedAt: officialRetrievedAt, sha256: officialSha256 });
 assert.equal(snapshot.source_url, 'https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SEGC');
 assert.equal(snapshot.source_sha256, officialSha256); assert.equal(snapshot.observations.length, 31);
 assert.deepEqual(snapshot.unavailable_observations, [{ month: '2025-10', reason: 'source_data_unavailable', source_value: '-', footnote_code: 'X', footnote_text: knownGap.footnotes[0].text }]);
 assert.equal(snapshot.observations.some(row => row.month === '2025-10'), false);
 const view = api.businessPriceContext(snapshot, officialRetrievedAt);
 assert.equal(view.status, 'available'); assert.deepEqual(view.current, { month: '2026-08', index_value: 374.865 });
 assert.deepEqual(view.comparison, { month: '2025-08', index_value: 359.588 }); assert.equal(view.change_percent, 4.25);
 assert.equal(view.observation_count, 31); assert.equal(view.source_month_count, 32); assert.equal(view.unavailable_observation_count, 1);
 assert.deepEqual(view.unavailable_observations, [{ month: '2025-10', reason: 'source_data_unavailable' }]);
});

test('an explicitly unavailable exact comparison month never falls back to an adjacent numeric month', () => {
 const api = load('src/lib/businessPriceContext.ts');
 const snapshot = api.parseBlsPriceContext(raw([{ year: '2026', period: 'M10', value: '375', footnotes: [{}] }, knownGap, { year: '2025', period: 'M09', value: '360', footnotes: [{}] }]), { retrievedAt: '2026-11-19T00:00:00.000Z', sha256: 'b'.repeat(64) });
 const view = api.businessPriceContext(snapshot, '2026-11-19T00:00:00.000Z');
 assert.equal(view.status, 'available'); assert.equal(view.comparison, null); assert.equal(view.change_percent, null); assert.equal(view.change_status, 'missing_comparison');
 assert.equal(view.unavailable_observations[0].month, '2025-10');
});

test('only the exact reviewed missing month and footnote are admitted, without weakening shared period bounds', () => {
 const api = load('src/lib/businessPriceContext.ts'), evidence = { retrievedAt: officialRetrievedAt, sha256: officialSha256 };
 const badGaps = [
  { ...knownGap, period: 'M09' }, { ...knownGap, year: '2026' }, { ...knownGap, period: 'M13' }, { ...knownGap, value: '0' },
  { ...knownGap, footnotes: [] }, { ...knownGap, footnotes: [{}] }, { ...knownGap, footnotes: [...knownGap.footnotes, {}] },
  { ...knownGap, footnotes: [{ code: 'P', text: knownGap.footnotes[0].text }] }, { ...knownGap, footnotes: [{ code: 'X', text: 'Different unavailable reason' }] },
  { ...knownGap, footnotes: [{ ...knownGap.footnotes[0], extra: '' }] },
 ];
 for (const gap of badGaps) assert.throws(() => api.parseBlsPriceContext(raw([rows[0], gap]), evidence), /PRICE_CONTEXT_INVALID_SOURCE/);
 for (const data of [[rows[0], knownGap, knownGap], [rows[0], knownGap, { ...knownGap, value: '123', footnotes: [{}] }], [knownGap], [...Array(36).fill(rows[0]), knownGap]]) assert.throws(() => api.parseBlsPriceContext(raw(data), evidence), /PRICE_CONTEXT_INVALID_SOURCE/);
 for (const retrievedAt of ['2025-09-20T00:00:00.000Z', '2025-10-20T00:00:00.000Z', '2028-11-20T00:00:00.000Z']) {
  const prior = new Date(retrievedAt); prior.setUTCMonth(prior.getUTCMonth() - 1);
  const numeric = { year: String(prior.getUTCFullYear()), period: `M${String(prior.getUTCMonth() + 1).padStart(2, '0')}`, value: '100', footnotes: [{}] };
  assert.throws(() => api.parseBlsPriceContext(raw([numeric, knownGap]), { ...evidence, retrievedAt }), /PRICE_CONTEXT_INVALID_SOURCE/);
 }
});

test('snapshot readback validates missing-observation provenance, overlap and counts before exposing numbers', () => {
 const api = load('src/lib/businessPriceContext.ts'), snapshot = api.parseBlsPriceContext(JSON.parse(officialRawBytes), { retrievedAt: officialRetrievedAt, sha256: officialSha256 });
 const gap = snapshot.unavailable_observations[0];
 for (const changed of [undefined, null, [{ ...gap, month: '2025-09' }], [{ ...gap, reason: 'estimated' }], [{ ...gap, source_value: '0' }], [{ ...gap, footnote_text: 'Other reason' }], [{ ...gap, private_name: 'Must not leave input' }], [gap, gap]]) {
  const view = api.businessPriceContext({ ...snapshot, unavailable_observations: changed }, officialRetrievedAt);
  assert.equal(view.status, 'unavailable'); assert.equal(view.current, null); assert.equal(view.change_percent, null); assert.deepEqual(view.unavailable_observations, []);
 }
 const overlap = api.businessPriceContext({ ...snapshot, observations: [...snapshot.observations, { month: '2025-10', index_value: 360 }] }, officialRetrievedAt);
 assert.equal(overlap.status, 'unavailable'); assert.equal(overlap.current, null);
 const stale = api.businessPriceContext(snapshot, '2026-11-01T00:00:00.000Z');
 assert.equal(stale.status, 'stale'); assert.equal(stale.current, null); assert.equal(stale.change_percent, null); assert.equal(stale.unavailable_observations[0].month, '2025-10');
});

test('saved raw validation pins exact v2 URL, original bytes and reviewed hash without a fetch', async () => {
 const { validateBlsPriceBytes } = await import('../scripts/refresh-business-price-context.mjs');
 const evidence = { retrievedAt: officialRetrievedAt, sourceUrl: 'https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SEGC', expectedSha256: officialSha256 };
 const result = validateBlsPriceBytes(officialRawBytes, evidence);
 assert.deepEqual(result.raw, officialRawBytes); assert.notEqual(result.raw, officialRawBytes); assert.equal(result.snapshot.observations.length, 31); assert.equal(result.snapshot.unavailable_observations.length, 1);
 for (const changed of [{ ...evidence, sourceUrl: evidence.sourceUrl.replace('/v2/', '/v1/') }, { ...evidence, sourceUrl: 'https://other.example.test' }, { ...evidence, expectedSha256: '0'.repeat(64) }, { ...evidence, retrievedAt: 'not-a-time' }]) assert.throws(() => validateBlsPriceBytes(officialRawBytes, changed));
 assert.throws(() => validateBlsPriceBytes(Buffer.concat([officialRawBytes, Buffer.from(' ')]), evidence), /PRICE_CONTEXT_SOURCE_HASH_MISMATCH/);
 for (const bytes of [Buffer.alloc(0), Buffer.alloc(131073), Buffer.from([0xff]), JSON.parse(officialRawBytes)]) assert.throws(() => validateBlsPriceBytes(bytes, { ...evidence, expectedSha256: undefined }));
});

test('shipped verified snapshot exactly matches the reviewed original raw bytes including missing-month provenance', () => {
 const api = load('src/lib/businessPriceContext.ts'), snapshot = JSON.parse(readFileSync('src/data/business-price-context.v1.json', 'utf8'));
 const expected = api.parseBlsPriceContext(JSON.parse(officialRawBytes), { retrievedAt: officialRetrievedAt, sha256: officialSha256 });
 assert.deepEqual(snapshot, expected);
 assert.equal(snapshot.source_sha256, createHash('sha256').update(officialRawBytes).digest('hex'));
 const view = api.businessPriceContext(snapshot, officialRetrievedAt);
 assert.equal(view.status, 'available'); assert.equal(view.current.index_value, 374.865); assert.equal(view.comparison.index_value, 359.588);
 assert.equal(view.change_percent, 4.25); assert.equal(view.service_dollar_benchmark_available, false); assert.equal(view.local_price_comparison_available, false); assert.equal(view.price_recommendation_available, false);
 assert.equal(api.businessPriceContext(snapshot, '2026-11-01T00:00:00.000Z').status, 'stale');
});
test('national price context distinguishes an exact published index change from service dollars', () => {
 const api = load('src/lib/businessPriceContext.ts');
 const snapshot = api.parseBlsPriceContext(raw(), { retrievedAt: now, sha256: 'a'.repeat(64) });
 const view = api.businessPriceContext(snapshot, now);
 assert.equal(view.status, 'available'); assert.equal(view.current.month, '2026-08'); assert.equal(view.comparison.month, '2025-08'); assert.equal(view.change_percent, 12);
 assert.equal(view.unit, 'index_points'); assert.equal(view.currency, null); assert.equal(view.sample_count, null); assert.equal(view.geography, 'US_CITY_AVERAGE'); assert.equal(view.service_dollar_benchmark_available, false);
});
test('national price context fails closed without verified source observations or a current snapshot', () => {
 const api = load('src/lib/businessPriceContext.ts');
 const snapshot = api.parseBlsPriceContext(raw(), { retrievedAt: now, sha256: 'a'.repeat(64) });
 assert.equal(api.businessPriceContext(null, now).status, 'unavailable');
 assert.equal(api.businessPriceContext(snapshot, '2026-12-01T00:00:00.000Z').status, 'stale');
 assert.equal(api.businessPriceContext({ ...snapshot, series_id: 'FOREIGN_SERIES' }, now).status, 'unavailable');
});

test('raw price reference requires exact single series, successful shape and no ambiguous provider message', () => {
 const api = load('src/lib/businessPriceContext.ts'), evidence = { retrievedAt: now, sha256: 'a'.repeat(64) };
 for (const bad of [null, {}, { ...raw(), status: 'REQUEST_FAILED' }, { ...raw(), message: ['No Data Available'] }, { ...raw(), Results: { series: [] } }, { ...raw(), Results: { series: [...raw().Results.series, ...raw().Results.series] } }, { ...raw(), Results: { series: [{ ...raw().Results.series[0], seriesID: 'CUUR0000SEGD03' }] } }]) assert.throws(() => api.parseBlsPriceContext(bad, evidence), /PRICE_CONTEXT_INVALID_SOURCE/);
 const documentedArray = { ...raw(), Results: [raw().Results] };
 assert.equal(api.parseBlsPriceContext(documentedArray, evidence).observations.length, 13);
});

test('raw reference rejects duplicate, annual, current/future, malformed and unbounded periods', () => {
 const api = load('src/lib/businessPriceContext.ts'), evidence = { retrievedAt: now, sha256: 'a'.repeat(64) };
 for (const data of [[], [...rows, rows[0]], [{ ...rows[0], period: 'M13' }], [{ ...rows[0], period: 'M00' }], [{ ...rows[0], year: '2026', period: 'M09' }], [{ ...rows[0], year: '2027' }], [{ ...rows[0], year: '0026' }], Array(37).fill(rows[0])]) assert.throws(() => api.parseBlsPriceContext(raw(data), evidence), /PRICE_CONTEXT_INVALID_SOURCE/);
});

test('raw reference rejects nonfinite, nonpositive, malformed values and unreviewed footnotes', () => {
 const api = load('src/lib/businessPriceContext.ts'), evidence = { retrievedAt: now, sha256: 'a'.repeat(64) };
 for (const value of [NaN, Infinity, 100, 'NaN', 'Infinity', '0', '-10', '1e6', '100000000000000000', '1.000000001']) assert.throws(() => api.parseBlsPriceContext(raw([{ ...rows[0], value }]), evidence), /PRICE_CONTEXT_INVALID_SOURCE/);
 for (const footnotes of [undefined, null, [{ code: 'P', text: 'Preliminary' }], [{ text: 'Unreviewed source note' }], [{ unexpected: '' }]]) assert.throws(() => api.parseBlsPriceContext(raw([{ ...rows[0], footnotes }]), evidence), /PRICE_CONTEXT_INVALID_SOURCE/);
});

test('verified snapshot binds unit, base, geography, sample unknown and safe official links', () => {
 const api = load('src/lib/businessPriceContext.ts'), snapshot = api.parseBlsPriceContext(raw(), { retrievedAt: now, sha256: 'a'.repeat(64) });
 for (const changed of [{ unit: 'USD' }, { currency: 'USD' }, { reference_base: '1997=100' }, { seasonal_adjustment: 'seasonally_adjusted' }, { geography: 'New York City' }, { population: 'CPI_W' }, { sample_count: 0 }, { source_url: 'https://competitor.example.test' }, { metadata_url: 'https://competitor.example.test' }, { source_sha256: 'unknown' }, { retrieved_at: '2027-01-01T00:00:00.000Z' }, { source_release_at: now }, { observations: snapshot.observations.map((row, i) => ({ ...row, ...(i ? {} : { index_value: Infinity }) })) }]) {
  const view = api.businessPriceContext({ ...snapshot, ...changed }, now); assert.equal(view.status, 'unavailable'); assert.equal(view.current, null); assert.equal(view.change_percent, null);
 }
 const projected = api.businessPriceContext({ ...snapshot, private_business_records: ['must never leave input'] }, now);
 assert.equal(JSON.stringify(projected).includes('must never leave'), false);
});

test('missing comparison is unknown, negative and zero changes remain measured calculations', () => {
 const api = load('src/lib/businessPriceContext.ts'), snapshot = api.parseBlsPriceContext(raw(rows.slice(1)), { retrievedAt: now, sha256: 'a'.repeat(64) });
 const missing = api.businessPriceContext(snapshot, now); assert.equal(missing.status, 'available'); assert.equal(missing.change_percent, null); assert.equal(missing.change_status, 'missing_comparison'); assert.equal(missing.comparison, null);
 for (const [last, percent] of [['90', -10], ['100', 0]]) {
  const changed = rows.map((row, i) => i === 12 ? { ...row, value: last } : row);
  assert.equal(api.businessPriceContext(api.parseBlsPriceContext(raw(changed), { retrievedAt: now, sha256: 'a'.repeat(64) }), now).change_percent, percent);
 }
});

test('freshness expires exactly at the earliest fetch, observation or verified release boundary', () => {
 const api = load('src/lib/businessPriceContext.ts'), snapshot = api.parseBlsPriceContext(raw(), { retrievedAt: now, sha256: 'a'.repeat(64) });
 assert.equal(api.businessPriceContext(snapshot, '2026-10-31T23:59:59.999Z').status, 'available');
 const expired = api.businessPriceContext(snapshot, '2026-11-01T00:00:00.000Z'); assert.equal(expired.status, 'stale'); assert.equal(expired.current, null); assert.equal(expired.change_percent, null);
 const released = { ...snapshot, next_expected_release_at: '2026-10-14T12:30:00.000Z' };
 assert.equal(api.businessPriceContext(released, '2026-10-21T12:29:59.999Z').status, 'available'); assert.equal(api.businessPriceContext(released, '2026-10-21T12:30:00.000Z').status, 'stale');
 const oldRows = rows.map(row => ({ ...row, year: String(Number(row.year) - 1) }));
 assert.equal(api.businessPriceContext(api.parseBlsPriceContext(raw(oldRows), { retrievedAt: now, sha256: 'a'.repeat(64) }), now).status, 'stale');
});

test('an explicitly unavailable snapshot honestly contains no verified numeric observation', () => {
 const api = load('src/lib/businessPriceContext.ts'), snapshot = { ...api.PRICE_CONTEXT_DEFINITION, status: 'unavailable', observations: [] };
 assert.equal(snapshot.status, 'unavailable'); assert.deepEqual(snapshot.observations, []);
 const view = api.businessPriceContext(snapshot, now); assert.equal(view.status, 'unavailable'); assert.equal(view.reason, 'source_not_verified'); assert.equal(view.current, null); assert.equal(view.change_percent, null); assert.equal(view.retrieved_at, null);
});

test('refresh transport sends no credentials/business data and validates exact original bytes before write', async () => {
 const { refreshBlsPriceSnapshot } = await import('../scripts/refresh-business-price-context.mjs');
 const body = JSON.stringify(raw()), calls = [], writes = [];
 const snapshot = await refreshBlsPriceSnapshot({ now: () => now, fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(body, { headers: { 'Content-Type': 'application/json;charset=UTF-8' } }); }, commit: async value => writes.push(value) });
 assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SEGC'); assert.deepEqual(calls[0].options.headers, { Accept: 'application/json' }); assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.redirect, 'error'); assert.ok(calls[0].options.signal instanceof AbortSignal); assert.equal(calls[0].options.body, undefined);
 assert.equal(writes.length, 1); assert.equal(writes[0].raw.toString(), body); assert.equal(snapshot.source_sha256, createHash('sha256').update(body).digest('hex'));
});

test('failed, oversized or invalid refresh never invokes the snapshot writer', async () => {
 const { refreshBlsPriceSnapshot } = await import('../scripts/refresh-business-price-context.mjs'); let writes = 0;
 const providers = [async () => { throw new DOMException('timeout', 'TimeoutError'); }, async () => new Response('Unavailable', { status: 429 }), async () => new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }), async () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '200000' } }), async () => new Response('x'.repeat(131073), { headers: { 'Content-Type': 'application/json' } }), async () => new Response(JSON.stringify({ ...raw(), message: ['No Data Available'] }), { headers: { 'Content-Type': 'application/json' } })];
 for (const fetchImpl of providers) await assert.rejects(refreshBlsPriceSnapshot({ fetchImpl, now: () => now, commit: async () => { writes++; } }));
 assert.equal(writes, 0);
});

test('public price-context copy covers all four locales with identical placeholders', () => {
 const { BUSINESS_PRICE_CONTEXT_COPY_ROWS: copy, businessPriceContextCopy } = load('src/i18n/business-price-context-copy.ts');
 assert.equal(new Set(copy.map(row => row[0])).size, copy.length);
 for (const row of copy) { assert.equal(row.length, 4); const tokens = value => [...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort(); for (const value of row) { assert.ok(value.trim()); assert.deepEqual(tokens(value), tokens(row[0])); } }
 for (const locale of ['en', 'fr', 'es', 'zh-CN']) assert.ok(businessPriceContextCopy(locale, 'Calculated change from {from} to {to}: {value}%', { from: 'A', to: 'B', value: '12' }).includes('12'));
});
