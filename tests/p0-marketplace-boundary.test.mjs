import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
function loadModule(file, dependencies, env = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, require: dependencies, Response, Request, URL, Set, process: { env } });
  return exports;
}

for (const path of ['booking-checkout', 'commerce-checkout', 'pickup-reservation']) {
  test(`${path} fails closed before database access or Stripe session creation`, async () => {
    let providerCalls = 0;
    const failProvider = () => { providerCalls++; throw new Error('A disabled marketplace reached a provider'); };
    const route = loadModule(`src/app/api/stripe/${path}/route.ts`, (name) => {
      if (name === '@/lib/marketplaceLaunchCore' && existsSync(new URL('src/lib/marketplaceLaunchCore.ts', root))) {
        return loadModule('src/lib/marketplaceLaunchCore.ts', () => { throw new Error('Launch guard must have no provider dependency'); });
      }
      if (name === '@/lib/operationalMonitoring') return {
        withOperationalMonitoring: (_profile, handler) => handler,
        routeMonitoringProfile: () => ({}), noteOperationalFailure() {},
      };
      return new Proxy({}, { get: () => failProvider });
    });
    const result = await route.POST(new Request(`https://girlzculture.test/api/stripe/${path}`, {
      method: 'POST', body: JSON.stringify({ salon_id: 'demo-business', style_id: 'demo-style' }),
    }));
    assert.equal(result.status, 503);
    assert.equal((await result.json()).code, 'CUSTOMER_MARKETPLACE_NOT_LIVE');
    assert.equal(providerCalls, 0, 'Neither Supabase nor Stripe should be contacted');
  });
}
