import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface SeoHealth {
  active_total: number;
  missing_photo: number;
  missing_description: number;
  missing_oem: number;
  missing_brand_model: number;
  missing_seo_slug: number;
  duplicate_title_groups: number;
  noindex_pages: number;
  oem_indexable: number;
  brand_indexable: number;
}

export const getSeoHealth = createServerFn({ method: "GET" })
  .handler(async (): Promise<SeoHealth> => {
    const { data, error } = await (supabaseAdmin as any).rpc("seo_health_overview");
    if (error) throw new Error(error.message);
    return (data ?? {}) as SeoHealth;
  });
