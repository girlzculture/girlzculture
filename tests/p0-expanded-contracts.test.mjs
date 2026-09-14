import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load = typescriptLoader(process.cwd());
const { validateTool, ASSISTANT_TOOLS } = load('src/lib/gcAssistantCore.ts');
const { POLICY_DEFAULTS, validateBusinessPolicy } = load('src/lib/businessPolicyCore.ts');

test('general calendar questions do not require a service identity', () => {
  const result = validateTool('get_availability', { style_id: null, stylist_id: null, date: '2026-09-24' });
  assert.equal(result.risk, 1);
});

test('owner operating capabilities have explicit permission and fixed argument schemas', () => {
  for (const name of ['get_customers', 'get_professionals', 'get_products', 'get_booking_messages', 'get_reviews', 'get_promotions', 'get_plan_status', 'get_profile_completion', 'get_earnings_summary', 'get_upcoming_appointments', 'get_calendar_gaps', 'prepare_manual_appointment', 'prepare_manual_reschedule', 'prepare_manual_cancellation', 'prepare_service_edit', 'prepare_professional_draft', 'prepare_product_draft', 'prepare_booking_note', 'prepare_promotion_draft']) {
    assert.ok(ASSISTANT_TOOLS[name], name);
    assert.ok(ASSISTANT_TOOLS[name].permission, name);
    assert.equal(ASSISTANT_TOOLS[name].schema.additionalProperties, false, name);
  }
});

test('business refund policy explicitly concerns money handled by the business', () => {
  const policy = validateBusinessPolicy({ ...POLICY_DEFAULTS, refund_satisfaction: 'case_by_case', refund_terms: 'Please contact our manager within seven days.' });
  assert.equal(policy.refund_satisfaction, 'case_by_case');
  assert.equal(policy.deposit_treatment, 'platform_rules');
  assert.throws(() => validateBusinessPolicy({ ...policy, deposit_treatment: 'business_only' }), /PLATFORM_POLICY_CONFLICT/);
});

test('business-hour previews reject off-grid time values before database confirmation',()=>{
  const hours=Object.fromEntries(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day=>[day,{closed:false,open:'09:00',close:'17:00'}]));
  assert.equal(validateTool('prepare_business_hours',{hours}).tool,'prepare_business_hours');
  hours.Monday.open='09:01';
  assert.throws(()=>validateTool('prepare_business_hours',{hours}),/ASSISTANT_INVALID_INPUT/);
  assert.throws(()=>validateTool('prepare_business_profile_update',{field:'hours',text:null,hours}),/ASSISTANT_INVALID_INPUT/);
});
