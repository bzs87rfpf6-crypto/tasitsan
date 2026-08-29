import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";
import { z } from "zod";
import {
  buildUniqueTitle,
  buildUniqueDescription,
  computeContentHash,
  type SeoPartInput,
} from "./product-seo-meta";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(v: string): boolean { return UUID_RE.test(v); }

/**
 * Defensive resolver: accept a UUID OR a seo_slug / historical slug and
 * always return the canonical parts.id UUID. Prevents `invalid input syntax
 * for type uuid` when a caller accidentally hands us a slug.
 * Returns null if nothing resolves (caller decides fallback).
 */
async function resolvePartUuid(
  input: string,
  caller: string,
): Promise<string | null> {
  const raw = input.trim();
  if (isUUID(raw)) {
    console.info(`[product-seo-meta:${caller}] incoming=${raw} resolved=${raw} (uuid pass-through)`);
    return raw.toLowerCase();
  }
  // Slug path — resolve via parts.seo_slug, then parts_slug_history.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bySlug = await supabaseAdmin
    .from("parts").select("id").eq("seo_slug", raw).maybeSingle();
  if (bySlug.data?.id) {
    console.info(`[product-seo-meta:${caller}] incoming=${raw} resolved=${bySlug.data.id} (via seo_slug)`);
    return bySlug.data.id as string;
  }
  const byHist = await supabaseAdmin
    .from("parts_slug_history").select("part_id").eq("slug", raw)
    .order("replaced_at", { ascending: false }).limit(1).maybeSingle();
  if (byHist.data?.part_id) {
    console.info(`[product-seo-meta:${caller}] incoming=${raw} resolved=${byHist.data.part_id} (via history)`);
    return byHist.data.part_id as string;
  }
  console.warn(`[product-seo-meta:${caller}] incoming=${raw} could not resolve to a parts.id UUID`);
  return null;
}


export type StoredProductSeoMeta = {
  title: string;
  description: string;
  score: number;
  title_variant: number;
  content_hash: string;
  needs_rewrite: boolean;
  generated_at: string;
  // JSON payloads — kept loose so the TanStack RPC serializer accepts them.
  attributes?: Record<string, string | number | boolean | null | string[]> | null;
  internal_links?: Array<{ url: string; title: string; reason?: string }> | null;
  alt_texts?: string[] | null;
  ai_faqs?: Array<{ question: string; answer: string }> | null;
};

/** Read the pre-computed unique meta for a product. Public: served during SSR
 * of every product page. Uses the anon publishable client behind a narrow
 * SELECT to authenticated only, so we fall back gracefully when missing. */
export const getProductSeoMeta = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ partId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<StoredProductSeoMeta | null> => {
    const partUuid = await resolvePartUuid(data.partId, "getProductSeoMeta");
    if (!partUuid) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("product_seo_meta")
      .select("title,description,score,title_variant,content_hash,needs_rewrite,generated_at,attributes,internal_links,alt_texts,ai_faqs")
      .eq("part_id", partUuid)
      .maybeSingle();
    if (error) { console.error("[getProductSeoMeta] query failed", error); return null; }
    return (row as StoredProductSeoMeta | null) ?? null;
  });


/** Admin-only: regenerate & upsert unique meta for a single part. Handles
 * variant-collision by bumping `title_variant` until the emitted <title> is
 * unique among stored rows. Returns the stored row. */
export const upsertProductSeoMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ partId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<StoredProductSeoMeta> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwnerAdmin(context.supabase, context.userId);

    const partUuid = await resolvePartUuid(data.partId, "upsertProductSeoMeta");
    if (!partUuid) throw new Error("Parça bulunamadı");

    const { data: part, error } = await supabaseAdmin
      .from("parts")
      .select("id,title,description,brand,model,year,category,oem_code,oem_codes,engine_code,city,price,condition,stock_quantity")
      .eq("id", partUuid)
      .maybeSingle();
    if (error || !part) throw new Error("Parça bulunamadı");

    const p = part as unknown as SeoPartInput;

    const hash = computeContentHash(p);
    let variant = 0;
    let title = buildUniqueTitle(p, variant);
    // Collision resolution — bump variant until title is unique among other parts.
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await supabaseAdmin
        .from("product_seo_meta")
        .select("part_id")
        .eq("title", title)
        .neq("part_id", p.id)
        .limit(1);
      if (!clash || clash.length === 0) break;
      variant += 1;
      title = buildUniqueTitle(p, variant);
    }
    const description = buildUniqueDescription(p);

    // Compute a lightweight score (title present, desc length ok, OEM+brand+model+year completeness).
    let score = 40;
    if (title.length >= 30 && title.length <= 70) score += 15;
    if (description.length >= 110 && description.length <= 160) score += 15;
    if ((p.oem_codes?.length ?? 0) > 0 || p.oem_code) score += 10;
    if (p.brand && p.model) score += 10;
    if (p.year) score += 5;
    if ((p.description ?? "").trim().length > 40) score += 5;

    const { data: saved, error: upErr } = await supabaseAdmin
      .from("product_seo_meta")
      .upsert({
        part_id: p.id,
        title,
        description,
        title_variant: variant,
        content_hash: hash,
        score,
        needs_rewrite: false,
        generated_at: new Date().toISOString(),
      }, { onConflict: "part_id" })
      .select("title,description,score,title_variant,content_hash,needs_rewrite,generated_at")
      .single();
    if (upErr) throw new Error(upErr.message);
    return saved as StoredProductSeoMeta;
  });

/** Admin summary: coverage + duplicate counts. Used by admin dashboard. */
export const getProductSeoMetaStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwnerAdmin(context.supabase, context.userId);

    const [{ count: total }, { count: withMeta }, { count: needsRewrite }] = await Promise.all([
      supabaseAdmin.from("parts").select("*", { count: "exact", head: true }).eq("status", "approved"),
      supabaseAdmin.from("product_seo_meta").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("product_seo_meta").select("*", { count: "exact", head: true }).eq("needs_rewrite", true),
    ]);

    // Duplicate hash groups — inline aggregate to avoid a bespoke RPC.
    const { data: hashRows } = await supabaseAdmin
      .from("product_seo_meta")
      .select("content_hash");
    const hashCounts = new Map<string, number>();
    for (const r of (hashRows ?? []) as Array<{ content_hash: string }>) {
      hashCounts.set(r.content_hash, (hashCounts.get(r.content_hash) ?? 0) + 1);
    }
    let duplicateGroups = 0;
    for (const n of hashCounts.values()) if (n > 1) duplicateGroups += 1;

    return {
      approvedTotal: total ?? 0,
      withMeta: withMeta ?? 0,
      needsRewrite: needsRewrite ?? 0,
      coverage: total && total > 0 ? Math.round(((withMeta ?? 0) * 100) / total) : 0,
      duplicateGroups,
    };
  });
