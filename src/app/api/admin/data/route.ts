import { requireAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdmin(request);
    const sources = [
      ["salons", "name"], ["salon_applications", "submitted_at"], ["customers", "created_at"],
      ["bookings", "appointment_datetime"], ["reviews", "created_at"], ["support_tickets", "created_at"],
    ] as const;
    const results = await Promise.all(sources.map(([table, order]) => admin.from(table).select("*").order(order, { ascending: false }).limit(500)));
    const payload: Record<string, unknown[]> = {};
    results.forEach((result, index) => {
      if (result.error) throw result.error;
      payload[sources[index][0]] = result.data || [];
    });
    return Response.json(payload);
  } catch (error) {
    console.error("Admin data load failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load admin data" }, { status: 403 });
  }
}
