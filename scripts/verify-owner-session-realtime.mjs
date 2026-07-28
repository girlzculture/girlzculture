import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import {
  ownerFallbackDelay,
  subscribeToOwnerUpdates,
} from "../src/lib/ownerRealtime.ts";
import { shouldPreserveSupabaseAuthResponse } from "../src/lib/supabaseFetchPolicy.ts";

class FakeChannel {
  constructor(name) {
    this.name = name;
    this.handlers = [];
    this.statusCallback = null;
    this.subscribedAfterHandlers = false;
  }

  on(type, filter, callback) {
    this.handlers.push({ type, filter, callback });
    return this;
  }

  subscribe(callback) {
    this.subscribedAfterHandlers = this.handlers.length === 2;
    this.statusCallback = callback;
    return this;
  }

  status(value) {
    this.statusCallback?.(value);
  }
}

class FakeClient {
  constructor() {
    this.channels = [];
    this.removed = [];
    this.auth = {
      signOut() {
        throw new Error("Realtime recovery must never sign out the user.");
      },
    };
  }

  channel(name) {
    const channel = new FakeChannel(name);
    this.channels.push(channel);
    return channel;
  }

  async removeChannel(channel) {
    this.removed.push(channel);
  }
}

const client = new FakeClient();
const states = [];
let fallbackRefreshes = 0;
const cleanup = subscribeToOwnerUpdates({
  client,
  salonId: "4f879f80-3d68-4da2-8d31-b99bcfeea515",
  onNotification() {},
  onBooking() {},
  onConnectionState(state, status) {
    states.push([state, status || ""]);
  },
  onFallbackRefresh() {
    fallbackRefreshes += 1;
  },
  retryDelaysMs: [5],
  pollingIntervalMs: 10,
});

assert.equal(client.channels.length, 1);
assert.equal(client.channels[0].subscribedAfterHandlers, true);
client.channels[0].status("CHANNEL_ERROR");
await wait(30);
assert.ok(fallbackRefreshes >= 1, "Polling fallback did not refresh the workspace.");
assert.ok(client.channels.length >= 2, "Realtime did not reconnect after a channel error.");
const reconnected = client.channels.at(-1);
assert.equal(reconnected.subscribedAfterHandlers, true);
reconnected.status("SUBSCRIBED");
await wait(20);
assert.deepEqual(states.at(-1), ["connected", "SUBSCRIBED"]);
const refreshesAfterReconnect = fallbackRefreshes;
await wait(40);
assert.equal(
  fallbackRefreshes,
  refreshesAfterReconnect,
  "Polling continued after realtime recovered.",
);
await cleanup();
reconnected.status("CHANNEL_ERROR");
await wait(20);
assert.equal(
  client.channels.at(-1),
  reconnected,
  "Cleanup allowed another reconnect.",
);

assert.equal(ownerFallbackDelay(30_000, 0), 30_000);
assert.equal(ownerFallbackDelay(30_000, 1), 60_000);
assert.equal(ownerFallbackDelay(30_000, 8), 300_000);

const terminalClient = new FakeClient();
let terminalFallbacks = 0;
const cleanupTerminal = subscribeToOwnerUpdates({
  client: terminalClient,
  salonId: "aaaaaaaa-3d68-4da2-8d31-b99bcfeea515",
  onNotification() {},
  onBooking() {},
  onFallbackRefresh() {
    terminalFallbacks += 1;
    return "terminal";
  },
  retryDelaysMs: [5],
  pollingIntervalMs: 10,
});
terminalClient.channels[0].status("CHANNEL_ERROR");
await wait(30);
assert.equal(terminalFallbacks, 1);
assert.equal(
  terminalClient.channels.length,
  1,
  "A terminal session failure allowed realtime to reconnect.",
);
await cleanupTerminal();

assert.equal(
  shouldPreserveSupabaseAuthResponse(
    "https://example.supabase.co/auth/v1/token?grant_type=refresh_token",
  ),
  true,
);
assert.equal(
  shouldPreserveSupabaseAuthResponse(
    "https://example.supabase.co/rest/v1/bookings",
  ),
  false,
);

console.log(
  "Owner session/realtime verification passed: callbacks precede subscribe; reconnect and polling fallback recover; transient polling uses capped backoff; terminal auth stops polling/reconnect; cleanup stops work; and Auth responses stay unchanged.",
);
