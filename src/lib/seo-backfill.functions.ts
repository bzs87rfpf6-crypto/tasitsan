import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  buildUniqueTitle,
  buildUniqueDescription,
  computeContentHash,
  primaryOem,
  type SeoPartInput,
} from "./product-seo-meta";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

/** Score threshold — anything below this is considered low-quality and eligible
 * for rewrite even when meta already exists. */
const REWRITE_SCORE_THRESHOLD = 70;
const DEFAULT_BATCH_SIZE = 25;

type SnapshotStats = {
  duplicateGroups: number;
  avgTitleLength: number | null;
  avgDescLength: number | null;
  totalMeta: number;
};

async function snapshotStats(supabaseAdmin: any): Promise<SnapshotStats> {
  const { data } = await supabaseAdmin
    .from("product_seo_meta")
    .select("title,description,content_hash");
  const rows = (data ?? []) as Array<{ title: string; description: string; content_hash: string }>;
  const hashCounts = new Map<string, number>();
  let titleLen = 0, descLen = 0;
  for (const r of rows) {
    titleLen += (r.title ?? "").length;
    descLen += (r.description ?? "").length;
    hashCounts.set(r.content_hash, (hashCounts.get(r.content_hash) ?? 0) + 1);
  }
  let duplicateGroups = 0;
  for (const n of hashCounts.values()) if (n > 1) duplicateGroups += 1;
  return {
    duplicateGroups,
    avgTitleLength: rows.length ? +(titleLen / rows.length).toFixed(1) : null,
    avgDescLength: rows.length ? +(descLen / rows.length).toFixed(1) : null,
    totalMeta: rows.length,
  };
}

/** Start a new backfill run. Snapshots "before" duplicate stats and counts
 * candidates. Idempotent-safe: if a run is already 'running', return it. */
export const startSeoBackfillRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchSize: z.number().int().min(1).max(100).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reuse a running job to avoid parallel runs.
    const { data: existing } = await supabaseAdmin
      .from("seo_backfill_runs")
      .select("*")
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1);
    if (existing && existing.length > 0) return existing[0];

    const before = await snapshotStats(supabaseAdmin);

    // Candidate count: approved parts whose meta is missing OR low-score OR needs_rewrite OR duplicate-hash, excluding manually_edited.
    const { count: approvedCount } = await supabaseAdmin
      .from("parts").select("*", { count: "exact", head: true }).eq("status", "approved");
    const { count: goodCount } = await supabaseAdmin
      .from("product_seo_meta").select("*", { count: "exact", head: true })
      .gte("score", REWRITE_SCORE_THRESHOLD).eq("needs_rewrite", false).eq("manually_edited", false);
    const { count: manualCount } = await supabaseAdmin
      .from("product_seo_meta").select("*", { count: "exact", head: true }).eq("manually_edited", true);
    // Rough candidate estimate — actual selection re-checked each batch.
    const candidates = Math.max(0, (approvedCount ?? 0) - (goodCount ?? 0) - (manualCount ?? 0));

    const { data: run, error } = await supabaseAdmin
      .from("seo_backfill_runs")
      .insert({
        status: "running",
        started_by: context.userId,
        batch_size: data.batchSize ?? DEFAULT_BATCH_SIZE,
        candidates_total: candidates,
        duplicate_groups_before: before.duplicateGroups,
        avg_title_length_before: before.avgTitleLength,
        avg_desc_length_before: before.avgDescLength,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return run;
  });

async function generateFaqsViaGemini(part: SeoPartInput): Promise<Array<{ q: string; a: string }> | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const oem = primaryOem(part);
  const car = [part.brand, part.model, part.year].filter(Boolean).join(" ");
  const specs = [
    part.category ? `Kategori: ${part.category}` : null,
    part.engine_code ? `Motor kodu: ${part.engine_code}` : null,
    part.condition ? `Durum: ${part.condition}` : null,
  ].filter(Boolean).join(" · ");
  const system = "Sen bir Türk yedek parça uzmanısın. SADECE geçerli JSON döndür — açıklama, markdown, code fence yok. Format: {\"faqs\":[{\"q\":\"...\",\"a\":\"...\"}]}. Tam olarak 6 adet SSS üret. Her soru bu ürüne özgü olmalı, jenerik olmayacak.";
  const user = [
    `Ürün: ${part.title}`,
    oem ? `OEM: ${oem}` : null,
    car ? `Uyumlu araç: ${car}` : null,
    specs || null,
    "Sorular: Bu parça hangi araçlarla uyumludur? OEM kodu neyi ifade eder? Nasıl monte edilir? Sıfır mı ikinci el mi? Garanti kapsamı nedir? Değişim belirtileri nelerdir?",
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const raw = j?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);
    const faqs = Array.isArray(parsed?.faqs) ? parsed.faqs : [];
    return faqs
      .filter((f: unknown) => f && typeof f === "object" && "q" in (f as object) && "a" in (f as object))
      .slice(0, 6)
      .map((f: { q: unknown; a: unknown }) => ({ q: String(f.q).slice(0, 200), a: String(f.a).slice(0, 800) }));
  } catch {
    return null;
  }
}

