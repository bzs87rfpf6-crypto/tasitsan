import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";
import { unzipSync, strFromU8 } from "fflate";

// ============== Public: ürün sayfası için görsel bulma (cascade) ==============
// Sıra:
//   1) oem_image_library (doğrulanmış)
//   2) aynı OEM'e sahip diğer ürünlerin fotoğrafları
//   3) Firecrawl (mevcut findOemImages içinde çalışıyor — buradan tetiklenmez)
//
// Bu fonksiyon yalnızca havuzu + paylaşımlı görselleri döner. Firecrawl
// caller tarafında ayrıca çağrılır (mevcut akış korunur).

const lookupSchema = z.object({
  oem: z.string().trim().min(1).max(60),
  limit: z.number().int().min(1).max(20).optional(),
});

export interface LibraryImage {
  id: string;
  oem: string;
  brand: string | null;
  image_url: string;
  source_type: string;
  confidence: number;
  verified: boolean;
  is_primary: boolean;
  origin: "library" | "shared_part";
}

export const lookupOemLibrary = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => lookupSchema.parse(d))
  .handler(async ({ data }): Promise<{ images: LibraryImage[] }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );

    const limit = data.limit ?? 10;
    const out: LibraryImage[] = [];

    // 1) Library
    const { data: lib } = await sb.rpc("lookup_oem_images", { _oem: data.oem, _limit: limit });
    if (Array.isArray(lib)) {
      for (const r of lib) {
        out.push({
          id: r.id,
          oem: r.oem,
          brand: r.brand,
          image_url: r.image_url,
          source_type: r.source_type,
          confidence: r.confidence,
          verified: r.verified,
          is_primary: r.is_primary,
          origin: "library",
        });
      }
    }

    // 2) Shared OEM part photos
    if (out.length < limit) {
      const remaining = limit - out.length;
      const { data: shared } = await sb.rpc("lookup_shared_oem_part_photos", { _oem: data.oem, _limit: remaining });
      if (Array.isArray(shared)) {
        const seen = new Set(out.map((o) => o.image_url));
        for (const r of shared) {
          if (seen.has(r.image_url)) continue;
          seen.add(r.image_url);
          out.push({
            id: r.part_id,
            oem: data.oem,
            brand: null,
            image_url: r.image_url,
            source_type: "shared_oem",
            confidence: 70,
            verified: true,
            is_primary: false,
            origin: "shared_part",
          });
        }
      }
    }

    return { images: out };
  });

// ============== Admin: Library list ==============

