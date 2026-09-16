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

test('legacy business services retain their existing order while new stored positions take precedence', () => {
  const { sortCatalogRecords } = load('src/lib/catalogOrdering.ts');
  const legacy = [{ id: 'k', name: 'Knotless Braids', sort_order: null }, { id: 'b', name: 'Boho / Goddess Braids' }, { id: 's', name: 'Silk Press', sort_order: null }];
  const options = { preserveSourceOrder: true };
  assert.deepEqual(Array.from(sortCatalogRecords(legacy, options), row => row.id), ['k', 'b', 's']);
  assert.deepEqual(legacy.map(row => row.id), ['k', 'b', 's'], 'sorting must not mutate the loaded business records');
  assert.deepEqual(Array.from(sortCatalogRecords(legacy), row => row.id), ['b', 'k', 's'], 'platform vocabulary retains its alphabetical fallback');
  const mixed = [...legacy, { id: 'a', name: 'Alpha', sort_order: 2 }, { id: 'z', name: 'Zebra', sort_order: 1 }];
  assert.deepEqual(Array.from(sortCatalogRecords(mixed, options), row => row.id), ['z', 'a', 'k', 'b', 's']);
});

for (const kind of ['services', 'products']) test(`${kind} spreadsheet exports retain imported positions and legacy source order`, async () => {
  const rows = [
    { id: 'legacy-z', name: 'Zebra legacy', sort_order: null },
    { id: 'legacy-a', name: 'Alpha legacy', sort_order: null },
    { id: 'import-a', name: 'Alpha imported', sort_order: 2 },
    { id: 'import-z', name: 'Zebra imported', sort_order: 1 },
  ];
  const queries = []; let exported;
  const admin = { from(table) {
    const query = { table, columns: '', filters: [], ordering: [] }; queries.push(query);
    const chain = {
      select(columns) { query.columns = columns; return chain; },
      eq(key, value) { query.filters.push([key, value]); return chain; },
      is(key, value) { query.filters.push([key, value]); return chain; },
      order(key, options) { query.ordering.push([key, options]); return chain; },
      then(resolve, reject) { return Promise.resolve({ data: ['styles', 'salon_products'].includes(table) ? rows : [], error: null }).then(resolve, reject); },
    }; return chain;
  } };
  const route = typescriptLoader(root, {
    'next/cache': { revalidatePath() {} },
    '@/lib/supabaseAdmin': { requireSalonPermission: async (_request, permission) => { assert.equal(permission, kind === 'services' ? 'styles' : 'products'); return { admin, salon: { id: 'business-A' } }; } },
    '@/lib/operationalMonitoring': { withOperationalMonitoring: (_profile, handler) => handler, routeMonitoringProfile() {} },
    '@/lib/platformErrors': { rejectRequest(message) { throw Error(message); }, monitoredRouteFailure({ error }) { throw error; } },
    '@/lib/salonCatalogSpreadsheet': {
      buildSalonServiceExportWorkbook: async (_catalog, data) => { exported = data; return Buffer.from('workbook'); },
      buildSalonProductExportWorkbook: async data => { exported = data; return Buffer.from('workbook'); },
    },
  })('src/app/api/salon/catalog-spreadsheet/route.ts');
  const response = await route.GET(new Request(`http://localhost/api/salon/catalog-spreadsheet?kind=${kind}&mode=export`));
  assert.equal(response.status, 200);
  assert.deepEqual(Array.from(exported, row => row.record_id), ['import-z', 'import-a', 'legacy-z', 'legacy-a']);
  const owned = queries.find(query => query.table === (kind === 'services' ? 'styles' : 'salon_products'));
  assert.ok(owned.columns.split(',').includes('sort_order'));
  assert.ok(owned.filters.some(([key, value]) => key === 'salon_id' && value === 'business-A'));
  assert.equal(owned.ordering[0][0], 'created_at');
  assert.equal(owned.ordering[0][1].ascending, false);
});