function scoreMeta(p: SeoPartInput, title: string, description: string): number {
  let s = 40;
  if (title.length >= 30 && title.length <= 70) s += 15;
  if (description.length >= 110 && description.length <= 160) s += 15;
  if ((p.oem_codes?.length ?? 0) > 0 || p.oem_code) s += 10;
  if (p.brand && p.model) s += 10;
  if (p.year) s += 5;
  if ((p.description ?? "").trim().length > 40) s += 5;
  return s;
}

/** Process ONE batch. Returns updated run + remaining candidate count.
 * Admin panel polls this repeatedly until remaining=0. */
export const processSeoBackfillBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: run } = await supabaseAdmin
      .from("seo_backfill_runs").select("*").eq("id", data.runId).maybeSingle();
    if (!run) throw new Error("Run bulunamadı");
    if (run.status !== "running") return { run, remaining: 0, batch: [] };

    const batchSize = run.batch_size as number;

    // Pull batch of candidate parts. Priority order:
    //   1) parts with NO meta row yet
    //   2) parts flagged needs_rewrite
    //   3) parts whose meta score < threshold
    //   4) parts whose content_hash appears >1 time (duplicate rewrite)
    // Combined via a UNION-style multi-query for simplicity.

    // (1) missing meta — fetch a page of approved parts, then subtract the ones
    // that already have a meta row. Uses an oversize page to survive filtering.
    const missingPage = await supabaseAdmin
      .from("parts")
      .select("id,title,description,brand,model,year,category,oem_code,oem_codes,engine_code,city,price,condition,stock_quantity")
      .eq("status", "approved")
      .limit(batchSize * 8);
    const pageIds = (missingPage.data ?? []).map((r: { id: string }) => r.id);
    const { data: haveMetaRows } = pageIds.length > 0
      ? await supabaseAdmin.from("product_seo_meta").select("part_id").in("part_id", pageIds)
      : { data: [] as Array<{ part_id: string }> };
    const haveMetaSet = new Set((haveMetaRows ?? []).map((r: { part_id: string }) => r.part_id));
    const missingParts = (missingPage.data ?? []).filter((r: { id: string }) => !haveMetaSet.has(r.id)).slice(0, batchSize);

    let candidates: Array<Record<string, unknown>> = [];
    if (missingParts.length > 0) {
      candidates = missingParts;
    } else {
      // Two-step fallback: fetch a page of meta rows we might replace.
      const { data: rewriteRows } = await supabaseAdmin
        .from("product_seo_meta")
        .select("part_id")
        .eq("manually_edited", false)
        .or(`needs_rewrite.eq.true,score.lt.${REWRITE_SCORE_THRESHOLD}`)
        .limit(batchSize);
      const ids = (rewriteRows ?? []).map((r: { part_id: string }) => r.part_id);
      if (ids.length === 0) {
        // Check for duplicate hash groups.
        const { data: hashRows } = await supabaseAdmin
          .from("product_seo_meta").select("part_id,content_hash").eq("manually_edited", false);
        const groups = new Map<string, string[]>();
        for (const r of (hashRows ?? []) as Array<{ part_id: string; content_hash: string }>) {
          const arr = groups.get(r.content_hash) ?? [];
          arr.push(r.part_id);
          groups.set(r.content_hash, arr);
        }
        const dupIds: string[] = [];
        for (const arr of groups.values()) if (arr.length > 1) dupIds.push(...arr.slice(1));
        if (dupIds.length > 0) {
          const { data: parts } = await supabaseAdmin
            .from("parts")
            .select("id,title,description,brand,model,year,category,oem_code,oem_codes,engine_code,city,price,condition,stock_quantity")
            .in("id", dupIds.slice(0, batchSize));
          candidates = parts ?? [];
        }
      } else {
        const { data: parts } = await supabaseAdmin
          .from("parts")
          .select("id,title,description,brand,model,year,category,oem_code,oem_codes,engine_code,city,price,condition,stock_quantity")
          .in("id", ids);
        candidates = parts ?? [];
      }
    }

    if (candidates.length === 0) {
      // Done — finalize.
      const after = await snapshotStats(supabaseAdmin);
      const { data: finalized } = await supabaseAdmin
        .from("seo_backfill_runs").update({
          status: "completed",
          finished_at: new Date().toISOString(),
          duplicate_groups_after: after.duplicateGroups,
          avg_title_length_after: after.avgTitleLength,
          avg_desc_length_after: after.avgDescLength,
        }).eq("id", data.runId).select("*").single();
      return { run: finalized, remaining: 0, batch: [] };
    }

    // Load existing meta rows for these parts so we can respect manually_edited.
    const partIds = candidates.map((p) => p.id as string);
    const { data: existingMeta } = await supabaseAdmin
      .from("product_seo_meta").select("part_id,manually_edited,ai_faqs,content_hash,score").in("part_id", partIds);
    const metaMap = new Map<string, { manually_edited: boolean; ai_faqs: unknown; content_hash: string; score: number }>();
    for (const m of (existingMeta ?? []) as any[]) metaMap.set(m.part_id, m);

    let processed = 0, skipped = 0, rewritten = 0, faqGen = 0, failed = 0;
    const batchReport: Array<{ id: string; action: string; title?: string }> = [];
    let lastError: string | null = null;

    for (const raw of candidates) {
      const p = raw as unknown as SeoPartInput;
      const existing = metaMap.get(p.id);
      if (existing?.manually_edited) {
        skipped += 1;
        batchReport.push({ id: p.id, action: "skipped_manual" });
        continue;
      }

      // Attempt with retry (2 tries — computation is deterministic, retry mainly for FAQ).
      let attemptError: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // Compute unique title with collision loop.
          let variant = 0;
          let title = buildUniqueTitle(p, variant);
          for (let i = 0; i < 5; i++) {
            const { data: clash } = await supabaseAdmin
              .from("product_seo_meta").select("part_id").eq("title", title).neq("part_id", p.id).limit(1);
            if (!clash || clash.length === 0) break;
            variant += 1;
            title = buildUniqueTitle(p, variant);
          }
          const description = buildUniqueDescription(p);
          const hash = computeContentHash(p);
          const score = scoreMeta(p, title, description);

          // Data-rich check: OEM + brand + model. Skip FAQ generation otherwise.
          const dataRich = Boolean((primaryOem(p)) && p.brand && p.model);
          let ai_faqs: Array<{ q: string; a: string }> | null = (existing?.ai_faqs as any) ?? null;
          if (dataRich && (!ai_faqs || (Array.isArray(ai_faqs) && ai_faqs.length === 0))) {
            const { data: cached } = await supabaseAdmin
              .from("ai_content_cache").select("content").eq("scope", "faq").eq("scope_key", hash).maybeSingle();
            const cachedFaqs = (cached?.content as { faqs?: unknown } | null)?.faqs;
            if (Array.isArray(cachedFaqs)) {
              ai_faqs = cachedFaqs as Array<{ q: string; a: string }>;
            } else {
              const generated = await generateFaqsViaGemini(p);
              if (generated && generated.length > 0) {
                ai_faqs = generated;
                faqGen += 1;
                await supabaseAdmin.from("ai_content_cache").upsert({
                  scope: "faq",
                  scope_key: hash,
                  content: { faqs: generated } as unknown as import("@/integrations/supabase/types").Json,
                  model: "google/gemini-3.5-flash",
                  generated_at: new Date().toISOString(),
                }, { onConflict: "scope,scope_key" });
              }
            }
          }

          await supabaseAdmin.from("product_seo_meta").upsert({
            part_id: p.id,
            title,
            description,
            title_variant: variant,
            content_hash: hash,
            score,
            needs_rewrite: false,
            ai_faqs,
            last_backfill_run_id: data.runId,
            manually_edited: false,
            generated_at: new Date().toISOString(),
          }, { onConflict: "part_id" });

          processed += 1;
          if (existing) rewritten += 1;
          batchReport.push({ id: p.id, action: existing ? "rewritten" : "created", title });
          attemptError = null;
          break;
        } catch (err) {
          attemptError = err instanceof Error ? err.message : String(err);
          if (attempt === 1) {
            failed += 1;
            lastError = attemptError;
            batchReport.push({ id: p.id, action: "failed" });
          }
        }
      }
    }

    // Update run counters.
    const { data: updated } = await supabaseAdmin
      .from("seo_backfill_runs").update({
        processed_count: (run.processed_count as number) + processed,
        skipped_count: (run.skipped_count as number) + skipped,
        rewritten_count: (run.rewritten_count as number) + rewritten,
        faq_generated_count: (run.faq_generated_count as number) + faqGen,
        failed_count: (run.failed_count as number) + failed,
        last_error: lastError ?? (run.last_error as string | null),
      }).eq("id", data.runId).select("*").single();

    // Remaining estimate.
    const { count: approvedCount } = await supabaseAdmin
      .from("parts").select("*", { count: "exact", head: true }).eq("status", "approved");
    const { count: goodCount } = await supabaseAdmin
      .from("product_seo_meta").select("*", { count: "exact", head: true })
      .gte("score", REWRITE_SCORE_THRESHOLD).eq("needs_rewrite", false).eq("manually_edited", false);
    const { count: manualCount } = await supabaseAdmin
      .from("product_seo_meta").select("*", { count: "exact", head: true }).eq("manually_edited", true);
    const remaining = Math.max(0, (approvedCount ?? 0) - (goodCount ?? 0) - (manualCount ?? 0));

    return { run: updated, remaining, batch: batchReport };
  });