const listSchema = z.object({
  search: z.string().trim().max(60).optional(),
  brand: z.string().trim().max(60).optional(),
  verified: z.enum(["all", "verified", "pending"]).optional(),
  source_type: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const adminListOemImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz işlem.");

    let q = supabase.from("oem_image_library").select("*", { count: "exact" });
    if (data.search) {
      const norm = data.search.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      q = q.ilike("oem_normalized", `%${norm}%`);
    }
    if (data.brand) q = q.ilike("brand", `%${data.brand}%`);
    if (data.verified === "verified") q = q.eq("verified", true);
    else if (data.verified === "pending") q = q.eq("verified", false);
    if (data.source_type) q = q.eq("source_type", data.source_type);
    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;
    q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

// ============== Admin: Verify / Reject / Set Primary ==============

const idSchema = z.object({ id: z.string().uuid() });

async function assertAdmin(context: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }) {
  await assertOwnerAdmin(context.supabase, context.userId);
}

export const verifyOemImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("oem_image_library")
      .update({ verified: true, verified_by: context.userId, verified_at: new Date().toISOString(), confidence: 95 })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectOemImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.extend({ reason: z.string().max(200).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row } = await context.supabase.from("oem_image_library").select("oem_normalized, image_url").eq("id", data.id).maybeSingle();
    if (row && row.oem_normalized) {
      await context.supabase.from("oem_image_rejections").upsert({
        oem_normalized: row.oem_normalized,
        image_url: row.image_url,
        rejected_by: context.userId,
        reason: data.reason ?? null,
      }, { onConflict: "oem_normalized,image_url" });
    }
    const { error } = await context.supabase.from("oem_image_library").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setOemImagePrimary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row } = await context.supabase.from("oem_image_library").select("oem_normalized").eq("id", data.id).maybeSingle();
    if (!row || !row.oem_normalized) throw new Error("Kayıt bulunamadı.");
    await context.supabase.from("oem_image_library").update({ is_primary: false }).eq("oem_normalized", row.oem_normalized);
    const { error } = await context.supabase.from("oem_image_library").update({ is_primary: true }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============== Admin: Manual add (single URL) ==============

const addSchema = z.object({
  oem: z.string().trim().min(1).max(60),
  brand: z.string().trim().max(60).optional().nullable(),
  image_url: z.string().url().max(2000),
  source_type: z.enum(["manufacturer_catalog","supplier_catalog","user_upload","shared_oem","firecrawl","manual"]).default("manual"),
  source_name: z.string().trim().max(120).optional().nullable(),
  verified: z.boolean().optional(),
});

export const addOemImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const verified = data.verified ?? true;
    const { error } = await context.supabase.from("oem_image_library").upsert({
      oem: data.oem,
      brand: data.brand ?? null,
      image_url: data.image_url,
      source_type: data.source_type,
      source_name: data.source_name ?? null,
      confidence: verified ? 95 : 60,
      verified,
      verified_by: verified ? context.userId : null,
      verified_at: verified ? new Date().toISOString() : null,
      uploaded_by: context.userId,
    }, { onConflict: "oem_normalized,image_url", ignoreDuplicates: false });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============== Admin: ZIP upload (bulk) ==============
// İçindeki MR122305.jpg → OEM=MR122305 olarak ele alınır.
// Alt klasör adı marka olarak kabul edilir (örn. Mitsubishi/MR122305.jpg).

const zipSchema = z.object({
  zip_base64: z.string().min(20),
  default_brand: z.string().trim().max(60).optional().nullable(),
  source_type: z.enum(["manufacturer_catalog","supplier_catalog","manual"]).default("manufacturer_catalog"),
  source_name: z.string().trim().max(120).optional().nullable(),
});

const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;

export const uploadOemImageZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => zipSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // base64 → bytes
    const b64 = data.zip_base64.replace(/^data:[^;]+;base64,/, "");
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(bytes);
    } catch (e) {
      throw new Error(`ZIP açılamadı: ${e instanceof Error ? e.message : String(e)}`);
    }

    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [path, content] of Object.entries(unzipped)) {
      if (path.endsWith("/") || content.length === 0) continue;
      if (!IMG_EXT.test(path)) { skipped++; continue; }
      if (content.length > 5 * 1024 * 1024) { errors.push(`${path}: 5MB üstü atlandı`); continue; }

      // path: "Mitsubishi/MR122305.jpg" → brand=Mitsubishi, oem=MR122305
      const parts = path.split("/").filter(Boolean);
      const filename = parts[parts.length - 1];
      const folderBrand = parts.length > 1 ? parts[parts.length - 2] : null;
      const brand = folderBrand ?? data.default_brand ?? null;
      const oem = filename.replace(IMG_EXT, "");
      if (!oem || oem.length < 2) { skipped++; continue; }

      const ext = (filename.match(IMG_EXT)?.[0] ?? ".jpg").toLowerCase();
      const ctMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
      const contentType = ctMap[ext] ?? "image/jpeg";
      const storagePath = `${brand ?? "_"}/${oem.replace(/[^A-Za-z0-9_-]/g, "_")}-${Date.now()}${ext}`;

      const { error: upErr } = await supabaseAdmin.storage.from("oem-image-library").upload(storagePath, content, { contentType, upsert: false });
      if (upErr && !/already exists|Duplicate/i.test(upErr.message)) {
        errors.push(`${path}: ${upErr.message}`);
        continue;
      }

      const { data: pub } = supabaseAdmin.storage.from("oem-image-library").getPublicUrl(storagePath);
      const publicUrl = pub.publicUrl;

      const { error: insErr } = await supabaseAdmin.from("oem_image_library").upsert({
        oem,
        brand,
        image_url: publicUrl,
        source_type: data.source_type,
        source_name: data.source_name ?? null,
        confidence: 90,
        verified: true,
        verified_by: context.userId,
        verified_at: new Date().toISOString(),
        uploaded_by: context.userId,
      }, { onConflict: "oem_normalized,image_url", ignoreDuplicates: true });
      if (insErr) { errors.push(`${path}: DB ${insErr.message}`); continue; }
      added++;
    }

    return { added, skipped, errors: errors.slice(0, 50), total_files: Object.keys(unzipped).length };
  });

