import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OnlineParcaMetrics } from "@/lib/onlineparca-metrics.server";

export type { OnlineParcaMetrics };

type AuthedSupabase = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };

/** Admin: OnlineParça canlı arama performans ölçümleri. */
export const getOnlineParcaPerf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnlineParcaMetrics> => {
    const sb = context.supabase as unknown as AuthedSupabase;
    const [a, s] = await Promise.all([
      sb.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      sb.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
    ]);
    if (a.data !== true && s.data !== true) throw new Error("Yetkisiz");
    const { getOnlineParcaMetrics } = await import("@/lib/onlineparca-metrics.server");
    return getOnlineParcaMetrics();
  });
