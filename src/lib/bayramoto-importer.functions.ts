/**
 * Bayramoto.com.tr toplu içe aktarma.
 *
 * Akış:
 *   1) WooCommerce Store API üzerinden ürünleri sayfa sayfa çek.
 *      (https://bayramoto.com.tr/wp-json/wc/store/v1/products)
 *   2) Her ürün için: SKU (OEM), marka, başlık, permalink elde edilir.
 *      Store API images alanını çoğunlukla boş döndürdüğü için ürün HTML'i
 *      ek olarak çekilir; og:image ve woocommerce-product-gallery
 *      data-large_image alanlarından görsel URL'leri toplanır.
 *   3) Sonuçlar oem_image_library tablosuna upsert edilir.
 *
 * Sadece bayramoto.com.tr ve alt URL'lerine istek atılır.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";

const ALLOWED_HOST = "bayramoto.com.tr";
const STORE_API = `https://${ALLOWED_HOST}/wp-json/wc/store/v1/products`;
const UA = "Mozilla/5.0 (compatible; TasitsanImporter/1.0; +https://www.tasitsan.com.tr)";

function sameDomain(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === ALLOWED_HOST || u.hostname.endsWith("." + ALLOWED_HOST);
  } catch {
    return false;
  }
}

function normalizeOem(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-./_]+/g, "");
}

// ---------- Validation ----------
const OEM_VALID_RE = /^[A-Z0-9][A-Z0-9\-./\s]{3,49}$/i; // 4-50 char, alfasayısal + ayraç
const BAD_IMAGE_PARTS = [
  "logo", "banner", "placeholder", "no-image", "noimage", "default",
  "watermark", "sprite", "icon-", "/icons/", "payment", "thumbnail-default",
  "loading", "spinner", "blank.gif",
];
const SIZE_RE = /-(\d{2,4})x(\d{2,4})\.(?:jpe?g|png|webp)(?:$|[?#])/i;

function isValidOem(oem: string): boolean {
  const trimmed = oem.trim();
  if (trimmed.length < 5) return false;
  const norm = normalizeOem(trimmed);
  if (norm.length < 4) return false; // ayraçlardan sonra da kısa olmasın
  return OEM_VALID_RE.test(trimmed);
}

function isValidImage(url: string): { ok: boolean; reason?: string; width?: number; height?: number } {
  if (!url || url.length < 10) return { ok: false, reason: "empty" };
  const lower = url.toLowerCase();
  for (const bad of BAD_IMAGE_PARTS) {
    if (lower.includes(bad)) return { ok: false, reason: `bad:${bad}` };
  }
  // WP boyut eki -WxH.ext varsa boyutu doğrula. Yoksa (full size) varsay ≥300.
  const m = url.match(SIZE_RE);
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w < 300) return { ok: false, reason: `small:${w}x${h}`, width: w, height: h };
    return { ok: true, width: w, height: h };
  }
  return { ok: true };
}

/**
 * WP thumbnail (-350x435.jpg) URL'sini full-size'a çevir.
 * Ana görsel olarak her zaman full-size tercih edilir.
 */
function upgradeToFullSize(url: string): string {
  return url.replace(/-(\d{2,4})x(\d{2,4})(\.(?:jpe?g|png|webp))/i, "$3");
}


interface ScrapedProduct {
  oem: string;
  oem_normalized: string;
  title: string;
  brand: string | null;
  url: string;
  main_image: string | null;
  main_score: number;
  images: string[];
}


interface StoreProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  sku: string;
  brands?: { name: string }[];
  images?: unknown;
  image?: unknown;
  [key: string]: unknown;
}

async function fetchStorePage(page: number, perPage: number): Promise<StoreProduct[]> {
  const url = `${STORE_API}?per_page=${perPage}&page=${page}`;
  if (!sameDomain(url)) throw new Error("blocked: cross-domain");
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`store api page ${page} HTTP ${res.status}`);
  }
  return (await res.json()) as StoreProduct[];
}

