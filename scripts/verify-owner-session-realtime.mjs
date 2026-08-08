import assert from "node:assert/strict";
import fs from "node:fs";
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
    this.subscribed = false;
  }

  on(type, filter, callback) {
    if (this.subscribed) {
      throw new Error("A postgres_changes listener was added after subscribe().");
    }
    this.handlers.push({ type, filter, callback });
    return this;
  }

  subscribe(callback) {
    this.subscribedAfterHandlers = this.handlers.length === 3;
    this.subscribed = true;
    this.statusCallback = callback;
    return this;
  }

  status(value) {
    this.statusCallback?.(value);
  }

  emit(table, event, payload = { new: { id: `${table}-${event}` } }) {
    for (const handler of this.handlers) {
      if (
        handler.filter.table === table &&
        handler.filter.event === event
      ) {
        handler.callback(payload);
      }
    }
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
let reviewRefreshes = 0;
const cleanup = subscribeToOwnerUpdates({
  client,
  salonId: "4f879f80-3d68-4da2-8d31-b99bcfeea515",
  onNotification() {},
  onBooking() {},
  onReviewStateChange() {
    reviewRefreshes += 1;
  },
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
assert.deepEqual(
  client.channels[0].handlers.map(({ filter }) => [
    filter.table,
    filter.event,
    filter.filter,
  ]),
  [
    ["notifications", "INSERT", "salon_id=eq.4f879f80-3d68-4da2-8d31-b99bcfeea515"],
    ["bookings", "INSERT", "salon_id=eq.4f879f80-3d68-4da2-8d31-b99bcfeea515"],
    ["salons", "UPDATE", "id=eq.4f879f80-3d68-4da2-8d31-b99bcfeea515"],
  ],
);
client.channels[0].emit("salons", "UPDATE");
assert.equal(reviewRefreshes, 1);
client.channels[0].status("CHANNEL_ERROR");
client.channels[0].emit("salons", "UPDATE");
assert.equal(
  reviewRefreshes,
  1,
  "A disconnected channel continued refreshing review state.",
);
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
reconnected.emit("salons", "UPDATE");
assert.equal(
  reviewRefreshes,
  1,
  "Cleanup left a review listener active.",
);
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
  onReviewStateChange() {},
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

const ownerDashboardSource = fs.readFileSync(
  "src/components/owner/OwnerDashboardApp.tsx",
  "utf8",
);
const liveRefreshSource = ownerDashboardSource.match(
  /const refreshLiveWorkspace = \(\) => \{[\s\S]*?removeRealtime = subscribeToOwnerUpdates/,
)?.[0] || "";
assert.ok(liveRefreshSource, "Owner live-workspace refresh wiring is missing.");
assert.match(liveRefreshSource, /if \(refreshed\.salon\) setSalon\(refreshed\.salon\)/);
assert.match(liveRefreshSource, /setReviews\(refreshedRecords\.reviews \|\| \[\]\)/);
assert.match(ownerDashboardSource, /onReviewStateChange: refreshLiveWorkspace/);
assert.match(ownerDashboardSource, /onFallbackRefresh: refreshLiveWorkspace/);

const reviewMigration = fs.readFileSync(
  "supabase/migrations/20260807220000_review_moderation_and_rating_sync.sql",
  "utf8",
);
assert.match(reviewMigration, /alter publication supabase_realtime drop table public\.reviews/);
assert.doesNotMatch(reviewMigration, /alter publication supabase_realtime add table public\.reviews/);
assert.match(reviewMigration, /alter publication supabase_realtime add table public\.salons/);

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
  "Owner session/realtime verification passed: booking, notification, and salon-summary callbacks precede subscribe; the private review table is not subscribed directly; salon summary changes refresh review state; reconnect and full-workspace polling fallback recover; terminal auth and cleanup stop all work; and Auth responses stay unchanged.",
);
