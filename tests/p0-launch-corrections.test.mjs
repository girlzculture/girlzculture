import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const root = process.cwd();
const load = typescriptLoader(root);

test('New York and NYC resolve to New York City without treating New York State as a city', () => {
  const { matchDecisionLocationMarket } = load('src/lib/decisionSearchIntentCore.ts');
  const markets = [{ name: 'New York City', state_code: 'NY', center_latitude: 40.7128, center_longitude: -74.006 }];
  for (const query of ['New York', 'NYC', 'braids in New York NY', 'New York City']) assert.equal(matchDecisionLocationMarket(query, markets)?.market.name, 'New York City');
  assert.equal(matchDecisionLocationMarket('New York State', markets), null);
});

test('Harlem shorthand and qualified requests retain the neighborhood instead of the city center', () => {
  const { decisionExplicitLocationRequest } = load('src/lib/decisionSearchEnrichmentCore.ts');
  for (const query of ['Harlem', 'braids in Harlem, New York', 'Find a business in East Harlem NYC']) assert.match(decisionExplicitLocationRequest(query).phrase, /harlem, Manhattan, New York, NY/i);
  assert.equal(decisionExplicitLocationRequest('feed-in braids near me'), null);
});

test('explicit Harlem overrides stale Dallas intent and saved GPS, using the configured place resolver', async () => {
  const fixture = { master_styles: [], search_language_rules: [], location_markets: [{ name: 'New York City', state_code: 'NY', center_latitude: 40.7128, center_longitude: -74.006 }] };
  const admin = { from(table) { const chain = new Proxy({}, { get(_target, key) { if (key === 'then') return resolve => resolve({ data: fixture[table] || [], error: null }); return () => chain; } }); return chain; } };
  const queries = [];
  const server = typescriptLoader(root, { '@/lib/supabaseAdmin': { getSupabaseAdmin: () => admin }, '@/lib/searchPlaceServer': { resolveSearchPlace: async query => { queries.push(query); return { origin: { lat: 40.8116, lng: -73.9465 }, label: 'Harlem, New York, NY, USA' }; } } })('src/lib/beautyConciergeServer.ts');
  const intent = { ...server.deterministicConciergeIntent('braids', 'en'), location: 'Dallas, TX' };
  const result = await server.resolveStyleAndLocation('Harlem, New York', intent, { lat: 32.7767, lng: -96.797 });
  assert.match(queries[0], /Harlem/i);
  assert.equal(result.origin.lat, 40.8116);
  assert.match(result.intent.location, /Harlem/);
});

test('an unresolved explicit place never falls back to a random business or stale GPS', async () => {
  const admin = { from(table) { assert.notEqual(table, 'salons'); const chain = new Proxy({}, { get(_target,key) { if (key === 'then') return resolve => resolve({ data: [], error: null }); return () => chain; } }); return chain; } };
  const server = typescriptLoader(root, { '@/lib/supabaseAdmin': { getSupabaseAdmin: () => admin }, '@/lib/searchPlaceServer': { resolveSearchPlace: async () => null } })('src/lib/beautyConciergeServer.ts');
  const result = await server.resolveStyleAndLocation('in Unknownville', server.deterministicConciergeIntent('in Unknownville', 'en'), { lat: 40.7, lng: -74 });
  assert.equal(result.origin, null);
});

test('custom spreadsheet headings, column order and minute durations parse without the platform template', async () => {
  const { inspectSalonSpreadsheet, parseSalonServiceSpreadsheet } = load('src/lib/salonCatalogSpreadsheet.ts');
  const bytes = Buffer.from('Studio services for September\nTreatment title,What it costs,Time needed\nZebra style,180,90\nAlpha style,120,45\n');
  const inspection = await inspectSalonSpreadsheet(bytes, 'my-own-format.csv', 'services');
  const sheet = inspection.sheets[0].name;
  const reviewed = await inspectSalonSpreadsheet(bytes, 'my-own-format.csv', 'services', { sheet, row: 2 });
  assert.equal(reviewed.sheets[0].headers[0].label, 'Treatment title');
  const result = await parseSalonServiceSpreadsheet(bytes, 'my-own-format.csv', { sheet, header_row: 2, columns: { customer_name: 1, base_price: 2, duration_min_hours: 3 }, duration_unit: 'minutes', category: 'Hair', service_group: 'Braids' });
  assert.deepEqual(Array.from(result.errors), []);
  assert.deepEqual(Array.from(result.rows, row => row.customer_name), ['Zebra style', 'Alpha style']);
  assert.equal(result.rows[0].duration_min_hours, 1.5);
  assert.equal(result.rows[1].duration_min_hours, 0.75);
});

test('mapped spreadsheets reject duplicate column use and invalid numeric data before saving', async () => {
  const { parseSalonServiceSpreadsheet, inspectSalonSpreadsheet } = load('src/lib/salonCatalogSpreadsheet.ts');
  const bytes = Buffer.from('Treatment,Cost,Minutes\nStyle,-1,90\n');
  const sheet = (await inspectSalonSpreadsheet(bytes, 'services.csv', 'services')).sheets[0].name;
  const mapping = { sheet, header_row: 1, columns: { customer_name: 1, base_price: 2, duration_min_hours: 3 }, duration_unit: 'minutes', category: 'Hair', service_group: 'Braids' };
  const result = await parseSalonServiceSpreadsheet(bytes, 'services.csv', mapping);
  assert.ok(result.errors.length);
  await assert.rejects(parseSalonServiceSpreadsheet(bytes, 'services.csv', { ...mapping, columns: { customer_name: 1, base_price: 1 } }), /one valid field/);
});

test('source ordering is restored from database records, rather than alphabetized after refresh', () => {
  const { sortCatalogRecords } = load('src/lib/catalogOrdering.ts');
  assert.deepEqual(Array.from(sortCatalogRecords([{ id: 'a', name: 'Alpha', sort_order: 2 }, { id: 'z', name: 'Zebra', sort_order: 1 }]), row => row.name), ['Zebra', 'Alpha']);
  const migration = readFileSync('supabase/migrations/20260915133423_preserve_service_spreadsheet_order.sql', 'utf8');
  assert.match(migration, /with ordinality/);
  assert.match(migration, /and s\.salon_id=p_salon_id/);
  assert.match(migration, /from public,anon,authenticated/);
});
