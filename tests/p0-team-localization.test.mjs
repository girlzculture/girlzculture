import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const load = typescriptLoader(process.cwd());
const { DASHBOARD_SOURCE_MESSAGES } = load('src/i18n/dashboard-source-catalog.ts');
const copy = ['Authorized Users', 'Open one member to manage details and permissions in a focused workspace.', 'Add User', 'No additional users have been added.'];

function harness(scope, locale) {
  const state = []; let cursor = 0; const callbacks = []; const effects = []; const timers = []; const requests = [];
  let resolveResponse;
  const response = new Promise(resolve => { resolveResponse = resolve; });
  const Component = typescriptLoader(process.cwd(), {
    react: {
      useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
      useCallback(fn) { return callbacks[cursor++] ??= fn; },
      useEffect(fn) { const i = cursor++; if (!(i in state)) { state[i] = true; effects.push(fn); } },
    },
    'next/link': { default: 'a' }, 'next/navigation': { useRouter: () => ({}) },
    'lucide-react': Object.fromEntries(['MailPlus', 'RefreshCw', 'ShieldCheck', 'ShieldOff', 'Trash2', 'UserPlus'].map(name => [name, 'i'])),
    '@/components/i18n/LocaleProvider': { useI18n: () => ({ translateSource: source => DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source }) },
    '@/lib/supabase': { getSessionForScope: async () => ({ access_token: 'fixture-only' }) },
  }, {
    window: { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} },
    fetch: async (url, init) => { requests.push({ url, ...init }); return response; },
  })('src/components/auth/TeamUserManager.tsx').default;
  function render() { cursor = 0; return Component({ scope }); }
  function texts(node) {
    if (typeof node === 'string') return [node];
    if (Array.isArray(node)) return node.flatMap(texts);
    return node?.props ? texts(node.props.children) : [];
  }
  const initial = render(); effects.splice(0).forEach(fn => fn()); timers.splice(0).forEach(fn => fn());
  return { initial, texts, render, requests, resolveResponse };
}

for (const locale of ['en', 'fr', 'es', 'wo', 'zh-CN']) {
  test(`delayed owner team response renders ${locale} immediately without a DOM translation observer`, async () => {
    const app = harness('salon', locale);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].url, '/api/salon/team');
    // Deliberately return after the initial render/localization opportunity.
    app.resolveResponse(Response.json({ users: [], stylists: [], can_manage: true }));
    await new Promise(resolve => setImmediate(resolve));
    const visible = app.texts(app.render());
    for (const source of copy) assert.ok(visible.includes(DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source), source);
    if (locale !== 'en') for (const source of copy) assert.equal(visible.includes(source), false, source);
    assert.equal(app.requests.length, 1, 'Rendering copy must not introduce a data write or second fetch');
  });
}

test('owner localization correction leaves the Admin team render unchanged', async () => {
  const app = harness('admin', 'wo');
  app.resolveResponse(Response.json({ users: [], stylists: [], can_manage: true }));
  await new Promise(resolve => setImmediate(resolve));
  for (const source of copy) assert.ok(app.texts(app.render()).includes(source));
  assert.equal(app.requests[0].url, '/api/admin/team');
});
