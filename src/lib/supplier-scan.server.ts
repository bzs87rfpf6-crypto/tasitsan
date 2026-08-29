/**
 * Tedarikçi (OnlineParça) OEM tarama motoru — sunucu tarafı.
 *
 * Katalog/XML/API varsayımı YOK. Yetkili kullanıcı hesabıyla giriş yapılır,
 * tedarikçinin OEM arama ekranı çağrılır ve dönen HTML ayrıştırılır.
 *
 * Güvenlik:
 *  - Şifre asla loglanmaz, asla frontend'e dönmez.
 *  - Yalnızca tedarikçi kaydındaki host'a istek atılır.
 *  - CAPTCHA / 2FA tespit edilirse tarama durdurulur (otomatik aşma denenmez).
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type ScanStatus = "IN_STOCK" | "OUT_OF_STOCK" | "NOT_FOUND" | "ERROR";

export interface ScanHit {
  status: ScanStatus;
  product_name: string | null;
  brand: string | null;
  supplier_product_code: string | null;
  stock_quantity: number | null;
  supplier_price: number | null;
  product_url: string | null;
  gtin: string | null;
  image_url: string | null;
  error_message?: string;
}

export type OemFailureCode =
  | "SUCCESS"
  | "NOT_FOUND"
  | "SEARCH_FAILED"
  | "PRODUCT_PARSE_FAILED"
  | "DETAIL_FETCH_FAILED"
  | "PRICE_PARSE_FAILED"
  | "STOCK_PARSE_FAILED"
  | "LOGIN_REQUIRED"
  | "SESSION_EXPIRED"
  | "ONLINEPARCA_TIMEOUT";

export class VerificationRequiredError extends Error {
  constructor(message = "OnlineParça doğrulaması gerekiyor.") {
    super(message);
    this.name = "VerificationRequiredError";
  }
}

export function normalizeOem(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error("ONLINEPARCA_TIMEOUT");
    }
    throw err;
  }
}

export function calcSalePrice(supplierPrice: number, marginPercent: number): number {
  const value = supplierPrice * (1 + marginPercent / 100);
  return Math.round(value * 100) / 100;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function sameHost(url: string, host: string): boolean {
  const h = hostOf(url);
  return !!h && !!host && (h === host || h.endsWith("." + host));
}

/** Set-Cookie başlıklarını "a=1; b=2" formuna indirger. */
function collectCookies(res: Response, prev: string): string {
  const jar = new Map<string, string>();
  for (const part of prev.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k && v.length) jar.set(k, v.join("="));
  }
  const raw =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
  for (const line of raw) {
    for (const chunk of line.split(/,(?=[^;]+?=)/g)) {
      const first = chunk.split(";")[0]?.trim() ?? "";
      const [k, ...v] = first.split("=");
      if (k && v.length) jar.set(k, v.join("="));
    }
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

const CAPTCHA_MARKERS = [
  "g-recaptcha",
  "recaptcha",
  "hcaptcha",
  "cf-turnstile",
  "captcha",
  "iki adımlı",
  "two-factor",
  "doğrulama kodu",
  "sms kodu",
  "otp",
];

function detectVerification(html: string): boolean {
  const lower = html.toLowerCase();
  return CAPTCHA_MARKERS.some((m) => lower.includes(m));
}

export interface SupplierSession {
  cookie: string;
  host: string;
  origin: string;
  loginUrl: string;
  /** Keşfedilen arama formu (varsa) */
  search?: SearchForm;
}

export interface SearchForm {
  action: string;
  method: "GET" | "POST";
  field: string;
  hidden: Record<string, string>;
  source: "form" | "template";
}

interface FormInfo {
  action: string;
  method: "GET" | "POST";
  inputs: { name: string; value: string; type: string }[];
  html: string;
}

/** HTML içindeki tüm <form> bloklarını ayrıştırır. */
export function parseForms(html: string, baseUrl: string): FormInfo[] {
  const out: FormInfo[] = [];
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = m[1] ?? "";
    const inner = m[2] ?? "";
    const actionRaw = /action=["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
    const method =
      (/method=["']([^"']*)["']/i.exec(attrs)?.[1] ?? "get").toUpperCase() === "POST"
        ? "POST"
        : "GET";
    let action = baseUrl;
    try {
      action = new URL(actionRaw || baseUrl, baseUrl).toString();
    } catch {
      /* geçersiz action */
    }
    const inputs: FormInfo["inputs"] = [];
    for (const im of inner.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
      const tag = im[2] ?? "";
      const name = /name=["']([^"']+)["']/i.exec(tag)?.[1];
      if (!name) continue;
      inputs.push({
        name,
        value: /value=["']([^"']*)["']/i.exec(tag)?.[1] ?? "",
        type: (/type=["']([^"']+)["']/i.exec(tag)?.[1] ?? "text").toLowerCase(),
      });
    }
    out.push({ action, method: method as "GET" | "POST", inputs, html: m[0] });
  }
  return out;
}

const USER_FIELD_RE = /^(username|user|email|login|kullanici|customeremail|e-?mail)$/i;
const PASS_FIELD_RE = /^(password|pass|sifre|şifre|pwd)$/i;

function pickLoginForm(forms: FormInfo[]): FormInfo | null {
  return (
    forms.find(
      (f) =>
        f.inputs.some((i) => i.type === "password" || PASS_FIELD_RE.test(i.name)) &&
        f.inputs.some((i) => USER_FIELD_RE.test(i.name)),
    ) ??
    forms.find((f) => f.inputs.some((i) => i.type === "password")) ??
    null
  );
}

/** Arama formunu bulur: metin girişi + arama benzeri alan adı. */
export function pickSearchForm(forms: FormInfo[]): SearchForm | null {
  const candidates = forms.filter((f) =>
    f.inputs.some((i) =>
      /^(q|s|search|searchterm|searchterms|keyword|kelime|term|query)$/i.test(i.name),
    ),
  );
  const f = candidates[0];
  if (!f) return null;
  const field = f.inputs.find((i) =>
    /^(q|s|search|searchterm|searchterms|keyword|kelime|term|query)$/i.test(i.name),
  )!.name;
  const hidden: Record<string, string> = {};
  for (const i of f.inputs) {
    if (i.name !== field && i.value && (i.type === "hidden" || i.type === "checkbox"))
      hidden[i.name] = i.value;
  }
  return { action: f.action, method: f.method, field, hidden, source: "form" };
}

async function fetchPage(url: string, cookie: string) {
  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "follow",
  });
  const html = await res.text();
  return { res, html };
}

/**
 * Tedarikçi paneline giriş yapar ve oturum çerezini döndürür.
 * Giriş formu sayfadan keşfedilir (alan adları + CSRF/hidden alanlar birebir taşınır),
 * ardından oturum gerçekten korumalı bir sayfa çağrılarak doğrulanır.
 */
