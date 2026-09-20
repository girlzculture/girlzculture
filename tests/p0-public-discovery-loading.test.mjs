import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

// Run the real placement and API parser with controlled React hook scheduling.
// Render, passive effects, the existing request timer and transport completion
// are separate boundaries; no browser, real network or elapsed-time wait runs.
const drainMicrotasks = () => new Promise(resolve => setImmediate(resolve));
const area = (lat = 40.71, label = 'Area A') => ({ lat, lng: -74, label, source: 'explicit' });
const salon = id => ({ id, name: id, slug: id, starting_price: 75 });
function harness(kind, props = {}) {
  const slots = [], effects = [], timers = new Map(), requests = [];
  let cursor = 0, timerId = 0;
  let location = { ready: true, location: area(), radiusMiles: 25 };
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(factory, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useEffect(effect, deps) {
      const index = cursor++, old = slots[index];
      if (!same(old?.deps, deps)) {
        slots[index] = { deps, cleanup: old?.cleanup };
        effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const Component = typescriptLoader(process.cwd(), {
    react,
    'next/link': { __esModule: true, default: 'a' },
    'lucide-react': { ArrowLeft: 'i', ArrowRight: 'i', RotateCcw: 'i', Megaphone: 'i' },
    '@/components/location/CustomerLocationProvider': { useCustomerLocation: () => location },
    '@/components/public/MarketplaceSalonCard': { __esModule: true, default: 'salon-card' },
    '@/components/public/SalonCardSkeletons': { __esModule: true, default: 'loading-cards' },
  }, {
    URLSearchParams, AbortController,
    window: { setTimeout(callback) { timers.set(++timerId, callback); return timerId; }, clearTimeout(id) { timers.delete(id); } },
    sessionStorage: { getItem: () => 'fixed-session-seed' },
    fetch(url, options) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      requests.push({ url: new URL(url, 'https://fixture.invalid'), ...options, resolve, reject });
      return promise;
    },
  })(`src/components/public/${kind === 'nearby' ? 'Nearby' : 'Featured'}SalonPlacement.tsx`).default;
  const render = () => { cursor = 0; return Component(props); };
  const nodes = () => {
    const result = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      result.push(node); visit(node.props?.children);
    }
    visit(render()); return result;
  };
  const text = () => {
    function visit(node) { return Array.isArray(node) ? node.map(visit).join(' ') : node && typeof node === 'object' ? visit(node.props?.children) : String(node ?? ''); }
    return visit(render());
  };
  const commit = () => { for (const effect of effects.splice(0)) effect(); };
  const start = () => { commit(); const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); };
  return {
    requests, render, nodes, text, commit, start,
    setLocation(next) { location = { ...location, ...next }; },
    setProps(next) { Object.assign(props, next); },
    cards() { return nodes().filter(node => node.type === 'salon-card').map(node => node.props.salon.id); },
    pending() { return nodes().some(node => node.type === 'loading-cards'); },
    button(label) { const found = nodes().find(node => node.type === 'button' && String(node.props.children).includes(label)); assert.ok(found, label); return found; },
    async respond(index, body, status = 200) { requests[index].resolve(Response.json(body, { status })); await drainMicrotasks(); },
    async reject(index) { requests[index].reject(new Error('Old area transport failed')); await drainMicrotasks(); },
  };
}

