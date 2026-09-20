import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const { authorizedMessageRecipients } = typescriptLoader(process.cwd())('src/lib/bookingMessageRecipientsServer.ts');
test('notification destinations exclude revoked and wrong-role identities and duplicate devices', async () => {
  const calls = [];
  const admin = { rpc: async (name, args) => {
    calls.push({ name, ...args });
    return { data: ['owner', 'permitted-team'].includes(args.p_user), error: null };
  } };
  const recipients = await authorizedMessageRecipients(admin, 'business-a', 'booking-a', ['owner', 'revoked-team', 'wrong-role', 'permitted-team', 'owner', '']);
  assert.equal(JSON.stringify(recipients), JSON.stringify(['owner', 'permitted-team']));
  assert.equal(calls.length, 4);
  for (const call of calls) { assert.equal(call.name, 'booking_message_business_recipient'); assert.equal(call.p_salon, 'business-a'); assert.equal(call.p_booking, 'booking-a'); }
});
test('recipient lookup errors stop delivery instead of retaining stale recipients', async () => {
  await assert.rejects(authorizedMessageRecipients({ rpc: async () => ({ error: new Error('local lookup failed') }) }, 'business-a', 'booking-a', ['owner']), /local lookup failed/);
});
