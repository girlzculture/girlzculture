import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

for (const locale of ['en', 'fr', 'es', 'zh-CN']) for (const answerOnly of [false, true]) {
  test(`literal null in ${locale} ${answerOnly ? 'answer' : 'planning'} produces bounded recovery, not visible null`, async () => {
    const incidents = [], executions = [], plans = [];
    const id = '33000000-0000-4000-8000-000000000001';
    const context = { admin: {}, user: { id: 'owner', user_metadata: { gc_assistant_locale: locale } }, salon: { id: 'business', time_zone: 'America/New_York' } };
    let parse;
    const load = typescriptLoader(process.cwd(), {
      '@/lib/supabaseAdmin': { requireSalonOwner: async () => context },
      '@/lib/requestSecurity': { enforceRateLimit() {}, RateLimitError: class extends Error {} },
      '@/lib/gcAssistantPlanningServer': { planOwnerRequest: async input => {
        plans.push(input);
        if (answerOnly && !input.answerOnly) return { response_locale: locale, plan: { tool: 'get_business_media', args: {} } };
        return parse(JSON.stringify(input.answerOnly ? { reply: 'null' } : { language_switch: null, decision: { clarification: 'null' } }), new Set(['photos']), Boolean(input.answerOnly));
      } },
      '@/lib/gcAssistantServer': { executeAssistantTool: async (_context, input) => {
        executions.push(input);
        return { request: { id }, assistant_message: `Authorized ${locale} gallery count: 8` };
      } },
      '@/lib/operationalMonitoring': { withOperationalMonitoring: (_profile, handler) => handler, routeMonitoringProfile() {} },
      '@/lib/platformErrors': { capturePlatformError: async input => { incidents.push(input); return id; } },
    });
    parse = load('src/lib/gcAssistantPlannerProtocol.ts').parseOwnerPlannerResponse;
    const response = await load('src/app/api/salon/assistant/route.ts').POST(new Request('http://localhost/api/salon/assistant', {
      method: 'POST', body: JSON.stringify({ action: 'plan', request_id: id, locale, text: 'How many photos?', previous_request_ids: [] }),
    }));
    const body = await response.json();
    assert.equal(response.status, answerOnly ? 200 : 502);
    assert.equal(executions.length, answerOnly ? 1 : 0);
    assert.equal(plans.length, answerOnly ? 2 : 1, 'No automatic retry');
    assert.equal(incidents.length, 1);
    if (answerOnly) {
      assert.equal(body.assistant_message, `Authorized ${locale} gallery count: 8`);
      assert.equal(body.response_locale, locale);
    } else {
      assert.equal(body.code, 'ASSISTANT_INVALID_PLAN');
      assert.equal(body.request_id, id);
      assert.equal(body.reply, undefined);
      assert.equal(body.clarification, undefined);
    }
  });
}

for (const locale of ['wo', 'en', 'fr', 'es', 'zh-CN']) {
  for (const fallback of [false, true]) {
    test(`resolved ${locale} reaches tool, answer and ${fallback ? 'fallback' : 'response'} without replaying older private facts`, async () => {
      const plans = [], tools = [], incidents = [], preferences = [];
      const id = '33000000-0000-4000-8000-000000000001';
      const context = { admin: {auth:{admin:{updateUserById:async(user,body)=>{preferences.push({user,body});return {error:null};}}}}, user: { id: 'owner' }, salon: { id: 'business', time_zone: 'America/New_York' } };
      const load = typescriptLoader(process.cwd(), {
        '@/lib/supabaseAdmin': { requireSalonOwner: async () => context },
        '@/lib/requestSecurity': { enforceRateLimit() {}, RateLimitError: class extends Error {} },
        '@/lib/gcAssistantPlanningServer': { planOwnerRequest: async input => {
          plans.push(input);
          if (!input.answerOnly) return { response_locale: locale, plan: { tool: 'get_services_and_prices', args: { query: 'Silk Press' } } };
          if (fallback) throw new Error('Fixture provider failure');
          return { reply: `Generated ${locale} reply: Silk Press 120 USD` };
        } },
        '@/lib/gcAssistantServer': { executeAssistantTool: async (_context, input) => {
          tools.push(input);
          return { request: { id }, assistant_message: `Template ${input.locale}: Silk Press 120 USD` };
        } },
        '@/lib/operationalMonitoring': { withOperationalMonitoring: (_profile, handler) => handler, routeMonitoringProfile() {} },
        '@/lib/platformErrors': { capturePlatformError: async input => { incidents.push(input); return id; } },
      });
      const response = await load('src/app/api/salon/assistant/route.ts').POST(new Request('http://localhost/api/salon/assistant', {
        method: 'POST', body: JSON.stringify({ action: 'plan', request_id: id, locale: locale === 'en' ? 'wo' : 'en', text: `Reply in ${locale}. How much is Silk Press?`, previous_request_ids: [], conversation: [{ role: 'user', text: 'Earlier private prose' }] }),
      }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(tools[0].locale, locale);
      assert.equal(preferences.length,locale === "wo" ? 0 : 1);
      if(preferences.length){assert.equal(preferences[0].user,"owner");assert.equal(preferences[0].body.user_metadata.gc_assistant_locale,locale);}
      assert.equal(plans[1].locale, locale);
      assert.deepEqual(Array.from(plans[1].previousRequestIds), [id]);
      assert.equal(plans[1].conversation, undefined);
      assert.equal(body.response_locale, locale);
      assert.equal(body.assistant_message, fallback ? `Template ${locale}: Silk Press 120 USD` : `Generated ${locale} reply: Silk Press 120 USD`);
      assert.equal(incidents.length, fallback ? 1 : 0);
    });
  }
}
