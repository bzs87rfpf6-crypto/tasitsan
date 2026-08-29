// SEO Faz 7 — Tur 3
// Model ve Model×Kategori landing page için sunucu fonksiyonları.
// - getModelLanding: /marka/$brand/$model
// - getModelCategoryLanding: /marka/$brand/$model/$category
// - listIndexableLandingPages: sitemap üretimi için (yalnız indexable=true)
// - getSeoGrowthOverview: admin panelinde büyüme özeti
//
// Kalite kontrolü landing-quality.ts üzerinden yapılır. Skor < 55 ise
// sayfa noindex,follow olarak yayınlanır ve sitemap'e girmez.
// Sonuç `landing_page_registry` tablosuna upsert edilir; admin panel
// bu tablodan büyüme ve thin content raporunu okur.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { scoreLanding, LANDING_INDEXABLE_THRESHOLD, type LandingSignal } from "@/lib/landing-quality";
import { brandSlug } from "@/lib/brand-seo.functions";
import { CATEGORY_SLUGS, categoryFromSlug } from "@/lib/category-seo.functions";

// ---------- Types ----------

export interface ModelLandingPart {
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
  category: string | null;
  city: string | null;
}

export interface ModelLandingData {
  brand: string;
  model: string;
  category: string | null;
  slug: string;
  total: number;
  unique_oems: number;
  unique_years: number;
  categories: Array<{ slug: string; label: string; count: number }>;
  top_oems: Array<{ oem: string; count: number }>;
  parts: ModelLandingPart[];
  quality_score: number;
  indexable: boolean;
  reasons: string[];
  faqs: Array<{ q: string; a: string }>;
}

