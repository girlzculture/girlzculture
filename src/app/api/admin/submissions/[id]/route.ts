import { requireAdminPermission } from "@/lib/supabaseAdmin";

export async function GET(request: Request, context: RouteContext<"/api/admin/submissions/[id]">) {
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
        console.error("Application document signing failed", { applicationId: id, path, error: signError });
        return null;
      }
      return data.signedUrl;
    }));

    return Response.json({ application: { ...application, document_urls: signedDocuments.filter(Boolean) } });
  } catch (error) {
    console.error("Admin application detail load failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load application" }, { status: 403 });
  }
}
