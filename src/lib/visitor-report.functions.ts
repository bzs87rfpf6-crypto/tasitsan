import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

export type VisitorReport = {
  rangeDays: number;
  totalVisits: number;
  uniqueVisitors: number;
  totalVisitsToday: number;
  uniqueVisitorsToday: number;
  uniqueVisitors24h: number;
  sessions: number;
  visitsPerVisitor: number;
  botVisits: number;
  botSessions: number;
  botsByName: { name: string; hits: number }[];
  avgTimeSec: number;
  medianTimeSec: number;
  engagement: { bounce: number; viewed: number; high: number };
  topViewedParts: {
    part_id: string; title: string; seo_slug: string | null;
    views: number; visitors: number; avg_sec: number;
  }[];
  topEngagedParts: {
    part_id: string; title: string; seo_slug: string | null;
    avg_sec: number; total_sec: number; high_interest: number; views: number;
  }[];
  topSellerProfiles: { seller_id: string; name: string; visits: number; visitors: number }[];
  dailySeries: { date: string; visits: number; uniques: number }[];
};

/** Parmak izi tabanlı tekil ziyaretçi + ilgi/süre raporu (yalnızca admin). */
export const getVisitorReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => ({
    days: Math.min(Math.max(Number(input?.days ?? 30) || 30, 1), 90),
  }))
  .handler(async ({ data, context }): Promise<VisitorReport> => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { data: rpc, error } = await context.supabase.rpc("admin_visitor_report", {
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return rpc as unknown as VisitorReport;
  });
