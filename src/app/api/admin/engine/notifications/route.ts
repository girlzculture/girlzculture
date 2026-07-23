import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { cleanText, errorResponse } from "@/lib/requestSecurity";

const PLACEHOLDER = /\{\{([a-z][a-z0-9_]*)\}\}/g;

function validateTemplate(body:Record<string,unknown>, allowedVariables:string[]) {
  const subject = cleanText(body.subject, 140);
  const templateBody = cleanText(body.body, 12000);
  if (subject.length < 3 || templateBody.length < 3) throw new Error("Enter a subject and message body.");
  const used = [...templateBody.matchAll(PLACEHOLDER), ...subject.matchAll(PLACEHOLDER)].map((match) => match[1]);
  const invalid = [...new Set(used.filter((name) => !allowedVariables.includes(name)))];
  if (invalid.length) throw new Error(`Remove unsupported placeholders: ${invalid.join(", ")}.`);
  if (/<\/?[a-z][^>]*>/i.test(templateBody) || /javascript:/i.test(templateBody)) throw new Error("Templates are plain text. HTML and scripts are not allowed.");
  return { subject, templateBody };
}

async function GETHandler(request:Request) {
  try {
    const { admin } = await requireAdminPermission(request, "content");
    const [{data:templates,error},{data:versions,error:versionError}] = await Promise.all([
      admin.from("notification_templates").select("*").order("display_name"),
      admin.from("notification_template_versions").select("*").order("created_at",{ascending:false}).limit(500),
    ]);
    if (error) throw error;
    if (versionError) throw versionError;
    return Response.json({ templates:templates || [], versions:versions || [] });
  } catch (error) {
    noteOperationalFailure("Notification templates load failed", error);
    return errorResponse(error, "Unable to load notification templates.");
  }
}

async function PATCHHandler(request:Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "content");
    const body = await request.json() as Record<string,unknown>;
    const templateKey = cleanText(body.template_key, 120);
    const action = cleanText(body.action, 30);
    const expectedVersion = Number(body.expected_version);
    const reason = cleanText(body.reason, 500);
    if (!templateKey || !["save_draft","publish","rollback"].includes(action)) throw new Error("Choose a notification template action.");
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("Reload this template before saving.");
    const { data:template, error:readError } = await admin.from("notification_templates").select("*").eq("template_key",templateKey).single();
    if (readError) throw readError;
    const allowed = Array.isArray(template.allowed_variables) ? template.allowed_variables.map(String) : [];
    const values = action === "rollback" ? {subject:"",templateBody:""} : validateTemplate(body,allowed);
    if (action === "publish" && reason.length < 5) throw new Error("Enter a publication reason of at least 5 characters.");
    const result = await admin.rpc("admin_apply_notification_template", { p_template_key:templateKey, p_expected_version:expectedVersion, p_action:action, p_subject:values.subject, p_body:values.templateBody, p_reason:reason||null, p_target_version:body.target_version==null?null:Number(body.target_version), p_actor_user_id:user.id });
    if (result.error) {
      if (result.error.message.includes("TEMPLATE_VERSION_CONFLICT")) return Response.json({error:"Another administrator changed this template. Reload before saving."},{status:409});
      throw result.error;
    }
    await admin.from("admin_security_events").insert({ actor_user_id:user.id, action:`notification_template_${action}`, result:"Allowed", details:{template_key:templateKey,reason:reason||null} });
    return Response.json({ template:result.data });
  } catch (error) {
    noteOperationalFailure("Notification template update failed", error);
    return errorResponse(error, "Unable to update the notification template.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/notifications", "GET"), GETHandler);
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/notifications", "PATCH"), PATCHHandler);
