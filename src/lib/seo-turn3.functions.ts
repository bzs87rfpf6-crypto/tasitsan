// SEO Faz 7 — Tur 3 enrichment engine.
// For each candidate product: normalize attributes, build 8-12 internal links,
// compute alt texts, calculate 0-100 SEO score with breakdown, and persist to
// product_seo_meta. Respects manually_edited=true (never overwrites content —
// but still refreshes attributes, links, score).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeAttributes, buildAltTexts, type RawPartRow, type NormalizedAttributes } from "./seo-attributes";
import { computeSeoScore } from "./seo-scoring";
import { buildPartParam } from "./part-slug";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

const DEFAULT_BATCH = 25;
const MAX_LINKS = 12;
const MIN_LINKS = 6;

const PART_SELECT =
  "id,seo_slug,title,description,brand,model,year,category,oem_code,oem_codes,oem_families,oem_family,engine_code,part_type,vehicle_class,city,photos,condition";

type LinkItem = { url: string; title: string; reason: string };

function partUrl(part: { id: string; seo_slug?: string | null; title?: string | null; oem_code?: string | null; oem_codes?: string[] | null }): string {
  return `https://www.tasitsan.com.tr/parts/${buildPartParam(part)}`;
}

/** Discover related products using several signals and dedupe.
 *  Never links to self, never emits duplicate URLs, capped at MAX_LINKS. */
async function buildInternalLinks(
  supabaseAdmin: any,
  current: RawPartRow,
  attrs: NormalizedAttributes,
): Promise<LinkItem[]> {
  const out: LinkItem[] = [];
  const seen = new Set<string>([current.id]);

  const add = (rows: Array<{ id: string; title: string; seo_slug: string | null; oem_code?: string | null; oem_codes?: string[] | null }>, reason: string) => {
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ url: partUrl(r), title: r.title, reason });
      if (out.length >= MAX_LINKS) return;
    }
  };

  // 1) Same OEM family (strongest replacement signal)
  if (attrs.oem_primary) {
    const { data } = await supabaseAdmin
      .from("parts")
      .select("id,title,seo_slug,oem_code,oem_codes")
      .eq("status", "approved")
      .neq("id", current.id)
      .contains("oem_codes", [attrs.oem_primary])
      .limit(5);
    add(data ?? [], "same_oem");
  }
  if (out.length >= MAX_LINKS) return out;

  // 2) Same vehicle (brand + model)
  if (attrs.brand && attrs.model) {
    const { data } = await supabaseAdmin
      .from("parts")
      .select("id,title,seo_slug,oem_code,oem_codes")
      .eq("status", "approved")
      .neq("id", current.id)
      .eq("brand", attrs.brand)
      .eq("model", attrs.model)
      .limit(5);
    add(data ?? [], "same_vehicle");
  }
  if (out.length >= MAX_LINKS) return out;

  // 3) Same category + brand (related within same maker line)
  if (attrs.category && attrs.brand) {
    const { data } = await supabaseAdmin
      .from("parts")
      .select("id,title,seo_slug")
      .eq("status", "approved")
      .neq("id", current.id)
      .eq("category", attrs.category)
      .eq("brand", attrs.brand)
      .limit(4);
    add(data ?? [], "same_category_brand");
  }
  if (out.length >= MAX_LINKS) return out;

  // 4) Same category (fallback)
  if (attrs.category) {
    const { data } = await supabaseAdmin
      .from("parts")
      .select("id,title,seo_slug")
      .eq("status", "approved")
      .neq("id", current.id)
      .eq("category", attrs.category)
      .limit(4);
    add(data ?? [], "same_category");
  }

  return out.slice(0, MAX_LINKS);
}