const META_TAG_RE = /<meta\b[^>]*>/gi;
const ATTR_RE = /([a-zA-Z_:.-]+)\s*=\s*(["'])(.*?)\2/g;

// WooCommerce ürün galerisi bloğu (tek ürün sayfasındaki asıl galeri).
// `single-product` ve `woocommerce-product-gallery` aynı div'de bulunur.
const WC_GALLERY_BLOCK_RE =
  /<(?:div|figure)[^>]*class=["'][^"']*woocommerce-product-gallery[^"']*["'][\s\S]*?<\/(?:div|figure)>\s*(?=<(?:div|section|aside|footer|nav)\b|<\/(?:div|section|main|article)>)/i;

// Galeri item'larında WooCommerce data-large_image kullanır (zoom için tam boy).
const LARGE_IMG_RE = /data-large_image=["']([^"']+)["']/gi;
// Galeri içindeki <img> etiketinin src/alt/title özelliklerini birlikte yakala.
const IMG_TAG_RE = /<img\b([^>]+)>/gi;

interface GalleryImage {
  url: string;
  alt: string;
  title: string;
}

interface ImageSources {
  gallery: GalleryImage[]; // ürün galerisi (asıl kaynak, sıralı)
  og_image: string | null; // fallback
  store_image: string | null; // Store API single image
}

function cleanImageUrl(url: string): string {
  return url
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/g, "&")
    .trim();
}

function isGoodWpProductUrl(url: string): boolean {
  if (!sameDomain(url)) return false;
  if (!url.includes("/wp-content/uploads/")) return false;
  return /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url);
}

function getAttr(tag: string, name: string): string {
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(tag)) !== null) {
    if (m[1].toLowerCase() === name) return m[3];
  }
  return "";
}

function extractMetaImage(html: string): string | null {
  let og: string | null = null;
  let m: RegExpExecArray | null;
  META_TAG_RE.lastIndex = 0;
  while ((m = META_TAG_RE.exec(html)) !== null) {
    const tag = m[0];
    const name = (getAttr(tag, "property") || getAttr(tag, "name")).toLowerCase();
    const content = getAttr(tag, "content");
    if (!content) continue;
    if (name === "og:image" || name === "og:image:secure_url") {
      og = content;
      break;
    }
  }
  if (!og) return null;
  const cleaned = cleanImageUrl(og);
  return isGoodWpProductUrl(cleaned) ? cleaned : null;
}

function extractGalleryImages(html: string): GalleryImage[] {
  const block = html.match(WC_GALLERY_BLOCK_RE)?.[0];
  if (!block) return [];

  const seen = new Set<string>();
  const out: GalleryImage[] = [];

  // 1) data-large_image — galeri item'larının tam boy URL'i
  let m: RegExpExecArray | null;
  LARGE_IMG_RE.lastIndex = 0;
  while ((m = LARGE_IMG_RE.exec(block)) !== null) {
    const url = cleanImageUrl(m[1]);
    if (!isGoodWpProductUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, alt: "", title: "" });
  }

  // 2) Galeri içindeki <img> — alt/title text'lerini eşle, eksik kalanları ekle
  IMG_TAG_RE.lastIndex = 0;
  while ((m = IMG_TAG_RE.exec(block)) !== null) {
    const attrs = m[1];
    const src = cleanImageUrl(getAttr(attrs, "src") || getAttr(attrs, "data-src") || "");
    const alt = getAttr(attrs, "alt");
    const title = getAttr(attrs, "title");
    if (!src || !isGoodWpProductUrl(src)) continue;
    const full = upgradeToFullSize(src);
    const existing = out.find((g) => g.url === full || upgradeToFullSize(g.url) === full);
    if (existing) {
      if (alt && !existing.alt) existing.alt = alt;
      if (title && !existing.title) existing.title = title;
      continue;
    }
    if (seen.has(full)) continue;
    seen.add(full);
    out.push({ url: full, alt, title });
  }

  return out;
}

