import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, "search-suggestions", 120, 10 * 60_000);
    const query = new URL(request.url).searchParams;
    const type = cleanText(query.get("type"), 20);
    const term = cleanText(query.get("q"), 80).toLowerCase();
    if (type !== "style") return Response.json({ suggestions: [] });
    const admin = getSupabaseAdmin();
    const [{ data: master, error: masterError }, { data: offered, error: offeredError }] = await Promise.all([
      admin.from("master_styles").select("name").eq("is_active", true).order("sort_order").limit(250),
      admin.from("styles").select("name").limit(500),
    ]);
    if (masterError) throw masterError;
    if (offeredError) throw offeredError;
    const names = [...(master || []), ...(offered || [])].map((row) => String(row.name || "").trim()).filter(Boolean);
    const unique = [...new Map(names.map((name) => [name.toLowerCase(), name])).values()];
    const suggestions = unique.filter((name) => !term || name.toLowerCase().includes(term)).sort((left, right) => {
      const leftStarts = left.toLowerCase().startsWith(term) ? 0 : 1;
      const rightStarts = right.toLowerCase().startsWith(term) ? 0 : 1;
      return leftStarts - rightStarts || left.localeCompare(right);
    }).slice(0, 8);
    return Response.json({ suggestions });
  } catch (error) {
    console.error("Search suggestion load failed", error);
    return errorResponse(error, "Unable to load suggestions");
  }
}
