import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

export type ConvPart = {
  part_id: string;
  seo_slug?: string | null;
  title: string | null;
  oem_code?: string | null;
  oem_codes?: string[] | null;
  brand: string | null;
  model?: string | null;
  views?: number;
  clicks?: number;
  inquiries?: number;
  favorites?: number;
  views_7d?: number;
  wa_7d?: number;
  inq_7d?: number;
  opportunity_score?: number;
};

export type ConvOem = { oem: string; search_count?: number; attempts?: number; last_at: string; reason?: string };
export type ConvSource = { source: string; sessions: number };
export type ConvPath = { path: string; hits: number };
export type ConvRisingOem = { oem: string; d1: number; prev6: number };
export type ConvFunnel = {
  visited: number;
  searched: number;
  viewed: number;
  whatsapped: number;
  offered: number;
  sold: number;
};

export type ConversionAnalytics = {
  today_cards: { real_users: number; inquiries: number; whatsapp: number; leads: number };
  bots_filtered?: { hits: number; sessions: number };
  top_viewed: { d1: ConvPart[]; d7: ConvPart[]; d30: ConvPart[] };
  top_oem: ConvOem[];
  no_result_oem: ConvOem[];
  whatsapp_parts: ConvPart[];
  inquiry_parts: ConvPart[];
  favorite_parts: ConvPart[];
  sources: ConvSource[];
  funnel: ConvFunnel;
  sales_potential: ConvPart[];
  seo_daily: {
    google_visitors_today: number;
    top_paths_today: ConvPath[];
    rising_oem: ConvRisingOem[];
  };
  snapshot_at: string;
};

export const getConversionAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_conversion_analytics");
    if (error) throw new Error(error.message);
    const result = (data ?? {}) as ConversionAnalytics;
    const partIds = new Set<string>();
    const collect = (rows?: ConvPart[]) => rows?.forEach((p) => {
      if (p.part_id) partIds.add(p.part_id);
    });
    collect(result.top_viewed?.d1);
    collect(result.top_viewed?.d7);
    collect(result.top_viewed?.d30);
    collect(result.whatsapp_parts);
    collect(result.inquiry_parts);
    collect(result.favorite_parts);
    collect(result.sales_potential);

    if (partIds.size > 0) {
      const ids = [...partIds];
      const { data: parts } = await context.supabase
        .from("parts")
        .select("id,seo_slug,title,oem_code,oem_codes,brand,model")
        .in("id", ids);
      const byId = new Map((parts ?? []).map((p) => [p.id, p]));
      const enrich = (rows?: ConvPart[]) => rows?.map((p) => {
        const meta = byId.get(p.part_id);
        return meta
          ? {
              ...p,
              seo_slug: meta.seo_slug,
              title: meta.title ?? p.title,
              oem_code: meta.oem_code,
              oem_codes: meta.oem_codes,
              brand: meta.brand ?? p.brand,
              model: meta.model ?? p.model,
            }
          : p;
      }) ?? [];
      result.top_viewed = {
        d1: enrich(result.top_viewed?.d1),
        d7: enrich(result.top_viewed?.d7),
        d30: enrich(result.top_viewed?.d30),
      };
      result.whatsapp_parts = enrich(result.whatsapp_parts);
      result.inquiry_parts = enrich(result.inquiry_parts);
      result.favorite_parts = enrich(result.favorite_parts);
      result.sales_potential = enrich(result.sales_potential);
    }
    return result;
  });
