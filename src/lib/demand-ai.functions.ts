import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DemandAiInsights = {
  generated_at: string | null;
  rising: string[];
  top_oems: string[];
  missing: string[];
  suggested: string[];
  trends: string[];
  summary: string;
};

const EMPTY: DemandAiInsights = {
  generated_at: null, rising: [], top_oems: [], missing: [], suggested: [], trends: [], summary: "",
};

/** Yönetici: gece çalışan AI talep analizinin son sonucunu okur. */
export const getDemandAiInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DemandAiInsights> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Yetkisiz");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("stats_cache")
      .select("payload, computed_at")
      .eq("key", "demand_ai_daily")
      .maybeSingle();
    if (!data) return EMPTY;
    const p = (data.payload ?? {}) as Partial<DemandAiInsights>;
    return {
      generated_at: data.computed_at ?? null,
      rising: p.rising ?? [],
      top_oems: p.top_oems ?? [],
      missing: p.missing ?? [],
      suggested: p.suggested ?? [],
      trends: p.trends ?? [],
      summary: p.summary ?? "",
    };
  });

/** Yönetici: AI talep analizini elle çalıştırır (gece işiyle aynı mantık). */
export const runDemandAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DemandAiInsights> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Yetkisiz");
    const { runDemandAnalysis } = await import("./demand-ai.server");
    return runDemandAnalysis();
  });
