import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export const SITE_URL = "https://tasitsan.com.tr";

export const getPublicSiteSeo = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("ga4_measurement_id,gsc_verification_code")
    .maybeSingle();
  return {
    ga4: (data?.ga4_measurement_id as string | null) ?? null,
    gsc: (data?.gsc_verification_code as string | null) ?? null,
  };
});

export const getPartSeo = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: part } = await supabaseAdmin
      .from("parts")
      .select("id,title,description,brand,model,year,oem_code,oem_codes,engine_code,city,price,photos,condition,status,stock_quantity,created_at,updated_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!part) return null;
    return part as {
      id: string; title: string; description: string | null;
      brand: string | null; model: string | null; year: number | null;
      oem_code: string | null; oem_codes: string[] | null; engine_code: string | null;
      city: string | null; price: number | null;
      photos: string[] | null; condition: string; status: string;
      stock_quantity: number | null; created_at: string; updated_at: string;
    };
  });

export const getSitemapParts = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("parts")
    .select("id,updated_at")
    .neq("status", "inactive")
    .order("updated_at", { ascending: false })
    .limit(5000);
  return (data ?? []) as { id: string; updated_at: string }[];
});
