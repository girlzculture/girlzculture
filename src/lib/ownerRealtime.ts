import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type RealtimeRow = Record<string, unknown>;
type OwnerRealtimeOptions = {
  client: SupabaseClient;
  salonId: string;
  onNotification: (row: RealtimeRow) => void;
  onBooking: (row: RealtimeRow) => void;
  onStatus?: (status: string) => void;
};

export function subscribeToOwnerUpdates({ client, salonId, onNotification, onBooking, onStatus }: OwnerRealtimeOptions) {
  const channel: RealtimeChannel = client.channel(`owner-live-${salonId}-${crypto.randomUUID()}`);

  // Supabase requires every postgres_changes callback to be registered before
  // subscribe(). Keep subscribe as the final channel-builder call.
  channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `salon_id=eq.${salonId}` }, (payload) => onNotification(payload.new as RealtimeRow));
  channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings", filter: `salon_id=eq.${salonId}` }, (payload) => onBooking(payload.new as RealtimeRow));
  channel.subscribe((status) => onStatus?.(status));

  let removed = false;
  return async () => {
    if (removed) return;
    removed = true;
    await client.removeChannel(channel);
  };
}