function singleStoreApiImage(storeImage: unknown): string | null {
  // Store API tek ürün: { image: { src, thumbnail, ... } } veya images:[{src}]
  if (!storeImage || typeof storeImage !== "object") return null;
  const obj = storeImage as Record<string, unknown>;
  const candidates: unknown[] = [];
  if (Array.isArray(obj.images)) candidates.push(...obj.images);
  if (obj.image) candidates.push(obj.image);
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") {
      const u = cleanImageUrl(c);
      if (isGoodWpProductUrl(u)) return upgradeToFullSize(u);
    } else if (typeof c === "object") {
      const rec = c as Record<string, unknown>;
      for (const k of ["src", "large", "full", "url"]) {
        const v = rec[k];
        if (typeof v === "string") {
          const u = cleanImageUrl(v);
          if (isGoodWpProductUrl(u)) return upgradeToFullSize(u);
        }
      }
    }
  }
  return null;
}

// Başlık ile alt/title metnini eşleştirme skoru (0..1).
// "Far Mitsubishi L200" → token'lar: ["far","mitsubishi","l200"]
const STOPWORDS = new Set([
  "için","ile","ve","veya","the","and","or","oem","yedek","parça","parca",
  "orjinal","orijinal","muadil","nikelajli","sag","sol","on","arka","ust","alt",
]);
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}
function titleMatchScore(title: string, alt: string, urlPath: string): number {
  const titleTokens = tokenize(title);
  if (titleTokens.length === 0) return 0;
  const hay = (alt + " " + urlPath).toLowerCase();
  let hit = 0;
  for (const t of titleTokens) if (hay.includes(t)) hit++;
  return hit / titleTokens.length;
}

async function scrapeProductPage(
  permalink: string,
  storeImage: unknown = null,
  productTitle = "",
): Promise<{ main: string | null; images: string[]; sources: ImageSources | null; status: number; main_score: number }> {
  if (!sameDomain(permalink)) return { main: null, images: [], sources: null, status: 0, main_score: 0 };
  const res = await fetch(permalink, { headers: { "User-Agent": UA } });
  if (!res.ok) return { main: null, images: [], sources: null, status: res.status, main_score: 0 };
  const html = await res.text();

  const gallery = extractGalleryImages(html);
  const og = extractMetaImage(html);
  const storeImg = singleStoreApiImage(storeImage);

  const sources: ImageSources = { gallery, og_image: og, store_image: storeImg };

  // Primary seçimi: önce galerinin ilk geçerli görseli.
  // Yoksa Store API ana görseli. Son fallback og:image.
  let main: string | null = null;
  let mainScore = 0;
  for (const g of gallery) {
    const full = upgradeToFullSize(g.url);
    if (!isValidImage(full).ok) continue;
    main = full;
    mainScore = titleMatchScore(productTitle, `${g.alt} ${g.title}`, full);
    break;
  }
  if (!main && storeImg && isValidImage(storeImg).ok) {
    main = storeImg;
    mainScore = titleMatchScore(productTitle, "", storeImg);
  }
  if (!main && og && isValidImage(og).ok) {
    main = og;
    mainScore = titleMatchScore(productTitle, "", og);
  }

  // Ek görseller: galerideki diğer geçerli URL'ler (primary hariç).
  const extras: string[] = [];
  for (const g of gallery) {
    const full = upgradeToFullSize(g.url);
    if (full === main) continue;
    if (!isValidImage(full).ok) continue;
    if (!extras.includes(full)) extras.push(full);
    if (extras.length >= 7) break;
  }

  return { main, images: extras, sources, status: res.status, main_score: mainScore };
}





