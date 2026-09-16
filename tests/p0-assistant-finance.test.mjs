import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load = () => typescriptLoader(process.cwd())('src/lib/assistantFinance.ts');
const paid = { booking_origin: 'marketplace', payment_mode: 'live', payment_verified_at: '2030-09-24T10:00:00Z', stripe_charge_id: 'ch_fixture', deposit_status: 'Paid', deposit_amount: 20, stripe_processing_fee: 1, platform_fee: 2, net_amount_owed_salon: 17 };

test('finance evidence keeps live, test and unknown modes separate and never treats transfer as bank settlement', () => {
  const result = load().assistantFinanceEvidence([
    { ...paid, stripe_transfer_id: 'tr_fixture', transfer_status: 'Transferred to salon', bank_payout_status: 'Managed by salon Stripe payout schedule', guest_name: 'Private person' },
    { ...paid, payment_mode: 'test', deposit_amount: 900 },
    { ...paid, payment_mode: null, deposit_amount: 1000 },
    { ...paid, booking_origin: 'business_added', deposit_amount: 800 },
  ]);
  assert.equal(result.live.recorded_verified_deposits, 20);
  assert.equal(result.test.recorded_verified_deposits, 900);
  assert.equal(result.unknown.recorded_verified_deposits, 1000);
  assert.equal(result.live.processing_fees, 1);
  assert.equal(result.live.platform_fees, 2);
  assert.equal(result.live.recorded_net_owed, 17);
  assert.equal(result.live.confirmed_connect_transfers, 1);
  assert.equal(result.live.bank_settled_amount, null);
  assert.equal(result.live.net_revenue, null);
  assert.equal(JSON.stringify(result).includes('Private person'), false);
  assert.equal(JSON.stringify(result).includes('ch_fixture'), false);
});

test('missing monetary fields remain unknown and unverified deposits are never counted as paid', () => {
  const result = load().assistantFinanceEvidence([
    { ...paid, stripe_processing_fee: null },
    { ...paid, deposit_status: 'Unpaid', deposit_amount: 999 },
    { ...paid, payment_verified_at: null, deposit_amount: 888 },
    { ...paid, stripe_charge_id: null, deposit_amount: 777 },
  ]).live;
  assert.equal(result.recorded_verified_deposits, 20);
  assert.equal(result.processing_fees, null);
  assert.equal(result.unverified_deposit_records, 3);
  assert.equal(load().assistantFinanceEvidence([]).live.recorded_verified_deposits, 0);
});

test('pending refunds are distinct from completed refunds and do not fabricate net revenue', () => {
  const result = load().assistantFinanceEvidence([
    { ...paid, refund_status: 'Succeeded', refund_completed_at: '2030-09-25T00:00:00Z', stripe_refund_id: 're_fixture', refund_amount: 20 },
    { ...paid, refund_status: 'Pending', refund_amount: 10 },
    { ...paid, refund_status: 'Succeeded', refund_completed_at: null, refund_amount: 50 },
  ]).live;
  assert.equal(result.completed_refunds, 20);
  assert.equal(result.pending_refund_records, 1);
  assert.equal(result.unverified_refund_records, 1);
  assert.equal(result.net_revenue, null);
});
