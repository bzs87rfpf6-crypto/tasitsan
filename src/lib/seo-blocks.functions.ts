// Server functions for homepage SEO interlinking blocks + admin SEO report.
// Public read of approved listings; loaded once during SSR for crawler visibility.
import { createServerFn } from "@tanstack/react-start";

export interface SeoBlockPart {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  oem_code: string | null;
  city: string | null;
  price: number | null;
  seo_slug: string | null;
}

export interface PopularOem {
  oem: string;
  count: number;
}

export interface HomeSeoBlocks {
  popularOems: PopularOem[];
  toyotaHilux: SeoBlockPart[];
  mitsubishiL200: SeoBlockPart[];
  construction: SeoBlockPart[];
  recent: SeoBlockPart[];
}

const PART_COLS = "id,title,brand,model,oem_code,city,price,seo_slug";

async function fetchSlice(
  client: { from: (t: string) => any },
  filter: (q: any) => any,
  limit: number,
): Promise<SeoBlockPart[]> {
  let q = client.from("parts").select(PART_COLS).eq("status", "approved").gt("stock_quantity", 0);
  q = filter(q);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []) as SeoBlockPart[];
}

export const getHomeSeoBlocks = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeSeoBlocks> => {
    const { serverReadClient: supabaseAdmin } = await import("@/lib/supabase-admin.server");

    const [toyotaHilux, mitsubishiL200, construction, recent, oemRes] = await Promise.all([
      fetchSlice(supabaseAdmin, (q) => q.ilike("brand", "%toyota%").ilike("model", "%hilux%"), 8),
      fetchSlice(supabaseAdmin, (q) => q.ilike("brand", "%mitsubishi%").ilike("model", "%l200%"), 8),
      fetchSlice(supabaseAdmin, (q) => q.eq("vehicle_class", "construction"), 8),
      fetchSlice(supabaseAdmin, (q) => q, 12),
      supabaseAdmin
        .from("oem_searches")
        .select("oem")
        .not("oem", "is", null)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(2000),
    ]);

    const tally = new Map<string, number>();
    for (const row of (oemRes.data ?? []) as { oem: string }[]) {
      const k = (row.oem ?? "").trim().toUpperCase();
      if (!k || k.length < 4) continue;
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }
    const popularOems: PopularOem[] = Array.from(tally.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([oem, count]) => ({ oem, count }));

    return { popularOems, toyotaHilux, mitsubishiL200, construction, recent };
  },
);

export interface SeoReport {
  totalApproved: number;
  sitemapCount: number;
  missingOem: number;
  missingDescription: number;
  missingPhotos: number;
  outOfStock: number;
  riskySamples: Array<{ id: string; title: string; reason: string }>;
}

export const getSeoReport = createServerFn({ method: "GET" }).handler(async (): Promise<SeoReport> => {
  const { serverReadClient: supabaseAdmin } = await import("@/lib/supabase-admin.server");

  const head = (q: any) => q.select("id", { count: "exact", head: true });

  const [totalRes, sitemapRes, noOemRes, noDescRes, noPhotosRes, outStockRes, riskyRes] =
    await Promise.all([
      head(supabaseAdmin.from("parts")).eq("status", "approved"),
      head(supabaseAdmin.from("parts")).eq("status", "approved").gt("stock_quantity", 0),
      head(supabaseAdmin.from("parts")).eq("status", "approved").is("oem_code", null),
      head(supabaseAdmin.from("parts")).eq("status", "approved").or("description.is.null,description.eq."),
      head(supabaseAdmin.from("parts")).eq("status", "approved").or("photos.is.null,photos.eq.{}"),
      head(supabaseAdmin.from("parts")).eq("status", "approved").or("stock_quantity.is.null,stock_quantity.eq.0"),
      supabaseAdmin
        .from("parts")
        .select("id,title,oem_code,description,photos")
        .eq("status", "approved")
        .is("oem_code", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const risky: SeoReport["riskySamples"] = [];
  for (const r of (riskyRes.data ?? []) as Array<{
    id: string;
    title: string;
    oem_code: string | null;
    description: string | null;
    photos: string[] | null;
  }>) {
    const issues: string[] = [];
    if (!r.oem_code) issues.push("OEM yok");
    if (!r.description || r.description.trim().length < 20) issues.push("Açıklama yok/kısa");
    if (!r.photos || r.photos.length === 0) issues.push("Görsel yok");
    if (issues.length >= 2) risky.push({ id: r.id, title: r.title, reason: issues.join(" · ") });
  }

  return {
    totalApproved: totalRes.count ?? 0,
    sitemapCount: sitemapRes.count ?? 0,
    missingOem: noOemRes.count ?? 0,
    missingDescription: noDescRes.count ?? 0,
    missingPhotos: noPhotosRes.count ?? 0,
    outOfStock: outStockRes.count ?? 0,
    riskySamples: risky.slice(0, 10),
  };
});