for (const kind of ['nearby', 'featured']) {
  test(`${kind}: valid initial location is pending before the scheduled request starts`, () => {
    const app = harness(kind);
    assert.equal(app.pending(), true, 'not-yet-read discovery must not assert an empty result');
    assert.equal(app.requests.length, 0);
    app.commit();
    assert.equal(app.pending(), true, 'passive effect has scheduled but not started transport');
    assert.equal(app.requests.length, 0);
    app.start();
    assert.equal(app.requests.length, 1);
    assert.equal(app.pending(), true);
  });

  test(`${kind}: location changes hide completed old rows and total before effects`, async () => {
    const app = harness(kind); app.render(); app.start();
    await app.respond(0, { salons: [salon('area-a')], total: 10 });
    assert.deepEqual(app.cards(), ['area-a']);
    app.setLocation({ location: area(41, 'Area B') });
    assert.deepEqual(app.cards(), []);
    assert.equal(app.pending(), true);
    assert.equal(app.text().includes('View all'), false);
    assert.equal(app.requests.length, 1, 'pending render precedes the next passive effect');
    app.start();
    assert.equal(app.requests[1].url.searchParams.get('lat'), '41');
    await app.respond(1, { salons: [salon('area-b')], total: 1 });
    assert.deepEqual(app.cards(), ['area-b']);
    assert.equal(app.pending(), false);
  });

  test(`${kind}: old completed empty and error states do not leak into an unread location`, async () => {
    const app = harness(kind); app.render(); app.start();
    await app.respond(0, { salons: [], total: 0, promo: { title: 'Area A empty promotion', body: 'Only A', href: '/partner' } });
    assert.equal(app.pending(), false);
    assert.match(app.text(), kind === 'nearby' ? /No salons are nearby yet/ : /Area A empty promotion/);
    app.setLocation({ location: area(41) });
    assert.equal(app.pending(), true);
    assert.doesNotMatch(app.text(), /No salons are nearby yet|Area A empty promotion/);
    app.start();
    await app.respond(1, { error: 'Area B unavailable. Reference PUBLIC-B.' }, 503);
    assert.match(app.text(), /Area B unavailable/);
    app.setLocation({ location: area(42) });
    assert.equal(app.pending(), true);
    assert.doesNotMatch(app.text(), /Area B unavailable/);
  });

  for (const outcome of ['success', 'failure']) {
    test(`${kind}: obsolete ${outcome} cannot settle the replacement request`, async () => {
      const app = harness(kind); app.render(); app.start();
      app.setLocation({ location: area(41) }); app.render(); app.start();
      assert.equal(app.requests[0].signal.aborted, true);
      if (outcome === 'success') await app.respond(0, { salons: [salon('obsolete')], total: 99 });
      else await app.reject(0);
      assert.equal(app.pending(), true, 'old success/catch/finally cannot clear new pending state');
      assert.deepEqual(app.cards(), []);
      assert.doesNotMatch(app.text(), /Old area transport failed/);
      await app.respond(1, { salons: [salon('current')], total: 1 });
      assert.deepEqual(app.cards(), ['current']);
      assert.equal(app.pending(), false);
    });
  }

  test(`${kind}: actual failure retains retry and only a successful empty response shows empty`, async () => {
    const app = harness(kind); app.render(); app.start();
    await app.respond(0, { error: 'Unavailable. Reference PUBLIC-FAIL.' }, 503);
    assert.equal(app.pending(), false);
    assert.match(app.text(), /PUBLIC-FAIL/);
    void app.button('Try again').props.onClick();
    assert.equal(app.pending(), true);
    assert.doesNotMatch(app.text(), /PUBLIC-FAIL/);
    assert.equal(app.requests.length, 2);
    await app.respond(1, { salons: [], total: 0 });
    assert.equal(app.pending(), false);
    assert.match(app.text(), kind === 'nearby' ? /No salons are nearby yet/ : /Own a business/);
  });

  test(`${kind}: unresolved or missing location does not query and label-only changes keep matching results`, async () => {
    const app = harness(kind); app.setLocation({ ready: false, location: null }); app.render(); app.start();
    assert.equal(app.pending(), true); assert.equal(app.requests.length, 0);
    app.setLocation({ ready: true }); app.render(); app.start();
    assert.equal(app.pending(), false); assert.equal(app.requests.length, 0);
    assert.match(app.text(), /Choose a (?:city|search location)/);
    app.setLocation({ location: area() }); app.render(); app.start();
    await app.respond(0, { salons: [salon('same-area')], total: 1 });
    app.setLocation({ location: area(40.71, 'Renamed place') }); app.render(); app.start();
    assert.deepEqual(app.cards(), ['same-area']); assert.equal(app.requests.length, 1);
    app.setLocation({ radiusMiles: 50 });
    assert.equal(app.pending(), true); assert.deepEqual(app.cards(), []);
    app.start(); assert.equal(app.requests[1].url.searchParams.get('radius'), '50');
    app.setLocation({ location: area(Number.NaN) }); app.render(); app.start();
    assert.equal(app.pending(), false); assert.equal(app.requests.length, 2);
    assert.match(app.text(), /Choose a (?:city|search location)/);
  });

  test(`${kind}: effective limits define the query and clamped equivalent limits do not refetch`, async () => {
    const app = harness(kind, { maxCards: 6 }); app.render(); app.start();
    await app.respond(0, { salons: [salon('six-card-query')], total: 1 });
    app.setProps({ maxCards: 25 });
    assert.equal(app.pending(), true); assert.deepEqual(app.cards(), []);
    app.start(); assert.equal(app.requests[1].url.searchParams.get('limit'), '24');
    await app.respond(1, { salons: [salon('bounded-query')], total: 1 });
    app.setProps({ maxCards: 26 }); app.render(); app.start();
    assert.deepEqual(app.cards(), ['bounded-query']); assert.equal(app.requests.length, 2);
    if (kind === 'featured') {
      app.setProps({ viewAll: true });
      assert.equal(app.pending(), true); assert.deepEqual(app.cards(), []);
      app.start(); assert.equal(app.requests.length, 3);
    }
  });
}

test('featured append preserves current cards, deduplicates IDs and uses the same session seed', async () => {
  const app = harness('featured', { viewAll: true }); app.render(); app.start();
  await app.respond(0, { salons: [salon('first')], total: 3 });
  void app.button('Load more featured salons').props.onClick();
  assert.deepEqual(app.cards(), ['first']);
  assert.equal(app.requests[1].url.searchParams.get('offset'), '1');
  assert.equal(app.requests[1].url.searchParams.get('seed'), app.requests[0].url.searchParams.get('seed'));
  await app.respond(1, { salons: [salon('first'), salon('second')], total: 2 });
  assert.deepEqual(app.cards(), ['first', 'second']);
  assert.doesNotMatch(app.text(), /Load more featured salons/);
});

test('featured late append cannot merge old rows or settle another area request', async () => {
  const app = harness('featured', { viewAll: true }); app.render(); app.start();
  await app.respond(0, { salons: [salon('area-a')], total: 3 });
  void app.button('Load more featured salons').props.onClick();
  app.setLocation({ location: area(41) }); app.render(); app.start();
  await app.respond(1, { salons: [salon('old-append')], total: 3 });
  assert.equal(app.pending(), true);
  assert.deepEqual(app.cards(), []);
  await app.respond(2, { salons: [salon('area-b')], total: 1 });
  assert.deepEqual(app.cards(), ['area-b']);
});
