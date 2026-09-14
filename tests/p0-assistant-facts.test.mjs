import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

function fixture() {
  const dates = [];
  const { Facts } = typescriptLoader(process.cwd(), {
    '@/components/i18n/LocaleProvider': { useI18n: () => ({ translateSource: value => ({ Confirmed: 'Confirmé', Tuesday: 'mardi' })[value] || value, formatNumber: String, formatCurrency: value => `USD ${value}`, formatDate: (value, options) => { dates.push({ value, ...options }); return 'date affichée'; } }) },
    '@/lib/supabase': {}, 'next/link': { default: 'a' },
  })('src/components/owner/GcAssistant.tsx');
  function render(node) {
    if (node == null || typeof node === 'boolean') return '';
    if (Array.isArray(node)) return node.map(render).join(' ');
    if (typeof node !== 'object') return String(node);
    if (typeof node.type === 'function') return render(node.type(node.props));
    return render(node.props?.children);
  }
  return { dates, render: value => render(Facts({ value })) };
}
test('Assistant nested booking facts retain the business timezone, localized status and original customer name', () => {
  const app = fixture(); const rendered = app.render({ time_zone: 'Asia/Shanghai', bookings: [{ guest_name: 'Save {value1} $180', appointment_datetime: '2026-09-13T16:00:00Z', status: 'Confirmed' }] });
  assert.match(rendered, /Save \{value1\} \$180/); assert.match(rendered, /Confirmé/);
  assert.equal(app.dates[0].timeZone, 'Asia/Shanghai');
});
test('Assistant hours and option prices are formatted without leaking database keys or changing original names', () => {
  const app = fixture(); const rendered = app.render({ hours: { Tue: { open: '09:00', close: '19:00', closed: false } }, services: [{ name: 'Save', length_options: [{ label: 'Owner original', price_add: 25 }] }], unknown_internal_column: 'hidden' });
  assert.match(rendered, /mardi/); assert.match(rendered, /USD 25/); assert.match(rendered, /Owner original/);
  assert.doesNotMatch(rendered, /unknown_internal_column|price_add|hidden/);
  assert.equal(app.dates.length, 2); assert.ok(app.dates.every(date => date.timeZone === 'UTC'));
});

test('Assistant provides an explicit expansion for returned records beyond the initial thirty', () => {
  const app = fixture();
  const rendered = app.render({ bookings: Array.from({ length: 31 }, (_, index) => ({ guest_name: `Original person ${index}` })) });
  assert.match(rendered, /Show \{value0\} more results/);
  assert.match(rendered, /Original person 30/);
});
