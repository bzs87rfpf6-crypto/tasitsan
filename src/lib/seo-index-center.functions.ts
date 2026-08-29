// SEO İndeks Merkezi — Google Search Console odaklı indeksleme durumu özeti.
// Tüm sayımlar sunucu tarafında, servis edilen head() kurallarıyla birebir aynı
// mantıkla hesaplanır (ürün sayfası: status = 'approved' → index,follow).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

export interface SeoIndexCenter {
  total_products: number;
  indexable: number;
  noindex: number;
  canonical_ok: number;
  missing_meta: number;
  missing_slug: number;
  redirects_301: number;
  landing_total: number;
  landing_indexable: number;
  index_rate: number; // % — indekslenebilir ürün oranı
  avg_score: number | null;
  low_score: number;
  server_errors_24h: number;
  indexnow_pending: number;
  last_indexnow_at: string | null;
  sitemap_url: string;
  robots_blocked: string[];
}

async function assertAdmin(supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }> }, userId: string) {
  await assertOwnerAdmin(supabase, userId);
}

export const getSeoIndexCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SeoIndexCenter> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const head = (q: any) => q.select("*", { count: "exact", head: true });

    const [
      total, approved, missingSlug, redirects, meta, landing, landingIdx, idxQueue, errors,
    ] = await Promise.all([
      head(db.from("parts")),
      head(db.from("parts")).eq("status", "approved"),
      head(db.from("parts")).eq("status", "approved").or("seo_slug.is.null,seo_slug.eq."),
      head(db.from("parts_slug_history")),
      db.from("product_seo_meta").select("score").limit(5000),
      head(db.from("landing_page_registry")),
      head(db.from("landing_page_registry")).eq("indexable", true),
      head(db.from("indexnow_queue")).eq("status", "pending"),
      head(db.from("security_events"))
        .gte("created_at", new Date(Date.now() - 86400_000).toISOString())
        .ilike("event_type", "%5xx%"),
    ]);

    const scores = ((meta.data ?? []) as Array<{ score: number | null }>)
      .map((r) => r.score).filter((s): s is number => typeof s === "number");
    const avg = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

    const { data: lastFlush } = await db
      .from("indexnow_queue").select("sent_at").not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(1).maybeSingle();

    const totalProducts = total.count ?? 0;
    const indexable = approved.count ?? 0;
    const metaRows = scores.length;

    return {
      total_products: totalProducts,
      indexable,
      noindex: Math.max(0, totalProducts - indexable),
      canonical_ok: indexable, // her ürün head()'i kendi URL'sini canonical verir
      missing_meta: Math.max(0, indexable - metaRows),
      missing_slug: missingSlug.count ?? 0,
      redirects_301: redirects.count ?? 0,
      landing_total: landing.count ?? 0,
      landing_indexable: landingIdx.count ?? 0,
      index_rate: totalProducts ? Math.round((indexable / totalProducts) * 100) : 0,
      avg_score: avg,
      low_score: scores.filter((s) => s < 55).length,
      server_errors_24h: errors.count ?? 0,
      indexnow_pending: idxQueue.count ?? 0,
      last_indexnow_at: lastFlush?.sent_at ?? null,
      sitemap_url: "https://www.tasitsan.com.tr/sitemap.xml",
      robots_blocked: ["/admin", "/api/", "/account", "/auth", "/cart", "/reset-password"],
    };
  });
