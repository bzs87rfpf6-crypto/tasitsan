/**
 * Partman.gr OEM Aktarıcı (görsel + metadata + çapraz referans).
 *
 * Akış (OEM başına):
 *   1) OEM Görsel Havuzu (oem_image_library) kontrol edilir.
 *   2) Partman.gr arama HTML'i çekilir: /?s=<OEM>&post_type=product
 *   3) İlk /product/<slug>/ ziyaret edilir. Sayfadan şunlar çıkarılır:
 *        - Ürün adı, kategori (breadcrumb)
 *        - Marka, model, araç yılı (ürün attribute tablosu)
 *        - SKU + alternatif/eşdeğer OEM kodları (attribute tablosu + açıklama)
 *        - Galeri görselleri
 *   4) Ana görsel Storage'a indirilir, oem_image_library'ye upsert edilir.
 *   5) Her alternatif kod için oem_cross_reference satırı yazılır.
 *
 * Günlük limit: 5000 OEM (bugünkü partman.gr kaynaklı satırlar).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerAdmin } from "@/lib/admin-auth.server";
import { normalizeOem as centralNormalizeOem, normalizeOemFamily } from "@/lib/oem-normalize";

const ALLOWED_HOST = "partman.gr";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const STORAGE_BUCKET = "oem-image-library";
const SOURCE_NAME_PREFIX = "partman.gr";
const DAILY_LIMIT = 5000;
const BATCH_SIZE = 25;

function sameDomain(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === ALLOWED_HOST || u.hostname.endsWith("." + ALLOWED_HOST);
  } catch {
    return false;
  }
}

function normalizeOem(raw: string): string {
  return centralNormalizeOem(raw);
}

const OEM_VALID_RE = /^[A-Z0-9][A-Z0-9\-./\s]{3,49}$/i;
function isValidOem(oem: string): boolean {
  const t = oem.trim();
  if (t.length < 5) return false;
  if (normalizeOem(t).length < 4) return false;
  return OEM_VALID_RE.test(t);
}

const BAD_IMAGE_PARTS = [
  "logo", "banner", "placeholder", "no-image", "noimage", "default",
  "watermark", "sprite", "icon-", "/icons/", "payment", "favicon",
  "loading", "spinner", "blank.gif", "404_image",
];
const SIZE_RE = /-(\d{2,4})x(\d{2,4})\.(?:jpe?g|png|webp)(?:$|[?#])/i;

function isValidImage(url: string): { ok: boolean; reason?: string; width?: number; height?: number } {
  if (!url || url.length < 10) return { ok: false, reason: "empty" };
  const lower = url.toLowerCase();
  for (const bad of BAD_IMAGE_PARTS) {
    if (lower.includes(bad)) return { ok: false, reason: `bad:${bad}` };
  }
  const m = url.match(SIZE_RE);
  if (m) {
    const w = Number(m[1]); const h = Number(m[2]);
    if (w < 300) return { ok: false, reason: `small:${w}x${h}`, width: w, height: h };
    return { ok: true, width: w, height: h };
  }
  return { ok: true };
}

function upgradeToFullSize(url: string): string {
  return url.replace(/-(\d{2,4})x(\d{2,4})(\.(?:jpe?g|png|webp))/i, "$3");
}

function cleanText(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#8211;/g, "–").replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanImageUrl(url: string): string {
  return url.replace(/\\\//g, "/").replace(/&amp;/g, "&").replace(/\\u0026/g, "&").trim();
}

function isGoodWpProductUrl(url: string): boolean {
  if (!sameDomain(url)) return false;
  if (!url.includes("/wp-content/uploads/")) return false;
  return /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url);
}

const ATTR_RE = /([a-zA-Z_:.-]+)\s*=\s*(["'])(.*?)\2/g;
function getAttr(tag: string, name: string): string {
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(tag)) !== null) {
    if (m[1].toLowerCase() === name) return m[3];
  }
  return "";
}

const META_TAG_RE = /<meta\b[^>]*>/gi;
function extractMeta(html: string): { ogImage: string | null; ogTitle: string | null; description: string | null } {
  let ogImage: string | null = null;
  let ogTitle: string | null = null;
  let description: string | null = null;
  META_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = META_TAG_RE.exec(html)) !== null) {
    const tag = m[0];
    const name = (getAttr(tag, "property") || getAttr(tag, "name")).toLowerCase();
    const content = getAttr(tag, "content");
    if (!content) continue;
    if (!ogImage && (name === "og:image" || name === "og:image:secure_url")) ogImage = content;
    if (!ogTitle && name === "og:title") ogTitle = cleanText(content);
    if (!description && (name === "description" || name === "og:description")) description = cleanText(content);
  }
  if (ogImage) {
    const cleaned = cleanImageUrl(ogImage);
    ogImage = isGoodWpProductUrl(cleaned) ? cleaned : null;
  }
  return { ogImage, ogTitle, description };
}

const LARGE_IMG_RE = /data-large_image=["']([^"']+)["']/gi;
function extractLargeImages(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  LARGE_IMG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LARGE_IMG_RE.exec(html)) !== null) {
    const url = cleanImageUrl(m[1]);
    if (!isGoodWpProductUrl(url) || seen.has(url)) continue;
    seen.add(url); out.push(url);
  }
  return out;
}

const PRODUCT_LINK_RE = /href=["'](https:\/\/partman\.gr\/product\/[^"'#?]+)["']/gi;
function extractFirstProductLink(html: string): string | null {
  PRODUCT_LINK_RE.lastIndex = 0;
  const m = PRODUCT_LINK_RE.exec(html);
  return m ? m[1] : null;
}

// ---------- Metadata extraction ----------

interface ProductMeta {
  productName: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  yearRange: string | null;
  sku: string | null;
  /** Alternatif/eşdeğer OEM kodları (normalize edilmemiş ham) */
  altCodes: string[];
}

