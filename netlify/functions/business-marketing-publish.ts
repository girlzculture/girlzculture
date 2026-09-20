import { monitoredNetlifyFailure } from "./_monitoring.mjs";
declare const Netlify: { env: { get(key: string): string | undefined } };
export default async function publishBusinessMarketing(request: Request, context: { deploy: { context: string; published: boolean } }) {
  if (context.deploy.context !== "production" || !context.deploy.published) return Response.json({ disabled: true });
  try {
    const secret = Netlify.env.get("INTERNAL_API_SECRET");
    if (!secret) throw Error("MARKETING_WORKER_NOT_CONFIGURED");
    const response = await fetch("https://girlzculture.com/api/salon/marketing/publish-due", { method: "POST", redirect: "error", headers: { "x-internal-secret": secret }, signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw Error("MARKETING_WORKER_UNAVAILABLE");
    return Response.json({ ok: true });
  } catch {
    return monitoredNetlifyFailure({ request, error: Error("MARKETING_WORKER_UNAVAILABLE"), feature: "business-marketing", action: "scheduled-publication", safeMessage: "Scheduled business updates need review." });
  }
}
export const config = { schedule: "*/5 * * * *" };
