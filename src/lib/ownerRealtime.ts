import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type RealtimeRow = Record<string, unknown>;
export type OwnerRealtimeConnectionState =
  | "connecting"
  | "connected"
  | "degraded";

type OwnerRealtimeOptions = {
  client: SupabaseClient;
  salonId: string;
  onNotification: (row: RealtimeRow) => void;
  onBooking: (row: RealtimeRow) => void;
  onConnectionState?: (
    state: OwnerRealtimeConnectionState,
    status?: string,
  ) => void;
  onFallbackRefresh?: () => void | Promise<void>;
  retryDelaysMs?: number[];
  pollingIntervalMs?: number;
};

const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

export function subscribeToOwnerUpdates({
  client,
  salonId,
  onNotification,
  onBooking,
  onConnectionState,
  onFallbackRefresh,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  pollingIntervalMs = 30_000,
}: OwnerRealtimeOptions) {
  let channel: RealtimeChannel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  let retryAttempt = 0;
  let stopped = false;
  let connectionGeneration = 0;
  let degraded = false;

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };
  const stopPolling = () => {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = null;
  };
  const startPolling = () => {
    if (stopped || pollingTimer || !onFallbackRefresh) return;
    void onFallbackRefresh();
    pollingTimer = setInterval(() => {
      if (!stopped) void onFallbackRefresh();
    }, Math.max(1_000, pollingIntervalMs));
  };
  const removeCurrentChannel = async (expected: RealtimeChannel | null) => {
    if (!expected || channel !== expected) return;
    channel = null;
    try {
      await client.removeChannel(expected);
    } catch {
      // A disconnected transport may also reject channel removal. The local
      // reference is already cleared, so reconnect can continue safely.
    }
  };
  const scheduleReconnect = () => {
    if (stopped || retryTimer) return;
    const delay =
      retryDelaysMs[
        Math.min(retryAttempt, Math.max(0, retryDelaysMs.length - 1))
      ] ?? 30_000;
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!stopped) connect();
    }, Math.max(0, delay));
  };
  const handleDisconnect = (
    failedChannel: RealtimeChannel,
    generation: number,
    status: string,
  ) => {
    if (stopped || generation !== connectionGeneration) return;
    if (!degraded) {
      degraded = true;
      onConnectionState?.("degraded", status);
    }
    startPolling();
    void removeCurrentChannel(failedChannel).finally(scheduleReconnect);
  };
  const connect = () => {
    if (stopped) return;
    clearRetry();
    connectionGeneration += 1;
    const generation = connectionGeneration;
    const nextChannel = client.channel(
      `owner-live-${salonId}-${crypto.randomUUID()}`,
    );
    channel = nextChannel;
    onConnectionState?.("connecting");

    // Supabase requires every postgres_changes callback to be registered
    // before subscribe(). Keep subscribe as the final builder call.
    nextChannel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `salon_id=eq.${salonId}`,
      },
      (payload) => onNotification(payload.new as RealtimeRow),
    );
    nextChannel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "bookings",
        filter: `salon_id=eq.${salonId}`,
      },
      (payload) => onBooking(payload.new as RealtimeRow),
    );
    nextChannel.subscribe((status) => {
      if (stopped || generation !== connectionGeneration) return;
      if (status === "SUBSCRIBED") {
        retryAttempt = 0;
        degraded = false;
        stopPolling();
        onConnectionState?.("connected", status);
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        handleDisconnect(nextChannel, generation, status);
      }
    });
  };

  connect();

  return async () => {
    if (stopped) return;
    stopped = true;
    connectionGeneration += 1;
    clearRetry();
    stopPolling();
    const current = channel;
    channel = null;
    if (current) {
      try {
        await client.removeChannel(current);
      } catch {
        // Cleanup must remain idempotent even while the transport is offline.
      }
    }
  };
}
