import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function inboxHarness(translateSource = value => value) {
  const slots = []; let cursor = 0; let effects = []; let dirty = true; let tree; let changeAuth = () => {};
  let session = { user: { id: 'customer-a' }, access_token: 'local-a' }; let sessionWait;
  const requests = []; const responses = [];
  const react = {
    useRef: value => { const index = cursor++; return slots[index] ??= { current: value }; },
    useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { const next = typeof value === 'function' ? value(slots[index]) : value; if (next !== slots[index]) { slots[index] = next; dirty = true; } }]; },
    useEffect: (effect, deps) => { const index = cursor++; const old = slots[index]; if (!old || deps.some((value, i) => value !== old.deps[i])) { slots[index] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect(); }); } },
  };
  const Component = typescriptLoader(process.cwd(), {
    react, 'next/link': { default: 'a' }, 'lucide-react': { Languages: 'i', MessageSquare: 'i', Send: 'i' },
    '@/components/booking/MessageDisplay': { default: 'message-display' }, '@/components/booking/BookingWelcome': { default: 'booking-welcome' }, '@/components/booking/BookingPolicyEvidence': { default: 'policy-evidence' },
    '@/components/i18n/LocaleProvider': { useI18n: () => ({ locale: 'fr', translateSource, formatDate: value => value }) },
    '@/lib/supabase': {
      getSessionForScope: async () => sessionWait ? sessionWait.promise : session,
      getSupabaseForScope: () => ({ auth: { onAuthStateChange: callback => { changeAuth = callback; callback('INITIAL_SESSION', session); return { data: { subscription: { unsubscribe() {} } } }; } } }),
    },
  }, { crypto: { randomUUID }, AbortController, fetch: async (url, options) => { requests.push({ url, ...options }); const response = deferred(); responses.push(response); return response.promise; } })('src/components/BookingInbox.tsx').default;
  function render() { do { dirty = false; cursor = 0; tree = Component({ scope: 'customer' }); const pending = effects; effects = []; pending.forEach(effect => effect()); } while (dirty); return tree; }
  function find(predicate) { function walk(node) { if (!node || typeof node !== 'object') return null; if (Array.isArray(node)) return node.map(walk).find(Boolean); return predicate(node) ? node : walk(node.props?.children); } return walk(render()); }
  async function settle() { for (let i = 0; i < 4; i++) { await tick(); render(); } }
  render();
  return { render, find, settle, requests, responses,
    switchActor(id) { session = id ? { user: { id }, access_token: `local-${id}` } : null; changeAuth(id ? 'SIGNED_IN' : 'SIGNED_OUT', session); render(); },
    holdSession() { return sessionWait = deferred(); },
    draft(text) { find(node => node.type === 'textarea').props.onChange({ target: { value: text } }); render(); },
    async ready(messages = []) { await settle(); responses[0].resolve(Response.json({ threads: [{ booking: { id: 'booking-a', guest_name: 'PRIVATE A', appointment_datetime: '2026-09-13T12:00:00Z' }, messages: [] }], role: 'customer' })); await settle(); responses[1].resolve(Response.json({ booking: { id: 'booking-a', guest_name: 'PRIVATE A', appointment_datetime: '2026-09-13T12:00:00Z' }, messages, role: 'customer' })); await settle(); },
  };
}

test('a late inbox list cannot restore the previous account private booking after sign-out', async () => {
  const app = inboxHarness(); await app.settle(); app.switchActor(null);
  app.responses[0].resolve(Response.json({ threads: [{ booking: { id: 'private-booking-a', guest_name: 'PRIVATE A' }, messages: [] }], role: 'customer' })); await app.settle();
  assert.equal(JSON.stringify(app.render()).includes('PRIVATE A'), false);
});

test('an inbox send awaiting authentication cannot execute with the next account token', async () => {
  const app = inboxHarness(); await app.ready(); app.draft('Private draft A'); const session = app.holdSession();
  void app.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  app.switchActor('customer-b'); session.resolve({ user: { id: 'customer-b' }, access_token: 'local-b' }); await app.settle();
  assert.equal(app.requests.filter(request => request.method === 'POST').length, 0);
});

test('a delayed translation cannot reappear after the target language changes', async () => {
  const app = inboxHarness(); await app.ready(); app.draft('Original A');
  const translate = app.find(node => node.type === 'button' && node.props.children?.includes?.('Preview translation')).props.onClick(); await app.settle();
  app.find(node => node.type === 'select' && node.props['aria-label'] === 'Translation language').props.onChange({ target: { value: 'es' } }); app.render();
  app.responses[2].resolve(Response.json({ preview: { original: 'Original A', translated: 'Traduction privée A', locale: 'fr', provider: 'test' } })); await translate; await app.settle();
  assert.equal(JSON.stringify(app.render()).includes('Traduction privée A'), false);
});

test('a successful old send does not erase a newer draft', async () => {
  const app = inboxHarness(); await app.ready(); app.draft('First draft');
  void app.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await app.settle();
  app.draft('New unsent draft'); app.responses[2].resolve(Response.json({ message: { id: 'saved' } })); await app.settle();
  assert.equal(app.find(node => node.type === 'textarea').props.value, 'New unsent draft');
});

test('message sender labels are localized on render without a later DOM translation scan', async () => {
  const labels = { Customer: 'Client', Business: 'Entreprise', 'Girlz Culture Support': 'Assistance Girlz Culture' };
  for (const [role, source] of [['customer', 'Customer'], ['salon', 'Business'], ['platform_admin', 'Girlz Culture Support']]) {
    const app = inboxHarness(value => labels[value] || value);
    await app.ready([{ id: 'message-a', sender_role: role, original_body: 'Business', created_at: '2026-09-13T12:00:00Z' }]);
    assert.equal(app.find(node => node.type === 'small' && node.props.children?.[1] === ' · ').props.children[0], labels[source]);
    assert.equal(app.find(node => node.props.messageId === 'message-a').props.original, 'Business');
  }
});

test('inbox loading is translated on its initial render', () => {
  const app = inboxHarness(value => value === 'Loading booking messages…' ? 'Chargement des messages…' : value);
  assert.equal(app.render().props.children, 'Chargement des messages…');
});

test('a delayed empty inbox is translated in the render that introduces it', async () => {
  const labels = {
    'Loading booking messages…': 'Chargement des messages…',
    'No booking conversations yet': 'Aucune conversation de réservation',
    'A conversation becomes available after a real appointment is booked.': 'Une conversation est disponible après la réservation d’un rendez-vous réel.',
  };
  const app = inboxHarness(value => labels[value] || value);
  await app.settle();
  app.responses[0].resolve(Response.json({ threads: [], role: 'customer' }));
  await app.settle();
  assert.equal(app.find(node => node.type === 'h2').props.children, labels['No booking conversations yet']);
  assert.equal(app.find(node => node.type === 'p').props.children, labels['A conversation becomes available after a real appointment is booked.']);
});