/** Process ONE batch of enrichment. Idempotent — safe to call repeatedly. */
export const processSeoEnrichmentBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      batchSize: z.number().int().min(1).max(100).optional(),
      // If true, only pick rows whose enriched_at is NULL or older than 24h.
      staleOnly: z.boolean().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const batchSize = data.batchSize ?? DEFAULT_BATCH;

    // Priority: never-enriched first, then stale (>24h), then lowest score.
    const staleCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    let candIds: string[] = [];

    const { data: never } = await supabaseAdmin
      .from("product_seo_meta")
      .select("part_id")
      .is("enriched_at", null)
      .limit(batchSize);
    candIds = (never ?? []).map((r: { part_id: string }) => r.part_id);

    if (candIds.length < batchSize) {
      const need = batchSize - candIds.length;
      const { data: stale } = await supabaseAdmin
        .from("product_seo_meta")
        .select("part_id")
        .lt("enriched_at", staleCutoff)
        .order("score", { ascending: true })
        .limit(need);
      for (const r of (stale ?? []) as Array<{ part_id: string }>) {
        if (!candIds.includes(r.part_id)) candIds.push(r.part_id);
      }
    }

    if (candIds.length === 0) {
      return { processed: 0, updated: [], remaining: 0 };
    }

    const { data: parts } = await supabaseAdmin
      .from("parts").select(PART_SELECT).in("id", candIds);
    const { data: metas } = await supabaseAdmin
      .from("product_seo_meta")
      .select("part_id,title,description,content_hash,manually_edited,ai_faqs")
      .in("part_id", candIds);
    const metaMap = new Map<string, any>();
    for (const m of (metas ?? []) as any[]) metaMap.set(m.part_id, m);

    // Compute duplicate hash counts once for this batch.
    const hashes = Array.from(new Set((metas ?? []).map((m: any) => m.content_hash).filter(Boolean)));
    const dupCount = new Map<string, number>();
    if (hashes.length > 0) {
      const { data: allWith } = await supabaseAdmin
        .from("product_seo_meta").select("content_hash").in("content_hash", hashes);
      for (const r of (allWith ?? []) as Array<{ content_hash: string }>) {
        dupCount.set(r.content_hash, (dupCount.get(r.content_hash) ?? 0) + 1);
      }
    }

    const updates: Array<{ id: string; score: number; issues: string[]; links: number }> = [];
    let failed = 0;

    for (const raw of (parts ?? []) as RawPartRow[]) {
      try {
        const meta = metaMap.get(raw.id);
        if (!meta) continue; // must have base meta from Tur 2

        const attrs = normalizeAttributes(raw);
        const links = await buildInternalLinks(supabaseAdmin, raw, attrs);
        const alts = buildAltTexts(raw, attrs);
        const faqsCount = Array.isArray(meta.ai_faqs) ? meta.ai_faqs.length : 0;
        const photosCount = (raw.photos ?? []).filter((u) => typeof u === "string").length;
        const dup = dupCount.get(meta.content_hash) ?? 1;

        const score = computeSeoScore({
          title: meta.title ?? "",
          description: meta.description ?? "",
          content_hash: meta.content_hash ?? "",
          duplicate_hash_count: dup,
          faqs_count: faqsCount,
          internal_links_count: links.length,
          photos_count: photosCount,
          alt_texts_count: alts.length,
          indexable: true, // parts.$id has no noindex by default
          canonical_ok: true, // route emits self-canonical
          attrs,
          own_description_length: (raw.description ?? "").length,
        });

        // Additional structural issues
        const extraIssues: string[] = [];
        if (links.length < MIN_LINKS) extraIssues.push("few_internal_links");
        if (attrs.oem_all.length === 0) extraIssues.push("missing_oem");
        if (!attrs.year) extraIssues.push("missing_year");
        const allIssues = Array.from(new Set([...score.issues, ...extraIssues]));

        type Json = import("@/integrations/supabase/types").Json;
        await supabaseAdmin.from("product_seo_meta").update({
          attributes: attrs as unknown as Json,
          internal_links: links as unknown as Json,
          alt_texts: alts as unknown as Json,
          score: score.score,
          score_breakdown: score.breakdown as unknown as Json,
          issues: allIssues as unknown as Json,
          needs_rewrite: score.score < 55,
          enriched_at: new Date().toISOString(),
        }).eq("part_id", raw.id);

        updates.push({ id: raw.id, score: score.score, issues: allIssues, links: links.length });
      } catch {
        failed += 1;
      }
    }

    // Remaining count = rows still lacking enriched_at.
    const { count: remaining } = await supabaseAdmin
      .from("product_seo_meta").select("*", { count: "exact", head: true }).is("enriched_at", null);

    return { processed: updates.length, failed, updated: updates, remaining: remaining ?? 0 };
  });

