import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

export type AnalyticsOverview = {
  visitorsTotal: number;
  visitorsDaily: number;
  visitorsWeekly: number;
  visitorsMonthly: number;
  distinctCities: number;
  cities: { city: string; count: number }[];
  topParts: { part_id: string; title: string; views: number }[];
  topSearches: { query: string; count: number }[];
  topOem: { oem: string; count: number }[];
  devices: { device: string; sessions: number }[];
  whatsappClicks: number;
  callClicks: number;
  totalMembers: number;
  newMembersToday: number;
  totalParts: number;
  newPartsToday: number;
  topSellers: { seller_id: string; name: string; count: number }[];
  dailySeries: { date: string; visitors: number; newMembers: number; newParts: number }[];
  /** Sunucu tarafında elenen bot trafiği (bugün) */
  botsFiltered?: { hits: number; sessions: number };
  /** 5 dakikalık pencerede tekilleştirilmiş bugünkü ziyaret sayısı */
  visitsTodayDeduped?: number;
  debug?: {
    snapshotAt: string;
    tz: string;
    dayStart: string;
    weekStart: string;
    monthStart: string;
    analyticsRowsLast30: number;
    pageViewRowsLast30: number;
    distinctSessionsLast30: number;
    distinctVisitorsTodayFromUsers: number;
  };
};

/**
 * Single-snapshot analytics overview.
 *
 * All metrics (Bugün / Bu Hafta / Bu Ay / Son 30 Gün) are computed inside ONE
 * SQL function over the full analytics_events table. Previous JS aggregation
 * sampled only the most-recent 10 000 rows and therefore the 30-day distinct
 * session counter drifted downward as fresh events crowded out older ones.
 * The deterministic SQL version always returns the same number for the same
 * underlying data.
 */
export const getAnalyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_analytics_overview");
    if (error) throw new Error(error.message);
    const overview = (data ?? {}) as AnalyticsOverview;

    // Server-side debug trail — visible in worker logs, helps verify the
    // counter is deterministic across refreshes.
    if (overview.debug) {
      console.log("[analytics-overview]", {
        snapshotAt: overview.debug.snapshotAt,
        tz: overview.debug.tz,
        analyticsRowsLast30: overview.debug.analyticsRowsLast30,
        pageViewRowsLast30: overview.debug.pageViewRowsLast30,
        distinctSessionsLast30: overview.debug.distinctSessionsLast30,
        today: overview.visitorsDaily,
        week: overview.visitorsWeekly,
        month: overview.visitorsMonthly,
        total30: overview.visitorsTotal,
      });
    }
    return overview;
  });
