import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20260914225409_ai_assistant_pilot_budget.sql',
  'utf8',
);
const concierge = fs.readFileSync('src/lib/beautyConciergeServer.ts', 'utf8');
const ownerPlanner = fs.readFileSync('src/lib/gcAssistantPlanningServer.ts', 'utf8');
const environment = fs.readFileSync('.env.example', 'utf8');
const netlify = fs.readFileSync('netlify.toml', 'utf8');

test('the founder-approved $50 allowance is split into isolated $25 feature caps', () => {
  assert.match(migration, /feature_key in \('beauty_concierge', 'gc_owner_assistant'\)/);
  assert.match(migration, /monthly_budget_cents = 2500/);
  assert.match(migration, /when feature_key = 'beauty_concierge' then 500/);
  assert.match(migration, /else 25/);
  assert.match(migration, /AI_PILOT_FEATURE_INVENTORY_INCOMPLETE/);
});

test('both assistants use the approved model and retain safety controls', () => {
  assert.match(migration, /is_enabled = true/);
  assert.match(migration, /provider_key = 'openai'/);
  assert.match(migration, /model_key = 'gpt-5\.4-nano'/);
  assert.match(migration, /when feature_key = 'gc_owner_assistant' then true/);
  assert.match(migration, /fallback_behavior = 'deterministic'/);
  assert.match(migration, /moderation_required = true/);
  assert.match(migration, /setting_key = 'ai\.emergency_kill_switch'/);
  assert.match(migration, /published_value = 'false'::jsonb/);
});

test('budget is reserved atomically before either provider request', () => {
  assert.match(migration, /'beauty_concierge', 'gc_owner_assistant', 'translation_drafts'/);
  assert.match(migration, /where feature_key = p_feature\s+for update/);
  assert.match(migration, /used \+ p_cost_cents > f\.monthly_budget_cents/);
  assert.match(migration, /daily >= f\.daily_request_limit/);
  assert.match(migration, /to service_role/);

  const conciergeReservation = concierge.indexOf('admin.rpc("reserve_governed_ai_usage"');
  const conciergeProvider = concierge.indexOf('await openAiIntent(', conciergeReservation);
  assert.ok(conciergeReservation > -1 && conciergeProvider > conciergeReservation);

  const ownerReservation = ownerPlanner.indexOf('admin.rpc("reserve_gc_assistant_usage"');
  const ownerProvider = ownerPlanner.indexOf('fetch(openAiApiUrl("chat/completions")', ownerReservation);
  assert.ok(ownerReservation > -1 && ownerProvider > ownerReservation);
});

test('the budget ledger uses the selected model rates for both assistants', () => {
  for (const expected of [
    'OPENAI_CONCIERGE_INPUT_USD_PER_MILLION=0.20',
    'OPENAI_CONCIERGE_OUTPUT_USD_PER_MILLION=1.25',
    'AI_OWNER_INPUT_USD_PER_MILLION=0.20',
    'AI_OWNER_OUTPUT_USD_PER_MILLION=1.25',
  ]) assert.ok(environment.includes(expected), expected);

  assert.match(netlify, /\[context\.production\.environment\]/);
  assert.match(netlify, /AI_APPROVED_PROVIDERS = "openai"/);
  assert.match(netlify, /AI_APPROVED_MODELS = "\{\\"openai\\":\[\\"gpt-5\.4-nano\\"\]\}"/);
  assert.match(netlify, /AI_OWNER_OUTPUT_USD_PER_MILLION = "1\.25"/);
  assert.doesNotMatch(netlify, /^\s*OPENAI_API_KEY\s*=/m);
});
