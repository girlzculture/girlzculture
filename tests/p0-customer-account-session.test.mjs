import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const slots = [], effects = [], pending = [], redirects = []; let cursor = 0, onAuth, id = 'customer-a';
  const router = { replace: path => redirects.push(path) };
  let userReads = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn, deps) { const i = cursor++; const prior = slots[i]; if (!prior || deps.some((value, j) => value !== prior.deps[j])) effects.push(() => { prior?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const session = () => id ? { user: { id, email: `${id}@example.test`, user_metadata: {} }, access_token: id } : null;
  const client = {
    auth: { getUser: async () => { userReads++; return { data: { user: session()?.user } }; }, onAuthStateChange(callback) { onAuth = callback; return { data: { subscription: { unsubscribe() {} } } }; } },
    from(table) {
      let actor; const query = {
        select() { return query; }, eq(_key, value) { actor = value; return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { return query; },
        then(resolve) { return Promise.resolve({ data: table === 'customers' ? { id: actor, name: `PRIVATE ${actor}`, email: `${actor}@example.test` } : table === 'bookings' ? [{ id: `booking-${actor}`, salon: { name: `PRIVATE ${actor}` }, appointment_datetime: '2030-01-01T12:00:00Z' }] : [] }).then(resolve); },
      }; return query;
    },
  };
  const overrides = {
    react, 'next/link': { default: 'a' }, 'next/navigation': { useRouter: () => router, useSearchParams: () => new URLSearchParams() }, 'lucide-react': {},
    '@/lib/supabase': { getSupabaseForScope: () => client, getSessionForScope: async () => session() },
    '@/lib/salonOpenStatus': { getSalonStatusLabel: () => '', isSalonClosedToday: () => false },
  };
  for (const name of ['site/SafeImage','auth/RoleLogoutButton','BookingInbox','i18n/LanguageSelector','dashboard/WorkspaceToolbar','dashboard/CustomerAssistant','dashboard/WorkspaceCalendar']) overrides[`@/components/${name}`] = { default: name, RoleSessionBoundary: 'boundary' };
  const Component = typescriptLoader(process.cwd(), overrides, { fetch: (_url, options) => new Promise(resolve => pending.push({ actor: options.headers.Authorization, resolve })) })('src/components/CustomerAccount.tsx').default;
  function render() { cursor = 0; const tree = Component({discoveryAvailable:false,homeHref:'/site-access'}); while (effects.length) effects.shift()(); return tree; }
  async function settle() { for (let i = 0; i < 3; i++) { render(); await tick(); } }
  function changeActor(next) { id = next; onAuth?.(next ? 'SIGNED_IN' : 'SIGNED_OUT', session()); render(); }
  render(); onAuth?.('INITIAL_SESSION', session());
  return { pending, redirects, settle, render, changeActor, reads: () => userReads,
    finish(index) { pending[index].resolve(Response.json({ salons: [{ name: `FAVORITE ${pending[index].actor}` }] })); },
  };
}

test('customer account clears all private records immediately on account changes and logout', async () => {
  const app = harness(); await app.settle(); app.finish(0); await app.settle();
  assert.match(JSON.stringify(app.render()), /PRIVATE customer-a/);
  assert.equal(app.render().key, 'customer-a', 'account-owned child forms must be keyed to their identity');
  const reads = app.reads(); app.changeActor('customer-a'); await app.settle();
  assert.equal(app.reads(), reads, 'same-actor token updates retain the loaded account');
  app.changeActor('customer-b');
  assert.doesNotMatch(JSON.stringify(app.render()), /PRIVATE customer-a|FAVORITE Bearer customer-a/);
  await app.settle(); app.finish(1); await app.settle();
  assert.match(JSON.stringify(app.render()), /PRIVATE customer-b/);
  assert.equal(app.render().key, 'customer-b');
  app.changeActor(null); await app.settle();
  assert.doesNotMatch(JSON.stringify(app.render()), /PRIVATE customer/);
  assert.ok(app.redirects.includes('/login?next=/account'));
});

test('a delayed customer account load cannot overwrite a newer account', async () => {
  const app = harness(); await app.settle();
  app.changeActor('customer-b'); await app.settle();
  assert.equal(app.pending.length, 2);
  app.finish(1); await app.settle();
  assert.match(JSON.stringify(app.render()), /PRIVATE customer-b/);
  app.finish(0); await app.settle();
  assert.match(JSON.stringify(app.render()), /PRIVATE customer-b/);
  assert.doesNotMatch(JSON.stringify(app.render()), /PRIVATE customer-a|FAVORITE Bearer customer-a/);
});
