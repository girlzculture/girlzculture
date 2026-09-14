import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { typescriptLoader } from './helpers/load-typescript.mjs';

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function assistantHarness() {
  const slots = []; let cursor = 0; let initialized = false; let changeAuth;
  let session = { user: { id: 'owner-a' }, access_token: 'local-a' };
  const responses = []; const requests = []; const events = [];
  let sessionWait = null;
  const react = {
    createContext: () => ({ Provider: 'context-provider' }),
    useRef: value => { const index = cursor++; return slots[index] ??= { current: value }; },
    useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useEffect: effect => { if (!initialized) effect(); },
  };
  const Component = typescriptLoader(process.cwd(), {
    react, 'next/link': { default: 'a' }, 'lucide-react': { Sparkles: 'i', X: 'i' },
    '@/components/i18n/LocaleProvider': { useI18n: () => ({ locale: 'fr', translateSource: text => text }) },
    '@/lib/supabase': {
      getSessionForScope: async () => sessionWait ? sessionWait.promise : session,
      getSupabaseForScope: () => ({ auth: { onAuthStateChange: callback => { changeAuth = callback; return { data: { subscription: { unsubscribe() {} } } }; } } }),
    },
  }, { crypto: { randomUUID }, window: { dispatchEvent: event => events.push(event.type) }, Event,
    fetch: async (_url, options) => { requests.push(options); const response = deferred(); responses.push(response); return response.promise; },
  })('src/components/owner/GcAssistant.tsx').default;
  function render() { cursor = 0; const tree = Component(); initialized = true; return tree; }
  function find(predicate, tree = render()) {
    if (!tree || typeof tree !== 'object') return null;
    if (Array.isArray(tree)) return tree.map(child => find(predicate, child ?? null)).find(Boolean);
    if (predicate(tree)) return tree;
    return tree.props?.children === undefined ? null : find(predicate, tree.props.children);
  }
  render(); changeAuth('SIGNED_IN', session);
  return {
    requests, responses, events, render, find,
    switchActor: id => { session = id ? { user: { id }, access_token: `local-${id}` } : null; changeAuth(id ? 'SIGNED_IN' : 'SIGNED_OUT', session); },
    holdSession: () => sessionWait = deferred(),
    quickRead: () => find(node => node.type === 'button' && node.props.children === 'My business profile').props.onClick(),
    articles: () => { const tree = render(); const found = []; const walk = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk); if (node.type === 'article') found.push(node); walk(node.props?.children); }; walk(tree); return found; },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a delayed Assistant response cannot reveal the previous account after an identity change', async () => {
  const app = assistantHarness(); app.quickRead(); await tick();
  assert.equal(app.requests.length, 1);
  app.switchActor('owner-b');
  app.responses[0].resolve(Response.json({ request: { id: 'old-private', risk_class: 1, result: { description: 'PRIVATE A' } } }));
  await tick();
  assert.equal(app.articles().length, 0, 'old account result must not return to the cleared conversation');
});

test('a request awaiting its session cannot execute using the next account credentials', async () => {
  const app = assistantHarness(); const session = app.holdSession(); app.quickRead();
  app.switchActor('owner-b'); session.resolve({ user: { id: 'owner-b' }, access_token: 'local-b' }); await tick();
  assert.equal(app.requests.length, 0, 'an old request must not execute as the new account');
});

test('an old response must not clear the next account busy state', async () => {
  const app = assistantHarness(); app.quickRead(); await tick(); app.switchActor('owner-b'); app.quickRead(); await tick();
  assert.equal(app.requests.length, 2, 'new actor must be able to start independently');
  app.responses[0].resolve(Response.json({ clarification: 'PRIVATE A' })); await tick();
  assert.equal(app.find(node => node.type === 'button' && node.props.children === 'My business profile').props.disabled, true);
  app.responses[1].resolve(Response.json({ clarification: 'Current response' })); await tick();
  assert.equal(app.articles().length, 1);
});