function normalizeBrand(raw: string): string {
  return raw
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ---------- Core loader ----------

async function loadLanding(input: {
  brand: string;
  model: string;
  category?: string; // display label
  categorySlug?: string;
}): Promise<ModelLandingData | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const brand = normalizeBrand(input.brand);
  const model = normalizeBrand(input.model);
  const category = input.category ?? null;

  let query = supabaseAdmin
    .from("parts")
    .select(
      "id,title,brand,model,year,oem_code,oem_codes,price,photos,seo_slug,category,city,description,has_photos,updated_at",
    )
    .eq("status", "active")
    .ilike("brand", brand)
    .ilike("model", model)
    .order("updated_at", { ascending: false })
    .limit(60);

  if (category) query = query.ilike("category", category);

  const { data: rows, error } = await query;
  if (error) {
    console.error("[model-seo] parts load", error);
    return null;
  }
  const list = rows ?? [];
  if (list.length === 0) return null;

  // Signal derivation
  const oemSet = new Set<string>();
  const yearSet = new Set<number>();
  const categoryCount = new Map<string, number>();
  const oemCount = new Map<string, number>();
  let photoCount = 0;
  let descLenSum = 0;
  let descCount = 0;

  for (const p of list) {
    if (p.oem_code) {
      oemSet.add(p.oem_code);
      oemCount.set(p.oem_code, (oemCount.get(p.oem_code) ?? 0) + 1);
    }
    (p.oem_codes ?? []).forEach((c: string) => {
      if (c) oemSet.add(c);
    });
    if (p.year) yearSet.add(p.year);
    if (p.category) categoryCount.set(p.category, (categoryCount.get(p.category) ?? 0) + 1);
    if ((p.photos && p.photos.length > 0) || p.has_photos) photoCount += 1;
    if (p.description) {
      descLenSum += p.description.length;
      descCount += 1;
    }
  }

  const signal: LandingSignal = {
    listings_count: list.length,
    unique_oems: oemSet.size,
    unique_vehicles: yearSet.size || 1,
    avg_description_length: descCount > 0 ? Math.round(descLenSum / descCount) : 0,
    photo_ratio: list.length > 0 ? photoCount / list.length : 0,
    has_core_fields: !!brand && !!model,
  };
  const quality = scoreLanding(signal);

  const catsMapped: Array<{ slug: string; label: string; count: number }> = [];
  for (const [label, count] of categoryCount.entries()) {
    const slugEntry = Object.entries(CATEGORY_SLUGS).find(([, v]) => v === label);
    if (slugEntry) catsMapped.push({ slug: slugEntry[0], label, count });
  }
  catsMapped.sort((a, b) => b.count - a.count);

  const topOems = [...oemCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([oem, count]) => ({ oem, count }));

  const slug = input.categorySlug
    ? `${brandSlug(brand)}/${brandSlug(model)}/${input.categorySlug}`
    : `${brandSlug(brand)}/${brandSlug(model)}`;

  const kind = input.categorySlug ? "brand_model_category" : "brand_model";

  // FAQ — sadece gerçek veri varsa
  const faqs: Array<{ q: string; a: string }> = [];
  if (list.length >= 3) {
    faqs.push({
      q: `${brand} ${model} yedek parça fiyatları ne kadar?`,
      a: `Taşıtsan'da ${brand} ${model} için şu an ${list.length} aktif ilan bulunuyor. Fiyatlar parça türüne, ikinci el / sıfır durumuna ve satıcıya göre değişir; ilan sayfasında güncel teklifi görebilirsiniz.`,
    });
  }
  if (topOems.length > 0) {
    faqs.push({
      q: `${brand} ${model} için en çok aranan OEM numaraları hangileri?`,
      a: `En sık listelenen OEM numaraları: ${topOems.slice(0, 5).map((o) => o.oem).join(", ")}. Aracınıza tam uyumu için ruhsat / motor kodu ile karşılaştırın.`,
    });
  }
  if (yearSet.size > 1) {
    const years = [...yearSet].sort();
    faqs.push({
      q: `${brand} ${model} hangi model yıllarına parça mevcut?`,
      a: `Şu an ${years[0]} - ${years[years.length - 1]} arasında farklı model yıllarına ait ilanlar var. Yıl filtresini kullanarak aracınıza uygun ilanları görüntüleyebilirsiniz.`,
    });
  }

  // Kayıt: registry upsert (best-effort; hata olursa sayfa yine render)
  try {
    await supabaseAdmin.from("landing_page_registry").upsert(
      {
        slug,
        kind,
        brand,
        model,
        category,
        listings_count: signal.listings_count,
        unique_oems: signal.unique_oems,
        unique_vehicles: signal.unique_vehicles,
        quality_score: quality.score,
        indexable: quality.indexable,
        last_scored_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    );
  } catch (e) {
    console.warn("[model-seo] registry upsert failed", e);
  }

  return {
    brand,
    model,
    category,
    slug,
    total: signal.listings_count,
    unique_oems: signal.unique_oems,
    unique_years: yearSet.size,
    categories: catsMapped,
    top_oems: topOems,
    parts: list.slice(0, 24).map((p: {
      id: string; title: string; brand: string | null; model: string | null;
      year: number | null; oem_code: string | null; oem_codes: string[] | null;
      price: number | null; photos: string[] | null; seo_slug: string | null;
      category: string | null; city: string | null;
    }) => ({
      id: p.id,
      title: p.title,
      brand: p.brand,
      model: p.model,
      year: p.year,
      oem_code: p.oem_code,
      oem_codes: p.oem_codes,
      price: p.price,
      photos: p.photos,
      seo_slug: p.seo_slug,
      category: p.category,
      city: p.city,
    })),
    quality_score: quality.score,
    indexable: quality.indexable,
    reasons: quality.reasons,
    faqs,
  };
}

export const getModelLanding = createServerFn({ method: "GET" })
  .inputValidator((d: { brand: string; model: string }) =>
    z.object({ brand: z.string().min(1).max(60), model: z.string().min(1).max(60) }).parse(d),
  )
  .handler(async ({ data }) => loadLanding({ brand: data.brand, model: data.model }));

export const getModelCategoryLanding = createServerFn({ method: "GET" })
  .inputValidator((d: { brand: string; model: string; categorySlug: string }) =>
    z
      .object({
        brand: z.string().min(1).max(60),
        model: z.string().min(1).max(60),
        categorySlug: z.string().min(2).max(60),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const cat = categoryFromSlug(data.categorySlug);
    if (!cat) return null;
    return loadLanding({
      brand: data.brand,
      model: data.model,
      category: cat,
      categorySlug: data.categorySlug,
    });
  });

// Sitemap: yalnız indexable landing sayfaları
export const listIndexableLandingPages = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("landing_page_registry")
    .select("slug,kind,last_scored_at,quality_score")
    .eq("indexable", true)
    .in("kind", ["brand_model", "brand_model_category"])
    .order("quality_score", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("[model-seo] listIndexable", error);
    return [] as Array<{ slug: string; kind: string; last_scored_at: string; quality_score: number }>;
  }
  return data ?? [];
});

