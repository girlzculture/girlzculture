import { requireAdminPermission } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const section = new URL(request.url).searchParams.get("section") || "overview";
    const permission = section === "complaints" ? "support" : section;
    const { admin } = await requireAdminPermission(request, permission);
    const allSources = [
      ["salons", "name", true], ["salon_applications", "submitted_at", true], ["customers", "created_at", true],
      ["bookings", "appointment_datetime", true], ["reviews", "created_at", true], ["support_tickets", "created_at", true],
      ["subscriptions", "updated_at", false], ["complaints_log", "created_at", false], ["admin_users", "email", false],
      ["salon_promotions", "created_at", false], ["blog_posts", "updated_at", false], ["admin_settings", "updated_at", false],
      ["billing_events", "event_date", false],
    ] as const;
    const needed: Record<string, string[]> = {
      overview: allSources.map(([table]) => table), submissions: ["salon_applications"], salons: [],
      customers: ["customers", "bookings"], bookings: ["bookings", "salons"], quality: ["salons", "reviews", "complaints_log"],
      reviews: ["reviews", "salons"], finance: ["subscriptions", "salons", "billing_events"], marketing: ["salon_promotions", "blog_posts", "salons"],
      content: [], support: ["support_tickets"], complaints: ["support_tickets"], subscriptions: ["subscriptions", "salons"], settings: ["admin_users", "admin_settings"],
    };
    const sources = allSources.filter(([table]) => (needed[section] || []).includes(table));
    const results = await Promise.all(sources.map(async ([table, order, required]) => {
      const result = await admin.from(table).select("*").order(order, { ascending: false }).limit(500);
      if (result.error && !required) {
        console.warn("Optional admin data source unavailable", { table, error: result.error.message });
        return { data: [], error: null };
      }
      return result;
    }));
    // Keep the response shape stable for every section. Most admin routes only
    // fetch the tables they need, but every consumer can safely render an empty
    // state when another dataset is absent.
    const payload: Record<string, unknown[]> = Object.fromEntries(
      allSources.map(([table]) => [table, []]),
    );
    results.forEach((result, index) => {
      if (result.error) throw result.error;
      payload[sources[index][0]] = result.data || [];
    });
    const applications = Array.isArray(payload.salon_applications)
      ? payload.salon_applications as Array<Record<string, unknown>>
      : [];
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