const H1_RE = /<h1[^>]*class=["'][^"']*product_title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i;

/** Breadcrumb: ilk öğe genelde "Home", son öğe ürün adı. Aradakiler kategori hiyerarşisi. */
const BREADCRUMB_RE = /<(?:nav|p|div)[^>]*(?:class|id)=["'][^"']*(?:woocommerce-breadcrumb|yoast-breadcrumbs|breadcrumb)[^"']*["'][^>]*>([\s\S]*?)<\/(?:nav|p|div)>/i;
const BREADCRUMB_PART_RE = /<a[^>]*>([\s\S]*?)<\/a>|<span[^>]*>([\s\S]*?)<\/span>/gi;

function extractBreadcrumbs(html: string): string[] {
  const block = html.match(BREADCRUMB_RE);
  if (!block) return [];
  const parts: string[] = [];
  BREADCRUMB_PART_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BREADCRUMB_PART_RE.exec(block[1])) !== null) {
    const t = cleanText(m[1] ?? m[2] ?? "");
    if (t && !/^(home|αρχική|αρχικη|»|›|\/|-)$/i.test(t)) parts.push(t);
  }
  return parts;
}

/** WooCommerce product attribute tablosu: shop_attributes / product-attribute */
const ATTR_TABLE_RE = /<table[^>]*class=["'][^"']*(?:shop_attributes|woocommerce-product-attributes)[^"']*["'][^>]*>([\s\S]*?)<\/table>/i;
const ATTR_ROW_RE = /<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;

function extractAttrs(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const block = html.match(ATTR_TABLE_RE);
  if (!block) return out;
  ATTR_ROW_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_ROW_RE.exec(block[1])) !== null) {
    const key = cleanText(m[1]).toLowerCase();
    const val = cleanText(m[2]);
    if (key && val) out.set(key, val);
  }
  return out;
}

const SKU_RE = /<span[^>]*class=["'][^"']*\bsku\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i;
function extractSku(html: string): string | null {
  const m = html.match(SKU_RE);
  return m ? cleanText(m[1]) || null : null;
}

const YEAR_RANGE_RE = /\b(19[89]\d|20[0-3]\d)\s*[-–—/]\s*(19[89]\d|20[0-3]\d|present|today|σήμερα)\b/i;
const SINGLE_YEAR_RE = /\b(19[89]\d|20[0-3]\d)\b/;

function pickYear(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const r = c.match(YEAR_RANGE_RE);
    if (r) return r[0];
  }
  for (const c of candidates) {
    if (!c) continue;
    const r = c.match(SINGLE_YEAR_RE);
    if (r) return r[1];
  }
  return null;
}

