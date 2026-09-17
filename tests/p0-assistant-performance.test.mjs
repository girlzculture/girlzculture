import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load = () => typescriptLoader(process.cwd())('src/lib/assistantPerformance.ts');

test('period metrics distinguish completed marketplace value, manual work and recorded no-shows', () => {
  const result = load().assistantPeriodMetrics([
    { status: 'Completed', estimated_total: '120', booking_origin: 'marketplace', guest_name: 'Private name' },
    { status: 'Completed', estimated_total: 900, booking_origin: 'business_added' },
    { status: 'No-show', estimated_total: 50, booking_origin: 'marketplace' },
    { status: 'Confirmed', estimated_total: 200, appointment_datetime: '2000-01-01T00:00:00Z' },
  ]);
  assert.equal(result.total_appointments, 4);
  assert.equal(result.completed_appointments, 2);
  assert.equal(result.recorded_no_shows, 1);
  assert.equal(result.completed_booking_value, 120);
  assert.equal(result.cash_revenue, null);
  assert.equal(JSON.stringify(result).includes('Private name'), false);
});

test('missing completed amounts stay unavailable while a verified empty period is zero', () => {
  assert.equal(load().assistantPeriodMetrics([{ status: 'Completed', estimated_total: null }]).completed_booking_value, null);
  assert.equal(load().assistantPeriodMetrics([]).completed_booking_value, 0);
});

test('comparisons do not invent percentages from zero or unavailable booking values', () => {
  const { assistantPeriodMetrics, compareAssistantPeriods } = load();
  const previous = assistantPeriodMetrics([]);
  const current = assistantPeriodMetrics([{ status: 'Completed', estimated_total: 120 }]);
  const changes = compareAssistantPeriods(current, previous);
  assert.equal(changes.total_appointments.absolute, 1);
  assert.equal(changes.total_appointments.percent, null);
  assert.equal(changes.completed_booking_value.absolute, 120);
  const unknown = compareAssistantPeriods(assistantPeriodMetrics([{ status: 'Completed' }]), current);
  assert.equal(unknown.completed_booking_value.absolute, null);
  assert.equal(unknown.completed_booking_value.percent, null);
});

test('performance groups use record identity, preserve unknown value and omit private customer facts', () => {
  const result = load().assistantPerformanceGroups([
    { style_id: 'a', status: 'Completed', estimated_total: 100, guest_name: 'Private' },
    { style_id: 'a', status: 'Confirmed', estimated_total: 50 },
    { style_id: 'b', status: 'Completed', estimated_total: null },
    { style_id: null, status: 'Completed', estimated_total: 900, booking_origin: 'business_added' },
  ], 'style_id');
  assert.equal(result.length, 3);
  assert.equal(result.find(row => row.record_id === 'a').total_appointments, 2);
  assert.equal(result.find(row => row.record_id === 'a').completed_booking_value, 100);
  assert.equal(result.find(row => row.record_id === 'b').completed_booking_value, null);
  assert.equal(result.find(row => row.record_id === null).completed_booking_value, 0);
  assert.equal(JSON.stringify(result).includes('Private'), false);
});

test('deterministic summaries do not render an unknown amount as zero or no matching records', () => {
  const { presentAssistantResult } = typescriptLoader(process.cwd())('src/lib/gcAssistantPresentation.ts');
  for (const tool of ['get_earnings_summary', 'get_business_summary']) {
    const result = presentAssistantResult(tool, { bookings: 2, upcoming: 0, completed_booking_value: null }, 'en');
    assert.match(result.message, /not available/);
    assert.doesNotMatch(result.message, /\$0\.00|didn.t find/i);
  }
});
