import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

async function GETHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdminPermission(request, "submissions");
    const { id } = await context.params;
    const { data: application, error } = await admin.from("salon_applications").select("*").eq("id", id).single();
    if (error || !application) return Response.json({ error: "Application not found" }, { status: 404 });

    const paths: string[] = Array.isArray(application.document_urls) ? application.document_urls.map(String) : [];
    const signedDocuments = await Promise.all(paths.map(async (path) => {
      if (/^https?:\/\//i.test(path)) return path;
      const { data, error: signError } = await admin.storage.from("application-documents").createSignedUrl(path, 3600);
      if (signError) {
        noteOperationalFailure("Application document signing failed", { applicationId: id, path, error: signError });
        return null;
      }
      return data.signedUrl;
    }));

    return Response.json({ application: { ...application, document_urls: signedDocuments.filter(Boolean) } });
  } catch (error) {
    noteOperationalFailure("Admin application detail load failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load application" }, { status: 403 });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/submissions/[id]", "GET"), GETHandler);