const ATTR_KEY_BRAND = ["brand", "μάρκα", "marka", "manufacturer"];
const ATTR_KEY_MODEL = ["model", "μοντέλο", "μοντελο", "vehicle"];
const ATTR_KEY_YEAR = ["year", "έτος", "ετος", "yıl", "years"];
const ATTR_KEY_OEM = ["oem", "κωδικός", "κωδικος", "code", "oe", "oem code", "oem κωδικός", "κωδ.", "part number", "part no"];
const ATTR_KEY_ALT = ["alternative", "alt", "equivalent", "εναλλακτικός", "εναλλακτικος", "cross", "cross reference", "αντίστοιχος"];

function pickAttr(attrs: Map<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    for (const [key, val] of attrs) {
      if (key.includes(k)) return val;
    }
  }
  return null;
}

const OEM_LIKE_RE = /\b([A-Z0-9]{1,4}[-./\s]?[A-Z0-9]{2,8}(?:[-./\s][A-Z0-9]{1,8}){0,3})\b/gi;

/** Bir metinden OEM benzeri kod tokenları çıkar (gürültüyü filtreler). */
function extractOemTokens(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  OEM_LIKE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OEM_LIKE_RE.exec(text)) !== null) {
    const tok = m[1].trim();
    if (!isValidOem(tok)) continue;
    const norm = normalizeOem(tok);
    // Sadece harfli ya da sadece sayılı çok kısa şeyleri ele
    if (norm.length < 6) continue;
    if (!/\d/.test(norm)) continue; // gerçek OEM'lerde rakam var
    out.push(tok);
  }
  return out;
}

function extractProductMeta(html: string, ogTitle: string | null, description: string | null): ProductMeta {
  const h1 = html.match(H1_RE);
  const productName = h1 ? cleanText(h1[1]) : ogTitle;
  const crumbs = extractBreadcrumbs(html);
  const category = crumbs.length > 1 ? crumbs.slice(0, -1).join(" › ") : (crumbs[0] ?? null);
  const attrs = extractAttrs(html);

  const brand = pickAttr(attrs, ATTR_KEY_BRAND);
  const model = pickAttr(attrs, ATTR_KEY_MODEL);
  const yearAttr = pickAttr(attrs, ATTR_KEY_YEAR);
  const yearRange = pickYear(yearAttr, productName, description);
  const sku = extractSku(html);

  const altSet = new Set<string>();
  for (const v of [pickAttr(attrs, ATTR_KEY_OEM), pickAttr(attrs, ATTR_KEY_ALT), description, productName]) {
    for (const t of extractOemTokens(v ?? "")) altSet.add(t);
  }

  return {
    productName: productName ?? null,
    category: category ?? null,
    brand: brand ?? null,
    model: model ?? null,
    yearRange,
    sku,
    altCodes: Array.from(altSet),
  };
}

// ---------- HTTP scraping ----------

async function searchPartmanForOem(oem: string): Promise<string | null> {
  const url = `https://${ALLOWED_HOST}/?s=${encodeURIComponent(oem)}&post_type=product`;
  if (!sameDomain(url)) return null;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el,en;q=0.8" }, redirect: "follow" });
  if (!res.ok) return null;
  const html = await res.text();
  return extractFirstProductLink(html);
}

interface ScrapedProduct {
  images: string[];
  meta: ProductMeta;
}

async function scrapeProduct(productUrl: string): Promise<ScrapedProduct> {
  const empty: ScrapedProduct = { images: [], meta: { productName: null, category: null, brand: null, model: null, yearRange: null, sku: null, altCodes: [] } };
  if (!sameDomain(productUrl)) return empty;
  const res = await fetch(productUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) return empty;
  const html = await res.text();
  const images: string[] = [];
  const seen = new Set<string>();
  for (const u of extractLargeImages(html)) {
    const full = upgradeToFullSize(u);
    if (!seen.has(full)) { seen.add(full); images.push(full); }
  }
  const { ogImage, ogTitle, description } = extractMeta(html);
  if (ogImage) {
    const full = upgradeToFullSize(ogImage);
    if (!seen.has(full)) { seen.add(full); images.push(full); }
  }
  const meta = extractProductMeta(html, ogTitle, description);
  return { images, meta };
}

