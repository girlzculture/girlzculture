import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { businessServiceContribution, contributionPreviousPeriod, type ContributionEvidence } from "@/lib/businessServiceContribution";
type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
async function access(context: Context) {
 for (const permission of ["earnings", "bookings", "styles"]) {
  const check = await context.admin.rpc("p0_actor_has_permission", { p_salon: context.salon.id, p_user: context.user.id, p_permission: permission });
  if (check.error || check.data !== true) throw Error("CONTRIBUTION_ACCESS_DENIED");
 }
 const scope = await context.admin.rpc("business_finance_scope", { p_salon: context.salon.id, p_user: context.user.id });
 if (scope.error || scope.data?.kind !== "business") throw Error("CONTRIBUTION_ACCESS_DENIED");
 const business = await context.admin.from("salons").select("id,user_id,time_zone").eq("id", context.salon.id).maybeSingle();
 if (business.error || !business.data || business.data.id !== context.salon.id || (business.data.user_id === context.user.id) !== context.isOwner) throw Error("CONTRIBUTION_ACCESS_DENIED");
 return business.data;
}
export async function readServiceContribution(context: Context, from: string, to: string) {
 const before = await access(context);
 contributionPreviousPeriod({ from, to, timeZone: before.time_zone });
 const result = await context.admin.rpc("read_service_contribution_evidence", { p_salon: context.salon.id, p_actor: context.user.id, p_from: from, p_to: to });
 if (result.error) throw result.error;
 const after = await access(context), evidence = result.data as ContributionEvidence;
 if (JSON.stringify(before) !== JSON.stringify(after) || evidence?.period?.from !== from || evidence?.period?.to !== to || evidence?.period?.timeZone !== after.time_zone) throw Error("CONTRIBUTION_SOURCE_CHANGED");
 return { ...businessServiceContribution(context.salon.id, evidence), can_review: context.isOwner };
}
export async function saveServiceContribution(context: Context, requestId: string, payload: Record<string, unknown>) {
 const before = await access(context);
 if (!context.isOwner || before.user_id !== context.user.id) throw Error("CONTRIBUTION_OWNER_REQUIRED");
 const saved = await context.admin.rpc("save_service_contribution_review", { p_salon: context.salon.id, p_actor: context.user.id, p_request: requestId, p_payload: payload });
 if (saved.error) throw saved.error;
 const workspace = await readServiceContribution(context, String(payload.from), String(payload.to));
 const row = workspace.rows.find(item => item.service_id === payload.service_id);
 if (!row?.review || saved.data?.verified !== true || saved.data.service_id !== payload.service_id || saved.data.fingerprint !== workspace.fingerprint || row.review.revision !== saved.data.revision || row.review.fingerprint !== workspace.fingerprint) throw Error("CONTRIBUTION_READBACK_FAILED");
 return { ...workspace, verified: true };
}
