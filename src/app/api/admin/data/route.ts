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
    const applications = payload.salon_applications as Array<Record<string, unknown>>;
    await Promise.all(applications.map(async (application) => {
      const paths = Array.isArray(application.document_urls) ? application.document_urls.map(String) : [];
      const signed = await Promise.all(paths.map(async (path) => {
        if (/^https?:\/\//i.test(path)) return path;
        const { data, error } = await admin.storage.from("application-documents").createSignedUrl(path, 3600);
        if (error) { console.error("Application document signing failed", { applicationId: application.id, path, error }); return null; }
        return data.signedUrl;
      }));
      application.document_urls = signed.filter(Boolean);
    }));
    return Response.json(payload);
  } catch (error) {
    console.error("Admin data load failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load admin data" }, { status: 403 });
  }
}
