/**
 * OEM tabanlı Bayram Oto → Taşıtsan eşleştirme & görsel güncelleme.
 *
 * Akış:
 *   1) parts tablosundan aday parçaları çek (mod: missing_only | incomplete | all).
 *   2) Her parçanın OEM listesini normalize et.
 *   3) oem_image_library'de Bayram Oto kaynaklı (source_name ILIKE '%bayramoto.com.tr%')
 *      satırları topla — is_primary tercihli, yoksa ilk satır.
 *   4) Marka eşleşmesi + başlık Jaccard benzerliği (>= 0.6) + en az 1 geçerli görsel
 *      koşullarını birlikte sağlayan parçalar GÜNCELLENEBİLİR sayılır.
 *   5) dryRun=false ise parts.photos güncellenir ve oem_image_update_log'a yazılır.
 *
 * Mevcut görseli olan parçalar (photos.length > 0) varsayılan olarak korunur;
 * yalnızca `overwrite=true` ile bunlar da güncellenir (kullanıcı görselleri arkaya itilir).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

const MIN_SIMILARITY = 0.6;
const BAYRAMOTO_MARK = "bayramoto.com.tr";

// ---- helpers (importer'daki mantığın aynısı, çoğaltma yerine ufak kopya) ----
function normalizeOem(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[\s\-./_]+/g, "");
}

function normalizeBrand(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü]+/gi, "")
    .trim();
}

const STOPWORDS = new Set([
  "için", "ile", "ve", "veya", "the", "and", "or", "oem", "yedek", "parça", "parca",
  "orjinal", "orijinal", "muadil", "sag", "sol", "on", "arka", "ust", "alt",
  "araç", "arac", "araba",
]);
function tokenize(s: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}
function jaccard(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function isGoodImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  if (!/\.(?:jpe?g|png|webp)(?:\?|$)/.test(u)) return false;
  const bad = ["logo", "banner", "placeholder", "no-image", "noimage", "default", "icon-", "/icons/"];
  return !bad.some((b) => u.includes(b));
}

async function requireAdmin(ctx: { supabase: any; userId: string }): Promise<void> {
  await assertOwnerAdmin(ctx.supabase, ctx.userId);
}

// ============== Tipler ==============

type Mode = "missing_only" | "incomplete" | "all";
type Status =
  | "updated"
  | "would_update"
  | "skipped_no_oem_match"
  | "skipped_brand"
  | "skipped_low_score"
  | "skipped_no_image"
  | "skipped_has_photos"
  | "error";

interface PartRow {
  id: string;
  title: string;
  brand: string | null;
  oem_code: string | null;
  oem_codes: string[] | null;
  oem_norm: string[] | null;
  photos: string[];
}

interface SourceRow {
  oem_normalized: string;
  brand: string | null;
  image_url: string;
  is_primary: boolean;
  source_name: string | null;
  source_query: string | null; // başlık (importer source_query alanına yazıyor)
}

interface MatchResult {
  part_id: string;
  oem: string | null;
  oem_normalized: string | null;
  title_part: string;
  brand_part: string | null;
  title_source: string | null;
  brand_source: string | null;
  source_url: string | null;
  main_image: string | null;
  extra_images: string[];
  similarity: number;
  status: Status;
  reason: string | null;
}

// ============== Çekirdek: aday çek ve eşleştir ==============

async function loadCandidates(supabaseAdmin: any, mode: Mode, limit: number): Promise<PartRow[]> {
  let q = supabaseAdmin
    .from("parts")
    .select("id,title,brand,oem_code,oem_codes,oem_norm,photos")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (mode === "missing_only") {
    // photos = {} : Postgres array equals empty
    q = q.eq("photos", "{}");
  } else if (mode === "incomplete") {
    // En fazla 1 fotoğrafı olanlar
    q = q.or("photos.eq.{},photos.cs.{},array_length.eq.1"); // fallback
  }

  const { data, error } = await q;
  if (error) throw new Error(`load parts: ${error.message}`);
  const rows = (data ?? []) as PartRow[];
  // OEM'i olmayanları ele
  return rows.filter(
    (r) => (r.oem_code && r.oem_code.trim().length > 0) || (r.oem_codes && r.oem_codes.length > 0),
  );
}

function partOemList(p: PartRow): string[] {
  const out = new Set<string>();
  if (p.oem_code) out.add(normalizeOem(p.oem_code));
  for (const c of p.oem_codes ?? []) out.add(normalizeOem(c));
  for (const c of p.oem_norm ?? []) out.add(c?.toUpperCase());
  out.delete("");
  return Array.from(out);
}

async function loadSourceMap(
  supabaseAdmin: any,
  oemNorms: string[],
): Promise<Map<string, SourceRow>> {
  const map = new Map<string, SourceRow>();
  if (oemNorms.length === 0) return map;

  // 500'lük parçalarla in() sorgusu
  for (let i = 0; i < oemNorms.length; i += 500) {
    const chunk = oemNorms.slice(i, i + 500);
    const { data, error } = await supabaseAdmin
      .from("oem_image_library")
      .select("oem_normalized,brand,image_url,is_primary,source_name,source_query")
      .in("oem_normalized", chunk)
      .ilike("source_name", `%${BAYRAMOTO_MARK}%`)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(`load source: ${error.message}`);
    for (const r of (data ?? []) as SourceRow[]) {
      // İlki (primary varsa primary) tutulur, sonrakiler ek görsel sayılır
      if (!map.has(r.oem_normalized)) {
        map.set(r.oem_normalized, r);
      }
    }
  }
  return map;
}

async function loadExtras(
  supabaseAdmin: any,
  oemNorms: string[],
  primaryUrls: Set<string>,
): Promise<Map<string, string[]>> {
  const extras = new Map<string, string[]>();
  if (oemNorms.length === 0) return extras;
  for (let i = 0; i < oemNorms.length; i += 500) {
    const chunk = oemNorms.slice(i, i + 500);
    const { data } = await supabaseAdmin
      .from("oem_image_library")
      .select("oem_normalized,image_url")
      .in("oem_normalized", chunk)
      .ilike("source_name", `%${BAYRAMOTO_MARK}%`);
    for (const r of (data ?? []) as { oem_normalized: string; image_url: string }[]) {
      if (primaryUrls.has(r.image_url)) continue;
      const arr = extras.get(r.oem_normalized) ?? [];
      if (!arr.includes(r.image_url)) arr.push(r.image_url);
      extras.set(r.oem_normalized, arr);
    }
  }
  return extras;
}

function evaluate(
  part: PartRow,
  source: SourceRow | undefined,
  extras: string[],
  allowOverwrite: boolean,
): MatchResult {
  const oemList = partOemList(part);
  const oemNorm = oemList.find((o) => source?.oem_normalized === o) ?? oemList[0] ?? null;
  const base: MatchResult = {
    part_id: part.id,
    oem: oemNorm,
    oem_normalized: oemNorm,
    title_part: part.title,
    brand_part: part.brand,
    title_source: source?.source_query ?? null,
    brand_source: source?.brand ?? null,
    source_url: source?.source_name?.split(" | ").pop() ?? null,
    main_image: null,
    extra_images: [],
    similarity: 0,
    status: "skipped_no_oem_match",
    reason: null,
  };

  if (!source) return { ...base, status: "skipped_no_oem_match", reason: "OEM Bayram Oto havuzunda yok" };

  // Marka kontrolü — her ikisi de doluysa kıyasla; biri boşsa kabul et
  const bp = normalizeBrand(part.brand);
  const bs = normalizeBrand(source.brand);
  if (bp && bs && bp !== bs) {
    return {
      ...base,
      status: "skipped_brand",
      reason: `marka uyuşmazlığı: ${part.brand} ≠ ${source.brand}`,
    };
  }

  // Başlık benzerliği
  const sim = jaccard(part.title, source.source_query ?? "");
  base.similarity = Number(sim.toFixed(3));
  if (sim < MIN_SIMILARITY) {
    return { ...base, status: "skipped_low_score", reason: `benzerlik ${(sim * 100).toFixed(0)}% < %60` };
  }

  // Görsel kontrolü
  if (!isGoodImageUrl(source.image_url)) {
    return { ...base, status: "skipped_no_image", reason: "geçerli görsel yok" };
  }
  base.main_image = source.image_url;
  base.extra_images = extras.filter(isGoodImageUrl).slice(0, 7);

  // Fotoğraf çakışması
  if (!allowOverwrite && part.photos.length > 0) {
    return { ...base, status: "skipped_has_photos", reason: "ürünün zaten fotoğrafı var" };
  }

  return { ...base, status: "would_update", reason: null };
}

// ============== Önizleme ==============

const previewInput = z.object({
  mode: z.enum(["missing_only", "incomplete", "all"]).default("missing_only"),
  limit: z.number().int().min(1).max(500).default(100),
  overwrite: z.boolean().default(false),
});

export const previewMatchFromBayramoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const started = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const parts = await loadCandidates(supabaseAdmin, data.mode, data.limit);

    // Tüm OEM'leri topla
    const allOems = new Set<string>();
    for (const p of parts) for (const o of partOemList(p)) allOems.add(o);
    const oemNorms = Array.from(allOems);

    const sourceMap = await loadSourceMap(supabaseAdmin, oemNorms);
    const primaryUrls = new Set<string>();
    for (const s of sourceMap.values()) primaryUrls.add(s.image_url);
    const extrasMap = await loadExtras(supabaseAdmin, oemNorms, primaryUrls);

    const results: MatchResult[] = [];
    for (const p of parts) {
      let chosen: SourceRow | undefined;
      let chosenOem: string | undefined;
      for (const o of partOemList(p)) {
        const s = sourceMap.get(o);
        if (s) { chosen = s; chosenOem = o; break; }
      }
      const extras = chosenOem ? (extrasMap.get(chosenOem) ?? []) : [];
      results.push(evaluate(p, chosen, extras, data.overwrite));
    }

    const by = (s: Status) => results.filter((r) => r.status === s).length;
    const oemMatched = results.filter((r) => r.status !== "skipped_no_oem_match").length;
    const brandMatched = results.filter(
      (r) => r.status !== "skipped_no_oem_match" && r.status !== "skipped_brand",
    ).length;
    const simPassed = results.filter(
      (r) => r.status === "would_update" || r.status === "skipped_no_image" || r.status === "skipped_has_photos",
    ).length;
    const imageFound = results.filter(
      (r) => r.status === "would_update" || r.status === "skipped_has_photos",
    ).length;
    const updatable = by("would_update");

    return {
      ok: true as const,
      duration_ms: Date.now() - started,
      mode: data.mode,
      overwrite: data.overwrite,
      min_similarity: MIN_SIMILARITY,
      total: results.length,
      oem_matched: oemMatched,
      brand_matched: brandMatched,
      similarity_passed: simPassed,
      image_found: imageFound,
      updatable,
      by_status: {
        would_update: by("would_update"),
        skipped_no_oem_match: by("skipped_no_oem_match"),
        skipped_brand: by("skipped_brand"),
        skipped_low_score: by("skipped_low_score"),
        skipped_no_image: by("skipped_no_image"),
        skipped_has_photos: by("skipped_has_photos"),
      },
      // Tüm sonuçları döndür (önizlemenin tamamı filtre/keşif için kullanılır)
      items: results.map((r) => ({
        part_id: r.part_id,
        oem: r.oem,
        title_part: r.title_part,
        brand_part: r.brand_part,
        title_source: r.title_source,
        brand_source: r.brand_source,
        source_url: r.source_url,
        main_image: r.main_image,
        extra_count: r.extra_images.length,
        similarity: r.similarity,
        status: r.status,
        reason: r.reason,
      })),
    };
  });

// ============== Uygulama (yazma) ==============

const runInput = z.object({
  mode: z.enum(["missing_only", "incomplete", "all"]).default("missing_only"),
  limit: z.number().int().min(1).max(500).default(100),
  overwrite: z.boolean().default(false),
  log_skipped: z.boolean().default(false),
});

export const matchAndUpdateFromBayramoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => runInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const started = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const parts = await loadCandidates(supabaseAdmin, data.mode, data.limit);
    const partsById = new Map(parts.map((p) => [p.id, p] as const));

    const allOems = new Set<string>();
    for (const p of parts) for (const o of partOemList(p)) allOems.add(o);
    const oemNorms = Array.from(allOems);

    const sourceMap = await loadSourceMap(supabaseAdmin, oemNorms);
    const primaryUrls = new Set<string>();
    for (const s of sourceMap.values()) primaryUrls.add(s.image_url);
    const extrasMap = await loadExtras(supabaseAdmin, oemNorms, primaryUrls);

    const results: MatchResult[] = [];
    for (const p of parts) {
      let chosen: SourceRow | undefined;
      let chosenOem: string | undefined;
      for (const o of partOemList(p)) {
        const s = sourceMap.get(o);
        if (s) { chosen = s; chosenOem = o; break; }
      }
      const extras = chosenOem ? (extrasMap.get(chosenOem) ?? []) : [];
      results.push(evaluate(p, chosen, extras, data.overwrite));
    }

    let updated = 0;
    let errors = 0;
    const errorMsgs: string[] = [];
    const logsToInsert: Record<string, unknown>[] = [];

    for (const r of results) {
      if (r.status !== "would_update") {
        if (data.log_skipped) {
          logsToInsert.push(buildLog(r, partsById.get(r.part_id), r.status, r.reason, null));
        }
        continue;
      }
      const part = partsById.get(r.part_id);
      if (!part || !r.main_image) continue;
      const oldFirst = part.photos[0] ?? null;
      const newPhotos = data.overwrite
        ? [r.main_image, ...r.extra_images, ...part.photos.filter((x) => x !== r.main_image)].slice(0, 8)
        : [r.main_image, ...r.extra_images].slice(0, 8);

      const { error } = await supabaseAdmin
        .from("parts")
        .update({ photos: newPhotos, updated_at: new Date().toISOString() })
        .eq("id", r.part_id);
      if (error) {
        errors++;
        if (errorMsgs.length < 10) errorMsgs.push(`${r.part_id}: ${error.message}`);
        logsToInsert.push(buildLog(r, part, "error", error.message, oldFirst));
        continue;
      }
      updated++;
      logsToInsert.push(buildLog(r, part, "updated", null, oldFirst));
    }

    // Log batch insert (admin context.userId)
    if (logsToInsert.length > 0) {
      for (const row of logsToInsert) row.created_by = context.userId;
      for (let i = 0; i < logsToInsert.length; i += 100) {
        const chunk = logsToInsert.slice(i, i + 100);
        const { error } = await supabaseAdmin.from("oem_image_update_log").insert(chunk as never);
        if (error && errorMsgs.length < 10) errorMsgs.push(`log: ${error.message}`);
      }
    }

    const by = (s: Status) => results.filter((r) => r.status === s).length;

    return {
      ok: true as const,
      duration_ms: Date.now() - started,
      total: results.length,
      updatable: by("would_update"),
      updated,
      errors,
      by_status: {
        would_update: by("would_update"),
        skipped_no_oem_match: by("skipped_no_oem_match"),
        skipped_brand: by("skipped_brand"),
        skipped_low_score: by("skipped_low_score"),
        skipped_no_image: by("skipped_no_image"),
        skipped_has_photos: by("skipped_has_photos"),
      },
      error_messages: errorMsgs,
    };
  });

function buildLog(
  r: MatchResult,
  part: PartRow | undefined,
  status: Status,
  reason: string | null,
  oldImage: string | null,
): Record<string, unknown> {
  return {
    part_id: r.part_id,
    oem: r.oem ?? "",
    oem_normalized: r.oem_normalized,
    brand_part: r.brand_part,
    brand_source: r.brand_source,
    title_part: r.title_part,
    title_source: r.title_source,
    similarity: r.similarity,
    old_image_url: oldImage ?? part?.photos?.[0] ?? null,
    new_image_url: r.main_image,
    extra_images: r.extra_images,
    source_type: "bayramoto",
    source_url: r.source_url,
    status,
    reason,
  };
}

// ============== Audit log listesi ==============

export const listMatchLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("oem_image_update_log")
      .select("id,part_id,oem,brand_part,brand_source,title_part,title_source,similarity,old_image_url,new_image_url,source_url,status,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { ok: true as const, rows: rows ?? [] };
  });
