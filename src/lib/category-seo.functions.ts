import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

// Curated category slug → display name. Sitemap ve route gating için tek kaynak.
export const CATEGORY_SLUGS: Record<string, string> = {
  "motor-parcalari":     "Motor",
  "sanziman":            "Şanzıman",
  "fren-sistemi":        "Fren",
  "suspansiyon":         "Süspansiyon",
  "elektrik":            "Elektrik",
  "kaporta":             "Kaporta",
  "klima":               "Klima",
  "yakit-sistemi":       "Yakıt Sistemi",
  "aydinlatma":          "Aydınlatma",
  "mars-motoru":         "Marş Motoru",
};

export function categoryFromSlug(slug: string): string | null {
  return CATEGORY_SLUGS[slug.toLowerCase()] ?? null;
}

export interface CategoryProduct {
  id: string;
  title: string;
  seo_slug: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  oem_code: string | null;
  price: number | null;
  city: string | null;
  photos: string[] | null;
  has_photos: boolean | null;
}

export interface CategoryLandingData {
  total: number;
  top_products: CategoryProduct[];
  recent_products: CategoryProduct[];
  popular_oems: string[];
  brands: string[];
}

export const getCategoryLanding = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) =>
    z.object({ slug: z.string().min(2).max(60) }).parse(d)
  )
  .handler(async ({ data }): Promise<{ slug: string; category: string; data: CategoryLandingData } | null> => {
    const category = categoryFromSlug(data.slug);
    if (!category) return null;
    const { data: row, error } = await supabaseAdmin.rpc("category_landing", { _category: category, _limit: 12 });
    if (error) throw new Error(error.message);
    const j = (row ?? {}) as Partial<CategoryLandingData>;
    return {
      slug: data.slug.toLowerCase(),
      category,
      data: {
        total: j.total ?? 0,
        top_products: j.top_products ?? [],
        recent_products: j.recent_products ?? [],
        popular_oems: j.popular_oems ?? [],
        brands: j.brands ?? [],
      },
    };
  });
