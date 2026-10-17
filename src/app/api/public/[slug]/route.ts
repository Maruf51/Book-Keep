import { handleRouteError, jsonError } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loadPublicBusiness } from "@/lib/public-business";

/**
 * GET /api/public/[slug] (spec §6 — no login, rate limited)
 * Returns business info, active services and active staff for the
 * public booking page. 404 for unknown slug.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limited = enforceRateLimit(request, "public:business", 60);
    if (limited) return limited;

    const { slug } = await params;
    const data = await loadPublicBusiness(slug);
    if (!data) return jsonError("NOT_FOUND", "Business not found.", 404);

    return Response.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
