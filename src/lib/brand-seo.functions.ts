import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface BrandIndexRow {
  brand: string;
  slug: string;
  total: number;
  with_photo: number;
  last_updated: string | null;
}

export interface BrandLandingPart {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  oem_code: string | null;
  oem_codes: string[] | null;
  price: number | null;
  photos: string[] | null;
  seo_slug: string | null;
  has_photos: boolean | null;
}

export interface BrandLandingData {
  brand: string;
  total: number;
  with_photo: number;
  last_updated: string | null;
  models: Array<{ model: string; count: number }>;
  parts: BrandLandingPart[];
}

export const getBrandIndex = createServerFn({ method: "GET" })
  .handler(async (): Promise<BrandIndexRow[]> => {
    const { data, error } = await (supabaseAdmin as any).rpc("seo_brand_index", { _min_count: 3 });
    if (error) {
      console.error("[seo_brand_index]", error);
      return [];
    }
    return (data as unknown as BrandIndexRow[]) ?? [];
  });

export const getBrandLanding = createServerFn({ method: "GET" })
  .inputValidator((d: { brand: string }) => z.object({ brand: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<BrandLandingData | null> => {
    const { data: row, error } = await (supabaseAdmin as any).rpc("seo_brand_landing", {
      _brand: data.brand,
      _limit: 24,
    });
    if (error || !row) {
      console.error("[seo_brand_landing]", error);
      return null;
    }
    return row as unknown as BrandLandingData;
  });

const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u",
  Ç: "C", Ğ: "G", İ: "I", I: "I", Ö: "O", Ş: "S", Ü: "U",
};
export function brandSlug(input: string): string {
  return input
    .split("")
    .map((c) => TR_MAP[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
