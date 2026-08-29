/**
 * Admin server fns for OEM image jobs panel.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  await assertOwnerAdmin(context.supabase, context.userId);
}

export const getImageJobsProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.rpc("part_image_jobs_progress");
    if (error) throw new Error(error.message);
    return { progress: data };
  });

export const enqueueMissingImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(20000).default(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: count, error } = await context.supabase.rpc("enqueue_missing_part_images", {
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return { enqueued: count as number };
  });

export const retryFailedImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ maxAttempts: z.number().int().min(1).max(10).default(3) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: count, error } = await context.supabase.rpc("retry_failed_part_images", {
      _max_attempts: data.maxAttempts,
    });
    if (error) throw new Error(error.message);
    return { reset: count as number };
  });

interface JobRow {
  id: string;
  part_id: string;
  oem_code: string;
  status: string;
  attempts: number;
  last_error: string | null;
  image_url: string | null;
  source: string | null;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  confidence: number | null;
  confidence_band: string | null;
  score_breakdown: {
    oem: number;
    brand: number;
    title: number;
    visual: number;
    total: number;
  } | null;
  rejected: boolean;
  rejection_reason: string | null;
}

export const recentImageJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        minConfidence: z.number().min(0).max(100).default(0),
        includeRejected: z.boolean().default(true),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = context.supabase
      .from("part_image_jobs")
      .select(
        "id, part_id, oem_code, status, attempts, last_error, image_url, source, duration_ms, started_at, finished_at, created_at, confidence, confidence_band, score_breakdown, rejected, rejection_reason",
      )
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.minConfidence > 0) q = q.gte("confidence", data.minConfidence);
    if (!data.includeRejected) q = q.eq("rejected", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const jobs: JobRow[] = (rows ?? []) as JobRow[];
    return { jobs };
  });

export const runImageWorkerNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const base = process.env.PUBLIC_SITE_URL ?? "";
    const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
    if (!apiKey) throw new Error("SUPABASE_PUBLISHABLE_KEY tanımsız.");
    // Best effort; call the public worker route on the same origin.
    const url = base
      ? `${base.replace(/\/$/, "")}/api/public/hooks/image-resolver`
      : `/api/public/hooks/image-resolver`;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { apikey: apiKey, "Content-Type": "application/json" },
      });
      const body = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, body };
    } catch (e) {
      return { ok: false, status: 0, body: { error: e instanceof Error ? e.message : String(e) } };
    }
  });

export interface DomainStat {
  domain: string;
  attempts: number;
  successes: number;
  user_visible: number;
  avg_confidence: number | null;
  success_rate: number;
}

/**
 * "En Başarılı Domainler" raporu — part_image_jobs.source kolonundan agregat üretir.
 * Worker artık successful job'ın kaynak domainini source alanına yazıyor (örn. "oemotoyedekparca.com").
 */
export const topImageDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ rows: DomainStat[]; total_done: number; total_failed: number }> => {
      await assertAdmin(context);
      const { data, error } = await context.supabase
        .from("part_image_jobs")
        .select("status, source, confidence, rejected")
        .not("source", "is", null)
        .limit(5000);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{
        status: string;
        source: string | null;
        confidence: number | null;
        rejected: boolean;
      }>;
      const map = new Map<
        string,
        {
          attempts: number;
          successes: number;
          user_visible: number;
          conf_sum: number;
          conf_n: number;
        }
      >();
      let total_done = 0;
      let total_failed = 0;
      for (const r of rows) {
        const d = (r.source ?? "").trim().toLowerCase();
        if (!d) continue;
        const entry = map.get(d) ?? {
          attempts: 0,
          successes: 0,
          user_visible: 0,
          conf_sum: 0,
          conf_n: 0,
        };
        entry.attempts++;
        if (r.status === "done" && !r.rejected) entry.successes++;
        if (r.status === "done" && !r.rejected && (r.confidence ?? 0) >= 80) entry.user_visible++;
        if (r.confidence != null) {
          entry.conf_sum += Number(r.confidence);
          entry.conf_n++;
        }
        map.set(d, entry);
        if (r.status === "done") total_done++;
        else if (r.status === "failed") total_failed++;
      }
      const out: DomainStat[] = Array.from(map.entries())
        .map(([domain, v]) => ({
          domain,
          attempts: v.attempts,
          successes: v.successes,
          user_visible: v.user_visible,
          avg_confidence: v.conf_n > 0 ? Math.round(v.conf_sum / v.conf_n) : null,
          success_rate: v.attempts > 0 ? Math.round((v.successes / v.attempts) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.successes - a.successes || b.attempts - a.attempts)
        .slice(0, 30);
      return { rows: out, total_done, total_failed };
    },
  );
