import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

function harness() {
  const slots = [], responses = [], requests = []; let cursor = 0, mounted = false, onAuth;
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(effect) { if (!mounted) effect(); },
  };
  const Component = typescriptLoader(process.cwd(), {
    react, 'next/navigation': { useRouter: () => ({ push() {} }) }, 'next/link': { default: 'a' },
    'lucide-react': {}, '@/lib/location': { formatDistanceMiles: () => '1 mi' },
    '@/components/location/CustomerLocationProvider': { useCustomerLocation: () => ({ location: null }) },
    '@/components/site/SiteAccessProvider': { useSiteAccess: () => null },
    '@/components/site/SafeImage': { default: 'img' },
    '@/components/public/AssistantSupportHandoff': { __esModule: true, default: 'support-handoff' },
    '@/components/owner/AssistantDictation': { default: 'dictation' }, '@/components/owner/AssistantSpeech': { default: 'speech' },
    '@/components/i18n/LocaleProvider': { useI18n: () => ({ locale: 'fr' }) },
    '@/lib/supabase': { getSupabaseForScope: () => ({ auth: { onAuthStateChange(callback) { onAuth = callback; return { data: { subscription: { unsubscribe() {} } } }; } } }) },
  }, {
    fetch: (_url, options) => { requests.push(options); return new Promise(resolve => responses.push(resolve)); },
  })('src/components/public/BeautyConcierge.tsx').default;
  function render() { cursor = 0; const tree = Component(); mounted = true; return tree; }
  function find(predicate, node = render()) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) return node.map(child => find(predicate, child)).find(Boolean) || null;
    if (predicate(node)) return node;
    return node.props?.children ? find(predicate, node.props.children) : null;
  }
  render(); onAuth?.('INITIAL_SESSION', { user: { id: 'a' } });
  return { responses, requests, render, find,
    search() { find(node => node.type === 'textarea').props.onChange({ target: { value: 'My private preference' } }); return find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); },
    switchAccount() { onAuth?.('SIGNED_IN', { user: { id: 'b' } }); },
    clear() { find(node => node.type === 'button' && node.props.children === 'New conversation').props.onClick(); },
    conversation() { return find(node => node.props?.['aria-label'] === 'Assistant conversation'); },
  };
}

test('customer conversation and input clear on account changes', async () => {
  const app = harness(); const pending = app.search();
  app.responses[0](Response.json({ salons: [], mode: 'deterministic' })); await pending;
  assert.ok(app.conversation());
  const handoff = app.find(node => node.type === 'support-handoff');
  assert.equal(handoff.props.turns.length, 1);
  app.switchAccount();
  const nextHandoff = app.find(node => node.type === 'support-handoff');
  assert.notEqual(nextHandoff.key, handoff.key, 'account change must unmount private support drafts');
  assert.equal(nextHandoff.props.turns.length, 0);
  assert.equal(app.conversation(), null);
  assert.equal(app.find(node => node.type === 'textarea').props.value, '');
});

test('a late customer response cannot restore another account conversation or clear its busy state', async () => {
  const app = harness(); const previous = app.search(); app.switchAccount(); const current = app.search();
  assert.equal(app.requests.length, 2);
  app.responses[0](Response.json({ clarification: 'Previous account preference' })); await previous;
  assert.ok(app.conversation(), 'the current account message appears before the response');
  assert.doesNotMatch(JSON.stringify(app.conversation()), /Previous account preference/);
  assert.ok(app.find(node => node.props?.role === 'status'), 'the current account remains loading');
  assert.equal(app.find(node => node.type === 'button' && node.props.children === 'New conversation').props.disabled, true);
  app.responses[1](Response.json({ salons: [], mode: 'deterministic' })); await current;
  assert.ok(app.conversation());
});

test('public questions appear immediately and retry the captured request without duplicating the turn or clearing a later draft', async()=>{
 const app=harness();const pending=app.search();
 assert.match(JSON.stringify(app.conversation()),/My private preference/);
 assert.equal(app.find(node=>node.type==='textarea').props.value,'');
 assert.ok(app.find(node=>node.props?.role==='status'));
 app.find(node=>node.type==='textarea').props.onChange({target:{value:'Next unsent question'}});
 app.responses[0](Response.json({error:'Temporary search failure'},{status:503}));await pending;
 const retry=app.find(node=>node.type==='button'&&node.props.children==='Retry this question');assert.ok(retry);
 const retried=retry.props.onClick();assert.equal(app.requests.length,2);assert.equal(app.requests[1].body,app.requests[0].body);
 assert.equal(app.find(node=>node.type==='support-handoff').props.turns.length,1);
 app.responses[1](Response.json({salons:[],mode:'deterministic'}));
 await retried;
 assert.equal(app.find(node=>node.type==='textarea').props.value,'Next unsent question');
 assert.equal(app.find(node=>node.type==='support-handoff').props.turns.length,1);
});

test('a fresh customer conversation resets context and retains localized follow-up wording', async () => {
  const app = harness(); const pending = app.search();
  app.responses[0](Response.json({ salons: [], mode: 'deterministic', intent: { location: 'Harlem' } })); await pending;
  assert.match(JSON.stringify(app.conversation()), /Je n’ai pas trouvé/);
  app.clear(); assert.equal(app.conversation(), null);
  const next = app.search(); assert.equal(JSON.parse(app.requests[1].body).previous_intent, null);
  app.responses[1](Response.json({ salons: [] })); await next;
});