export async function loginSupplier(opts: {
  loginUrl: string;
  username: string;
  password: string;
}): Promise<SupplierSession> {
  const host = hostOf(opts.loginUrl);
  if (!host) throw new Error("Geçersiz giriş URL'si");
  const origin = new URL(opts.loginUrl).origin;

  // 1) Giriş sayfasını bul. Verilen URL kök adres ise /login denenir.
  const candidates = [opts.loginUrl];
  const path = new URL(opts.loginUrl).pathname;
  if (path === "/" || path === "")
    candidates.push(`${origin}/login`, `${origin}/giris`, `${origin}/account/login`);

  let cookie = "";
  let loginPageUrl = opts.loginUrl;
  let form: FormInfo | null = null;
  let searchForm: SearchForm | null = null;

  for (const url of candidates) {
    const { res, html } = await fetchPage(url, cookie);
    cookie = collectCookies(res, cookie);
    if (detectVerification(html)) throw new VerificationRequiredError();
    const forms = parseForms(html, res.url || url);
    searchForm = searchForm ?? pickSearchForm(forms);
    const found = pickLoginForm(forms);
    if (found) {
      form = found;
      loginPageUrl = res.url || url;
      break;
    }
  }

  if (!form) throw new Error("Giriş formu bulunamadı. Giriş URL'sini kontrol edin.");

  const userField = form.inputs.find((i) => USER_FIELD_RE.test(i.name))?.name ?? "Username";
  const passField =
    form.inputs.find((i) => i.type === "password")?.name ??
    form.inputs.find((i) => PASS_FIELD_RE.test(i.name))?.name ??
    "Password";

  const body = new URLSearchParams();
  for (const i of form.inputs) {
    if (i.name === userField || i.name === passField) continue;
    if (i.type === "submit" || i.type === "button") continue;
    if (i.value) body.set(i.name, i.value);
  }
  body.set(userField, opts.username);
  body.set(passField, opts.password);

  const res = await fetchWithTimeout(form.action, {
    method: form.method,
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      Referer: loginPageUrl,
      Origin: origin,
    },
    body: body.toString(),
    redirect: "manual",
  });
  cookie = collectCookies(res, cookie);
  if (res.status < 300 || res.status >= 400) {
    const html = await res.text();
    if (detectVerification(html)) throw new VerificationRequiredError();
  }

  // 2) Oturumu gerçekten doğrula: korumalı sayfa istenir, login'e düşerse başarısızdır.
  const session: SupplierSession = { cookie, host, origin, loginUrl: loginPageUrl };
  const verified = await verifySession(session);
  if (!verified)
    throw new Error("Giriş başarısız. Kullanıcı adı/şifre veya giriş URL'si hatalı olabilir.");

  if (searchForm) session.search = searchForm;
  return session;
}

const PROTECTED_PATHS = ["/customer/info", "/order/history", "/hesabim", "/account"];

/** Oturumun gerçekten açık olup olmadığını korumalı sayfa üzerinden doğrular. */
export async function verifySession(session: SupplierSession): Promise<boolean> {
  for (const p of PROTECTED_PATHS) {
    const { res, html } = await fetchPage(session.origin + p, session.cookie);
    if (!res.ok) continue;
    const finalPath = new URL(res.url).pathname.toLowerCase();
    if (/login|giris|signin/.test(finalPath)) return false;
    if (/çıkış|cikis|logout|hesabım|my account|oturumu kapat/i.test(html)) return true;
    return true;
  }
  return false;
}

/** Giriş yapılmış oturumla arama formunu (gerçek endpoint) keşfeder. */
export async function discoverSearchForm(session: SupplierSession): Promise<SearchForm | null> {
  const { res, html } = await fetchPage(session.origin + "/", session.cookie);
  if (!res.ok) return null;
  return pickSearchForm(parseForms(html, res.url));
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;
  // TR formatı: 1.234,56 — EN formatı: 1,234.56
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else normalized = cleaned.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

interface JsonLdProduct {
  "@type"?: string | string[];
  name?: string;
  sku?: string;
  gtin13?: string;
  gtin?: string;
  image?: string | string[];
  brand?: string | { name?: string };
  offers?:
    | { price?: string | number; availability?: string; url?: string; inventoryLevel?: unknown }
    | { price?: string | number; availability?: string; url?: string }[];
}

function flattenLd(node: unknown, out: JsonLdProduct[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n) => flattenLd(n, out));
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const isProduct = Array.isArray(type) ? type.includes("Product") : type === "Product";
  if (isProduct) out.push(obj as JsonLdProduct);
  if (obj["@graph"]) flattenLd(obj["@graph"], out);
  if (obj["itemListElement"]) flattenLd(obj["itemListElement"], out);
  if (obj["item"]) flattenLd(obj["item"], out);
}

function extractJsonLdProducts(html: string): JsonLdProduct[] {
  const out: JsonLdProduct[] = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      flattenLd(JSON.parse((m[1] ?? "").trim()), out);
    } catch {
      /* bozuk ld+json — yok say */
    }
  }
  return out;
}

const NOT_FOUND_MARKERS = [
  "sonuç bulunamadı",
  "bulunamadı",
  "ürün bulunamadı",
  "no results",
  "aramanıza uygun",
  "kayıt bulunamadı",
];

const OUT_OF_STOCK_MARKERS = [
  "stokta yok",
  "stok yok",
  "tükendi",
  "out of stock",
  "outofstock",
  "temin edilemiyor",
];

/* ---------------- gerçek DOM ayrıştırıcı (nopCommerce ürün kartı) ---------------- */

export interface CandidateDebug {
  index: number;
  url: string | null;
  title: string | null;
  isProduct: boolean;
  oemMatch: boolean;
  priceFound: boolean;
  stockFound: boolean;
  sku: string | null;
  brand: string | null;
  imageFound: boolean;
  signals: string[];
  result: "ACCEPTED" | "NOT_A_PRODUCT" | "OEM_MISMATCH" | "BLOCKED_URL" | "PENDING_DETAIL";
}

export interface ParseDebug {
  cardFound: boolean;
  cardSelector: string | null;
  cardCount: number;
  productUrl: string | null;
  productName: string | null;
  priceSelector: string | null;
  stockSelector: string | null;
  brandSelector: string | null;
  skuSelector: string | null;
  detailFetched: boolean;
  candidates: CandidateDebug[];
  rejectReason: "NOT_A_PRODUCT" | "OEM_MISMATCH" | null;
  notes: string[];
}

function emptyParseDebug(): ParseDebug {
  return {
    cardFound: false,
    cardSelector: null,
    cardCount: 0,
    productUrl: null,
    productName: null,
    priceSelector: null,
    stockSelector: null,
    brandSelector: null,
    skuSelector: null,
    detailFetched: false,
    candidates: [],
    rejectReason: null,
    notes: [],
  };
}

/** Ürün olamayacak kurumsal/bilgi sayfaları. */
const BLOCKED_URL_RE =
  /\/(teslimat[^/]*|iade[^/]*|iletisim|iletişim|contact|hakkimizda|hakkımızda|about|gizlilik[^/]*|cerez[^/]*|çerez[^/]*|kvkk|sss|faq|sikca[^/]*|sıkça[^/]*|blog|kurumsal|mesafeli[^/]*|sozlesme[^/]*|sözleşme[^/]*|kullanim[^/]*|kullanım[^/]*|banka[^/]*|odeme[^/]*|ödeme[^/]*|garanti|yardim|yardım|kargo[^/]*|sitemap|login|register|customer|cart|wishlist|compare|news|topic)(\/|$|\?)/i;

const BLOCKED_TITLE_RE =
  /^(teslimat|iade|iletişim|iletisim|hakkımızda|hakkimizda|gizlilik|çerez|cerez|kvkk|sıkça sorulan|sikca sorulan|s\.s\.s|sss|blog|kurumsal|mesafeli|sözleşme|sozlesme|kullanım koşulları|garanti|kargo|ödeme|odeme|banka)/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const CARD_CLASSES = [
  "product-item",
  "item-box",
  "product-grid-item",
  "product-card",
  "product-box",
];