/** Cancel or finalize a run manually. */
export const finalizeSeoBackfillRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid(), status: z.enum(["completed", "cancelled"]).default("cancelled") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const after = await snapshotStats(supabaseAdmin);
    const { data: updated } = await supabaseAdmin
      .from("seo_backfill_runs").update({
        status: data.status,
        finished_at: new Date().toISOString(),
        duplicate_groups_after: after.duplicateGroups,
        avg_title_length_after: after.avgTitleLength,
        avg_desc_length_after: after.avgDescLength,
      }).eq("id", data.runId).select("*").single();
    return updated;
  });

/** Final report with indexability improvement estimate. */
export const getSeoBackfillReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const run = data.runId
      ? (await supabaseAdmin.from("seo_backfill_runs").select("*").eq("id", data.runId).maybeSingle()).data
      : (await supabaseAdmin.from("seo_backfill_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle()).data;
    if (!run) return null;

    const [{ count: approvedTotal }, { count: withMeta }, { count: highQuality }] = await Promise.all([
      supabaseAdmin.from("parts").select("*", { count: "exact", head: true }).eq("status", "approved"),
      supabaseAdmin.from("product_seo_meta").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("product_seo_meta").select("*", { count: "exact", head: true }).gte("score", REWRITE_SCORE_THRESHOLD),
    ]);

    const dupBefore = run.duplicate_groups_before ?? 0;
    const dupAfter = run.duplicate_groups_after ?? 0;
    const total = withMeta ?? 0;
    const dupRateBefore = total > 0 ? +((dupBefore * 100) / total).toFixed(2) : 0;
    const dupRateAfter = total > 0 ? +((dupAfter * 100) / total).toFixed(2) : 0;

    // Google indexability heuristic: pages with unique title+description+score>=70 have
    // an ~85% indexability rate vs ~35% for duplicates/thin. Estimate improvement as
    // (highQuality/approved) - baselineCoverage.
    const coverage = approvedTotal && approvedTotal > 0 ? Math.round(((highQuality ?? 0) * 100) / approvedTotal) : 0;
    const indexabilityLift = Math.max(0, Math.min(100, Math.round(coverage * 0.85 + (100 - dupRateAfter) * 0.15 - 40)));

    return {
      run,
      approvedTotal: approvedTotal ?? 0,
      withMeta: withMeta ?? 0,
      highQuality: highQuality ?? 0,
      coveragePercent: coverage,
      duplicateRateBefore: dupRateBefore,
      duplicateRateAfter: dupRateAfter,
      avgTitleLengthBefore: run.avg_title_length_before,
      avgTitleLengthAfter: run.avg_title_length_after,
      avgDescLengthBefore: run.avg_desc_length_before,
      avgDescLengthAfter: run.avg_desc_length_after,
      indexabilityLiftPercent: indexabilityLift,
    };
  });

/** Mark a single row as manually edited (do-not-overwrite). */
export const markSeoMetaManuallyEdited = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ partId: z.string().uuid(), manuallyEdited: z.boolean().default(true) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated } = await supabaseAdmin
      .from("product_seo_meta").update({ manually_edited: data.manuallyEdited }).eq("part_id", data.partId).select("*").single();
    return updated;
  });
