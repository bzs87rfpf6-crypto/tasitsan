/**
 * OnlineParça uçtan uca OEM boru hattı (sunucu tarafı).
 *
 * Akış: SEARCH → SEARCH_PARSE → PRODUCT_MATCH → DETAIL_REQUEST → DETAIL_PARSE
 *       → PRICE → STOCK → EXTERNAL_SUPPLIER_SAVE
 *
 * Kurallar:
 *  - Her adım ayrı loglanır ve ayrı hata kodu üretir.
 *  - HTTP 200 tek başına "ürün bulundu" sayılmaz.
 *  - Stok tespit edilemezse `unknown` olur; asla `in_stock` varsayılmaz.
 *  - Şifre / cookie / session token loglanmaz.
 *  - Mevcut login/session mekanizması (supplier-scan.server) aynen kullanılır.
 */
import { calcSupplierSalePrice } from "@/lib/external-supplier";
import {
  loginSupplier,
  normalizeOem,
  parseDetailPage,
  VerificationRequiredError,
  type SupplierSession,
} from "@/lib/supplier-scan.server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
/** Arama isteği zaman aşımı — müşteri araması bloklanmasın diye kısa tutulur. */
const SEARCH_TIMEOUT_MS = 4_500;
/** Detay isteği zaman aşımı (arama satırı zaten yedek veri sağlar). */
const DETAIL_TIMEOUT_MS = 4_500;
const TIMEOUT_MS = SEARCH_TIMEOUT_MS;

export type StepStatus = "PASS" | "FAIL" | "SKIP";
export type StockStatus = "in_stock" | "out_of_stock" | "ask" | "unknown";

export type PipelineErrorCode =
  | "LOGIN_ERROR"
  | "SEARCH_HTTP_ERROR"
  | "SEARCH_PARSE_ERROR"
  | "PRODUCT_MATCH_ERROR"
  | "DETAIL_HTTP_ERROR"
  | "DETAIL_PARSE_ERROR"
  | "PRICE_PARSE_ERROR"
  | "STOCK_PARSE_ERROR"
  | "DATABASE_SAVE_ERROR";

export interface PipelineStep {
  step: string;
  status: StepStatus;
  httpStatus: number | null;
  url: string | null;
  durationMs: number;
  info: string | null;
  error: string | null;
}

export interface MatchedProduct {
  external_product_id: string | null;
  external_product_url: string;
  external_source_url: string | null;
  product_name: string | null;
  product_code: string | null;
  oem: string;
  normalized_oem: string;
  brand: string | null;
  list_price: number | null;
  source_currency: "TRY";
  price_includes_vat: boolean;
  stock_status: StockStatus;
  stock_quantity: number | null;
  image_url: string | null;
  match_type: MatchType;
}

export type MatchType =
  | "exact_oem"
  | "normalized_oem"
  | "product_code"
  | "product_url"
  | "product_name"
  | "none";

export interface PipelineResult {
  oem: string;
  normalizedOem: string;
  steps: PipelineStep[];
  errorCode: PipelineErrorCode | null;
  message: string;
  candidates: Array<{
    url: string | null;
    name: string | null;
    sku: string | null;
    price: number | null;
    stock: StockStatus;
    matchType: MatchType;
  }>;
  product: MatchedProduct | null;
  saved: { action: "CREATED" | "UPDATED" | "SKIPPED"; part_id: string | null; sale_price: number | null } | null;
}

// ---------------------------------------------------------------- utilities

function nowMs() {
  return Date.now();
}

