import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CATEGORY_SLUGS } from "./category-seo.functions";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

/** Quality gate for category landing pages.
 * Scoring: listings * 0.6 + distinct_brands * 2 + distinct_oems * 0.5, cap 100.
 * A category becomes `indexable=true` when quality_score >= 40. */
function scoreCategory(listings: number, brands: number, oems: number): { score: number; indexable: boolean } {
  const raw = listings * 0.6 + brands * 2 + oems * 0.5;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, indexable: score >= 40 && listings >= 6 };
}

/** Refresh the seo_category_landing table for every curated slug.
 * Called by admin panel + scheduled backfill. */
export const refreshCategoryLandingQuality = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);

    const results: Array<{ slug: string; score: number; indexable: boolean; listings: number }> = [];
    for (const [slug, name] of Object.entries(CATEGORY_SLUGS)) {
      const { data, error } = await supabaseAdmin
        .from("parts")
        .select("brand,oem_code,oem_codes")
        .eq("status", "approved")
        .eq("category", name);
      if (error) continue;
      const rows = (data ?? []) as Array<{ brand: string | null; oem_code: string | null; oem_codes: string[] | null }>;
      const listings = rows.length;
      const brands = new Set(rows.map((r) => (r.brand ?? "").trim().toLowerCase()).filter(Boolean)).size;
      const oemSet = new Set<string>();
      for (const r of rows) {
        if (r.oem_code) oemSet.add(r.oem_code.trim().toUpperCase());
        for (const c of r.oem_codes ?? []) if (c) oemSet.add(c.trim().toUpperCase());
      }
      const { score, indexable } = scoreCategory(listings, brands, oemSet.size);
      await supabaseAdmin.from("seo_category_landing").upsert({
        category_slug: slug,
        category_name: name,
        listings_count: listings,
        distinct_brands: brands,
        distinct_oems: oemSet.size,
        quality_score: score,
        indexable,
        updated_at: new Date().toISOString(),
      }, { onConflict: "category_slug" });
      results.push({ slug, score, indexable, listings });
    }
    return { updated: results.length, results };
  });

/** Public: return only indexable category slugs. Used by sitemap. */
export const listIndexableCategorySlugs = createServerFn({ method: "GET" })
  .handler(async (): Promise<Array<{ slug: string; updated_at: string }>> => {
    // Sitemap = sayfada gerçekten index alan set. Sayfa 6+ ilanda index,
    // altında noindex verdiği için aynı eşik burada da uygulanır.
    const { data } = await supabaseAdmin
      .from("seo_category_landing")
      .select("category_slug,updated_at")
      .gte("listings_count", 6);
    return ((data ?? []) as Array<{ category_slug: string; updated_at: string }>)
      .map((r) => ({ slug: r.category_slug, updated_at: r.updated_at }));
  });