// ============== Process ZIP already uploaded to storage (büyük dosyalar) ==============

const zipFromStorageSchema = z.object({
  storage_path: z.string().trim().min(1).max(300).regex(/^_uploads\/[A-Za-z0-9_\-./]+\.zip$/i, "Geçersiz storage path"),
  default_brand: z.string().trim().max(60).optional().nullable(),
  source_type: z.enum(["manufacturer_catalog","supplier_catalog","manual"]).default("manufacturer_catalog"),
  source_name: z.string().trim().max(120).optional().nullable(),
});

export const processOemImageZipFromStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => zipFromStorageSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("oem-image-library").download(data.storage_path);
    if (dlErr || !blob) throw new Error(`ZIP indirilemedi: ${dlErr?.message ?? "bulunamadı"}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(bytes);
    } catch (e) {
      throw new Error(`ZIP açılamadı: ${e instanceof Error ? e.message : String(e)}`);
    }

    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [path, content] of Object.entries(unzipped)) {
      if (path.endsWith("/") || content.length === 0) continue;
      if (!IMG_EXT.test(path)) { skipped++; continue; }
      if (content.length > 5 * 1024 * 1024) { errors.push(`${path}: 5MB üstü atlandı`); continue; }

      const parts = path.split("/").filter(Boolean);
      const filename = parts[parts.length - 1];
      const folderBrand = parts.length > 1 ? parts[parts.length - 2] : null;
      const brand = folderBrand ?? data.default_brand ?? null;
      const oem = filename.replace(IMG_EXT, "");
      if (!oem || oem.length < 2) { skipped++; continue; }

      const ext = (filename.match(IMG_EXT)?.[0] ?? ".jpg").toLowerCase();
      const ctMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
      const contentType = ctMap[ext] ?? "image/jpeg";
      const storagePath = `${brand ?? "_"}/${oem.replace(/[^A-Za-z0-9_-]/g, "_")}-${Date.now()}${ext}`;

      const { error: upErr } = await supabaseAdmin.storage.from("oem-image-library").upload(storagePath, content, { contentType, upsert: false });
      if (upErr && !/already exists|Duplicate/i.test(upErr.message)) {
        errors.push(`${path}: ${upErr.message}`);
        continue;
      }

      const { data: pub } = supabaseAdmin.storage.from("oem-image-library").getPublicUrl(storagePath);
      const publicUrl = pub.publicUrl;

      const { error: insErr } = await supabaseAdmin.from("oem_image_library").upsert({
        oem,
        brand,
        image_url: publicUrl,
        source_type: data.source_type,
        source_name: data.source_name ?? null,
        confidence: 90,
        verified: true,
        verified_by: context.userId,
        verified_at: new Date().toISOString(),
        uploaded_by: context.userId,
      }, { onConflict: "oem_normalized,image_url", ignoreDuplicates: true });
      if (insErr) { errors.push(`${path}: DB ${insErr.message}`); continue; }
      added++;
    }

    await supabaseAdmin.storage.from("oem-image-library").remove([data.storage_path]).catch(() => {});

    return { added, skipped, errors: errors.slice(0, 50), total_files: Object.keys(unzipped).length };
  });

// ============== Stats & Missing ==============

export const getOemLibraryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.rpc("oem_library_stats");
    if (error) throw new Error(error.message);
    return { stats: (data ?? {}) as Record<string, number | Record<string, number>> };
  });

const missingSchema = z.object({ limit: z.number().int().min(1).max(2000).optional() });

export const getMissingOems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missingSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("oem_library_missing", { _limit: data.limit ?? 200 });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Array<{ oem: string; brand: string | null; part_count: number }> };
  });

// ============== Save Firecrawl result into library (called by visual search) ==============

const saveFromSearchSchema = z.object({
  oem: z.string().trim().min(1).max(60),
  brand: z.string().trim().max(60).optional().nullable(),
  images: z.array(z.object({
    url: z.string().url().max(2000),
    source_domain: z.string().max(200).optional(),
    relevance: z.number().min(0).max(1).optional(),
  })).max(20),
});

export const saveFirecrawlImagesToLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveFromSearchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.images
      .filter((im) => (im.relevance ?? 0) >= 0.5)
      .map((im) => ({
        oem: data.oem,
        brand: data.brand ?? null,
        image_url: im.url,
        source_type: "firecrawl" as const,
        source_name: im.source_domain ?? null,
        confidence: Math.round((im.relevance ?? 0.5) * 100),
        verified: false,
        uploaded_by: context.userId,
      }));
    if (rows.length === 0) return { added: 0 };
    const { error } = await supabaseAdmin.from("oem_image_library").upsert(rows, { onConflict: "oem_normalized,image_url", ignoreDuplicates: true });
    if (error) console.warn("[oem-library] save firecrawl failed:", error.message);
    return { added: rows.length };
  });

// ============== Admin: OEM Görsel Havuzu kapsama raporu ==============

export interface OemCoverageReport {
  total_parts: number;
  with_photo: number;
  with_oem: number;
  matched_in_library: number;
  unmatched: number;
  coverage_pct: number;
}

export interface MissingOemRow {
  oem_family: string;
  part_count: number;
  sample_brand: string | null;
  sample_title: string | null;
}

async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const getOemImageCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OemCoverageReport> => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("parts_oem_image_coverage" as never);
    if (error) throw new Error(error.message);
    const row: any = Array.isArray(data) ? (data as any[])[0] : data;
    return {
      total_parts: Number(row?.total_parts ?? 0),
      with_photo: Number(row?.with_photo ?? 0),
      with_oem: Number(row?.with_oem ?? 0),
      matched_in_library: Number(row?.matched_in_library ?? 0),
      unmatched: Number(row?.unmatched ?? 0),
      coverage_pct: Number(row?.coverage_pct ?? 0),
    };
  });

export const getMissingOemImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(2000).default(500) }).parse(d))
  .handler(async ({ context, data }): Promise<{ rows: MissingOemRow[] }> => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc(
      "parts_missing_oem_images" as never,
      { _limit: data.limit } as never,
    );
    if (error) throw new Error(error.message);
    return {
      rows: ((rows ?? []) as any[]).map((r) => ({
        oem_family: String(r.oem_family ?? ""),
        part_count: Number(r.part_count ?? 0),
        sample_brand: r.sample_brand ?? null,
        sample_title: r.sample_title ?? null,
      })),
    };
  });

/**
 * Toplu yeniden indeksleme — tüm ürünlerde oem_families kolonunu yeniden hesaplar.
 * Trigger zaten BEFORE INSERT/UPDATE on (oem_code, oem_norm) çalıştığı için
 * sahte bir UPDATE yeterli. Batch'le çalışır.
 */
export const reindexPartsOemFamilies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ updated: number }> => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("reindex_parts_oem_families" as never);
    if (error) throw new Error(error.message);
    return { updated: Number(data ?? 0) };
  });