/** Dashboard aggregates. */
export const getSeoScoreDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ count: totalMeta }, { count: enriched }, { count: totalParts }] = await Promise.all([
      supabaseAdmin.from("product_seo_meta").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("product_seo_meta").select("*", { count: "exact", head: true }).not("enriched_at", "is", null),
      supabaseAdmin.from("parts").select("*", { count: "exact", head: true }).eq("status", "approved"),
    ]);

    // Pull scores + issues (cap to 5000 for aggregation — plenty for dashboard).
    const { data: rows } = await supabaseAdmin
      .from("product_seo_meta")
      .select("part_id,score,issues,internal_links,attributes,content_hash,title")
      .not("enriched_at", "is", null)
      .limit(5000);

    const list = (rows ?? []) as Array<{
      part_id: string; score: number; issues: unknown; internal_links: unknown;
      attributes: unknown; content_hash: string; title: string;
    }>;

    const buckets = { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 };
    const issueCounts = new Map<string, number>();
    let scoreSum = 0;
    let missingAttrs = 0, missingLinks = 0;
    const dupCount = new Map<string, number>();

    for (const r of list) {
      scoreSum += r.score;
      if (r.score >= 85) buckets.excellent += 1;
      else if (r.score >= 70) buckets.good += 1;
      else if (r.score >= 55) buckets.fair += 1;
      else if (r.score >= 40) buckets.poor += 1;
      else buckets.critical += 1;

      const iss = Array.isArray(r.issues) ? (r.issues as string[]) : [];
      for (const code of iss) issueCounts.set(code, (issueCounts.get(code) ?? 0) + 1);

      const attrs = (r.attributes as Partial<NormalizedAttributes> | null) ?? {};
      if (!attrs.oem_primary || !attrs.brand || !attrs.model) missingAttrs += 1;
      const linksLen = Array.isArray(r.internal_links) ? (r.internal_links as unknown[]).length : 0;
      if (linksLen < MIN_LINKS) missingLinks += 1;

      dupCount.set(r.content_hash, (dupCount.get(r.content_hash) ?? 0) + 1);
    }

    const topIssues = Array.from(issueCounts.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, count]) => ({ code, count }));

    const lowestBase = [...list]
      .sort((a, b) => a.score - b.score).slice(0, 20)
      .map((r) => ({ part_id: r.part_id, title: r.title, score: r.score }));

    const lowestIds = lowestBase.map((r) => r.part_id);
    const { data: lowestParts } = lowestIds.length
      ? await supabaseAdmin
        .from("parts")
        .select("id,seo_slug,title,oem_code,oem_codes")
        .in("id", lowestIds)
      : { data: [] };
    const partById = new Map((lowestParts ?? []).map((p: any) => [p.id, p]));
    const lowest = lowestBase.map((r) => {
      const p = partById.get(r.part_id);
      return {
        id: r.part_id,
        part_id: r.part_id,
        seo_slug: p?.seo_slug ?? null,
        title: p?.title ?? r.title,
        oem_code: p?.oem_code ?? null,
        oem_codes: p?.oem_codes ?? null,
        score: r.score,
      };
    });

    const duplicateClusters = Array.from(dupCount.entries())
      .filter(([, c]) => c > 1)
      .sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([hash, count]) => ({ content_hash: hash, count }));

    return {
      totalParts: totalParts ?? 0,
      totalMeta: totalMeta ?? 0,
      enriched: enriched ?? 0,
      avgScore: list.length ? +(scoreSum / list.length).toFixed(1) : null,
      buckets,
      topIssues,
      lowestScoring: lowest,
      missingAttributes: missingAttrs,
      missingInternalLinks: missingLinks,
      duplicateClusters,
      duplicateClusterCount: duplicateClusters.length,
    };
  });
