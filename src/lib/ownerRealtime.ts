import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type RealtimeRow = Record<string, unknown>;
export type OwnerFallbackOutcome = "ready" | "transient" | "terminal";
export type OwnerRealtimeConnectionState =
  | "connecting"
  | "connected"
  | "degraded";

type OwnerRealtimeOptions = {
  client: SupabaseClient;
  salonId: string;
  onNotification: (row: RealtimeRow) => void;
  onBooking: (row: RealtimeRow) => void;
  onReviewStateChange: () =>
    | void
    | OwnerFallbackOutcome
    | Promise<void | OwnerFallbackOutcome>;
  onConnectionState?: (
    state: OwnerRealtimeConnectionState,
    status?: string,
  ) => void;
  onFallbackRefresh?: () =>
    | void
    | OwnerFallbackOutcome
    | Promise<void | OwnerFallbackOutcome>;
  retryDelaysMs?: number[];
  pollingIntervalMs?: number;
};

const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

function dispatchOwnerEvent(name: string, detail: RealtimeRow) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function ownerFallbackDelay(
  pollingIntervalMs: number,
  attempt: number,
) {
  const base = Math.max(1_000, pollingIntervalMs);
  return Math.min(
    5 * 60_000,
    base * 2 ** Math.min(Math.max(0, attempt), 6),
  );
}

export function subscribeToOwnerUpdates({
  client,
  salonId,
  onNotification,
  onBooking,
  onReviewStateChange,
  onConnectionState,
  onFallbackRefresh,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  pollingIntervalMs = 30_000,
}: OwnerRealtimeOptions) {
  let channel: RealtimeChannel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pollingTimer: ReturnType<typeof setTimeout> | null = null;
  let healthyPollTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;
  let pollingAttempt = 0;
  let stopped = false;
  let terminalAuthFailure = false;
  let connectionGeneration = 0;
  let degraded = false;

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };
  const stopPolling = () => {
    if (pollingTimer) clearTimeout(pollingTimer);
    pollingTimer = null;
    pollingAttempt = 0;
  };
  const stopHealthyPolling = () => {
    if (healthyPollTimer) clearTimeout(healthyPollTimer);
    healthyPollTimer = null;
  };
  const scheduleHealthyPoll = () => {
    stopHealthyPolling();
    if (stopped || terminalAuthFailure || !onFallbackRefresh) return;
    healthyPollTimer = setTimeout(() => {
      healthyPollTimer = null;
      if (stopped || terminalAuthFailure) return;
      void Promise.resolve(onFallbackRefresh())
        .catch(() => undefined)
        .finally(scheduleHealthyPoll);
    }, Math.max(15_000, pollingIntervalMs));
  };
  const schedulePolling = (delay: number) => {
    if (
      stopped ||
      terminalAuthFailure ||
      pollingTimer ||
      !onFallbackRefresh
    ) {
      return;
    }
    pollingTimer = setTimeout(() => {
      pollingTimer = null;
      if (stopped || terminalAuthFailure) return;
      void Promise.resolve(onFallbackRefresh())
        .then((outcome) => {
          if (stopped) return;
          if (outcome === "terminal") {
            terminalAuthFailure = true;
            clearRetry();
            stopPolling();
            stopHealthyPolling();
            const current = channel;
            if (current) void removeCurrentChannel(current);
            return;
          }
          if (outcome === "transient") {
            pollingAttempt += 1;
          } else {
            pollingAttempt = 0;
          }
          const next =
            outcome === "transient"
              ? ownerFallbackDelay(pollingIntervalMs, pollingAttempt)
              : ownerFallbackDelay(pollingIntervalMs, 0);
          schedulePolling(next);
        })
        .catch(() => {
          if (stopped || terminalAuthFailure) return;
          pollingAttempt += 1;
          schedulePolling(ownerFallbackDelay(pollingIntervalMs, pollingAttempt));
        });
    }, Math.max(0, delay));
  };
  const startPolling = () => schedulePolling(0);
  const removeCurrentChannel = async (expected: RealtimeChannel | null) => {
    if (!expected || channel !== expected) return;
    channel = null;
    try {
      await client.removeChannel(expected);
    } catch {
      // A disconnected transport may also reject channel removal.
    }
  };
  const scheduleReconnect = () => {
    if (stopped || terminalAuthFailure || retryTimer) return;
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
    stopHealthyPolling();
    startPolling();
    void removeCurrentChannel(failedChannel).finally(scheduleReconnect);
  };
  const refreshWorkspace = () => {
    try {
      void Promise.resolve(onReviewStateChange()).catch(() => undefined);
    } catch {
      // A later event or fallback poll retries the refresh.
    }
  };
  const connect = () => {
    if (stopped || terminalAuthFailure) return;
    clearRetry();
    connectionGeneration += 1;
    const generation = connectionGeneration;
    const nextChannel = client.channel(
      `owner-live-${salonId}-${crypto.randomUUID()}`,
    );
    channel = nextChannel;
    onConnectionState?.("connecting");
    const isCurrentConnection = () =>
      !stopped &&
      generation === connectionGeneration &&
      channel === nextChannel;

    nextChannel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `salon_id=eq.${salonId}`,
      },
      (payload) => {
        if (!isCurrentConnection()) return;
        const row = payload.new as RealtimeRow;
        onNotification(row);
        dispatchOwnerEvent("gc:owner-notification", {
          ...row,
          bookingId: row.booking_id,
          actionUrl: row.booking_id
            ? `/salon/dashboard/bookings/${row.booking_id}`
            : "/salon/dashboard/bookings",
        });
        refreshWorkspace();
      },
    );
    nextChannel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "bookings",
        filter: `salon_id=eq.${salonId}`,
      },
      (payload) => {
        if (!isCurrentConnection()) return;
        const row = payload.new as RealtimeRow;
        onBooking(row);
        dispatchOwnerEvent("gc:owner-booking-update", {
          ...row,
          bookingId: row.id,
          title: "New booking received",
          body: "A customer completed a booking. The appointment list is updating now.",
          actionUrl: row.id
            ? `/salon/dashboard/bookings/${row.id}`
            : "/salon/dashboard/bookings",
          eventType: "INSERT",
        });
        refreshWorkspace();
      },
    );
    for (const event of ["UPDATE", "DELETE"] as const) {
      nextChannel.on(
        "postgres_changes",
        {
          event,
          schema: "public",
          table: "bookings",
          filter: `salon_id=eq.${salonId}`,
        },
        (payload) => {
          if (!isCurrentConnection()) return;
          const row = (payload.new || payload.old || {}) as RealtimeRow;
          dispatchOwnerEvent("gc:owner-booking-update", {
            ...row,
            bookingId: row.id,
            title: "Booking updated",
            body: "A booking status or appointment detail changed.",
            actionUrl: row.id
              ? `/salon/dashboard/bookings/${row.id}`
              : "/salon/dashboard/bookings",
            eventType: event,
          });
          refreshWorkspace();
        },
      );
    }
    nextChannel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "salons",
        filter: `id=eq.${salonId}`,
      },
      () => {
        if (isCurrentConnection()) refreshWorkspace();
      },
    );
    nextChannel.subscribe((status) => {
      if (stopped || generation !== connectionGeneration) return;
      if (status === "SUBSCRIBED") {
        retryAttempt = 0;
        degraded = false;
        stopPolling();
        scheduleHealthyPoll();
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
    stopHealthyPolling();
    const current = channel;
    channel = null;
    if (current) {
      try {
        await client.removeChannel(current);
      } catch {
        // Cleanup remains idempotent while transport is offline.
      }
    }
  };
}
