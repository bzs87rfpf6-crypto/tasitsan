import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

const BUCKET = "part-photos";

/** Public URL -> storage path (bucket içi). Bucket dışı URL'ler için null. */
function storagePathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const raw = url.slice(i + marker.length).split("?")[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Güvenli toplu silme. Yetki denetimi veritabanındaki
 * `bulk_delete_parts` fonksiyonunda (auth.uid + has_role) yapılır;
 * buradaki kontroller yalnızca ek bir katmandır.
 */
export const bulkDeleteParts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        partIds: z.array(z.string().uuid()).max(5000).optional(),
        batchId: z.string().uuid().optional(),
      })
      .refine((v) => (v.partIds && v.partIds.length > 0) || v.batchId, {
        message: "Silinecek ürün belirtilmedi",
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc("bulk_delete_parts", {
      p_part_ids: data.partIds ?? null,
      p_batch_id: data.batchId ?? null,
    } as never);
    if (error) throw new Error(error.message);

    const payload = (res ?? {}) as {
      requested?: number;
      found?: number;
      deleted?: number;
      failed?: number;
      orphan_photos?: string[];
    };

    // Artık hiçbir üründe kullanılmayan görselleri Storage'dan temizle.
    let removedPhotos = 0;
    const urls = payload.orphan_photos ?? [];
    if (urls.length > 0) {
      const paths = urls.map(storagePathFromUrl).filter((p): p is string => !!p);
      if (paths.length > 0) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        for (let i = 0; i < paths.length; i += 100) {
          const slice = paths.slice(i, i + 100);
          const { data: removed } = await supabaseAdmin.storage.from(BUCKET).remove(slice);
          removedPhotos += removed?.length ?? 0;
        }
      }
    }

    return {
      requested: payload.requested ?? 0,
      found: payload.found ?? 0,
      deleted: payload.deleted ?? 0,
      failed: payload.failed ?? 0,
      removedPhotos,
    };
  });

export interface ImportBatchRow {
  id: string;
  user_id: string;
  mode: string;
  file_name: string | null;
  total_rows: number;
  success_count: number;
  fail_count: number;
  status: string;
  created_at: string;
  inserted_count: number;
  live_count: number;
  seller_name?: string | null;
}

/** Kullanıcının kendi toplu yükleme geçmişi (ürün sayılarıyla). */
export const listMyImportBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportBatchRow[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("import_batches")
      .select("id,user_id,mode,file_name,total_rows,success_count,fail_count,status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const batches = data ?? [];
    if (batches.length === 0) return [];
    return await withCounts(batches);
  });

async function withCounts(batches: any[]): Promise<ImportBatchRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ids = batches.map((b) => b.id);
  const { data: items } = await supabaseAdmin
    .from("import_batch_items")
    .select("batch_id,part_id,action")
    .in("batch_id", ids)
    .eq("action", "insert");
  const partIds = (items ?? []).map((i) => i.part_id);
  const alive = new Set<string>();
  for (let i = 0; i < partIds.length; i += 500) {
    const { data: rows } = await supabaseAdmin
      .from("parts")
      .select("id")
      .in("id", partIds.slice(i, i + 500));
    (rows ?? []).forEach((r) => alive.add(r.id));
  }
  const inserted = new Map<string, number>();
  const live = new Map<string, number>();
  for (const it of items ?? []) {
    inserted.set(it.batch_id, (inserted.get(it.batch_id) ?? 0) + 1);
    if (alive.has(it.part_id)) live.set(it.batch_id, (live.get(it.batch_id) ?? 0) + 1);
  }
  return batches.map((b) => ({
    ...b,
    inserted_count: inserted.get(b.id) ?? 0,
    live_count: live.get(b.id) ?? 0,
  })) as ImportBatchRow[];
}

/** Bir yüklemede EKLENEN (güncellenen değil) ürünler. */
export const listBatchParts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: items, error } = await supabase
      .from("import_batch_items")
      .select("part_id")
      .eq("batch_id", data.batchId)
      .eq("action", "insert");
    if (error) throw new Error(error.message);
    const ids = (items ?? []).map((i) => i.part_id);
    if (ids.length === 0) return [] as any[];
    const out: any[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const { data: rows, error: e2 } = await supabase
        .from("parts")
        .select("id,seo_slug,title,brand,model,price,photos,status,stock_quantity,created_at,seller_id")
        .in("id", ids.slice(i, i + 500));
      if (e2) throw new Error(e2.message);
      out.push(...(rows ?? []));
    }
    return out;
  });

/* ---------------- Admin ---------------- */

export const adminListImportBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportBatchRow[]> => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("import_batches")
      .select("id,user_id,mode,file_name,total_rows,success_count,fail_count,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const batches = data ?? [];
    if (batches.length === 0) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name")
      .in("id", Array.from(new Set(batches.map((b) => b.user_id))));
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
    const withC = await withCounts(batches);
    return withC.map((b) => ({ ...b, seller_name: nameById.get(b.user_id) ?? null }));
  });

export const adminSearchParts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sellerId: z.string().uuid().optional(),
        brand: z.string().max(80).optional(),
        model: z.string().max(80).optional(),
        status: z.string().max(30).optional(),
        batchId: z.string().uuid().optional(),
        dateFrom: z.string().max(30).optional(),
        dateTo: z.string().max(30).optional(),
        limit: z.number().int().min(1).max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("parts")
      .select("id,title,brand,model,price,status,photos,created_at,seller_id,import_batch_id,stock_quantity")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 500);
    if (data.sellerId) q = q.eq("seller_id", data.sellerId);
    if (data.brand) q = q.ilike("brand", `%${data.brand}%`);
    if (data.model) q = q.ilike("model", `%${data.model}%`);
    if (data.status) q = q.eq("status", data.status);
    if (data.batchId) q = q.eq("import_batch_id", data.batchId);
    if (data.dateFrom) q = q.gte("created_at", data.dateFrom);
    if (data.dateTo) q = q.lte("created_at", data.dateTo);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const sellerIds = Array.from(new Set((rows ?? []).map((r) => r.seller_id).filter(Boolean)));
    const { data: profs } = sellerIds.length
      ? await supabaseAdmin.from("profiles").select("id,display_name").in("id", sellerIds)
      : { data: [] as any[] };
    const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
    return (rows ?? []).map((r) => ({ ...r, seller_name: nameById.get(r.seller_id) ?? null }));
  });

export const adminListDeleteLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("part_delete_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const ids = Array.from(
      new Set(rows.flatMap((r: any) => [r.actor_id, ...((r.owner_user_ids as string[]) ?? [])]).filter(Boolean)),
    );
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,display_name").in("id", ids)
      : { data: [] as any[] };
    const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
    return rows.map((r: any) => ({
      ...r,
      actor_name: nameById.get(r.actor_id) ?? null,
      owner_names: ((r.owner_user_ids as string[]) ?? []).map((u) => nameById.get(u) ?? u.slice(0, 8)),
    }));
  });
