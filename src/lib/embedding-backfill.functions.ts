import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { embedBatch, buildPartEmbeddingSource, sourceHash, EMBEDDING_META } from "@/lib/ai/embeddings.server";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

const BatchInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  force: z.boolean().default(false),
});

export const runEmbeddingBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Adayları çek
    let query = supabaseAdmin
      .from("parts")
      .select("id, title, brand, model, year, category, part_type, oem_code, oem_codes, description, embedding_source_hash, embedding_updated_at, updated_at")
      .eq("status", "approved")
      .limit(data.limit);
    if (!data.force) query = query.is("embedding", null);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return { processed: 0, updated: 0, skipped: 0, errors: 0 };

    const sources = rows.map((r) => buildPartEmbeddingSource(r));
    const hashes = sources.map(sourceHash);

    // Skip unchanged (hash aynı)
    const toEmbed: { idx: number; text: string }[] = [];
    let skipped = 0;
    rows.forEach((r, i) => {
      if (!data.force && r.embedding_source_hash === hashes[i]) { skipped++; return; }
      toEmbed.push({ idx: i, text: sources[i] });
    });

    if (toEmbed.length === 0) return { processed: rows.length, updated: 0, skipped, errors: 0 };

    const results = await embedBatch(toEmbed.map((t) => t.text));

    let updated = 0;
    let errors = 0;
    const now = new Date().toISOString();
    await Promise.all(results.map(async (res, k) => {
      const idx = toEmbed[k].idx;
      const row = rows[idx];
      if (!res.ok || !res.vector) { errors++; return; }
      const { error: upErr } = await supabaseAdmin
        .from("parts")
        .update({
          embedding: res.vector as unknown as string,
          embedding_source_hash: hashes[idx],
          embedding_updated_at: now,
        })
        .eq("id", row.id);
      if (upErr) { errors++; console.warn("[embed-backfill] update", upErr.message); }
      else updated++;
    }));

    return { processed: rows.length, updated, skipped, errors, model: EMBEDDING_META.model };
  });

export const embeddingStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [total, withEmb, stale] = await Promise.all([
      supabaseAdmin.from("parts").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabaseAdmin.from("parts").select("id", { count: "exact", head: true }).eq("status", "approved").not("embedding", "is", null),
      supabaseAdmin.from("parts_needing_embedding").select("id", { count: "exact", head: true }),
    ]);
    return {
      total: total.count ?? 0,
      with_embedding: withEmb.count ?? 0,
      needs_update: stale.count ?? 0,
      model: EMBEDDING_META.model,
      dims: EMBEDDING_META.dims,
    };
  });
