import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

function harness(file, props = {}) {
  const slots = [], requests = [], responses = []; let cursor = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
  };
  const Component = typescriptLoader(process.cwd(), {
    react, 'next/link': { __esModule: true, default: 'a' }, 'lucide-react': {},
    '@/components/i18n/LocaleProvider': { useI18n: () => ({ locale: 'en' }) },
    '@/components/public/ContactSupportForm': { __esModule: true, default: 'support-form' },
  }, { fetch: (url, options) => { requests.push({ url, options }); return new Promise(resolve => responses.push(resolve)); } })(file).default;
  function render() { cursor = 0; return Component(props); }
  function find(predicate, node = render()) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) return node.map(child => find(predicate, child)).find(Boolean) || null;
    if (predicate(node)) return node;
    return node.props?.children ? find(predicate, node.props.children) : null;
  }
  return { requests, responses, render, find };
}

test('support handoff requires review and uses the current Engine categories without creating a ticket', async () => {
  const app = harness('src/components/public/AssistantSupportHandoff.tsx', { turns: [{ question: 'Please help with my booking', answer: 'Open your bookings', language: 'en' }], failure: '' });
  assert.equal(app.requests.length, 0);
  const pending = app.find(node => node.type === 'button').props.onClick();
  assert.equal(app.requests[0].url, '/api/support');
  assert.equal(app.requests[0].options.method, 'GET');
  app.responses[0](Response.json({ categories: ['Bookings', 'Safety'] })); await pending;
  const form = app.find(node => node.type === 'support-form');
  assert.deepEqual(Array.from(form.props.categories), ['Bookings', 'Safety']);
  assert.match(form.props.initialMessage, /Please help with my booking/);
  assert.equal(app.requests.length, 1, 'review must never submit a ticket automatically');
});

test('support handoff rejects malformed categories and preserves the normal contact path', async () => {
  const app = harness('src/components/public/AssistantSupportHandoff.tsx', { turns: [], failure: '' });
  const pending = app.find(node => node.type === 'button').props.onClick();
  app.responses[0](Response.json({ categories: [null, { private: 'not a label' }] })); await pending;
  assert.equal(app.find(node => node.type === 'support-form'), null);
  assert.ok(app.find(node => node.type === 'a' && node.props.href === '/contact'));
});

test('handoff summary is bounded, local, and preserves the exact incident reference', () => {
  const { customerSupportSummary } = typescriptLoader(process.cwd())('src/lib/customerSupport.ts');
  const reference = 'bd4ee3ba-5b58-405d-98bd-410619216ace';
  const summary = customerSupportSummary(Array.from({ length: 8 }, (_, i) => ({ question: `question ${i} ` + 'x'.repeat(600), answer: 'a'.repeat(2000), language: 'en' })), `Unavailable. Reference: ${reference}`, 'en');
  assert.ok(summary.length < 3000);
  assert.doesNotMatch(summary, /question 0/);
  assert.match(summary, /question 7/);
  assert.ok(summary.includes(reference));
});

test('support submission does not claim success without a durable ticket reference', async () => {
  const app = harness('src/components/public/ContactSupportForm.tsx', { categories: ['Bookings'], initialMessage: 'Review this booking request', initialSubject: 'Booking help' });
  function field(type, value, name) {
    const node = app.find(node => node.type === type && (!name || node.props.type === name));
    node.props.onChange({ target: { value } });
  }
  field('input', 'Test Customer'); field('input', 'test@example.com', 'email'); field('select', 'Bookings');
  const pending = app.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  app.responses[0](Response.json({ ok: true })); await pending;
  assert.doesNotMatch(JSON.stringify(app.render()), /Your request was received/);
  assert.match(JSON.stringify(app.render()), /confirmed support reference/);
  assert.equal(app.find(node => node.type === 'textarea').props.value, 'Review this booking request');
});

test('an explicitly submitted support draft sends only reviewed fields and shows the stored reference', async () => {
  const app = harness('src/components/public/ContactSupportForm.tsx', { categories: ['Safety'], initialMessage: 'A draft the customer can edit', initialSubject: 'Safety concern' });
  for (const [predicate, value] of [
    [node => node.type === 'input' && node.props.maxLength === 120, 'Test Customer'],
    [node => node.type === 'input' && node.props.type === 'email', 'test@example.com'],
    [node => node.type === 'select', 'Safety'],
    [node => node.type === 'textarea', 'Only this reviewed message'],
  ]) app.find(predicate).props.onChange({ target: { value } });
  const submit = () => app.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const first = submit(); await submit();
  assert.equal(app.requests.length, 1, 'double submission must not duplicate the ticket');
  assert.equal(JSON.parse(app.requests[0].options.body).message, 'Only this reviewed message');
  const ticketId = '79d996ec-4ec4-408c-8b7c-e82e969b7da9';
  app.responses[0](Response.json({ ok: true, ticketId })); await first;
  assert.match(JSON.stringify(app.render()), new RegExp(`Your request was received. Reference: ${ticketId}`));
  assert.equal(app.find(node => node.type === 'textarea').props.value, '');
});

test('support categories are read only and ordinary tickets require confirmed persistence', async () => {
  const inserts = []; let ticketId;
  const route = typescriptLoader(process.cwd(), {
    '@/lib/operationalMonitoring': { noteOperationalFailure() {}, routeMonitoringProfile: () => ({}), withOperationalMonitoring: (_profile, handler) => handler },
    '@/lib/requestSecurity': { enforceRateLimit() {}, rejectBot() {}, cleanEmail: value => value, cleanText: value => value, errorResponse: (_error, fallback) => Response.json({ error: fallback }, { status: 500 }) },
    '@/lib/engineConfigServer': { getEngineList: async () => ['Safety', 'Payments'] },
    '@/lib/contentModerationServer': { moderatePublicContent: async () => ({ allowed: true, source: 'test' }) },
    '@/lib/businessSignupContentServer': { getBusinessSignupContent: async () => null },
    '@/lib/businessWaitlistCore': { BusinessWaitlistValidationError: class extends Error {}, isConfirmedBusinessWaitlistTicketId: () => false },
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => ({ from: table => {
      assert.equal(table, 'support_tickets');
      return { insert: row => { inserts.push(row); return { select: () => ({ single: async () => ({ data: { id: ticketId } }) }) }; } };
    } }) },
  }, { console: { info() {} } })('src/app/api/support/route.ts');
  const categories = await route.GET(new Request('https://example.test/api/support'));
  assert.deepEqual(await categories.json(), { categories: ['Safety', 'Payments'] });
  assert.equal(categories.headers.get('cache-control'), 'no-store');
  assert.equal(inserts.length, 0);
  const request = () => new Request('https://example.test/api/support', { method: 'POST', body: JSON.stringify({ name: 'Test Customer', email: 'test@example.com', subject: 'Safety concern', category: 'Safety', message: 'Reviewed safety report' }) });
  assert.equal((await route.POST(request())).status, 500);
  ticketId = '79d996ec-4ec4-408c-8b7c-e82e969b7da9';
  const success = await route.POST(request());
  assert.deepEqual(await success.json(), { ok: true, ticketId });
  assert.equal(inserts[1].priority, 'High');
});
