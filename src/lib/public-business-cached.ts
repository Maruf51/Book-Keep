import "server-only";
import { cacheLife } from "next/cache";
import { loadPublicBusiness } from "@/lib/public-business";
import type { PublicBusinessDto } from "@/lib/types";

/**
 * Cached wrapper for public pages only (PLAN P3-T6: `use cache` +
 * `cacheLife('minutes')`). Never import this from route handlers or tests —
 * `cacheLife` throws outside a request-time cache scope.
 */
export async function getPublicBusiness(
  slug: string
): Promise<PublicBusinessDto | null> {
  "use cache";
  cacheLife("minutes");
  return loadPublicBusiness(slug);
}
