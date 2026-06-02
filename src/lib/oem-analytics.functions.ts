import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTopOemSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { range?: "30d" | "all"; limit?: number }) => ({
    range: data.range === "all" ? "all" : "30d",
    limit: Math.max(1, Math.min(data.limit ?? 25, 100)),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("top_oem_searches", {
      _range: data.range,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as { oem: string; search_count: number; last_searched_at: string }[];
  });