// ---------- Storage mirror ----------

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
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface MirrorResult {
  publicUrl: string; bytes: number; hash: string; contentType: string;
  width: number | null; height: number | null;
}

async function mirrorImage(
  supabaseAdmin: any, srcUrl: string, oemNorm: string,
): Promise<MirrorResult | { error: string }> {
  if (!sameDomain(srcUrl)) return { error: "cross-domain" };
  const v = isValidImage(srcUrl);
  if (!v.ok) return { error: `invalid:${v.reason}` };
  let res: Response;
  try { res = await fetch(srcUrl, { headers: { "User-Agent": UA, Accept: "image/*" } }); }
  catch (e) { return { error: `fetch:${e instanceof Error ? e.message : "err"}` }; }
  if (!res.ok) return { error: `http:${res.status}` };
  const ct = res.headers.get("content-type");
  if (ct && !ct.startsWith("image/")) return { error: `mime:${ct}` };
  const buf = await res.arrayBuffer();
  const bytes = buf.byteLength;
  if (bytes < 2000) return { error: `tiny:${bytes}` };
  if (bytes > 5 * 1024 * 1024) return { error: `huge:${bytes}` };
  const hash = await sha256Hex(buf);
  const ext = extFromUrlOrType(srcUrl, ct);
  const oemSeg = safeSegment(oemNorm, "OEM");
  const storagePath = `partman/${oemSeg}-${hash.slice(0, 12)}.${ext}`;
  const contentType = ct?.startsWith("image/") ? ct : `image/${ext === "jpg" ? "jpeg" : ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buf, { contentType, upsert: false, cacheControl: "31536000" });
  if (upErr && !/exists|duplicate/i.test(upErr.message ?? "")) {
    return { error: `upload:${upErr.message}` };
  }
  const { data: pub } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return { publicUrl: pub.publicUrl, bytes, hash, contentType, width: v.width ?? null, height: v.height ?? null };
}

async function requireAdmin(ctx: { supabase: any; userId: string }): Promise<void> {
  await assertOwnerAdmin(ctx.supabase, ctx.userId);
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// =============== Public functions ===============

export const getPartmanStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const todayIso = startOfTodayIso();
    const [todayRes, totalRes, partsNoPhoto, xrefRes] = await Promise.all([
      supabaseAdmin.from("oem_image_library").select("id", { count: "exact", head: true })
        .like("source_name", `${SOURCE_NAME_PREFIX}%`).gte("created_at", todayIso),
      supabaseAdmin.from("oem_image_library").select("id", { count: "exact", head: true })
        .like("source_name", `${SOURCE_NAME_PREFIX}%`),
      supabaseAdmin.from("parts").select("id", { count: "exact", head: true })
        .not("oem_norm", "is", null).or("photos.is.null,photos.eq.{}"),
      supabaseAdmin.from("oem_cross_reference").select("id", { count: "exact", head: true }),
    ]);
    return {
      ok: true as const,
      today_count: todayRes.count ?? 0,
      total_count: totalRes.count ?? 0,
      daily_limit: DAILY_LIMIT,
      remaining_today: Math.max(0, DAILY_LIMIT - (todayRes.count ?? 0)),
      parts_without_photo: partsNoPhoto.count ?? 0,
      cross_refs_total: xrefRes.count ?? 0,
      bucket: STORAGE_BUCKET,
      batch_size: BATCH_SIZE,
    };
  });

const fetchOemsInput = z.object({
  limit: z.number().int().min(1).max(500).default(BATCH_SIZE),
});

export const fetchCandidateOems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fetchOemsInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pull = Math.min(2000, data.limit * 5);
    // NOTE: parts tablosundaki OEM kolonu `oem_code` (raw) ve `oem_norm` (normalize).
    const { data: rows, error } = await supabaseAdmin
      .from("parts").select("oem_code, oem_norm")
      .not("oem_norm", "is", null).or("photos.is.null,photos.eq.{}").limit(pull);
    if (error) throw new Error(`parts select failed (oem_code, oem_norm): ${error.message}`);
    const uniq = new Map<string, string>();
    for (const r of rows ?? []) {
      const oem = (r as any).oem_code as string | null;
      const norm = (r as any).oem_norm as string | null;
      if (!oem || !norm || !isValidOem(oem)) continue;
      if (!uniq.has(norm)) uniq.set(norm, oem);
    }
    const norms = Array.from(uniq.keys());
    if (norms.length === 0) return { ok: true as const, oems: [] as string[] };
    const inLib = new Set<string>();
    for (let i = 0; i < norms.length; i += 500) {
      const chunk = norms.slice(i, i + 500);
      const { data: lib } = await supabaseAdmin
        .from("oem_image_library").select("oem_normalized").in("oem_normalized", chunk);
      for (const r of lib ?? []) if ((r as any).oem_normalized) inLib.add((r as any).oem_normalized);
    }
    const oems: string[] = [];
    for (const [norm, raw] of uniq) {
      if (inLib.has(norm)) continue;
      oems.push(raw);
      if (oems.length >= data.limit) break;
    }
    return { ok: true as const, oems };
  });

const runInput = z.object({
  oems: z.array(z.string()).min(1).max(BATCH_SIZE),
});

interface RunItem {
  oem: string;
  oem_normalized: string;
  status: "saved" | "in_library" | "not_found" | "invalid_oem" | "no_image" | "mirror_failed" | "db_failed";
  product_url?: string;
  image_url?: string;
  product_name?: string | null;
  brand?: string | null;
  model?: string | null;
  year_range?: string | null;
  category?: string | null;
  alt_codes?: string[];
  cross_refs_saved?: number;
  error?: string;
}

export const runPartmanImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => runInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const started = Date.now();

    const todayIso = startOfTodayIso();
    const { count: todayCount } = await supabaseAdmin
      .from("oem_image_library").select("id", { count: "exact", head: true })
      .like("source_name", `${SOURCE_NAME_PREFIX}%`).gte("created_at", todayIso);
    const usedToday = todayCount ?? 0;
    const remaining = Math.max(0, DAILY_LIMIT - usedToday);
    if (remaining === 0) {
      return {
        ok: false as const, duration_ms: Date.now() - started, used_today: usedToday,
        remaining: 0, processed: 0, saved: 0, cross_refs_saved: 0, items: [] as RunItem[],
        error: `Günlük limit (${DAILY_LIMIT}) doldu.`,
      };
    }

    const seen = new Set<string>();
    const todo: { oem: string; norm: string }[] = [];
    for (const raw of data.oems) {
      const oem = raw.trim();
      const norm = normalizeOem(oem);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      todo.push({ oem, norm });
      if (todo.length >= remaining) break;
    }

    const norms = todo.map((t) => t.norm);
    const inLib = new Set<string>();
    if (norms.length > 0) {
      const { data: lib } = await supabaseAdmin
        .from("oem_image_library").select("oem_normalized").in("oem_normalized", norms);
      for (const r of lib ?? []) if ((r as any).oem_normalized) inLib.add((r as any).oem_normalized);
    }

    const items: RunItem[] = [];
    let saved = 0;
    let xrefSaved = 0;

    for (const { oem, norm } of todo) {
      if (inLib.has(norm)) {
        items.push({ oem, oem_normalized: norm, status: "in_library" });
        continue;
      }
      if (!isValidOem(oem)) {
        items.push({ oem, oem_normalized: norm, status: "invalid_oem" });
        continue;
      }
      let productUrl: string | null = null;
      try { productUrl = await searchPartmanForOem(oem); } catch { productUrl = null; }
      if (!productUrl) {
        items.push({ oem, oem_normalized: norm, status: "not_found" });
        continue;
      }
      let scraped: ScrapedProduct = { images: [], meta: { productName: null, category: null, brand: null, model: null, yearRange: null, sku: null, altCodes: [] } };
      try { scraped = await scrapeProduct(productUrl); } catch { /* keep empty */ }
      const { images, meta } = scraped;

      // ---- Cross-references (görsel olmasa da yaz) ----
      const altRows: any[] = [];
      const seenAlt = new Set<string>([norm]);
      for (const alt of meta.altCodes) {
        const altNorm = normalizeOem(alt);
        if (!altNorm || seenAlt.has(altNorm)) continue;
        seenAlt.add(altNorm);
        altRows.push({
          oem_code: oem, oem_normalized: norm,
          equivalent_code: alt, equivalent_normalized: altNorm,
          brand: meta.brand, model: meta.model,
          year_range: meta.yearRange, category: meta.category,
          product_name: meta.productName,
          source: SOURCE_NAME_PREFIX, source_url: productUrl,
          confidence: 80, verified: false,
        });
      }
      if (altRows.length > 0) {
        const { error: xrefErr, data: xrefIns } = await supabaseAdmin
          .from("oem_cross_reference")
          .upsert(altRows, { onConflict: "oem_normalized,equivalent_normalized,source", ignoreDuplicates: true })
          .select("id");
        if (!xrefErr) xrefSaved += xrefIns?.length ?? 0;
      }

      if (images.length === 0) {
        items.push({
          oem, oem_normalized: norm, status: "no_image", product_url: productUrl,
          product_name: meta.productName, brand: meta.brand, model: meta.model,
          year_range: meta.yearRange, category: meta.category, alt_codes: meta.altCodes,
          cross_refs_saved: altRows.length,
        });
        continue;
      }
      const main = images[0];
      const mirror = await mirrorImage(supabaseAdmin, main, norm);
      if ("error" in mirror) {
        items.push({
          oem, oem_normalized: norm, status: "mirror_failed", product_url: productUrl,
          product_name: meta.productName, brand: meta.brand, model: meta.model,
          year_range: meta.yearRange, category: meta.category, alt_codes: meta.altCodes,
          cross_refs_saved: altRows.length, error: mirror.error,
        });
        continue;
      }

      // source_name'a meta gömerek metadata'yı koru (oem_image_library şemasını değiştirmiyoruz)
      const sourceTags = [
        SOURCE_NAME_PREFIX,
        productUrl,
        meta.productName ? `name:${meta.productName}` : null,
        meta.model ? `model:${meta.model}` : null,
        meta.yearRange ? `year:${meta.yearRange}` : null,
        meta.category ? `cat:${meta.category}` : null,
      ].filter(Boolean).join(" | ");

      const { error: insErr, data: ins } = await supabaseAdmin
        .from("oem_image_library")
        .upsert({
          oem, oem_normalized: norm,
          brand: meta.brand,
          image_url: mirror.publicUrl,
          image_hash: mirror.hash,
          bytes: mirror.bytes,
          source_type: "supplier_catalog",
          source_name: sourceTags.slice(0, 500),
          source_query: oem.slice(0, 200),
          confidence: 85, verified: true, is_primary: true, use_count: 0,
          width: mirror.width, height: mirror.height,
        }, { onConflict: "oem_normalized,image_url", ignoreDuplicates: true })
        .select("id");
      if (insErr) {
        items.push({
          oem, oem_normalized: norm, status: "db_failed", product_url: productUrl,
          image_url: mirror.publicUrl, product_name: meta.productName, brand: meta.brand,
          model: meta.model, year_range: meta.yearRange, category: meta.category,
          alt_codes: meta.altCodes, cross_refs_saved: altRows.length, error: insErr.message,
        });
        continue;
      }
      saved += ins?.length ?? 0;
      inLib.add(norm);
      items.push({
        oem, oem_normalized: norm,
        status: (ins?.length ?? 0) > 0 ? "saved" : "in_library",
        product_url: productUrl, image_url: mirror.publicUrl,
        product_name: meta.productName, brand: meta.brand, model: meta.model,
        year_range: meta.yearRange, category: meta.category,
        alt_codes: meta.altCodes, cross_refs_saved: altRows.length,
      });
    }

    return {
      ok: true as const,
      duration_ms: Date.now() - started,
      used_today: usedToday + saved,
      remaining: Math.max(0, DAILY_LIMIT - (usedToday + saved)),
      processed: items.length,
      saved,
      cross_refs_saved: xrefSaved,
      items,
    };
  });