async function collectProducts(maxProducts: number, startPage: number, concurrency = 4):
Promise<{ products: ScrapedProduct[]; pagesScanned: number; storeProductsSeen: number; }> {
  const perPage = Math.min(100, maxProducts);
  const out: ScrapedProduct[] = [];
  let page = startPage;
  let pagesScanned = 0;
  let storeProductsSeen = 0;

  while (out.length < maxProducts) {
    const rows = await fetchStorePage(page, perPage);
    pagesScanned++;
    if (!rows.length) break;
    storeProductsSeen += rows.length;

    const candidates = rows
      .filter((r) => r.sku && isValidOem(r.sku) && r.permalink && sameDomain(r.permalink))
      .slice(0, maxProducts - out.length);


    // Sayfa içi sınırlı paralel scrape
    for (let i = 0; i < candidates.length; i += concurrency) {
      const chunk = candidates.slice(i, i + concurrency);
      const results = await Promise.all(
        chunk.map(async (p) => {
          try {
            const { main, images, main_score } = await scrapeProductPage(p.permalink, p, p.name);
            return { p, main, images, main_score };
          } catch {
            return { p, main: null, images: [] as string[], main_score: 0 };
          }
        }),

      );
      for (const { p, main, images, main_score } of results) {
        out.push({
          oem: p.sku.trim(),
          oem_normalized: normalizeOem(p.sku),
          title: p.name,
          brand: p.brands?.[0]?.name ?? null,
          url: p.permalink,
          main_image: main,
          main_score,
          images,
        });
        if (out.length >= maxProducts) break;
      }

      if (out.length >= maxProducts) break;
    }
    page++;
    if (rows.length < perPage) break; // son sayfa
  }
  return { products: out, pagesScanned, storeProductsSeen };
}

async function requireAdmin(ctx: { supabase: any; userId: string }): Promise<void> {
  await assertOwnerAdmin(ctx.supabase, ctx.userId);
}

// ============== Preview (kayıt yok) ==============

const previewInput = z.object({
  limit: z.number().int().min(1).max(100).default(100),
  page: z.number().int().min(1).max(1000).default(1),
});

// İçe aktarma için minimum başlık↔görsel eşleşme skoru.
const MIN_MATCH_SCORE = 0.5;

export const previewBayramotoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const started = Date.now();
    const { products, pagesScanned, storeProductsSeen } = await collectProducts(data.limit, data.page);

    const withOem = products.filter((p) => isValidOem(p.oem)).length;
    const withImage = products.filter((p) => !!p.main_image).length;
    const withBoth = products.filter((p) => isValidOem(p.oem) && !!p.main_image).length;
    const totalImages = products.reduce((n, p) => n + (p.main_image ? 1 : 0) + p.images.length, 0);

    // Skor dağılımı (yalnızca görseli olanlar üzerinden)
    const buckets = { s80: 0, s60: 0, s40: 0, s0: 0 };
    for (const p of products) {
      if (!p.main_image) continue;
      const s = p.main_score;
      if (s >= 0.8) buckets.s80++;
      else if (s >= 0.6) buckets.s60++;
      else if (s >= 0.4) buckets.s40++;
      else buckets.s0++;
    }

    // Gerçek başarı: OEM geçerli + görsel var + skor >= eşik
    const trueHits = products.filter(
      (p) => isValidOem(p.oem) && p.main_image && p.main_score >= MIN_MATCH_SCORE,
    ).length;
    const denom = withOem || 1;

    // Tüm 100 ürün listesi (önizleme için)
    const items = products.map((p) => {
      const oemValid = isValidOem(p.oem);
      const score = Number(p.main_score.toFixed(2));
      const status: "accept" | "reject_score" | "reject_oem" | "reject_no_image" =
        !oemValid
          ? "reject_oem"
          : !p.main_image
            ? "reject_no_image"
            : score < MIN_MATCH_SCORE
              ? "reject_score"
              : "accept";
      return {
        oem: p.oem,
        brand: p.brand,
        title: p.title,
        url: p.url,
        main_image: p.main_image,
        main_score: score,
        extra_images: p.images.length,
        oem_valid: oemValid,
        status,
      };
    });

    return {
      ok: true as const,
      domain: ALLOWED_HOST,
      min_score: MIN_MATCH_SCORE,
      duration_ms: Date.now() - started,
      pages_scanned: pagesScanned,
      products_seen: storeProductsSeen,
      products_with_oem: withOem,
      products_with_image: withImage,
      products_with_oem_and_image: withBoth,
      total_images_found: totalImages,
      score_buckets: buckets,
      true_success_count: trueHits,
      true_success_rate: Number((trueHits / denom).toFixed(3)),
      importable_count: trueHits,
      items,
    };
  });


