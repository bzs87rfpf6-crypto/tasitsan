import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns view counts (all-time) grouped by part_id for the signed-in user's parts.
 * Used by the "İlanlarım" manager for sort-by-views and stat displays.
 */
export const getMyListingViewCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Fetch user's part ids first (RLS will allow). Keep it lightweight.
    const { data: parts, error: partsErr } = await supabase
      .from("parts")
      .select("id")
      .eq("seller_id", userId);
    if (partsErr) throw partsErr;
    const ids = (parts ?? []).map((p) => p.id);
    if (ids.length === 0) return {} as Record<string, number>;

    // Aggregate views — chunk to keep the URL short for very large sellers.
    const counts: Record<string, number> = {};
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("part_views")
        .select("part_id")
        .in("part_id", slice);
      if (error) throw error;
      for (const row of data ?? []) {
        counts[row.part_id] = (counts[row.part_id] ?? 0) + 1;
      }
    }
    return counts;
  });
