import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PartEvaluation = {
  part_id: string;
  age_days: number;
  search_count: number;
  request_count: number;
  view_count: number;
  similar_count: number;
  market_avg: number | null;
  market_median: number | null;
  market_min: number | null;
  market_max: number | null;
  demand_score: number;
  price: number | null;
  recommended_low: number | null;
  recommended_high: number | null;
  recommendation: string | null;
  is_stale: boolean;
  error?: string;
};

export type StockDashboard = {
  most_searched: {
    oem: string;
    search_count: number;
    listing_count: number;
    sample: { id: string; title: string; price: number | null } | null;
  }[];
  fastest_selling: {
    id: string;
    title: string;
    brand: string | null;
    model: string | null;
    price: number | null;
    views_7d: number;
  }[];
  slow_moving: {
    id: string;
    title: string;
    brand: string | null;
    model: string | null;
    price: number | null;
    city: string | null;
    age_days: number;
    views_30d: number;
    recommendation: string;
  }[];
  top_vehicles: { brand: string; model: string; demand_count: number }[];
  stale_recs: StockDashboard["slow_moving"];
};

export const getPartEvaluation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { partId: string }) => ({ partId: String(data.partId) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await supabase.rpc("evaluate_part_stock", {
      _part_id: data.partId,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PartEvaluation;
  });

export const getStockDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("stock_dashboard_stats");
    if (error) throw new Error(error.message);
    return data as unknown as StockDashboard;
  });