// ============== Import (oem_image_library'ye kaydet) ==============

const importInput = z.object({
  limit: z.number().int().min(1).max(500).default(100),
  page: z.number().int().min(1).max(1000).default(1),
});

const STORAGE_BUCKET = "oem-image-library";

function safeSegment(s: string | null | undefined, fallback: string): string {
  const v = (s ?? "").trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return v.length > 0 ? v.slice(0, 60) : fallback;
}

function extFromUrlOrType(url: string, contentType: string | null): string {
  const m = url.toLowerCase().match(/\.(jpe?g|png|webp)(?:\?|#|$)/);
  if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  if (contentType) {
    if (contentType.includes("png")) return "png";
    if (contentType.includes("webp")) return "webp";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  }
  return "jpg";
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface MirrorResult {
  publicUrl: string;
  storagePath: string;
  bytes: number;
  hash: string;
  contentType: string;
}

async function mirrorImageToStorage(
  supabaseAdmin: any,
  srcUrl: string,
  brand: string | null,
  oemNorm: string,
): Promise<MirrorResult | { error: string }> {
  if (!sameDomain(srcUrl)) return { error: "cross-domain" };
  let res: Response;
  try {
    res = await fetch(srcUrl, { headers: { "User-Agent": UA, Accept: "image/*" } });
  } catch (e) {
    return { error: `fetch:${e instanceof Error ? e.message : "err"}` };
  }
  if (!res.ok) return { error: `http:${res.status}` };
  const ct = res.headers.get("content-type");
  if (ct && !ct.startsWith("image/")) return { error: `mime:${ct}` };
  const buf = await res.arrayBuffer();
  const bytes = buf.byteLength;
  if (bytes < 2000) return { error: `tiny:${bytes}` };
  if (bytes > 5 * 1024 * 1024) return { error: `huge:${bytes}` };
  const hash = await sha256Hex(buf);
  const ext = extFromUrlOrType(srcUrl, ct);
  const brandSeg = safeSegment(brand, "_unknown");
  const oemSeg = safeSegment(oemNorm, "OEM");
  const storagePath = `${brandSeg}/${oemSeg}-${hash.slice(0, 12)}.${ext}`;
  const contentType = ct?.startsWith("image/") ? ct : `image/${ext === "jpg" ? "jpeg" : ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buf, { contentType, upsert: false, cacheControl: "31536000" });
  if (upErr && !/exists|duplicate/i.test(upErr.message ?? "")) {
    return { error: `upload:${upErr.message}` };
  }
  const { data: pub } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return { publicUrl: pub.publicUrl, storagePath, bytes, hash, contentType };
}

export const runBayramotoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const started = Date.now();
    const { products, pagesScanned, storeProductsSeen } = await collectProducts(data.limit, data.page);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let savedRows = 0;
    let mirroredCount = 0;
    let mirrorFailed = 0;
    let skippedNoImage = 0;
    let skippedInvalidOem = 0;
    let skippedBadImage = 0;
    let skippedLowScore = 0;
    const errors: string[] = [];

    type Row = {
      oem: string;
      oem_normalized: string;
      brand: string | null;
      image_url: string;
      image_hash: string;
      bytes: number;
      source_type: string;
      source_name: string;
      source_query: string;
      confidence: number;
      verified: boolean;
      is_primary: boolean;
      use_count: number;
      width: number | null;
      height: number | null;
    };

    const oemNorms = Array.from(new Set(products.map((p) => p.oem_normalized).filter(Boolean)));
    const existingPrimary = new Set<string>();
    if (oemNorms.length > 0) {
      const { data: prim } = await supabaseAdmin
        .from("oem_image_library")
        .select("oem_normalized")
        .in("oem_normalized", oemNorms)
        .eq("is_primary", true);
      for (const r of prim ?? []) if (r.oem_normalized) existingPrimary.add(r.oem_normalized);
    }

    const rows: Row[] = [];

    for (const p of products) {
      if (!isValidOem(p.oem)) { skippedInvalidOem++; continue; }
      if (!p.main_image) { skippedNoImage++; continue; }
      if (p.main_score < MIN_MATCH_SCORE) { skippedLowScore++; continue; }
      const allUrls: string[] = [p.main_image];
      for (const u of p.images) if (u !== p.main_image) allUrls.push(u);
      const validUrls: { url: string; w: number | null; h: number | null }[] = [];
      for (const url of allUrls) {
        const v = isValidImage(url);
        if (!v.ok) { skippedBadImage++; continue; }
        validUrls.push({ url, w: v.width ?? null, h: v.height ?? null });
      }
      if (validUrls.length === 0) { skippedNoImage++; continue; }

      let firstWrite = !existingPrimary.has(p.oem_normalized);
      for (const { url, w, h } of validUrls) {
        const mirror = await mirrorImageToStorage(supabaseAdmin, url, p.brand, p.oem_normalized);
        if ("error" in mirror) {
          mirrorFailed++;
          if (errors.length < 10) errors.push(`${p.oem_normalized}:${mirror.error}`);
          continue;
        }
        mirroredCount++;

        const primary = firstWrite;
        if (firstWrite) {
          existingPrimary.add(p.oem_normalized);
          firstWrite = false;
        }
        rows.push({
          oem: p.oem,
          oem_normalized: p.oem_normalized,
          brand: p.brand,
          image_url: mirror.publicUrl,
          image_hash: mirror.hash,
          bytes: mirror.bytes,
          source_type: "supplier_catalog",
          source_name: `bayramoto.com.tr | ${p.url}`,
          source_query: p.title.slice(0, 200),
          confidence: 90,
          verified: true,
          is_primary: primary,
          use_count: 0,
          width: w,
          height: h,
        });
      }
    }

    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const { error, data: ins } = await supabaseAdmin
        .from("oem_image_library")
        .upsert(chunk, { onConflict: "oem_normalized,image_url", ignoreDuplicates: true })
        .select("id");
      if (error && errors.length < 10) errors.push(`chunk ${i}: ${error.message}`);
      else savedRows += ins?.length ?? 0;
    }

    return {
      ok: true as const,
      domain: ALLOWED_HOST,
      duration_ms: Date.now() - started,
      pages_scanned: pagesScanned,
      products_seen: storeProductsSeen,
      products_processed: products.length,
      rows_saved: savedRows,
      images_mirrored: mirroredCount,
      images_mirror_failed: mirrorFailed,
      products_skipped_no_image: skippedNoImage,
      products_skipped_invalid_oem: skippedInvalidOem,
      products_skipped_low_score: skippedLowScore,
      min_score: MIN_MATCH_SCORE,
      images_skipped_bad: skippedBadImage,
      errors: errors.slice(0, 10),
      next_page: pagesScanned > 0 ? data.page + pagesScanned : data.page + 1,
    };
  });


// ============== OEM Havuz İstatistikleri ==============

export const getOemLibraryStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [totalImages, verifiedRes, partsWithOem, partsNoPhoto] = await Promise.all([
      supabaseAdmin.from("oem_image_library").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("oem_image_library").select("id", { count: "exact", head: true }).eq("verified", true),
      supabaseAdmin.from("parts").select("id", { count: "exact", head: true }).not("oem_norm", "is", null),
      supabaseAdmin.from("parts").select("id", { count: "exact", head: true }).not("oem_norm", "is", null).or("photos.is.null,photos.eq.{}"),
    ]);

    const { data: distinctData } = await supabaseAdmin.rpc("count_distinct_oem_library");
    const distinctOemCount = distinctData == null ? 0 : Number(distinctData);

    const { data: matchData } = await supabaseAdmin.rpc("count_parts_matching_oem_library");
    const matchedParts = matchData == null ? null : Number(matchData);

    return {
      ok: true as const,
      total_images: totalImages.count ?? 0,
      verified_images: verifiedRes.count ?? 0,
      distinct_oem: distinctOemCount,
      parts_with_oem: partsWithOem.count ?? 0,
      parts_without_photo: partsNoPhoto.count ?? 0,
      matched_parts: matchedParts,
      bucket: STORAGE_BUCKET,
    };
  });


