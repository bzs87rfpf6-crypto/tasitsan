import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

/**
 * "Bugün" kartları — ağır dönüşüm sorgusundan BAĞIMSIZ, hızlı tek sorgu.
 * Kaynak: public.admin_today_metrics() RPC (Europe/Istanbul gün başlangıcı).
 *
 * unique_visitors_today : gün içindeki TEKİL gerçek ziyaretçi (fingerprint → visitor_id → session_id)
 * active_5m / active_30m: sadece son 5/30 dakikada aktif olanlar (düşebilir — bu normaldir)
 */
export type TodayMetrics = {
  day_start: string;
  snapshot_at: string;
  unique_visitors_today: number;
  sessions_today: number;
  active_5m: number;
  active_30m: number;
  searches_today: number;
  part_views_today: number;
  whatsapp_today: number;
  calls_today: number;
  conversions_today: number;
  inquiries_today: number;
  bots_filtered: { hits: number; sessions: number };
};

export const getTodayMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TodayMetrics> => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_today_metrics");
    if (error) throw new Error(error.message);
    return data as unknown as TodayMetrics;
  });
