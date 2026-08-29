/**
 * OEM Parça Kataloğu — sunucu fonksiyonları.
 * Mevcut parts / oem_reference verisine dokunmaz; yalnızca public.oem_catalog kullanılır.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeCatalogName, normalizeCatalogOem } from "@/lib/catalog-match";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

async function admin(supabase: unknown, userId: string) {
  await assertOwnerAdmin(supabase, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface CatalogRow {
  id: string;
  part_name: string;
  oem_no: string;
  normalized_oem: string;
  brand: string | null;
  vehicle_model: string | null;
  vehicle_year: string | null;
  alternative_oems: string[];
  source_catalog: string;
  score?: number;
}

export interface CatalogStats {
  total_records: number;
  total_oems: number;
  total_brands: number;
  matched_in_parts: number;
  last_upload: string | null;
  catalogs: { source_catalog: string; records: number; last_upload: string }[];
}

export const catalogStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CatalogStats> => {
    const db = await admin(context.supabase, context.userId);
    const { data, error } = await db.rpc("catalog_stats" as never);
    if (error) throw new Error(error.message);
    return data as unknown as CatalogStats;
  });

const rowSchema = z.object({
  part_name: z.string().trim().min(2).max(300),
  oem_no: z.string().trim().min(2).max(80),
  brand: z.string().trim().max(120).nullable().optional(),
  vehicle_model: z.string().trim().max(200).nullable().optional(),
  vehicle_year: z.string().trim().max(60).nullable().optional(),
  alternative_oems: z.array(z.string().trim().min(2).max(80)).max(50).optional(),
});

export interface CatalogImportResult {
  received: number;
  valid: number;
  imported: number;
  skipped: number;
}

/** Toplu import — client 500'lük parçalar halinde çağırır. */
export const catalogImportChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        source_catalog: z.string().trim().min(1).max(120),
        rows: z.array(rowSchema).min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CatalogImportResult> => {
    const db = await admin(context.supabase, context.userId);

    const seen = new Set<string>();
    const payload: Record<string, unknown>[] = [];
    for (const r of data.rows) {
      const nOem = normalizeCatalogOem(r.oem_no);
      const nName = normalizeCatalogName(r.part_name);
      if (!nOem || !nName) continue;
      const key = `${nOem}|${nName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      payload.push({
        part_name: r.part_name,
        normalized_part_name: nName,
        oem_no: r.oem_no,
        normalized_oem: nOem,
        brand: r.brand || null,
        vehicle_model: r.vehicle_model || null,
        vehicle_year: r.vehicle_year || null,
        alternative_oems: r.alternative_oems ?? [],
        source_catalog: data.source_catalog,
      });
    }

    if (payload.length === 0) {
      return { received: data.rows.length, valid: 0, imported: 0, skipped: data.rows.length };
    }

    const { data: inserted, error } = await db
      .from("oem_catalog" as never)
      .upsert(payload as never, { onConflict: "normalized_oem,normalized_part_name" })
      .select("id");
    if (error) throw new Error(error.message);

    const imported = (inserted ?? []).length;
    return {
      received: data.rows.length,
      valid: payload.length,
      imported,
      skipped: data.rows.length - imported,
    };
  });

/** Katalog kayıtlarını listeler (admin). */
export const catalogList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        q: z.string().trim().max(200).optional(),
        source_catalog: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).max(100000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context.supabase, context.userId);
    let query = db
      .from("oem_catalog" as never)
      .select("id, part_name, oem_no, normalized_oem, brand, vehicle_model, vehicle_year, alternative_oems, source_catalog", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.source_catalog) query = query.eq("source_catalog", data.source_catalog);
    if (data.q) {
      const nq = normalizeCatalogName(data.q);
      const nOem = normalizeCatalogOem(data.q);
      query = query.or(`normalized_part_name.ilike.%${nq}%,normalized_oem.ilike.%${nOem}%`);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as CatalogRow[], total: count ?? 0 };
  });

export const catalogUpdateRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: rowSchema.partial(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context.supabase, context.userId);
    const { error } = await db
      .from("oem_catalog" as never)
      .update(data.patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const catalogDeleteRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context.supabase, context.userId);
    const { error } = await db.from("oem_catalog" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Bir kaynağın tüm kayıtlarını siler. */
export const catalogDeleteSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ source_catalog: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context.supabase, context.userId);
    const { error, count } = await db
      .from("oem_catalog" as never)
      .delete({ count: "exact" })
      .eq("source_catalog", data.source_catalog);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

export interface CatalogSearchResponse {
  query: string;
  /** Güvenilir (ana) eşleşmeler — OEM listesi buradan üretilir. */
  matches: CatalogRow[];
  /** Yakın ama düşük güvenli eşleşmeler — otomatik OEM aramasına gönderilmez. */
  weakMatches: CatalogRow[];
  /** Online kaynaklarda aratılmaya hazır, benzersiz OEM listesi (yalnız ana eşleşmeler). */
  oems: string[];
}

/**
 * Parça adı → katalog eşleşmesi → OEM listesi.
 * Public: müşteri arama akışında da kullanılabilir (mevcut arama değiştirilmedi).
 */
export const catalogSearchByName = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        query: z.string().trim().min(2).max(200),
        limit: z.number().int().min(1).max(100).default(30),
        min_score: z.number().min(0).max(1).default(0.2),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CatalogSearchResponse> => {
    const { searchCatalogByNameServer } = await import("@/lib/catalog-search.server");
    return await searchCatalogByNameServer(data.query, data.limit, data.min_score);
  });


