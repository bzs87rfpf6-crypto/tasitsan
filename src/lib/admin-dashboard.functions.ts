import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ActiveFirm = {
  seller_id: string;
  display_name: string;
  city: string | null;
  is_verified: boolean;
  active_parts: number;
  pending_parts: number;
  total_parts: number;
};

export type ViewedFirm = {
  seller_id: string;
  display_name: string;
  city: string | null;
  is_verified: boolean;
  views_30d: number;
};

export type AdminDashboardOverview = {
  total_members: number;
  verified_sellers: number;
  active_sellers: number;
  total_parts: number;
  parts_today: number;
  new_members_30d: number;
  today_views: number;
  today_whatsapp: number;
  today_calls: number;
  active_firms: ActiveFirm[];
  viewed_firms: ViewedFirm[];
  top_oem: { oem: string; search_count: number; listing_count: number }[];
  top_searches: { query: string; search_count: number }[];
};

export const getAdminDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_dashboard_overview");
    if (error) throw new Error(error.message);
    return data as unknown as AdminDashboardOverview;
  });