async function timedFetch(url: string, cookie: string, xhr = false, timeoutMs = TIMEOUT_MS) {
  const started = nowMs();
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Cookie: cookie,
      Accept: xhr ? "text/html, */*; q=0.01" : "text/html,application/xhtml+xml",
      ...(xhr ? { "X-Requested-With": "XMLHttpRequest" } : {}),
      Referer: new URL(url).origin + "/",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const html = await res.text();
  return { res, html, durationMs: nowMs() - started };
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

/** "₺512,18" / "1.234,56" / "1234.56" → 512.18 */
function parsePrice(raw: string): number | null {
  const cleaned = raw
    .replace(/%\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*%/g, " ") // iskonto yüzdesi
    .replace(/[^\d.,]/g, " ")
    .trim();
  const token = /\d[\d.,]*/.exec(cleaned)?.[0];
  if (!token) return null;
  let normalized = token;
  if (token.includes(",") && token.includes(".")) {
    normalized = token.lastIndexOf(",") > token.lastIndexOf(".")
      ? token.replace(/\./g, "").replace(",", ".")
      : token.replace(/,/g, "");
  } else if (token.includes(",")) {
    normalized = /,\d{1,2}$/.test(token) ? token.replace(/\./g, "").replace(",", ".") : token.replace(/,/g, "");
  } else if (/\.\d{3}$/.test(token)) {
    normalized = token.replace(/\./g, "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const OUT_MARKERS = [
  "stokta yok",
  "stok yok",
  "tükendi",
  "tukendi",
  "temin edilemiyor",
  "out of stock",
  "mevcut değil",
];
/** Kaynak sitede "Lütfen stok sorunuz" gibi ifadeler → stok ASLA "var" sayılmaz. */
const ASK_MARKERS = [
  "stok sorunuz",
  "stok sorun",
  "stoğu sorunuz",
  "stogu sorunuz",
  "stok için arayınız",
  "stok icin ariniz",
  "fiyat ve stok sorunuz",
  "lütfen sorunuz",
  "lutfen sorunuz",
];
const IN_MARKERS = ["stokta var", "stokta mevcut", "stokta", "in stock", "mevcut"];

/** Metinden stok durumu. Belirsizse `unknown` döner — asla `in_stock` varsayılmaz. */
function stockFromText(raw: string | null | undefined): StockStatus {
  if (!raw) return "unknown";
  const t = raw.toLocaleLowerCase("tr");
  if (ASK_MARKERS.some((m) => t.includes(m))) return "ask";
  if (OUT_MARKERS.some((m) => t.includes(m))) return "out_of_stock";
  if (IN_MARKERS.some((m) => t.includes(m))) return "in_stock";
  return "unknown";
}

/** Ürün adı alanına sızan iletişim/paylaşım metinlerini eler (ör. "WhatsApp"). */
const CONTACT_NAME_RE =
  /^(whats\s*app|whatsapp|whatsapp ile sor|telefon|ara|iletişim|iletisim|paylaş|paylas|sepete ekle|favori|karşılaştır|karsilastir)\b/i;
export function sanitizeProductName(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (CONTACT_NAME_RE.test(s)) return null;
  if (/whatsapp/i.test(s) && s.length < 40) return null;
  if (s.length < 3) return null;
  return s;
}


function quantityFromText(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /(\d[\d.]*)\s*(?:adet|stok)/i.exec(raw) ?? /stok\s*(?:adedi|miktarı)\s*[:\-]?\s*(\d[\d.]*)/i.exec(raw);
  if (!m) return null;
  const n = Number((m[1] ?? "").replace(/\./g, ""));
  return Number.isFinite(n) ? n : null;
}

function absUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ search parser

interface SearchRow {
  /** Detay sayfası linki. OnlineParça tablo görünümünde link olmayabilir → null. */
  url: string | null;
  name: string | null;
  sku: string | null;
  brand: string | null;
  listPrice: number | null;
  actualPrice: number | null;
  stock: StockStatus;
  quantity: number | null;
  productId: string | null;
  image: string | null;
  rowText: string;
}

/** OnlineParça'nın aynı OEM'i kabul edebildiği kontrollü yazım biçimleri. */
export function buildOemSearchVariants(raw: string): string[] {
  const compact = normalizeOem(raw);
  if (!compact) return [];
  const variants = new Set<string>([raw.trim(), compact]);
  const prefix = /^([A-Z0-9]*[A-Z])(\d{5,})$/.exec(compact);
  if (prefix) {
    const letters = prefix[1] ?? "";
    const digits = prefix[2] ?? "";
    if (letters && digits.length > 4) {
      variants.add(`${letters}${digits.slice(0, 3)} ${digits.slice(3)}`);
      variants.add(`${letters}-${digits.slice(0, 3)}${digits.slice(3)}`);
      variants.add(`${letters}-${digits.slice(0, 3)}-${digits.slice(3)}`);
    }
  }
  return [...variants].filter(Boolean);
}

/**
 * OnlineParça `/product/search` tablo satırlarını ve klasik ürün kartlarını ayrıştırır.
 *
 * Not: Tablo görünümünde ürün adı `<a>` etiketi href İÇERMEYEBİLİR. Bu durumda satır
 * yine geçerli bir ürün sayılır (URL null olur) — link yok diye NOT_FOUND dönülmez.
 */
export function parseOnlineParcaSearch(html: string, baseUrl: string): SearchRow[] {
  const blocks = [
    ...[...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((m) => m[0]),
    ...[...html.matchAll(/<div[^>]+class=["'][^"']*\bproduct-item\b[^"']*["'][\s\S]*?<\/div>\s*<\/div>/gi)].map(
      (m) => m[0],
    ),
  ];
  const rows: SearchRow[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    // Tablo başlığı (thead) satırlarını ürün sanma.
    if (/<th\b/i.test(block)) continue;

    // Ürün adı bloğu (href zorunlu değil).
    const nameBlock =
      /class=["'][^"']*mobim-product-name[^"']*["'][^>]*>([\s\S]{0,1200}?)<\/div>/i.exec(block)?.[1] ??
      /<h[23][^>]*class=["'][^"']*product-title[^"']*["'][^>]*>([\s\S]{0,600}?)<\/h[23]>/i.exec(block)?.[1] ??
      null;

    let name: string | null = null;
    if (nameBlock) {
      name =
        sanitizeProductName(stripTags(/<h[1-6][^>]*>([\s\S]{0,400}?)<\/h[1-6]>/i.exec(nameBlock)?.[1] ?? "")) ??
        sanitizeProductName(stripTags(/<a[^>]*>([\s\S]{0,400}?)<\/a>/i.exec(nameBlock)?.[1] ?? "")) ??
        sanitizeProductName(stripTags(nameBlock));
    }

    const skuRaw =
      stripTags(
        /class=["'][^"']*mobim-product-sku[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] ?? "",
      ) ||
      stripTags(/<td[^>]+class=["'][^"']*\bsku\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(block)?.[1] ?? "") ||
      null;
    const sku = skuRaw?.replace(/^(?:stok\s*kodu|sku|oem|ürün\s*kodu)\s*[:#-]?\s*/i, "").trim() || null;

    const productId =
      /\/addproducttocart\/catalog\/(\d+)\//i.exec(block)?.[1] ??
      /data-productid=["'](\d+)["']/i.exec(block)?.[1] ??
      null;

    // Detay linki varsa al; yoksa satır yine geçerlidir (WhatsApp vb. linkler hariç tutulur).
    const hrefRaw =
      (nameBlock ? /<a[^>]+href=["']([^"']+)["']/i.exec(nameBlock)?.[1] : null) ??
      /<h[23][^>]*class=["'][^"']*product-title[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/i.exec(block)?.[1] ??
      /<a[^>]+href=["'](\/[^"']+)["'][^>]*>\s*<h[1-6][^>]*>/i.exec(block)?.[1] ??
      null;
    let url = hrefRaw ? absUrl(hrefRaw, baseUrl) : null;
    if (url) {
      const u = new URL(url);
      const sameHost = u.host === new URL(baseUrl).host;
      const blocked = /\/(login|register|cart|wishlist|compare|customer|addproducttocart)\b/i.test(u.pathname);
      if (!sameHost || blocked || !/^https?:$/.test(u.protocol)) url = null;
    }

    const brand =
      /class=["'][^"']*product-picture[^"']*["'][\s\S]*?<img[^>]+alt=["']([^"']+)["']/i.exec(block)?.[1] ??
      /<img[^>]+src=["'][^"']*\/images\/manufacturers\/[^"']*["'][^>]*alt=["']([^"']+)["']/i.exec(block)?.[1] ??
      /<img[^>]+alt=["']([^"']+)["'][^>]*src=["'][^"']*\/images\/manufacturers\//i.exec(block)?.[1] ??
      null;

    const actual = /class=["'][^"']*actual-price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1];
    const old = /class=["'][^"']*old-price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1];
    const stockBlock =
      /class=["'][^"']*mobim-stock-indicator[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(block)?.[1] ??
      /class=["'][^"']*(?:availability|stock)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(block)?.[1];
    const stockText = stockBlock ? stripTags(stockBlock) : null;

    const image =
      [...block.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/gi)]
        .map((m) => m[1] ?? "")
        .find((src) => !/\/images\/(flags|manufacturers)\//i.test(src) && !/whatsapp/i.test(src)) ?? null;

    const listPrice = old ? parsePrice(stripTags(old)) : null;
    const actualPrice = actual ? parsePrice(stripTags(actual)) : null;
    const stock = stockFromText(stockText);
    const rowText = stripTags(block);
    const looksLikeHeader = /^(?:stok kodu\s+)?(?:liste fiyatı\s+)?(?:size özel fiyat)/i.test(rowText) &&
      !name && !sku && !productId && !image && actualPrice == null && listPrice == null;
    if (looksLikeHeader) continue;

    // URL zorunlu değildir. Gerçek ürün sinyallerinden herhangi biri satırı FOUND yapar.
    const hasProductSignal = !!(name || sku || productId || image || actualPrice != null || listPrice != null || stock !== "unknown");
    if (!hasProductSignal) continue;

    const dedupeKey = url ?? (productId ? `id:${productId}` : sku ? `sku:${sku}` : `name:${name ?? rowText.slice(0, 120)}`);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({
      url,
      name,
      sku,
      brand: brand ? stripTags(brand) : null,
      listPrice,
      actualPrice,
      stock,
      quantity: quantityFromText(stockText),
      productId,
      image: image ? absUrl(image, baseUrl) : null,
      rowText,
    });
  }
  return rows;
}


// ------------------------------------------------------------ detail parser

export interface DetailData {
  name: string | null;
  sku: string | null;
  brand: string | null;
  price: number | null;
  listPrice: number | null;
  stock: StockStatus;
  quantity: number | null;
  productId: string | null;
  image: string | null;
  failedSelectors: string[];
}

export function parseOnlineParcaDetail(html: string, url: string): DetailData {
  const failed: string[] = [];
  const name =
    stripTags(/<h1[^>]*>([\s\S]{0,300}?)<\/h1>/i.exec(html)?.[1] ?? "") ||
    stripTags(/class=["'][^"']*product-name[^"']*["'][^>]*>([\s\S]{0,300}?)<\//i.exec(html)?.[1] ?? "") ||
    null;
  const safeName = sanitizeProductName(name);
  if (!safeName) failed.push("h1 / .product-name");

  const sku =
    stripTags(/id=["']sku-\d+["'][^>]*>([\s\S]{0,120}?)<\//i.exec(html)?.[1] ?? "") ||
    stripTags(
      /class=["'][^"']*\bsku\b[^"']*["'][\s\S]{0,200}?class=["']value["'][^>]*>([\s\S]{0,120}?)<\//i.exec(html)?.[1] ??
        "",
    ) ||
    null;
  if (!sku) failed.push(".sku .value / #sku-*");

  const brand =
    stripTags(
      /class=["'][^"']*manufacturers?[^"']*["'][\s\S]{0,240}?class=["']value["'][^>]*>([\s\S]{0,160}?)<\/span>/i.exec(
        html,
      )?.[1] ?? "",
    ).replace(/^(üretici|marka)\s*:?\s*/i, "") || null;
  if (!brand) failed.push(".manufacturers .value");

  const priceRaw = /class=["'][^"']*actual-price[^"']*["'][^>]*>([\s\S]{0,200}?)<\/span>/i.exec(html)?.[1];
  const price = priceRaw ? parsePrice(stripTags(priceRaw)) : null;
  if (price == null) failed.push(".actual-price");

  const oldRaw = /class=["'][^"']*old-price[^"']*["'][^>]*>([\s\S]{0,200}?)<\/span>/i.exec(html)?.[1];

  const availabilityRaw =
    /id=["']stock-availability-value-\d+["'][^>]*>([\s\S]{0,160}?)<\//i.exec(html)?.[1] ??
    /class=["'][^"']*\bstock\b[^"']*["'][\s\S]{0,240}?class=["']value["'][^>]*>([\s\S]{0,160}?)<\//i.exec(html)?.[1] ??
    null;
  const availabilityText = availabilityRaw ? stripTags(availabilityRaw) : null;
  let stock = stockFromText(availabilityText);
  if (stock === "unknown") failed.push("#stock-availability-value-* / .availability .value");

  // JSON-LD availability yalnızca destekleyici kanıt olarak kullanılır.
  if (stock === "unknown") {
    const ld = /"availability"\s*:\s*"([^"]+)"/i.exec(html)?.[1] ?? "";
    if (/outofstock|soldout/i.test(ld)) stock = "out_of_stock";
    else if (/instock/i.test(ld)) stock = "in_stock";
  }

  const gallery = /class=["'][^"']*picture-gallery[^"']*["'][\s\S]{0,1200}?<\/div>\s*<\/div>/i.exec(html)?.[0] ?? "";
  const galleryImg = /<img[^>]+(?:data-src|src)=["']([^"']+)["']/i.exec(gallery)?.[1] ?? null;
  const image =
    galleryImg ??
    [...html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/gi)]
      .map((m) => m[1] ?? "")
      .find((src) => /\/images\/thumbs\//i.test(src) && !/logo/i.test(src)) ??
    null;
  const isPlaceholder = !!image && /default-image|no[-_]?image|placeholder|logo/i.test(image);

  return {
    name: safeName,
    sku,
    brand,
    price,
    listPrice: oldRaw ? parsePrice(stripTags(oldRaw)) : null,
    stock,
    quantity: quantityFromText(availabilityText),
    productId: /data-productid=["'](\d+)["']/i.exec(html)?.[1] ?? null,
    image: image && !isPlaceholder ? absUrl(image, url) : null,
    failedSelectors: failed,
  };
}

// -------------------------------------------------------------- matching

function matchRow(row: SearchRow, oemRaw: string, oemNorm: string): MatchType {
  const skuNorm = normalizeOem(row.sku ?? "");
  if ((row.sku ?? "").trim().toUpperCase() === oemRaw.trim().toUpperCase()) return "exact_oem";
  if (skuNorm && skuNorm === oemNorm) return "normalized_oem";
  if (skuNorm && oemNorm.length >= 6 && (skuNorm.endsWith(oemNorm) || skuNorm.includes(oemNorm)))
    return "product_code";
  if (oemNorm.length >= 6 && normalizeOem(row.url ?? "").includes(oemNorm)) return "product_url";
  if (oemNorm.length >= 6 && normalizeOem(row.name ?? "").includes(oemNorm)) return "product_name";
  // Bazı tablo sürümlerinde OEM ayrı bir sınıf yerine düz hücre metnindedir.
  if (oemNorm.length >= 6 && normalizeOem(row.rowText).includes(oemNorm)) return "normalized_oem";
  return "none";
}

const MATCH_RANK: Record<MatchType, number> = {
  exact_oem: 0,
  normalized_oem: 1,
  product_code: 2,
  product_url: 3,
  product_name: 4,
  none: 9,
};

// -------------------------------------------------------------- pipeline

interface SupplierConfig {
  id: string;
  name: string;
  login_url: string;
  username: string | null;
  password_secret_key: string | null;
  default_margin: number;
  min_stock: number;
  system_seller_id: string | null;
}

// Oturum önbelleği — her OEM sorgusunda yeniden login olmayı engeller.
// Cookie loglanmaz; yalnızca süreç belleğinde tutulur.
const SESSION_TTL_MS = 10 * 60 * 1000;
const sessionCache = new Map<string, { session: SupplierSession; expires: number }>();
const sessionInflight = new Map<string, Promise<SupplierSession>>();

async function loginFresh(supplier: SupplierConfig): Promise<SupplierSession> {
  const { getServerReadClient } = await import("@/lib/supabase-admin.server");
  const { readOnlineParcaEnvPassword } = await import("@/lib/onlineparca-env.server");

  const envPassword = readOnlineParcaEnvPassword();
  const username = supplier.username ?? process.env["ONLINEPARCA_USERNAME"] ?? null;
  if (!supplier.login_url || !username) throw new Error("Tedarikçi hesap bilgileri eksik.");

  // 1) DB (app_secrets) — Lovable Cloud varsayılan davranışı.
  let password: string | null = null;
  const sb = getServerReadClient();
  if (sb && supplier.password_secret_key) {
    try {
      const { data: secret } = await sb
        .from("app_secrets")
        .select("value")
        .eq("key", supplier.password_secret_key)
        .maybeSingle();
      password = (secret?.value as string | undefined) ?? null;
    } catch {
      password = null;
    }
  }
  // 2) Self-host ENV fallback.
  if (!password) password = envPassword;
  if (!password) throw new Error("Tedarikçi şifresi bulunamadı (app_secrets veya ONLINEPARCA_PASSWORD).");

  return loginSupplier({
    loginUrl: supplier.login_url,
    username,
    password,
  });
}


function invalidateSupplierSession(supplierId: string) {
  sessionCache.delete(supplierId);
}

async function openSession(supplier: SupplierConfig): Promise<SupplierSession> {
  const k = supplier.id;
  const hit = sessionCache.get(k);
  if (hit && hit.expires > Date.now()) return hit.session;

  const pending = sessionInflight.get(k);
  if (pending) return pending;

  const p = loginFresh(supplier)
    .then((session) => {
      sessionCache.set(k, { session, expires: Date.now() + SESSION_TTL_MS });
      return session;
    })
    .finally(() => sessionInflight.delete(k));
  sessionInflight.set(k, p);
  return p;
}

// Tedarikçi yapılandırması kısa süreli önbellek — aynı arama içinde paralel
// çalışan OEM sorguları için tekrarlanan DB okumasını engeller (davranış aynı).
const SUPPLIER_TTL_MS = 5 * 60 * 1000;
const supplierCache = new Map<string, { value: SupplierConfig | null; expires: number }>();
const supplierInflight = new Map<string, Promise<SupplierConfig | null>>();

export async function loadOnlineParcaSupplier(supplierId?: string): Promise<SupplierConfig | null> {
  const cacheKey = supplierId ?? "__default__";
  const hit = supplierCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;
  const pending = supplierInflight.get(cacheKey);
  if (pending) return pending;

  const p = (async () => {
    const { getServerReadClient, logSupabaseServerEnvOnce } = await import("@/lib/supabase-admin.server");
    const { readOnlineParcaEnvConfig } = await import("@/lib/onlineparca-env.server");
    logSupabaseServerEnvOnce("onlineparca");

    let value: SupplierConfig | null = null;
    const sb = getServerReadClient();
    if (sb) {
      try {
        const query = sb
          .from("suppliers")
          .select(
            "id, name, login_url, username, password_secret_key, default_margin, min_stock, system_seller_id, active",
          )
          .not("login_url", "is", null);
        const { data } = supplierId
          ? await query.eq("id", supplierId).maybeSingle()
          : await query.eq("active", true).order("created_at").limit(1).maybeSingle();
        value = (data as unknown as SupplierConfig) ?? null;
      } catch (err) {
        console.warn("[onlineparca] tedarikçi DB okuması başarısız:", (err as Error).message);
        value = null;
      }
    }

    // Self-host fallback: DB'den okunamadıysa ENV yapılandırması kullanılır.
    if (!value?.login_url) {
      const env = readOnlineParcaEnvConfig();
      if (env) {
        value = {
          id: env.id,
          name: env.name,
          login_url: env.login_url,
          username: env.username,
          password_secret_key: null,
          default_margin: env.default_margin,
          min_stock: env.min_stock,
          system_seller_id: env.system_seller_id,
        };
      }
    }

    supplierCache.set(cacheKey, { value, expires: Date.now() + (value ? SUPPLIER_TTL_MS : 30_000) });
    return value;
  })().finally(() => supplierInflight.delete(cacheKey));


  supplierInflight.set(cacheKey, p);
  return p;
}


/**
 * OEM için tüm boru hattını çalıştırır. `save` true ise ürünü harici tedarikçi
 * kaydı olarak upsert eder (Taşıtsan'ın kendi stok kayıtlarına dokunmaz).
 */
export async function runOnlineParcaPipeline(opts: {
  oem: string;
  save?: boolean;
  supplierId?: string;
  session?: SupplierSession;
  supplier?: SupplierConfig;
}): Promise<PipelineResult> {
  const startedAt = nowMs();
  const result = await runPipelineInner(opts);
  try {
    const { recordOnlineParcaSample } = await import("@/lib/onlineparca-metrics.server");
    const searchSteps = result.steps.filter((s) => s.step === "1_SEARCH");
    const detailStep = result.steps.find((s) => s.step === "4_DETAIL_REQUEST");
    recordOnlineParcaSample({
      oem: result.oem,
      at: Date.now(),
      searchMs: searchSteps.reduce((acc, s) => Math.max(acc, s.durationMs), 0),
      parseMs: result.steps.find((s) => s.step === "2_SEARCH_PARSE")?.durationMs ?? 0,
      detailMs: detailStep?.durationMs ?? 0,
      totalMs: nowMs() - startedAt,
      attempts: searchSteps.length,
      timeouts: result.steps.filter((s) => (s.error ?? "").includes("ONLINEPARCA_TIMEOUT")).length,
      found: !!result.product,
    });
  } catch {
    /* ölçüm hatası akışı bozmaz */
  }
  return result;
}

async function runPipelineInner(opts: {
  oem: string;
  save?: boolean;
  supplierId?: string;
  session?: SupplierSession;
  supplier?: SupplierConfig;
}): Promise<PipelineResult> {
  const oem = opts.oem.trim();
  const normalizedOem = normalizeOem(oem);
  const steps: PipelineStep[] = [];
  const push = (s: Partial<PipelineStep> & { step: string; status: StepStatus }) =>
    steps.push({ httpStatus: null, url: null, durationMs: 0, info: null, error: null, ...s });

  const result: PipelineResult = {
    oem,
    normalizedOem,
    steps,
    errorCode: null,
    message: "",
    candidates: [],
    product: null,
    saved: null,
  };

  const supplier = opts.supplier ?? (await loadOnlineParcaSupplier(opts.supplierId));
  if (!supplier) {
    push({ step: "1_SEARCH", status: "FAIL", error: "Tedarikçi kaydı bulunamadı." });
    result.errorCode = "SEARCH_HTTP_ERROR";
    result.message = "Tedarikçi kaydı bulunamadı.";
    return result;
  }

  let session: SupplierSession;
  try {
    session = opts.session ?? (await openSession(supplier));
  } catch (err) {
    push({
      step: "0_LOGIN",
      status: "FAIL",
      error: err instanceof VerificationRequiredError ? "Doğrulama gerekiyor." : (err as Error).message,
    });
    result.errorCode = "LOGIN_ERROR";
    result.message = "OnlineParça oturumu açılamadı.";
    return result;
  }
  push({ step: "0_LOGIN", status: "PASS", url: supplier.login_url, info: "Oturum açık" });

  // 1) SEARCH — kademeli (hızlı yol önce). Aynı seçim önceliği korunur:
  //    aşama içinde sıradaki ilk "ürün bulunan" deneme kazanır; ürün bulunduysa
  //    sonraki aşamalar hiç çalıştırılmaz (gereksiz istek ve gecikme yok).
  const variants = buildOemSearchVariants(oem);
  const partial = (variant: string) => ({
    url: `${session.origin}/product/search?q=${encodeURIComponent(variant)}`,
    xhr: true,
  });
  const classic = (variant: string) => ({
    url: `${session.origin}/search?q=${encodeURIComponent(variant)}`,
    xhr: false,
  });
  const stages: Array<Array<{ url: string; xhr: boolean }>> = [
    // Aşama 1 — ham + sıkıştırılmış yazım (tipik olarak tek turda sonuç verir).
    variants.slice(0, 2).map(partial),
    // Aşama 2 — kalan kontrollü yazım biçimleri.
    variants.slice(2).map(partial),
    // Aşama 3 — klasik HTML arama (son yedek).
    variants.slice(0, 2).map(classic),
  ].filter((stage) => stage.length > 0);

  let html = "";
  let searchUrl: string | null = null;
  let rows: SearchRow[] = [];
  let lastStatus: number | null = null;
  let parseMs = 0;
  let attemptCount = 0;

  for (const stage of stages) {
    const settled = await Promise.all(
      stage.map(async (attempt) => {
        attemptCount += 1;
        try {
          const fetched = await timedFetch(attempt.url, session.cookie, attempt.xhr, SEARCH_TIMEOUT_MS);
          return { attempt, fetched, error: null as string | null };
        } catch (err) {
          return {
            attempt,
            fetched: null,
            error: (err as Error).name === "TimeoutError" ? "ONLINEPARCA_TIMEOUT" : (err as Error).message,
          };
        }
      }),
    );

    for (const { attempt, fetched, error } of settled) {
      if (!fetched) {
        push({ step: "1_SEARCH", status: "FAIL", url: attempt.url, error });
        continue;
      }
      lastStatus = fetched.res.status;
      const loginWall = /\/(login|giris|signin)/i.test(new URL(fetched.res.url || attempt.url).pathname);
      push({
        step: "1_SEARCH",
        status: fetched.res.ok && !loginWall ? "PASS" : "FAIL",
        httpStatus: fetched.res.status,
        url: attempt.url,
        durationMs: fetched.durationMs,
        info: `content-type=${fetched.res.headers.get("content-type") ?? "?"} length=${fetched.html.length} final=${fetched.res.url}`,
        error: loginWall ? "LOGIN_REQUIRED" : fetched.res.ok ? null : `HTTP ${fetched.res.status}`,
      });
      if (loginWall) {
        // Oturum düşmüş olabilir → önbellekten at, sonraki istek yeniden login olsun.
        invalidateSupplierSession(supplier.id);
        continue;
      }
      if (!fetched.res.ok) continue;
      if (searchUrl && rows.length > 0) continue;
      const parseStart = nowMs();
      const parsed = parseOnlineParcaSearch(fetched.html, fetched.res.url || attempt.url);
      parseMs += nowMs() - parseStart;
      if (parsed.length > 0 || !searchUrl) {
        html = fetched.html;
        searchUrl = fetched.res.url || attempt.url;
        rows = parsed;
      }
    }

    if (rows.length > 0) break;
  }
  void attemptCount;

  if (!searchUrl) {
    result.errorCode = "SEARCH_HTTP_ERROR";
    result.message = "OnlineParça araması yapılamadı.";
    push({ step: "2_SEARCH_PARSE", status: "SKIP", info: `HTTP ${lastStatus ?? "-"}` });
    return result;
  }

  // 2) SEARCH_PARSE
  const hasProductMarkup = /product-list|item-grid|mobim-product-sku|product-item/i.test(html);
  push({
    step: "2_SEARCH_PARSE",
    status: rows.length > 0 ? "PASS" : hasProductMarkup ? "FAIL" : "PASS",
    url: searchUrl,
    durationMs: parseMs,
    info: `RESULT_COUNT=${rows.length}`,
    error: rows.length === 0 && hasProductMarkup ? "SEARCH_PARSE_ERROR: ürün bloğu var, satır ayrıştırılamadı" : null,
  });
  if (rows.length === 0) {
    if (hasProductMarkup) {
      console.warn(
        "[onlineparca][parser-reject]",
        JSON.stringify({
          oem,
          normalized_oem: normalizedOem,
          search_url: searchUrl,
          reason: "PRODUCT_MARKUP_WITHOUT_ACCEPTED_ROW",
          html_preview: html.replace(/\s+/g, " ").slice(0, 1600),
        }),
      );
    }
    result.errorCode = hasProductMarkup ? "SEARCH_PARSE_ERROR" : null;
    result.message = hasProductMarkup
      ? "Arama yanıtı alındı ancak ürün listesi ayrıştırılamadı."
      : "OnlineParça'da bu OEM için ürün bulunamadı.";
    push({ step: "3_PRODUCT_MATCH", status: "SKIP" });
    return result;
  }

  // 3) PRODUCT_MATCH — asla "ilk sonucu al" değil; öncelik sırasına göre eşleştir.
  const scored = rows
    .map((row) => ({ row, matchType: matchRow(row, oem, normalizedOem) }))
    .sort((a, b) => MATCH_RANK[a.matchType] - MATCH_RANK[b.matchType]);
  result.candidates = scored.map(({ row, matchType }) => ({
    url: row.url,
    name: row.name,
    sku: row.sku,
    price: row.actualPrice ?? row.listPrice,
    stock: row.stock,
    matchType,
  }));
  const best = scored.find((s) => s.matchType !== "none");
  if (!best) {
    console.warn(
      "[onlineparca][parser-reject]",
      JSON.stringify({
        oem,
        normalized_oem: normalizedOem,
        reason: "ROWS_FOUND_BUT_OEM_NOT_MATCHED",
        rows: rows.slice(0, 5).map((row) => ({
          name: row.name,
          sku: row.sku,
          product_id: row.productId,
          url: row.url,
          row_text: row.rowText.slice(0, 500),
        })),
      }),
    );
    push({
      step: "3_PRODUCT_MATCH",
      status: "FAIL",
      info: `${rows.length} sonuç incelendi`,
      error: "PRODUCT_MATCH_ERROR: hiçbir sonuç aranan OEM ile eşleşmedi",
    });
    result.errorCode = "PRODUCT_MATCH_ERROR";
    result.message = "Sonuçlar aranan OEM ile eşleşmedi.";
    return result;
  }
  push({
    step: "3_PRODUCT_MATCH",
    status: "PASS",
    url: best.row.url,
    info: `MATCH_TYPE=${best.matchType} PRODUCT_ID=${best.row.productId ?? "-"} SKU=${best.row.sku ?? "-"}`,
  });

  // 4) DETAIL_REQUEST — yalnızca detay linki varsa. Tablo görünümünde link yoktur;
  // bu durumda arama satırındaki veriler yeterlidir ve hata sayılmaz.
  let detail: DetailData | null = null;
  let detailStatus: number | null = null;
  const detailUrl = best.row.url;
  if (!detailUrl) {
    push({ step: "4_DETAIL_REQUEST", status: "SKIP", info: "Arama satırında detay linki yok" });
    push({
      step: "5_DETAIL_PARSE",
      status: "SKIP",
      info: `PRODUCT=${best.row.name ?? "-"} SKU=${best.row.sku ?? "-"} (arama satırından)`,
    });
  } else
  try {
    const d = await timedFetch(detailUrl, session.cookie, false, DETAIL_TIMEOUT_MS);
    detailStatus = d.res.status;
    push({
      step: "4_DETAIL_REQUEST",
      status: d.res.ok ? "PASS" : "FAIL",
      httpStatus: d.res.status,
      url: detailUrl,
      durationMs: d.durationMs,
      info: `content-type=${d.res.headers.get("content-type") ?? "?"} length=${d.html.length} final=${d.res.url}`,
      error: d.res.ok ? null : `DETAIL_HTTP_ERROR: HTTP ${d.res.status}`,
    });
    if (d.res.ok) {
      detail = parseOnlineParcaDetail(d.html, d.res.url || detailUrl);
      if (!detail.name && !detail.sku && detail.price == null) {
        const generic = parseDetailPage(d.html, d.res.url || detailUrl);
        detail = {
          ...detail,
          name: detail.name ?? generic.hit.product_name,
          sku: detail.sku ?? generic.hit.supplier_product_code,
          brand: detail.brand ?? generic.hit.brand,
          price: detail.price ?? generic.hit.supplier_price,
          image: detail.image ?? generic.hit.image_url,
        };
      }
      const detailOk = !!(detail.name || detail.sku);
      push({
        step: "5_DETAIL_PARSE",
        status: detailOk ? "PASS" : "FAIL",
        url: best.row.url,
        info: `PRODUCT=${detail.name ?? "-"} SKU=${detail.sku ?? "-"} BRAND=${detail.brand ?? "-"}`,
        error: detailOk
          ? null
          : `DETAIL_PARSE_ERROR: başarısız selector'lar → ${detail.failedSelectors.join(", ")}`,
      });
      if (!detailOk) result.errorCode = "DETAIL_PARSE_ERROR";
    } else {
      result.errorCode = "DETAIL_HTTP_ERROR";
      push({ step: "5_DETAIL_PARSE", status: "SKIP" });
    }
  } catch (err) {
    push({
      step: "4_DETAIL_REQUEST",
      status: "FAIL",
      url: best.row.url,
      error: (err as Error).name === "TimeoutError" ? "ONLINEPARCA_TIMEOUT" : (err as Error).message,
    });
    push({ step: "5_DETAIL_PARSE", status: "SKIP" });
    result.errorCode = "DETAIL_HTTP_ERROR";
  }

  // 6) PRICE — detay sayfası önceliklidir, arama satırı yedektir.
  const price = detail?.price ?? best.row.actualPrice ?? best.row.listPrice ?? null;
  const listPrice = detail?.listPrice ?? best.row.listPrice ?? null;
  push({
    step: "6_PRICE",
    status: price != null ? "PASS" : "FAIL",
    info: price != null ? `PRICE=${price} TRY (KDV hariç) LIST=${listPrice ?? "-"}` : null,
    error: price != null ? null : "PRICE_PARSE_ERROR: fiyat bulunamadı",
  });
  if (price == null && !result.errorCode) result.errorCode = "PRICE_PARSE_ERROR";

  // 7) STOCK — detay > arama satırı; belirsizse unknown (asla in_stock varsayma).
  let stock: StockStatus = detail?.stock ?? "unknown";
  if (stock === "unknown") stock = best.row.stock;
  // "Lütfen stok sorunuz" bilgisi her zaman "stokta var"ın önüne geçer.
  if (best.row.stock === "ask" || detail?.stock === "ask") stock = "ask";
  const quantity = detail?.quantity ?? best.row.quantity ?? null;
  push({
    step: "7_STOCK",
    status: stock === "unknown" ? "FAIL" : "PASS",
    info: `STOCK_STATUS=${stock} QTY=${quantity ?? "-"}`,
    error: stock === "unknown" ? "STOCK_PARSE_ERROR: stok durumu doğrulanamadı" : null,
  });
  if (stock === "unknown" && !result.errorCode) result.errorCode = "STOCK_PARSE_ERROR";

  const product: MatchedProduct = {
    external_product_id: detail?.productId ?? best.row.productId ?? null,
    external_product_url: best.row.url ?? searchUrl,
    external_source_url: best.row.url,
    product_name: detail?.name ?? best.row.name,
    product_code: detail?.sku ?? best.row.sku,
    oem,
    normalized_oem: normalizedOem,
    brand: best.row.brand ?? detail?.brand ?? null,
    list_price: price,
    source_currency: "TRY",
    price_includes_vat: false,
    stock_status: stock,
    stock_quantity: quantity,
    image_url: detail?.image ?? best.row.image ?? null,
    match_type: best.matchType,
  };
  result.product = product;

  // 8) SAVE
  if (!opts.save) {
    push({ step: "8_EXTERNAL_SUPPLIER_SAVE", status: "SKIP", info: "Test modu — kayıt yapılmadı" });
    result.message = result.errorCode ? `Kısmi sonuç (${result.errorCode})` : "Boru hattı başarılı.";
    return result;
  }

  try {
    const saved = await saveExternalProduct(supplier, product);
    result.saved = saved;
    push({
      step: "8_EXTERNAL_SUPPLIER_SAVE",
      status: "PASS",
      info: `SOURCE=${supplier.name} SOURCE_TYPE=external_supplier RESULT=${saved.action} SALE_PRICE=${saved.sale_price ?? "-"}`,
    });
  } catch (err) {
    push({
      step: "8_EXTERNAL_SUPPLIER_SAVE",
      status: "FAIL",
      error: `DATABASE_SAVE_ERROR: ${(err as Error).message}`,
    });
    result.errorCode = "DATABASE_SAVE_ERROR";
  }

  result.message = result.errorCode ? `Kısmi sonuç (${result.errorCode})` : "Boru hattı başarılı.";
  return result;
}

/**
 * Harici tedarikçi ürününü `parts` üzerinde upsert eder.
 * Benzersiz anahtar: supplier_name + supplier_product_id (yoksa ürün URL'si).
 * Stok `in_stock` değilse ürün satılabilir yapılmaz.
 */
export async function saveExternalProduct(
  supplier: SupplierConfig,
  product: MatchedProduct,
): Promise<{ action: "CREATED" | "UPDATED" | "SKIPPED"; part_id: string | null; sale_price: number | null }> {
  // Yazma işlemi: RLS bypass gerektirir → service-role zorunlu.
  const { requireServiceRoleClient } = await import("@/lib/supabase-admin.server");
  const sb = requireServiceRoleClient("Harici tedarikçi ürünü kaydı");
  if (supplier.id.startsWith("env:")) {
    throw new Error(
      "Harici tedarikçi ürünü kaydı: ONLINEPARCA_SUPPLIER_ID tanımlı değil (ENV modunda kayıt yapılamaz).",
    );
  }

  const now = new Date().toISOString();

  if (!product.product_name || product.list_price == null) {
    return { action: "SKIPPED", part_id: null, sale_price: null };
  }

  const sellerId =
    supplier.system_seller_id ??
    ((await sb.from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle()).data
      ?.user_id as string | undefined) ??
    null;
  if (!sellerId) throw new Error("Sistem satıcı hesabı bulunamadı.");

  const externalId = String(product.external_product_id ?? product.external_product_url).slice(0, 120);
  const margin = Number(supplier.default_margin ?? 0);
  const salePrice = calcSupplierSalePrice(product.list_price, margin);
  const inStock = product.stock_status === "in_stock";
  const minStock = Number(supplier.min_stock ?? 1);
  const enough = product.stock_quantity == null || product.stock_quantity >= minStock;
  const sellable = inStock && enough;

  const payload = {
    title: product.product_name.slice(0, 240),
    brand: product.brand,
    price: salePrice,
    oem_code: product.normalized_oem,
    stock_quantity: sellable ? Math.max(1, product.stock_quantity ?? 1) : 0,
    status: sellable ? "approved" : "passive",
    source_type: "external_supplier",
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    supplier_product_id: externalId,
    supplier_product_code: product.product_code,
    supplier_oem: product.normalized_oem,
    supplier_url: product.external_product_url,
    supplier_stock_status: product.stock_status === "in_stock" ? "IN_STOCK" : "OUT_OF_STOCK",
    supplier_last_checked_at: now,
    last_synced_at: now,
    photos: product.image_url ? [product.image_url] : [],
  };

  const { data: existing } = await sb
    .from("parts")
    .select("id")
    .eq("source_type", "external_supplier")
    .eq("supplier_name", supplier.name)
    .eq("supplier_product_id", externalId)
    .maybeSingle();

  let partId = existing?.id ?? null;
  let action: "CREATED" | "UPDATED" = "UPDATED";
  if (partId) {
    const { error } = await sb.from("parts").update(payload).eq("id", partId);
    if (error) throw new Error(error.message);
  } else {
    const { data: inserted, error } = await sb
      .from("parts")
      .insert({ ...payload, seller_id: sellerId, whatsapp: "" })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Harici ürün kaydedilemedi");
    partId = inserted.id;
    action = "CREATED";
  }

  await sb.from("part_supplier_costs").upsert(
    {
      part_id: partId,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      supplier_product_id: externalId,
      supplier_cost_price: product.list_price,
      margin_percent: margin,
      sale_price: salePrice,
      supplier_last_checked_at: now,
      updated_at: now,
    },
    { onConflict: "part_id" },
  );

  return { action, part_id: partId, sale_price: salePrice };
}
