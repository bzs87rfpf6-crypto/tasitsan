/**
 * Image-resolver worker — pg_cron her dakika çağırır.
 * Bir batch (10) job alır, paralel çalıştırır, kalite filtresinden geçenleri parts.photos'a yazar.
 *
 * Kalite eşikleri (src/lib/oem-image-resolver.server.ts):
 *   - 80+ → kullanıcılara gösterilir (parts.photos güncellenir)
 *   - 70-79 → cache'lenir; admin görür ama parts.photos'a yazılmaz (rejected=true, status=done)
 *   - 70-   → reject; job 'failed' + rejected=true
 */
import { createFileRoute } from "@tanstack/react-router";

const SOFT_DEADLINE_MS = 25_000;

interface JobRow {
  id: string;
  part_id: string;
  oem_code: string;
}

export const Route = createFileRoute("/api/public/hooks/image-resolver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { resolveOemImage, MIN_CONFIDENCE_USER } = await import("@/lib/oem-image-resolver.server");

        const startedAt = Date.now();
        const batchSize = 10;
        let processed = 0;
        let succeeded = 0;
        let failed = 0;
        let rejectedLowConfidence = 0;

        while (Date.now() - startedAt < SOFT_DEADLINE_MS) {
          const { data: claimed, error } = await supabaseAdmin.rpc("claim_part_image_jobs", { _batch: batchSize });
          if (error) {
            console.error("[image-worker] claim failed", error.message);
            return Response.json({ ok: false, error: error.message }, { status: 500 });
          }
          const jobs = (claimed ?? []) as JobRow[];
          if (jobs.length === 0) break;

          const results = await Promise.allSettled(jobs.map((j) => processJob(j)));
          for (const r of results) {
            processed++;
            if (r.status === "fulfilled") {
              if (r.value.ok && r.value.applied) succeeded++;
              else if (r.value.ok && !r.value.applied) rejectedLowConfidence++;
              else failed++;
            } else failed++;
          }
        }

        return Response.json({
          ok: true,
          processed,
          succeeded,
          failed,
          rejected_low_confidence: rejectedLowConfidence,
          duration_ms: Date.now() - startedAt,
        });

        async function processJob(job: JobRow) {
          const t0 = Date.now();
          try {
            // Part context (brand/model/title) çek
            const { data: partCtx } = await supabaseAdmin
              .from("parts")
              .select("id, photos, brand, model, title, part_type, category")
              .eq("id", job.part_id)
              .maybeSingle();

            const r = await resolveOemImage(job.oem_code, partCtx ?? null);
            const duration = Date.now() - t0;

            if (r.ok) {
              const confidence = r.confidence;
              const meetsUserBar = confidence >= MIN_CONFIDENCE_USER;
              // parts.photos güncellemesi sadece 80+ ve hâlâ boşsa
              if (
                meetsUserBar &&
                partCtx &&
                (!partCtx.photos || (Array.isArray(partCtx.photos) && partCtx.photos.length === 0))
              ) {
                await supabaseAdmin
                  .from("parts")
                  .update({ photos: [r.public_url] })
                  .eq("id", job.part_id);
              }
              await supabaseAdmin
                .from("part_image_jobs")
                .update({
                  status: "done",
                  image_url: r.public_url,
                  source: r.source,
                  duration_ms: duration,
                  finished_at: new Date().toISOString(),
                  last_error: null,
                  confidence: r.confidence,
                  confidence_band: r.confidence_band,
                  score_breakdown: r.score_breakdown as unknown,
                  rejected: !meetsUserBar,
                  rejection_reason: meetsUserBar ? null : `Kullanıcı eşiğinin altında (skor %${r.confidence})`,
                } as never)
                .eq("id", job.id);
              return { ok: true as const, applied: meetsUserBar };
            }

            // failure path — düşük güven nedeniyle reddedildiyse de işaretle
            await supabaseAdmin
              .from("part_image_jobs")
              .update({
                status: "failed",
                duration_ms: duration,
                finished_at: new Date().toISOString(),
                last_error: r.reason.slice(0, 500),
                confidence: r.confidence ?? null,
                confidence_band: r.confidence_band ?? null,
                score_breakdown: (r.score_breakdown as unknown) ?? null,
                rejected: r.reason.startsWith("low confidence"),
                rejection_reason: r.reason.startsWith("low confidence") ? r.reason : null,
              } as never)
              .eq("id", job.id);
            return { ok: false as const, applied: false };
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            await supabaseAdmin
              .from("part_image_jobs")
              .update({
                status: "failed",
                duration_ms: Date.now() - t0,
                finished_at: new Date().toISOString(),
                last_error: msg.slice(0, 500),
              })
              .eq("id", job.id);
            return { ok: false as const, applied: false };
          }
        }
      },
    },
  },
});
