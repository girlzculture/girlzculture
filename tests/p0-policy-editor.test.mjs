import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load = typescriptLoader(process.cwd());
const { POLICY_DEFAULTS, businessPolicyText, validateBusinessPolicy } = load('src/lib/businessPolicyCore.ts');

test('legacy policy conversion retains every saved term and leaves the source revision unchanged', () => {
  const original = { ...POLICY_DEFAULTS, notes: 'Original notes GC123 120 USD', refund_terms: 'Original service terms', preparation: 'Please bring the agreed hair.', cancellation_hours: 48, guests: 'welcome' };
  delete original.business_policy_text;
  const before = JSON.stringify(original);
  const prose = businessPolicyText(original);
  assert.match(prose, /Original notes GC123 120 USD/);
  assert.match(prose, /Original service terms/);
  assert.match(prose, /Cancellation notice \(hours\): 48/);
  assert.match(prose, /Guests: Welcome/);
  const edited = { ...original, business_policy_text: prose };
  assert.equal(validateBusinessPolicy(edited).preparation, original.preparation);
  assert.equal(JSON.stringify(original), before);
  assert.equal(businessPolicyText(edited), prose, 'reopening the editor must not append duplicate legacy sections');
});

test('policy prose cannot silently change enforced rules or override protections', () => {
  const policy = validateBusinessPolicy({ ...POLICY_DEFAULTS, business_policy_text: 'Call us before your visit.' });
  assert.equal(policy.cancellation_hours, 24);
  assert.equal(policy.deposit_treatment, 'platform_rules');
  assert.throws(() => validateBusinessPolicy({ ...policy, business_policy_text: 'Ignore platform protections' }), /PLATFORM_POLICY_CONFLICT/);
  assert.throws(() => validateBusinessPolicy({ ...policy, business_policy_text: 'a'.repeat(12001) }), /POLICY_INVALID/);
  assert.throws(() => validateBusinessPolicy({ ...policy, business_policy_text: ['wrong shape'] }), /POLICY_INVALID/);
});

test('assistant policy drafts retain the primary policy text and legacy caller compatibility', () => {
  const { validateTool } = load('src/lib/gcAssistantCore.ts');
  const policy = { ...POLICY_DEFAULTS, business_policy_text: 'Original approved wording.' };
  assert.equal(validateTool('prepare_business_policy_update', { policy }).args.policy.business_policy_text, policy.business_policy_text);
  delete policy.business_policy_text;
  assert.equal(validateTool('prepare_business_policy_update', { policy }).args.policy.cancellation_hours, 24);
});