/** Arama sonucu HTML'inden ürün kartı bloklarını çıkarır. */
export function extractProductCards(html: string): { block: string; selector: string }[] {
  for (const cls of CARD_CLASSES) {
    const re = new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["']`, "gi");
    const starts: number[] = [];
    for (const m of html.matchAll(re)) {
      const tagStart = html.lastIndexOf("<", m.index ?? 0);
      if (tagStart >= 0) starts.push(tagStart);
    }
    if (starts.length === 0) continue;
    const blocks: { block: string; selector: string }[] = [];
    for (let i = 0; i < starts.length; i++) {
      const end =
        i + 1 < starts.length ? starts[i + 1]! : Math.min(html.length, starts[i]! + 12000);
      blocks.push({ block: html.slice(starts[i]!, end), selector: `.${cls}` });
    }
    return blocks;
  }
  return [];
}

const BAD_HREF = /(add-?to-?cart|compare|wishlist|javascript:|#|\/login|\/customer|\/cart)/i;

function pickProductLink(
  block: string,
  baseUrl: string,
): { url: string | null; name: string | null } {
  const titleMatch =
    /<(?:h2|h3|div)[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(
      block,
    );
  if (titleMatch) {
    return { url: abs(titleMatch[1]!, baseUrl), name: stripTags(titleMatch[2] ?? "") || null };
  }
  for (const m of block.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1]!;
    if (BAD_HREF.test(href)) continue;
    const text = stripTags(m[2] ?? "");
    const title = /title=["']([^"']+)["']/i.exec(m[0])?.[1];
    const alt = /<img[^>]+alt=["']([^"']+)["']/i.exec(m[0])?.[1];
    const name = text || title || alt || null;
    return { url: abs(href, baseUrl), name: name ? decodeEntities(name).trim() : null };
  }
  return { url: null, name: null };
}

function abs(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

const PRICE_CLASSES = [
  "actual-price",
  "product-price",
  "price-value",
  "prices",
  "price",
  "urun-fiyat",
  "fiyat",
];

function extractPrice(block: string): { value: number | null; selector: string | null } {
  for (const cls of PRICE_CLASSES) {
    const re = new RegExp(`class=["'][^"']*\\b${cls}[^"']*["'][^>]*>([\\s\\S]{0,200}?)<\\/`, "gi");
    for (const m of block.matchAll(re)) {
      // İndirim yüzdesi ("%20" / "20%") fiyat metnine karışmasın.
      const text = stripTags(m[1] ?? "").replace(/%\s*\d+|\d+\s*%/g, " ");
      if (!/\d/.test(text)) continue;
      const v = parseMoney(text);
      if (v && v > 0) return { value: v, selector: `.${cls}` };
    }
  }
  const plain = /(\d[\d.,]*)\s*(?:TL|₺)/i.exec(stripTags(block));
  if (plain) return { value: parseMoney(plain[1] ?? ""), selector: "metin (TL/₺)" };
  return { value: null, selector: null };
}

function extractStock(block: string): {
  quantity: number | null;
  inStock: boolean | null;
  selector: string | null;
} {
  const text = stripTags(block);
  const qty =
    /(?:stok(?:\s*(?:miktar[ıi]|adedi|durumu))?)\s*[:\-]?\s*(\d[\d.]*)\s*(?:adet)?/i.exec(text) ??
    /(\d[\d.]*)\s*adet\s*stok/i.exec(text);
  if (qty) {
    const n = Number((qty[1] ?? "").replace(/\./g, ""));
    if (Number.isFinite(n)) return { quantity: n, inStock: n > 0, selector: "metin: stok/adet" };
  }
  const classMatch =
    /class=["'][^"']*\b((?:mobim-)?stock(?:-indicator)?|availability|stok)\b[^"']*["'][^>]*>([\s\S]{0,400}?)<\//i.exec(block);
  if (classMatch) {
    const t = stripTags(classMatch[2] ?? "");
    const n = /(\d[\d.]*)/.exec(t);
    const out = OUT_OF_STOCK_MARKERS.some((m) => t.toLowerCase().includes(m));
    return {
      quantity: n ? Number((n[1] ?? "").replace(/\./g, "")) : out ? 0 : null,
      inStock: out ? false : true,
      selector: `.${classMatch[1]}`,
    };
  }
  const lower = text.toLowerCase();
  if (OUT_OF_STOCK_MARKERS.some((m) => lower.includes(m))) {
    return { quantity: 0, inStock: false, selector: "metin: stok yok" };
  }
  if (/(stokta|mevcut|in stock|sepete ekle)/i.test(text)) {
    return { quantity: null, inStock: true, selector: "metin: stokta/sepete ekle" };
  }
  return { quantity: null, inStock: null, selector: null };
}

function extractBrand(block: string): { value: string | null; selector: string | null } {
  const cls =
    /class=["'][^"']*\b(manufacturer|brand|marka|uretici)\b[^"']*["'][^>]*>([\s\S]{0,200}?)<\/(?:div|span|li|a)>/i.exec(
      block,
    );
  if (cls) {
    const t = stripTags(cls[2] ?? "").replace(/^(marka|üretici|manufacturer)\s*[:\-]?\s*/i, "");
    if (t) return { value: t.slice(0, 80), selector: `.${cls[1]}` };
  }
  const itemprop = /itemprop=["']brand["'][^>]*>([\s\S]{0,160}?)</i.exec(block);
  if (itemprop) {
    const t = stripTags(itemprop[1] ?? "");
    if (t) return { value: t.slice(0, 80), selector: "[itemprop=brand]" };
  }
  const txt = /(?:marka|üretici)\s*[:\-]\s*([^\n<|]{2,40})/i.exec(stripTags(block));
  if (txt) return { value: (txt[1] ?? "").trim(), selector: "metin: Marka:" };
  return { value: null, selector: null };
}

function extractSku(block: string): { value: string | null; selector: string | null } {
  const cls =
    /class=["'][^"']*\b(mobim-product-sku|product-sku)\b[^"']*["'][^>]*>([\s\S]{0,160}?)<\//i.exec(
      block,
    ) ?? /class=["'][^"']*\b(sku)\b[^"']*["'][^>]*>([\s\S]{0,160}?)<\//i.exec(block);
  if (cls) {
    const t = stripTags(cls[2] ?? "").replace(/^(sku|ürün kodu|stok kodu)\s*[:\-]?\s*/i, "");
    if (t) return { value: t.slice(0, 60), selector: `.${cls[1]}` };
  }
  const txt = /(?:sku|ürün kodu|stok kodu|oem)\s*[:\-]\s*([A-Za-z0-9._\-\/]{3,40})/i.exec(
    stripTags(block),
  );
  if (txt) return { value: txt[1] ?? null, selector: "metin: Ürün Kodu:" };
  return { value: null, selector: null };
}

function extractImage(block: string, baseUrl: string): string | null {
  const m = /<img[^>]+(?:data-src|src)=["']([^"']+)["']/i.exec(block);
  return m ? abs(m[1]!, baseUrl) : null;
}

function jsonLdToHit(p: JsonLdProduct, baseUrl: string, lower: string): ScanHit {
  const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
  const availability = String(offer?.availability ?? "").toLowerCase();
  const price = offer?.price != null ? parseMoney(String(offer.price)) : null;
  const image = Array.isArray(p.image) ? p.image[0] : p.image;
  const brand = typeof p.brand === "string" ? p.brand : (p.brand?.name ?? null);
  const inventory = (offer as { inventoryLevel?: unknown } | undefined)?.inventoryLevel;
  let stock: number | null = null;
  if (typeof inventory === "number") stock = inventory;
  else if (inventory && typeof inventory === "object") {
    const v = (inventory as { value?: unknown }).value;
    if (typeof v === "number") stock = v;
    else if (typeof v === "string" && v.trim()) stock = Number(v) || null;
  }
  const outOfStock =
    availability.includes("outofstock") ||
    availability.includes("soldout") ||
    (stock !== null && stock <= 0) ||
    (!availability && OUT_OF_STOCK_MARKERS.some((m) => lower.includes(m)));

  return {
    status: outOfStock ? "OUT_OF_STOCK" : "IN_STOCK",
    product_name: p.name ?? null,
    brand,
    supplier_product_code: p.sku ?? null,
    stock_quantity: outOfStock ? 0 : stock,
    supplier_price: price,
    product_url: offer && "url" in offer ? (offer.url ?? baseUrl) : baseUrl,
    gtin: p.gtin13 ?? p.gtin ?? null,
    image_url: image ?? null,
  };
}

/** Arama sonucu HTML'ini gerçek ürün kartı DOM yapısından ürün bilgisine çevirir. */
export function parseSearchResult(html: string, baseUrl: string, oem?: string): ScanHit {
  return parseSearchResultDetailed(html, baseUrl, oem).hit;
}

export function parseSearchResultDetailed(
  html: string,
  baseUrl: string,
  oem?: string,
): { hit: ScanHit; parse: ParseDebug } {
  if (detectVerification(html)) throw new VerificationRequiredError();

  const lower = html.toLowerCase();
  const parse = emptyParseDebug();

  // 1) Ürün kartı adayları — her biri ayrı ayrı doğrulanır
  const cards = extractProductCards(html);
  parse.cardCount = cards.length;
  const norm = oem ? normalizeOem(oem) : null;

  interface Evaluated {
    cand: CandidateDebug;
    selector: string;
    url: string | null;
    name: string | null;
    price: ReturnType<typeof extractPrice>;
    stock: ReturnType<typeof extractStock>;
    brand: ReturnType<typeof extractBrand>;
    sku: ReturnType<typeof extractSku>;
    block: string;
    score: number;
  }

  const evaluated: Evaluated[] = [];
  cards.forEach((c, i) => {
    const { url, name } = pickProductLink(c.block, baseUrl);
    const price = extractPrice(c.block);
    const stock = extractStock(c.block);
    const brand = extractBrand(c.block);
    const sku = extractSku(c.block);
    const image = extractImage(c.block, baseUrl);
    const hasCart = /add-?to-?cart|sepete\s*ekle|product-box-add-to-cart|addtocart/i.test(c.block);
    const blockedUrl = !!url && BLOCKED_URL_RE.test(new URL(url, baseUrl).pathname);
    const blockedTitle = !!name && BLOCKED_TITLE_RE.test(name.trim());

    const signals: string[] = [];
    if (price.value != null) signals.push("fiyat");
    if (stock.inStock !== null || stock.quantity != null) signals.push("stok");
    if (sku.value) signals.push("sku");
    if (brand.value) signals.push("marka");
    if (hasCart) signals.push("sepete ekle");
    if (image) signals.push("görsel");

    const oemMatch =
      !!norm &&
      (oemRelated(url ?? "", norm) ||
        oemRelated(name ?? "", norm) ||
        oemRelated(sku.value ?? "", norm) ||
        oemRelated(stripTags(c.block), norm));
    const isProduct =
      !blockedUrl && !blockedTitle && !!url && signals.filter((s) => s !== "görsel").length >= 2;

    const cand: CandidateDebug = {
      index: i + 1,
      url,
      title: name,
      isProduct,
      oemMatch,
      priceFound: price.value != null,
      stockFound: stock.inStock !== null || stock.quantity != null,
      sku: sku.value,
      brand: brand.value,
      imageFound: !!image,
      signals,
      result:
        blockedUrl || blockedTitle
          ? "BLOCKED_URL"
          : !isProduct
            ? "NOT_A_PRODUCT"
            : oemMatch || !norm
              ? "ACCEPTED"
              : "PENDING_DETAIL",
    };
    parse.candidates.push(cand);
    evaluated.push({
      cand,
      selector: c.selector,
      url,
      name,
      price,
      stock,
      brand,
      sku,
      block: c.block,
      score: signals.length + (oemMatch ? 5 : 0),
    });
  });

  const accepted = evaluated
    .filter((e) => e.cand.result === "ACCEPTED")
    .sort((a, b) => b.score - a.score)[0];

  if (accepted) {
    parse.cardFound = true;
    parse.cardSelector = accepted.selector;
    parse.productUrl = accepted.url;
    parse.productName = accepted.name;
    parse.priceSelector = accepted.price.selector;
    parse.stockSelector = accepted.stock.selector;
    parse.brandSelector = accepted.brand.selector;
    parse.skuSelector = accepted.sku.selector;

    const outOfStock =
      accepted.stock.inStock === false ||
      (accepted.stock.quantity !== null && accepted.stock.quantity <= 0);
    return {
      hit: {
        status: outOfStock ? "OUT_OF_STOCK" : "IN_STOCK",
        product_name: accepted.name,
        brand: accepted.brand.value,
        supplier_product_code: accepted.sku.value ?? oem ?? null,
        stock_quantity: accepted.stock.quantity,
        supplier_price: accepted.price.value,
        product_url: accepted.url ?? baseUrl,
        gtin: null,
        image_url: extractImage(accepted.block, baseUrl),
      },
      parse,
    };
  }

  // 2) JSON-LD (ürün detay sayfasına yönlendirildiyse)
  const products = extractJsonLdProducts(html);
  const ld =
    products.find((p) => !norm || oemRelated(`${p.name ?? ""} ${p.sku ?? ""} ${baseUrl}`, norm)) ??
    (norm ? undefined : products[0]);
  if (ld) {
    parse.cardFound = true;
    parse.cardSelector = "application/ld+json (Product)";
    const hit = jsonLdToHit(ld, baseUrl, lower);
    parse.productUrl = hit.product_url;
    parse.productName = hit.product_name;
    parse.priceSelector = hit.supplier_price != null ? "ld+json offers.price" : null;
    parse.stockSelector = "ld+json offers.availability";
    parse.brandSelector = hit.brand ? "ld+json brand" : null;
    parse.skuSelector = hit.supplier_product_code ? "ld+json sku" : null;
    return { hit, parse };
  }

  if (parse.candidates.some((c) => c.result === "PENDING_DETAIL")) {
    parse.rejectReason = "OEM_MISMATCH";
    parse.notes.push(
      "Ürün adayları bulundu ancak OEM eşleşmesi kart üzerinde doğrulanamadı; detay sayfası kontrol edilecek.",
    );
    return { hit: emptyHit("NOT_FOUND"), parse };
  }
  if (parse.candidates.length > 0) {
    parse.rejectReason = "NOT_A_PRODUCT";
    parse.notes.push("Bulunan kartlar ürün değil (kurumsal/bilgi sayfası veya ürün sinyali yok).");
    return { hit: emptyHit("NOT_FOUND"), parse };
  }

  if (NOT_FOUND_MARKERS.some((m) => lower.includes(m))) {
    parse.notes.push("Sayfada 'sonuç bulunamadı' işareti var.");
    return { hit: emptyHit("NOT_FOUND"), parse };
  }
  parse.notes.push("Ürün kartı veya JSON-LD bulunamadı.");
  return { hit: emptyHit("NOT_FOUND"), parse };
}

/** Metnin aranan OEM ile ilişkili olup olmadığını kontrol eder. */
export function oemRelated(text: string, normalizedOem: string): boolean {
  if (!text || normalizedOem.length < 4) return false;
  const candidate = normalizeOem(text);
  if (!candidate) return false;
  if (candidate.includes(normalizedOem)) return true;
  // Tedarikçi kodları marka ön eki taşıyabilir (örn. TY + OEM). Uzun ve güçlü
  // kodlarda yalnızca tam uç eşleşmesini kabul ederek yanlış ürünü engelle.
  const shorter = candidate.length < normalizedOem.length ? candidate : normalizedOem;
  const longer = candidate.length < normalizedOem.length ? normalizedOem : candidate;
  return shorter.length >= 6 && longer.length - shorter.length <= 4 && longer.endsWith(shorter);
}

/** Ürün detay sayfasından eksik alanları aynı oturumla tamamlar. */
export async function enrichFromDetail(
  session: SupplierSession,
  hit: ScanHit,
  parse: ParseDebug,
): Promise<void> {
  const url = hit.product_url;
  if (!url || !sameHost(url, session.host)) return;
  if (hit.supplier_price != null && hit.brand && hit.stock_quantity != null) return;

  const { res, html } = await fetchPage(url, session.cookie);
  parse.detailFetched = true;
  if (!res.ok) {
    parse.notes.push(`Detay sayfası HTTP ${res.status}`);
    return;
  }

  const ld = extractJsonLdProducts(html)[0];
  if (ld) {
    const d = jsonLdToHit(ld, url, html.toLowerCase());
    if (hit.supplier_price == null && d.supplier_price != null) {
      hit.supplier_price = d.supplier_price;
      parse.priceSelector = "detay: ld+json offers.price";
    }
    if (!hit.brand && d.brand) {
      hit.brand = d.brand;
      parse.brandSelector = "detay: ld+json brand";
    }
    if (!hit.supplier_product_code && d.supplier_product_code)
      hit.supplier_product_code = d.supplier_product_code;
    if (!hit.product_name && d.product_name) hit.product_name = d.product_name;
    if (!hit.image_url && d.image_url) hit.image_url = d.image_url;
    if (hit.stock_quantity == null && d.stock_quantity != null) {
      hit.stock_quantity = d.stock_quantity;
      parse.stockSelector = "detay: ld+json availability";
    }
    if (d.status === "OUT_OF_STOCK") hit.status = "OUT_OF_STOCK";
  }

  if (hit.supplier_price == null) {
    const p = extractPrice(html);
    if (p.value != null) {
      hit.supplier_price = p.value;
      parse.priceSelector = `detay: ${p.selector}`;
    }
  }
  if (!hit.brand) {
    const b = extractBrand(html);
    if (b.value) {
      hit.brand = b.value;
      parse.brandSelector = `detay: ${b.selector}`;
    }
  }
  if (!hit.supplier_product_code) {
    const s = extractSku(html);
    if (s.value) {
      hit.supplier_product_code = s.value;
      parse.skuSelector = `detay: ${s.selector}`;
    }
  }
  if (hit.stock_quantity == null || parse.stockSelector == null) {
    const st = extractStock(html);
    if (st.quantity != null || st.inStock != null) {
      if (st.quantity != null) hit.stock_quantity = st.quantity;
      if (st.inStock === false) hit.status = "OUT_OF_STOCK";
      parse.stockSelector = `detay: ${st.selector}`;
    }
  }
  if (!hit.product_name) {
    const h1 = /<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i.exec(html);
    if (h1) hit.product_name = stripTags(h1[1] ?? "") || null;
  }
  if (!hit.image_url) hit.image_url = extractImage(html, url);
}

function emptyHit(status: ScanStatus): ScanHit {
  return {
    status,
    product_name: null,
    brand: null,
    supplier_product_code: null,
    stock_quantity: null,
    supplier_price: null,
    product_url: null,
    gtin: null,
    image_url: null,
  };
}

/** Tek bir OEM'i tedarikçide sorgular. */
export interface AjaxDebug {
  tried: boolean;
  endpoint: string | null;
  method: string;
  status: number | null;
  contentType: string | null;
  itemCount: number;
  productCount: number;
  firstProductUrl: string | null;
  firstProductLabel: string | null;
  /** JSON yanıtının ilk güvenli parçası (kimlik bilgisi içermez). */
  rawPreview: string | null;
  /** Ürün detay adımı */
  detailStatus: number | null;
  detailUrl: string | null;
  detailName: string | null;
  detailBrand: string | null;
  detailSku: string | null;
  detailStock: string | null;
  detailPrice: string | null;
  oemMatch: boolean | null;
  /** Autocomplete yanıtından sonra gerçek arama isteğine devam edildi mi? */
  continuedToSearch: boolean;
  note: string | null;
}

export interface SearchDebug {
  inputOem: string;
  normalizedOem: string;
  requestUrl: string;
  method: string;
  status: number;
  redirected: boolean;
  finalUrl: string;
  contentType: string;
  bodyPreview: string;
  responseLength: number;
  productFound: boolean;
  detailVerified: boolean;
  priceFound: boolean;
  stockFound: boolean;
  finalCode: OemFailureCode;
  userMessage: string;
  searchSource: SearchForm["source"] | "ajax" | "product-search";
  /** Sunucudan gelen ham HTML içinde gerçek ürün bulundu mu? */
  serverHtmlProductFound: boolean;
  ajax: AjaxDebug;
  productSearch: {
    tried: boolean;
    method: string;
    url: string | null;
    status: number | null;
    contentType: string | null;
    resultCount: number;
    firstProductUrl: string | null;
    firstProductName: string | null;
    firstBrand: string | null;
    firstSku: string | null;
    firstPrice: number | null;
    firstStock: number | null;
    detailTried: boolean;
    detailStatus: number | null;
    detailContentType: string | null;
    oemMatch: boolean | null;
    failureStep: string | null;
  };
  parse?: ParseDebug;
}

/** OnlineParça'nın ürün tablosu döndüren özel /product/search partial yanıtını ayrıştırır. */
function parseProductSearchPartial(
  html: string,
  baseUrl: string,
  oem: string,
): { hit: ScanHit | null; resultCount: number; first: ScanHit | null } {
  const norm = normalizeOem(oem);
  const rows = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  const candidates: ScanHit[] = [];
  let matched: ScanHit | null = null;
  for (const row of rows) {
    if (/<th\b/i.test(row)) continue;
    const skuBlock =
      /<([a-z0-9]+)[^>]*class=["'][^"']*(?:mobim-product-sku|product-sku)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i.exec(
        row,
      ) ?? /<([a-z0-9]+)[^>]*class=["'][^"']*\bsku\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i.exec(row);
    const sku = stripTags(skuBlock?.[2] ?? "") || extractSku(row).value || "";
    const links = [...row.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    let productUrl: string | null = null;
    let productName: string | null = null;
    for (const link of links) {
      const resolved = abs(link[1] ?? "", baseUrl);
      if (!resolved || !sameHost(resolved, hostOf(baseUrl))) continue;
      const pathname = new URL(resolved).pathname;
      if (BAD_HREF.test(link[1] ?? "") || BLOCKED_URL_RE.test(pathname)) continue;
      const name = stripTags(link[2] ?? "") || /title=["']([^"']+)["']/i.exec(link[0])?.[1] || null;
      if (!name && !oemRelated(resolved, norm)) continue;
      productUrl = resolved;
      productName = name ? decodeEntities(name).trim() : null;
      break;
    }
    if (!productUrl) {
      const dataUrl = /(?:data-(?:product-)?url|data-href)=["']([^"']+)["']/i.exec(row)?.[1];
      const resolved = dataUrl ? abs(dataUrl, baseUrl) : null;
      if (resolved && sameHost(resolved, hostOf(baseUrl)) && !BLOCKED_URL_RE.test(new URL(resolved).pathname)) {
        productUrl = resolved;
      }
    }
    if (!productName) {
      const heading = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(row)?.[1];
      productName = heading ? stripTags(heading) || null : null;
    }
    const related =
      oemRelated(sku, norm) ||
      oemRelated(productUrl ?? "", norm) ||
      oemRelated(productName ?? "", norm) ||
      oemRelated(stripTags(row), norm);
    const price = extractPrice(row).value;
    const stock = extractStock(row);
    const brand =
      /class=["'][^"']*product-picture[^"']*["'][\s\S]*?<img[^>]+alt=["']([^"']+)["']/i.exec(
        row,
      )?.[1] ?? extractBrand(row).value;
    const productId = /\/addproducttocart\/catalog\/(\d+)\//i.exec(row)?.[1] ??
      /data-productid=["'](\d+)["']/i.exec(row)?.[1] ?? null;
    const imageUrl = extractImage(row, baseUrl);
    const rowText = stripTags(row);
    const hasProductSignal = !!(
      productName || sku || productId || imageUrl || price != null ||
      stock.quantity != null || stock.inStock != null
    );
    if (!hasProductSignal) continue;

    const outOfStock = stock.inStock === false || stock.quantity === 0;
    const stockQuantity = stock.quantity ?? (stock.inStock === true ? 1 : null);
    const hit: ScanHit = {
      status: outOfStock ? "OUT_OF_STOCK" : "IN_STOCK",
      product_name: productName,
      brand: brand ? decodeEntities(brand).trim() : null,
      supplier_product_code: sku || null,
      stock_quantity: stockQuantity,
      supplier_price: price,
      product_url: productUrl,
      gtin: null,
      image_url: imageUrl,
    };
    candidates.push(hit);
    const rowRelated = related || oemRelated(rowText, norm);
    if (rowRelated && !matched) matched = hit;
  }
  return { hit: matched, resultCount: candidates.length, first: candidates[0] ?? null };
}

function emptyProductSearchDebug(): SearchDebug["productSearch"] {
  return {
    tried: false, method: "GET", url: null, status: null, contentType: null, resultCount: 0,
    firstProductUrl: null, firstProductName: null, firstBrand: null, firstSku: null,
    firstPrice: null, firstStock: null, detailTried: false, detailStatus: null,
    detailContentType: null, oemMatch: null, failureStep: null,
  };
}

/** Autocomplete sonrasında kullanılan gerçek OnlineParça ürün arama partial endpointi. */
async function searchProductEndpoint(
  session: SupplierSession,
  oem: string,
): Promise<{ hit: ScanHit | null; debug: SearchDebug }> {
  const normalizedOem = normalizeOem(oem);
  const url = `${session.origin}/product/search?q=${encodeURIComponent(normalizedOem)}`;
  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": UA,
      Cookie: session.cookie,
      Accept: "text/html, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: session.origin + "/",
    },
    redirect: "follow",
  });
  const html = await res.text();
  const finalPath = new URL(res.url || url).pathname;
  const loginResponse = /\/login|\/giris|signin/i.test(finalPath);
  const verificationResponse = detectVerification(html);
  const parsed = res.ok
    ? parseProductSearchPartial(html, res.url || url, oem)
    : { hit: null, resultCount: 0, first: null };
  const productSearch = emptyProductSearchDebug();
  productSearch.tried = true;
  productSearch.url = url;
  productSearch.status = res.status;
  productSearch.contentType = res.headers.get("content-type");
  productSearch.resultCount = parsed.resultCount;
  productSearch.firstProductUrl = parsed.first?.product_url ?? null;
  productSearch.firstProductName = parsed.first?.product_name ?? null;
  productSearch.firstBrand = parsed.first?.brand ?? null;
  productSearch.firstSku = parsed.first?.supplier_product_code ?? null;
  productSearch.firstPrice = parsed.first?.supplier_price ?? null;
  productSearch.firstStock = parsed.first?.stock_quantity ?? null;
  // Satır bazında OEM eşleşmesi kurulamadıysa ancak yanıtın tamamı aranan OEM'i
  // içeriyorsa ilk sonucu kabul et (ör. SKU "TY5193124050" gibi ön ekli kodlar).
  let hit = parsed.hit;
  if (res.ok && !hit && parsed.first && oemRelated(html, normalizeOem(oem))) {
    hit = parsed.first;
    productSearch.oemMatch = true;
    productSearch.failureStep = null;
  }
  if (res.status === 401 || res.status === 403) productSearch.failureStep = "SESSION_EXPIRED";
  else if (loginResponse || verificationResponse) productSearch.failureStep = "LOGIN_REQUIRED";
  else if (!res.ok) productSearch.failureStep = "SEARCH_FAILED";
  else if (!hit) productSearch.failureStep = parsed.resultCount > 0 ? "PRODUCT_PARSE_FAILED" : "NOT_FOUND";
  const productFound = !!hit;
  const priceFound = hit?.supplier_price != null;
  const stockFound = !!hit && (hit.stock_quantity != null || hit.status === "IN_STOCK" || hit.status === "OUT_OF_STOCK");
  const finalCode: OemFailureCode = productSearch.failureStep === "LOGIN_REQUIRED"
    ? "LOGIN_REQUIRED"
    : productSearch.failureStep === "SESSION_EXPIRED"
      ? "SESSION_EXPIRED"
      : !res.ok
        ? "SEARCH_FAILED"
        : productFound
          ? priceFound
            ? stockFound
              ? "SUCCESS"
              : "STOCK_PARSE_FAILED"
            : "PRICE_PARSE_FAILED"
          : parsed.resultCount === 0
            ? "NOT_FOUND"
            : "PRODUCT_PARSE_FAILED";
  return {
    hit,
    debug: {
      requestUrl: url,
      inputOem: oem,
      normalizedOem,
      method: "GET",
      status: res.status,
      redirected: res.url !== url,
      finalUrl: res.url || url,
      contentType: res.headers.get("content-type") ?? "",
      bodyPreview: html.replace(/\s+/g, " ").slice(0, 500),
      responseLength: html.length,
      productFound,
      detailVerified: false,
      priceFound,
      stockFound,
      finalCode,
      userMessage: failureMessage(finalCode),
      searchSource: "product-search",
      serverHtmlProductFound: false,
      ajax: emptyAjaxDebug(),
      productSearch,
    },
  };
}

function failureMessage(code: OemFailureCode): string {
  if (code === "NOT_FOUND") return "Ürün bulunamadı.";
  if (code === "DETAIL_FETCH_FAILED") return "Ürün bulundu ancak detay bilgileri alınamadı.";
  if (code === "PRICE_PARSE_FAILED") return "Ürün bulundu ancak fiyat bilgisi alınamadı.";
  if (code === "STOCK_PARSE_FAILED") return "Ürün bulundu ancak stok bilgisi alınamadı.";
  if (code === "LOGIN_REQUIRED" || code === "SESSION_EXPIRED") return "OnlineParça oturumu geçersiz.";
  if (code === "ONLINEPARCA_TIMEOUT" || code === "SEARCH_FAILED") return "OnlineParça’ya ulaşılamadı.";
  if (code === "PRODUCT_PARSE_FAILED") return "Arama yanıtı alındı ancak ürün ayrıştırılamadı.";
  return "Ürün bulundu.";
}

function emptyAjaxDebug(): AjaxDebug {
  return {
    tried: false,
    endpoint: null,
    method: "GET",
    status: null,
    contentType: null,
    itemCount: 0,
    productCount: 0,
    firstProductUrl: null,
    firstProductLabel: null,
    rawPreview: null,
    detailStatus: null,
    detailUrl: null,
    detailName: null,
    detailBrand: null,
    detailSku: null,
    detailStock: null,
    detailPrice: null,
    oemMatch: null,
    continuedToSearch: false,
    note: null,
  };
}

interface AutocompleteItem {
  label?: string;
  producturl?: string;
  productpictureurl?: string;
}

/**
 * nopCommerce arama kutusunun gerçekte kullandığı XHR uç noktası.
 * Ürün listesi sayfası JS ile doldurulduğu için sunucudan gelen HTML'de ürün yoktur;
 * gerçek sonuç bu JSON çağrısından gelir.
 */
export async function ajaxSearchOem(
  session: SupplierSession,
  oem: string,
  debug: AjaxDebug,
): Promise<{ url: string; label: string | null }[]> {
  const endpoint = `${session.origin}/catalog/searchautocomplete?term=${encodeURIComponent(oem)}`;
  debug.tried = true;
  debug.endpoint = endpoint;
  const res = await fetchWithTimeout(endpoint, {
    headers: {
      "User-Agent": UA,
      Cookie: session.cookie,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: session.origin + "/",
    },
    redirect: "follow",
  });
  debug.status = res.status;
  debug.contentType = res.headers.get("content-type");
  const text = await res.text();
  debug.rawPreview = text.replace(/\s+/g, " ").slice(0, 400);
  if (!res.ok) {
    debug.note = `HTTP ${res.status}`;
    return [];
  }
  let items: AutocompleteItem[] = [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) items = parsed as AutocompleteItem[];
  } catch {
    debug.note = "Yanıt JSON değil";
    return [];
  }
  debug.itemCount = items.length;
  debug.firstProductLabel = (items[0]?.label ?? "").trim() || null;
  const out: { url: string; label: string | null }[] = [];
  for (const it of items) {
    const raw = (it.producturl ?? "").trim();
    if (!raw) continue;
    const url = abs(raw, session.origin + "/");
    if (!url || !sameHost(url, session.host)) continue;
    out.push({ url, label: (it.label ?? "").trim() || null });
  }
  debug.productCount = out.length;
  debug.firstProductUrl = out[0]?.url ?? null;
  if (out[0]?.label) debug.firstProductLabel = out[0].label;
  if (items.length > 0 && out.length === 0) {
    debug.note = "JSON eşleşme döndü ancak producturl boş (oturum/yetki gerekiyor olabilir).";
  }
  if (items.length === 0) debug.note = debug.note ?? "JSON yanıtı boş dizi.";
  return out;
}

/** Tek OEM sorgusu; hem sonucu hem de teşhis bilgisini döndürür. */
export async function searchOemDebug(
  session: SupplierSession,
  oem: string,
  _searchUrlTemplate?: string | null,
): Promise<{ hit: ScanHit | null; debug: SearchDebug; error?: string }> {
  const ajax = emptyAjaxDebug();
  let productSearchTrace = emptyProductSearchDebug();
  const norm0 = normalizeOem(oem);

  // 1) ÖNCE gerçek XHR uç noktası: ürün listesi JS ile geldiği için HTML'de bulunmaz.
  try {
    const items = await ajaxSearchOem(session, oem, ajax);
    for (const item of items.slice(0, 3)) {
      const { res: dRes, html: dHtml } = await fetchPage(item.url, session.cookie);
      ajax.detailUrl = item.url;
      ajax.detailStatus = dRes.status;
      if (!dRes.ok) {
        ajax.note = `Detay HTTP ${dRes.status}`;
        continue;
      }
      const detail = parseDetailPage(dHtml, item.url);
      ajax.detailName = detail.hit.product_name;
      ajax.detailBrand = detail.hit.brand;
      ajax.detailSku = detail.hit.supplier_product_code;
      ajax.detailStock =
        detail.hit.stock_quantity != null ? String(detail.hit.stock_quantity) : detail.hit.status;
      ajax.detailPrice =
        detail.hit.supplier_price != null ? String(detail.hit.supplier_price) : null;
      const related =
        oemRelated(item.label ?? "", norm0) ||
        oemRelated(item.url, norm0) ||
        oemRelated(dHtml, norm0);
      ajax.oemMatch = related;
      if (!detail.isProduct || !related) {
        ajax.note = !detail.isProduct
          ? "Detay sayfası ürün olarak doğrulanamadı."
          : "Detay sayfası aranan OEM ile eşleşmedi.";
        continue;
      }

      const parse = emptyParseDebug();
      parse.cardFound = true;
      parse.cardSelector = "ajax: /catalog/searchtermautocomplete";
      parse.cardCount = ajax.productCount;
      parse.detailFetched = true;
      parse.productUrl = detail.hit.product_url;
      parse.productName = detail.hit.product_name;
      parse.priceSelector = detail.priceSelector;
      parse.stockSelector = detail.stockSelector;
      parse.brandSelector = detail.brandSelector;
      parse.skuSelector = detail.skuSelector;
      parse.candidates.push({
        index: 1,
        url: item.url,
        title: detail.hit.product_name,
        isProduct: true,
        oemMatch: true,
        priceFound: detail.hit.supplier_price != null,
        stockFound: detail.hit.stock_quantity != null || detail.hit.status !== "NOT_FOUND",
        sku: detail.hit.supplier_product_code,
        brand: detail.hit.brand,
        imageFound: !!detail.hit.image_url,
        signals: ["ajax", "detay-doğrulandı"],
        result: "ACCEPTED",
      });
      return {
        hit: detail.hit,
        debug: {
          inputOem: oem,
          normalizedOem: norm0,
          requestUrl: ajax.endpoint ?? "",
          method: "GET",
          status: ajax.status ?? 0,
          redirected: false,
          finalUrl: item.url,
          contentType: ajax.contentType ?? "",
          bodyPreview: "",
          responseLength: ajax.rawPreview?.length ?? 0,
          productFound: true,
          detailVerified: true,
          priceFound: detail.hit.supplier_price != null,
          stockFound: detail.hit.stock_quantity != null,
          finalCode: detail.hit.supplier_price == null
            ? "PRICE_PARSE_FAILED"
            : detail.hit.stock_quantity == null
              ? "STOCK_PARSE_FAILED"
              : "SUCCESS",
          userMessage: failureMessage(
            detail.hit.supplier_price == null
              ? "PRICE_PARSE_FAILED"
              : detail.hit.stock_quantity == null
                ? "STOCK_PARSE_FAILED"
                : "SUCCESS",
          ),
          searchSource: "ajax",
          serverHtmlProductFound: false,
          ajax,
          productSearch: emptyProductSearchDebug(),
          parse,
        },
      };
    }
  } catch (err) {
    ajax.note = err instanceof Error ? err.message : "XHR isteği başarısız";
  }

  // 2) Autocomplete yalnızca öneri katmanıdır. producturl boş olsa da gerçek
  // ürün tablosunu döndüren özel endpointi mutlaka çalıştır.
  ajax.continuedToSearch = true;
  try {
    const productSearch = await searchProductEndpoint(session, oem);
    productSearchTrace = productSearch.debug.productSearch;
    productSearch.debug.ajax = ajax;
    if (productSearch.hit) {
      const hit = productSearch.hit;
      const parse = emptyParseDebug();
      parse.cardFound = true;
      parse.cardSelector = "/product/search: table.cart > tbody > tr";
      parse.cardCount = 1;
      parse.productUrl = hit.product_url;
      parse.productName = hit.product_name;
      parse.priceSelector = ".actual-price";
      parse.stockSelector = ".mobim-stock-indicator";
      parse.brandSelector = ".product-picture img[alt]";
      parse.skuSelector = ".mobim-product-sku";
      const detailUrl = hit.product_url;
      if (detailUrl && sameHost(detailUrl, session.host)) {
        productSearch.debug.productSearch.detailTried = true;
        const { res: detailRes, html: detailHtml } = await fetchPage(detailUrl, session.cookie);
        productSearch.debug.productSearch.detailStatus = detailRes.status;
        productSearch.debug.productSearch.detailContentType = detailRes.headers.get("content-type");
        ajax.detailUrl = detailUrl;
        ajax.detailStatus = detailRes.status;
        parse.detailFetched = true;
        if (detailRes.ok) {
          const detail = parseDetailPage(detailHtml, detailUrl);
          const detailMatches =
            oemRelated(detailHtml, norm0) ||
            oemRelated(detail.hit.supplier_product_code ?? "", norm0) ||
            oemRelated(detail.hit.product_name ?? "", norm0) ||
            oemRelated(detailUrl, norm0);
          productSearch.debug.productSearch.oemMatch = detail.isProduct && detailMatches;
          productSearch.debug.detailVerified = detail.isProduct && detailMatches;
          ajax.oemMatch = detail.isProduct && detailMatches;
          if (!detail.isProduct) productSearch.debug.productSearch.failureStep = "PRODUCT_DETAIL_PARSE";
          else if (!detailMatches) productSearch.debug.productSearch.failureStep = "OEM_VALIDATION";
          else {
            hit.status = detail.hit.status;
            hit.product_name = detail.hit.product_name ?? hit.product_name;
            hit.brand = detail.hit.brand ?? hit.brand;
            hit.supplier_product_code = detail.hit.supplier_product_code ?? hit.supplier_product_code;
            hit.stock_quantity = detail.hit.stock_quantity ?? hit.stock_quantity;
            hit.supplier_price = detail.hit.supplier_price ?? hit.supplier_price;
            hit.product_url = detail.hit.product_url ?? hit.product_url;
            hit.gtin = detail.hit.gtin ?? hit.gtin;
            hit.image_url = detail.hit.image_url ?? hit.image_url;
          }
        } else {
          productSearch.debug.productSearch.failureStep = "DETAIL_FETCH_FAILED";
        }
      }
      await enrichFromDetail(session, hit, parse);
      ajax.detailUrl = hit.product_url;
      ajax.detailStatus = productSearch.debug.productSearch.detailStatus;
      ajax.detailName = hit.product_name;
      ajax.detailBrand = hit.brand;
      ajax.detailSku = hit.supplier_product_code;
      ajax.detailStock = hit.stock_quantity != null ? String(hit.stock_quantity) : hit.status;
      ajax.detailPrice = hit.supplier_price != null ? String(hit.supplier_price) : null;
      if (productSearch.debug.productSearch.oemMatch == null) {
        productSearch.debug.productSearch.oemMatch =
          oemRelated(hit.supplier_product_code ?? "", norm0) ||
          oemRelated(hit.product_name ?? "", norm0) ||
          oemRelated(hit.product_url ?? "", norm0);
        ajax.oemMatch = productSearch.debug.productSearch.oemMatch;
      }
      // Arama sonucu geçerli bir ürün döndürdüyse, detay sayfası doğrulanamasa bile
      // sonucu düşürme; yalnızca hangi adımda doğrulanamadığını raporla.
      if (!productSearch.debug.productSearch.oemMatch) {
        productSearch.debug.productSearch.failureStep = "OEM_VALIDATION_SOFT";
        parse.notes.push(
          "Ürün arama sonucunda bulundu ancak detay sayfasında OEM doğrulanamadı; arama sonucu kullanıldı.",
        );
      }
      productSearch.debug.parse = parse;
      productSearch.debug.serverHtmlProductFound = true;
      productSearch.debug.productFound = true;
      productSearch.debug.priceFound = hit.supplier_price != null;
       productSearch.debug.stockFound =
         hit.stock_quantity != null || hit.status === "IN_STOCK" || hit.status === "OUT_OF_STOCK";
      productSearch.debug.finalCode = productSearch.debug.productSearch.failureStep === "DETAIL_FETCH_FAILED"
        ? "DETAIL_FETCH_FAILED"
        : hit.supplier_price == null
          ? "PRICE_PARSE_FAILED"
           : !productSearch.debug.stockFound
            ? "STOCK_PARSE_FAILED"
            : "SUCCESS";
      productSearch.debug.userMessage = failureMessage(productSearch.debug.finalCode);
      return { hit, debug: productSearch.debug };
    }
    // Arama API'si çalıştı ve gerçekten sonuç yok → bozuk klasik /search yedeğine düşme.
    if (
      productSearch.debug.productSearch.tried &&
      productSearch.debug.status === 200 &&
      productSearch.debug.productSearch.resultCount === 0
    ) {
      return { hit: emptyHit("NOT_FOUND"), debug: productSearch.debug };
    }
    // /product/search güncel ve belirleyici arama yoludur. HTTP/parser/session
    // hatalarını eski /search yedeğine çevirip yanlış NOT_FOUND üretme.
    return { hit: null, debug: productSearch.debug, error: productSearch.debug.userMessage };
  } catch (err) {
    const timeout = err instanceof Error && err.message === "ONLINEPARCA_TIMEOUT";
    const code: OemFailureCode = timeout ? "ONLINEPARCA_TIMEOUT" : "SEARCH_FAILED";
    const debug: SearchDebug = {
      inputOem: oem,
      normalizedOem: norm0,
      requestUrl: `${session.origin}/product/search?q=${encodeURIComponent(norm0)}`,
      method: "GET",
      status: 0,
      redirected: false,
      finalUrl: "",
      contentType: "",
      bodyPreview: "",
      responseLength: 0,
      productFound: false,
      detailVerified: false,
      priceFound: false,
      stockFound: false,
      finalCode: code,
      userMessage: failureMessage(code),
      searchSource: "product-search",
      serverHtmlProductFound: false,
      ajax,
      productSearch: productSearchTrace,
    };
    debug.productSearch.failureStep = code;
    return { hit: null, debug, error: debug.userMessage };
  }

  // Eski klasik HTML /search yedeği bilerek kullanılmaz.
}

/** Ürün detay sayfasını doğrular ve ürün bilgisini çıkarır. */
export function parseDetailPage(
  html: string,
  url: string,
): {
  isProduct: boolean;
  hit: ScanHit;
  priceSelector: string | null;
  stockSelector: string | null;
  brandSelector: string | null;
  skuSelector: string | null;
} {
  const ld = extractJsonLdProducts(html)[0];
  const price = extractPrice(html);
  const stock = extractStock(html);
  const brand = extractBrand(html);
  const sku = extractSku(html);
  const h1 = /<h1[^>]*>([\s\S]{0,300}?)<\/h1>/i.exec(html);
  const name = ld?.name ?? (h1 ? stripTags(h1[1] ?? "") || null : null);
  const hasCart = /add-?to-?cart|sepete\s*ekle|addtocart/i.test(html);
  const blockedPath = BLOCKED_URL_RE.test(new URL(url).pathname);
  const blockedTitle = !!name && BLOCKED_TITLE_RE.test(name.trim());

  const signals = [
    !!ld,
    price.value != null,
    sku.value != null,
    brand.value != null,
    hasCart,
  ].filter(Boolean).length;
  const isProduct = !blockedPath && !blockedTitle && signals >= 2;

  const outOfStock = stock.inStock === false || (stock.quantity !== null && stock.quantity <= 0);
  const base = ld
    ? jsonLdToHit(ld, url, html.toLowerCase())
    : emptyHit(outOfStock ? "OUT_OF_STOCK" : "IN_STOCK");
  return {
    isProduct,
    hit: {
      ...base,
      status:
        base.status === "NOT_FOUND" ? (outOfStock ? "OUT_OF_STOCK" : "IN_STOCK") : base.status,
      product_name: base.product_name ?? name,
      brand: base.brand ?? brand.value,
      supplier_product_code: base.supplier_product_code ?? sku.value,
      stock_quantity: base.stock_quantity ?? stock.quantity,
      supplier_price: base.supplier_price ?? price.value,
      product_url: url,
      image_url: base.image_url ?? extractImage(html, url),
    },
    priceSelector: price.selector ?? (base.supplier_price != null ? "ld+json offers.price" : null),
    stockSelector: stock.selector ?? "ld+json availability",
    brandSelector: brand.selector ?? (base.brand ? "ld+json brand" : null),
    skuSelector: sku.selector ?? (base.supplier_product_code ? "ld+json sku" : null),
  };
}

/** Tek bir OEM'i tedarikçide sorgular. */
export async function searchOem(
  session: SupplierSession,
  searchUrlTemplate: string,
  oem: string,
): Promise<ScanHit> {
  const { hit, error } = await searchOemDebug(session, oem, searchUrlTemplate);
  if (!hit) throw new Error(error ?? "Sonuç alınamadı");
  return hit;
}

/** Basit kontrollü retry (rate limit / geçici hata). */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 800): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof VerificationRequiredError) throw err;
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