// Admin: büyüme özeti
export interface SeoGrowthOverview {
  total_pages: number;
  indexable_pages: number;
  thin_pages: number;
  avg_quality: number;
  by_kind: Array<{ kind: string; total: number; indexable: number; avg_quality: number }>;
  top_brands: Array<{ brand: string; pages: number; indexable: number }>;
  top_models: Array<{ brand: string; model: string; pages: number; quality: number }>;
  top_categories: Array<{ category: string; pages: number }>;
  ai_cache_size: number;
  recent_pages: Array<{ slug: string; kind: string; quality_score: number; indexable: boolean; last_scored_at: string }>;
  threshold: number;
}

export const getSeoGrowthOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<SeoGrowthOverview> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const empty: SeoGrowthOverview = {
      total_pages: 0,
      indexable_pages: 0,
      thin_pages: 0,
      avg_quality: 0,
      by_kind: [],
      top_brands: [],
      top_models: [],
      top_categories: [],
      ai_cache_size: 0,
      recent_pages: [],
      threshold: LANDING_INDEXABLE_THRESHOLD,
    };

    const { data: rows, error } = await supabaseAdmin
      .from("landing_page_registry")
      .select("slug,kind,brand,model,category,quality_score,indexable,last_scored_at")
      .order("last_scored_at", { ascending: false })
      .limit(4000);
    if (error || !rows) {
      console.error("[seo-growth] rows", error);
      return empty;
    }

    const total = rows.length;
    const indexable = rows.filter((r) => r.indexable).length;
    const thin = total - indexable;
    const avgQuality =
      total > 0 ? Math.round((rows.reduce((s, r) => s + (r.quality_score ?? 0), 0) / total) * 10) / 10 : 0;

    const byKindMap = new Map<string, { total: number; indexable: number; sumQ: number }>();
    const brandMap = new Map<string, { pages: number; indexable: number }>();
    const modelMap = new Map<string, { brand: string; model: string; pages: number; sumQ: number }>();
    const catMap = new Map<string, number>();

    for (const r of rows) {
      const k = byKindMap.get(r.kind) ?? { total: 0, indexable: 0, sumQ: 0 };
      k.total += 1;
      if (r.indexable) k.indexable += 1;
      k.sumQ += r.quality_score ?? 0;
      byKindMap.set(r.kind, k);

      if (r.brand) {
        const b = brandMap.get(r.brand) ?? { pages: 0, indexable: 0 };
        b.pages += 1;
        if (r.indexable) b.indexable += 1;
        brandMap.set(r.brand, b);
      }
      if (r.brand && r.model) {
        const key = `${r.brand}||${r.model}`;
        const m = modelMap.get(key) ?? { brand: r.brand, model: r.model, pages: 0, sumQ: 0 };
        m.pages += 1;
        m.sumQ += r.quality_score ?? 0;
        modelMap.set(key, m);
      }
      if (r.category) catMap.set(r.category, (catMap.get(r.category) ?? 0) + 1);
    }

    const { count: aiCount } = await supabaseAdmin
      .from("ai_content_cache")
      .select("*", { count: "exact", head: true });

    return {
      total_pages: total,
      indexable_pages: indexable,
      thin_pages: thin,
      avg_quality: avgQuality,
      by_kind: [...byKindMap.entries()].map(([kind, v]) => ({
        kind,
        total: v.total,
        indexable: v.indexable,
        avg_quality: v.total > 0 ? Math.round((v.sumQ / v.total) * 10) / 10 : 0,
      })),
      top_brands: [...brandMap.entries()]
        .map(([brand, v]) => ({ brand, pages: v.pages, indexable: v.indexable }))
        .sort((a, b) => b.pages - a.pages)
        .slice(0, 10),
      top_models: [...modelMap.values()]
        .map((m) => ({
          brand: m.brand,
          model: m.model,
          pages: m.pages,
          quality: m.pages > 0 ? Math.round((m.sumQ / m.pages) * 10) / 10 : 0,
        }))
        .sort((a, b) => b.pages - a.pages)
        .slice(0, 10),
      top_categories: [...catMap.entries()]
        .map(([category, pages]) => ({ category, pages }))
        .sort((a, b) => b.pages - a.pages)
        .slice(0, 10),
      ai_cache_size: aiCount ?? 0,
      recent_pages: rows.slice(0, 20).map((r) => ({
        slug: r.slug,
        kind: r.kind,
        quality_score: r.quality_score ?? 0,
        indexable: !!r.indexable,
        last_scored_at: r.last_scored_at,
      })),
      threshold: LANDING_INDEXABLE_THRESHOLD,
    };
  },
);
