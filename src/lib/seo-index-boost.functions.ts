// SEO INDEX BOOST 2.0 — yönetici server fonksiyonları.
// Google Search Console URL Inspection ile indeks durumu senkronizasyonu,
// otomatik iyileştirme kuyruğu ve "Google İndeks Bekleyen Ürünler" listesi.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";
const ORIGIN = "https://www.tasitsan.com.tr";

export interface IndexPendingRow {
  part_id: string;
  title: string;
  seo_slug: string | null;
  url: string;
  score: number;
  index_state: string;
  index_verdict: string | null;
  last_crawl_at: string | null;
  gsc_checked_at: string | null;
  internal_links_count: number;
  alt_texts_count: number;
  has_meta: boolean;
  canonical_ok: boolean;
  schema_ok: boolean;
  issues: string[];
  in_boost_queue: boolean;
  boosted_at: string | null;
  total_count: number;
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  await assertOwnerAdmin(context.supabase, context.userId);
}

/** Liste: Google indeks bekleyen / zayıf ürünler. */
export const getSeoIndexPending = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      filter: z.enum(["pending", "not_indexed", "low_score", "indexed", "all"]).default("pending"),
      limit: z.number().int().min(1).max(500).default(50),
      offset: z.number().int().min(0).default(0),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { data: rows, error } = await (context.supabase as any).rpc("seo_index_pending", {
      _filter: data.filter, _limit: data.limit, _offset: data.offset,
    });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as IndexPendingRow[];
    return { rows: list, total: list[0]?.total_count ?? 0 };
  });

function mapCoverage(state: string | undefined, verdict: string | undefined): string {
  const s = (state ?? "").toLowerCase();
  if (verdict === "PASS" || s.includes("submitted and indexed") || s.includes("indexed, not submitted")) return "indexed";
  if (s.includes("crawled")) return "crawled_not_indexed";
  if (s.includes("discovered")) return "discovered_not_indexed";
  if (s.includes("excluded") || s.includes("duplicate") || s.includes("alternate")) return "excluded";
  if (s.includes("error") || verdict === "FAIL") return "error";
  return "unknown";
}

/** GSC URL Inspection ile ürün URL'lerinin indeks durumunu günceller. */
export const syncGscIndexStates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(50).default(20) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const lk = process.env['LOVABLE_API_KEY'];
    const gk = process.env['GOOGLE_SEARCH_CONSOLE_API_KEY'];
    if (!lk || !gk) throw new Error("Google Search Console bağlantısı yapılandırılmamış.");
    const headers = { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": gk, "Content-Type": "application/json" };

    // Doğrulanmış property'yi çalışma anında çöz.
    const sitesRes = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers });
    if (!sitesRes.ok) throw new Error(`Search Console property listesi alınamadı [${sitesRes.status}]: ${await sitesRes.text()}`);
    const entries: Array<{ siteUrl: string; permissionLevel?: string }> = (await sitesRes.json())?.siteEntry ?? [];
    const matches = entries.filter(
      (e) => e.permissionLevel !== "siteUnverifiedUser" &&
        (e.siteUrl === "sc-domain:tasitsan.com.tr" || e.siteUrl === `${ORIGIN}/` || e.siteUrl === "https://tasitsan.com.tr/"),
    );
    if (matches.length === 0) throw new Error("tasitsan.com.tr için doğrulanmış Search Console property bulunamadı.");
    if (matches.length > 1) {
      return { selection_required: true, candidates: matches.map((m) => m.siteUrl), checked: 0, updated: [] as any[] };
    }
    const siteUrl = matches[0].siteUrl;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: cands } = await db
      .from("product_seo_meta")
      .select("part_id, parts!inner(id, seo_slug, status)")
      .eq("parts.status", "approved")
      .order("gsc_checked_at", { ascending: true, nullsFirst: true })
      .limit(data.limit);

    const updated: Array<{ part_id: string; url: string; index_state: string; verdict: string | null }> = [];
    for (const row of (cands ?? []) as any[]) {
      const slug = row.parts?.seo_slug;
      if (!slug) continue;
      const url = `${ORIGIN}/parts/${slug}`;
      try {
        const res = await fetch(`${GATEWAY}/v1/urlInspection/index:inspect`, {
          method: "POST", headers, body: JSON.stringify({ inspectionUrl: url, siteUrl }),
        });
        if (!res.ok) {
          console.error(`URL Inspection failed [${res.status}]: ${await res.text()}`);
          continue;
        }
        const j: any = await res.json();
        const idx = j?.inspectionResult?.indexStatusResult ?? {};
        const state = mapCoverage(idx.coverageState, idx.verdict);
        await db.from("product_seo_meta").update({
          index_state: state,
          index_verdict: idx.coverageState ?? idx.verdict ?? null,
          last_crawl_at: idx.lastCrawlTime ?? null,
          gsc_checked_at: new Date().toISOString(),
        }).eq("part_id", row.part_id);
        updated.push({ part_id: row.part_id, url, index_state: state, verdict: idx.coverageState ?? null });
      } catch (e) {
        console.error("URL Inspection error", e);
      }
    }
    return { selection_required: false, checked: (cands ?? []).length, updated };
  });

/** İyileştirme kuyruğundaki ürünleri toplu güçlendirir. */
export const runSeoIndexBoost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      limit: z.number().int().min(1).max(50).default(10),
      partIds: z.array(z.string().uuid()).max(50).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { boostPart } = await import("./seo-index-boost.server");
    const db = supabaseAdmin as any;

    let ids = data.partIds ?? [];
    if (ids.length === 0) {
      // Meta kaydı hiç olmayan onaylı ürünler + puanı 80 altı kuyruk.
      const { data: q, error } = await db.rpc("seo_boost_candidates", { _limit: data.limit });
      if (error) throw new Error(error.message);
      ids = ((q ?? []) as Array<{ part_id: string }>).map((r) => r.part_id);
    }

    const results = [];
    let failed = 0;
    for (const id of ids) {
      try {
        const r = await boostPart(db, id);
        if (r) results.push(r);
      } catch (e) {
        failed += 1;
        console.error("boostPart failed", id, e);
      }
    }

    const { data: ov } = await db.rpc("seo_boost_overview");
    const remaining = Number((ov as any)?.boost_queue ?? 0) + Number((ov as any)?.no_meta ?? 0);

    return { processed: results.length, failed, remaining, results };
  });

/** Kuyruk özeti kartları. */
export const getSeoIndexBoostStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { data, error } = await (context.supabase as any).rpc("seo_boost_overview");
    if (error) throw new Error(error.message);
    const o = (data ?? {}) as Record<string, number>;
    return {
      approved: Number(o.approved ?? 0),
      no_meta: Number(o.no_meta ?? 0),
      boost_queue: Number(o.boost_queue ?? 0) + Number(o.no_meta ?? 0),
      not_indexed: Number(o.not_indexed ?? 0),
      indexed: Number(o.indexed ?? 0),
      gsc_checked: Number(o.gsc_checked ?? 0),
      boosted: Number(o.boosted ?? 0),
    };
  });
