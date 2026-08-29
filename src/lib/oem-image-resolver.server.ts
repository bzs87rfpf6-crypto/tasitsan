/**
 * OEM görsel çözücü — worker tarafından kullanılır.
 * Tek sorumluluk: bir OEM kodu için en iyi görseli bul (Firecrawl + skor),
 * indir, part-images bucket'ına yükle ve skor + breakdown ile döndür.
 *
 * Kalite filtresi (Akıllı Eşleşme):
 *   - OEM eşleşmesi : %50 ağırlık (mevcut değilse aday reddedilir)
 *   - Marka         : %20
 *   - Ürün adı      : %20
 *   - Görsel/host   : %10
 *
 * Eşikler:
 *   - 70 altı  → reddedilir (worker parts.photos'a yazmaz)
 *   - 70-79    → "Orta Güven" — sadece admin görür
 *   - 80-89    → "Yüksek Güven" — kullanıcılar görür
 *   - 90+      → "Çok Yüksek Güven"
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const IMG_EXT_RE = /\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s"'<>)]*)?$/i;
const ABS_IMG_RE = /https?:\/\/[^\s"'<>)]+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s"'<>)]*)?/gi;
const BAD = [
  "gstatic.com",
  "googleusercontent.com/proxy",
  "doubleclick",
  "googlesyndication",
  "logo-",
  "/logo",
  "-logo.",
  "/icon",
  "favicon",
  "sprite",
  "placeholder",
  "watermark",
  "no-image",
  "noimage",
  "/avatar",
  "/banner",
  "banner-",
  "captcha",
];
// Tiny-pixel hints (icons / thumbnails / spacers we don't want)
const SIZE_HINT_RE = /(?:^|[-_\/])(?:16|24|32|48|50|64)x(?:16|24|32|48|50|64)(?:[-_./]|$)/i;
// OEM catalog / yedek parça siteleri (skor bonusu için)
const CATALOG_DOMAINS = [
  "partsouq.com",
  "amayama.com",
  "megazip.net",
  "7zap.com",
  "toyodiy.com",
  "nissan-parts.com",
  "parts.cat",
  "oemotoyedekparca.com",
  "otoparcaburada.com",
  "parcahane.com",
  "parcamarket.com",
  "yedekparcabudur.com",
  "yedekparcam.com",
  "otoparcam.com",
  "parcaburada.com",
];
const TIMEOUT_MS = 18_000;

function absolutize(maybe: string, base: string): string {
  try {
    const v = (maybe || "").trim();
    if (!v) return "";
    if (v.startsWith("data:")) return "";
    if (v.startsWith("//")) return "https:" + v;
    if (/^https?:/i.test(v)) return v;
    if (!base) return v;
    return new URL(v, base).toString();
  } catch {
    return maybe;
  }
}

function isImageUrl(u: string): boolean {
  if (!u || !/^https?:\/\//i.test(u)) return false;
  const low = u.toLowerCase();
  if (BAD.some((b) => low.includes(b))) return false;
  if (SIZE_HINT_RE.test(low)) return false;
  // Either explicit image extension OR query carrying obvious image marker.
  return IMG_EXT_RE.test(low) || /[?&](?:format|type)=(?:jpe?g|png|webp|avif)/i.test(low);
}

/**
 * Tüm görsel kaynaklarından aday URL'leri çıkar:
 *  - <img src / data-src / data-lazy-src / data-original / srcset>
 *  - <picture><source srcset>
 *  - og:image / twitter:image
 *  - JSON-LD image alanları
 *  - <script> içindeki "image"/"gallery"/"images" dizileri
 *  - inline style + <style> background-image: url(...)
 *  - <link rel="image_src">
 *  - .jpg/.jpeg/.png/.webp/.avif uzantılı her serbest URL
 */
function extractAllImages(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const abs = absolutize(raw, baseUrl);
    if (isImageUrl(abs)) out.add(abs);
  };

  // <img ...>
  const imgTagRe = /<img\b[^>]*>/gi;
  const attrRe = /\b(src|data-src|data-original|data-lazy-src|data-lazy|data-image|data-zoom-image|data-large_image)\s*=\s*["']([^"']+)["']/gi;
  const srcsetRe = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = imgTagRe.exec(html))) {
    const tag = tagMatch[0];
    let m: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((m = attrRe.exec(tag))) add(m[2]);
    srcsetRe.lastIndex = 0;
    while ((m = srcsetRe.exec(tag))) {
      for (const part of m[1].split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (url) add(url);
      }
    }
  }

  // <picture><source srcset="...">
  const sourceTagRe = /<source\b[^>]*>/gi;
  let sMatch: RegExpExecArray | null;
  while ((sMatch = sourceTagRe.exec(html))) {
    const tag = sMatch[0];
    let m: RegExpExecArray | null;
    srcsetRe.lastIndex = 0;
    while ((m = srcsetRe.exec(tag))) {
      for (const part of m[1].split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (url) add(url);
      }
    }
  }

  // <meta property="og:image" | "twitter:image" content="...">
  const metaRe = /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const metaRe2 = /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["'][^>]*>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = metaRe.exec(html))) add(mm[1]);
  while ((mm = metaRe2.exec(html))) add(mm[1]);

  // <link rel="image_src" href="...">
  const linkImgRe = /<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*href\s*=\s*["']([^"']+)["']/gi;
  while ((mm = linkImgRe.exec(html))) add(mm[1]);

  // JSON-LD "image": "..." veya "image": ["...", ...]
  const ldRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld: RegExpExecArray | null;
  while ((ld = ldRe.exec(html))) {
    const body = ld[1];
    // string image
    const strRe = /"image"\s*:\s*"([^"]+)"/gi;
    let s: RegExpExecArray | null;
    while ((s = strRe.exec(body))) add(s[1]);
    // array image
    const arrRe = /"image"\s*:\s*\[([^\]]+)\]/gi;
    let a: RegExpExecArray | null;
    while ((a = arrRe.exec(body))) {
      for (const piece of a[1].match(/"([^"]+)"/g) ?? []) add(piece.replace(/^"|"$/g, ""));
    }
  }

  // <script> içindeki image/images/gallery dizileri (Partsouq/Amayama tarzı SPA verisi)
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const arrKeyRe = /"(?:image|images|gallery|photos|thumb|thumbnail|imageUrl|image_url)"\s*:\s*(?:"([^"]+)"|\[([^\]]{0,4000})\])/gi;
  let sc: RegExpExecArray | null;
  while ((sc = scriptRe.exec(html))) {
    const body = sc[1];
    if (body.length > 200_000) continue;
    let k: RegExpExecArray | null;
    while ((k = arrKeyRe.exec(body))) {
      if (k[1]) add(k[1]);
      if (k[2]) for (const p of k[2].match(/"([^"]+)"/g) ?? []) add(p.replace(/^"|"$/g, ""));
    }
  }

  // CSS background-image: url(...) — inline ve <style> blokları
  const bgRe = /background(?:-image)?\s*:\s*[^;}"']*url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((mm = bgRe.exec(html))) add(mm[1]);

  // Son çare: HTML içindeki tüm absolute image URL'leri
  for (const m of html.match(ABS_IMG_RE) ?? []) add(m);

  return Array.from(out);
}

function catalogBonus(url: string, sourceUrl: string): number {
  const u = `${url} ${sourceUrl}`.toLowerCase();
  return CATALOG_DOMAINS.some((d) => u.includes(d)) ? 20 : 0;
}

// Threshold to keep something in cache as a "good" result (admin can still inspect 50+ via panel).
export const MIN_CONFIDENCE_KEEP = 70;
// Threshold above which the worker writes the image to parts.photos (user-visible).
export const MIN_CONFIDENCE_USER = 80;

export interface PartContext {
  brand?: string | null;
  model?: string | null;
  title?: string | null;
  part_type?: string | null;
  category?: string | null;
}

function normalizeOem(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-./_]+/g, "");
}

function pickContentType(url: string, header: string | null): string {
  if (header && header.startsWith("image/")) return header;
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

function extToCt(ct: string): string {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "jpg";
}

function tokenize(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function bandFor(score: number): "low" | "medium" | "high" | "very_high" {
  if (score >= 90) return "very_high";
  if (score >= 80) return "high";
  if (score >= 70) return "medium";
  return "low";
}

export interface ScoreBreakdown {
  oem: number; // 0..50
  brand: number; // 0..20
  title: number; // 0..20
  visual: number; // 0..10
  total: number; // 0..100
  band: "low" | "medium" | "high" | "very_high";
  matchedTokens?: string[];
}

/**
 * Bir aday için güven skoru hesapla.
 * Adayın URL'i + kaynak sayfa başlığı + sayfa metni (haystack) ve part bağlamı kullanılır.
 */
export function scoreCandidate(args: {
  oemNormalized: string;
  haystack: string; // candidate url + source url + title concatenated, lowercased
  byteLen: number;
  hostBad: boolean;
  part?: PartContext | null;
}): ScoreBreakdown {
  const hay = args.haystack.toLowerCase();
  const oem = args.oemNormalized.toLowerCase();

  // 1) OEM (50). Tam eşleşme yoksa 0 → aday reddedilir.
  let oemScore = 0;
  // OEM kodunun "normalleştirilmiş" haline benzer şekilde haystack'i normalize edip ara
  const hayNorm = hay.replace(/[\s\-./_]+/g, "");
  if (hayNorm.includes(oem)) oemScore = 50;
  else if (oem.length >= 5 && hayNorm.includes(oem.slice(0, Math.max(5, oem.length - 2))))
    oemScore = 30; // kısmi

  // 2) Brand (20)
  let brandScore = 0;
  const brandTokens = tokenize(args.part?.brand);
  if (brandTokens.length > 0) {
    const hits = brandTokens.filter((t) => hay.includes(t)).length;
    brandScore = Math.min(20, Math.round((hits / brandTokens.length) * 20));
  } else {
    // Brand bilinmiyorsa nötr puan ver (10/20), tamamen cezalandırma
    brandScore = 10;
  }

  // 3) Ürün adı / part_type (20)
  const titleTokens = Array.from(
    new Set([
      ...tokenize(args.part?.title),
      ...tokenize(args.part?.part_type),
      ...tokenize(args.part?.model),
    ]),
  );
  let titleScore = 0;
  const matched: string[] = [];
  if (titleTokens.length > 0) {
    for (const t of titleTokens) {
      if (hay.includes(t)) matched.push(t);
    }
    titleScore = Math.min(20, Math.round((matched.length / titleTokens.length) * 20));
  } else {
    titleScore = 10;
  }

  // 4) Görsel/host kalitesi (10) — heuristic: yeterli boyut + temiz host
  let visualScore = 0;
  if (!args.hostBad) visualScore += 5;
  if (args.byteLen >= 8_000) visualScore += 3;
  if (args.byteLen >= 30_000) visualScore += 2;
  visualScore = Math.min(10, visualScore);

  const total = oemScore + brandScore + titleScore + visualScore;
  return {
    oem: oemScore,
    brand: brandScore,
    title: titleScore,
    visual: visualScore,
    total,
    band: bandFor(total),
    matchedTokens: matched.slice(0, 8),
  };
}

interface ResolveSuccess {
  ok: true;
  storage_path: string;
  public_url: string;
  source: string;
  source_url: string | null;
  confidence: number;
  confidence_band: ScoreBreakdown["band"];
  score_breakdown: ScoreBreakdown;
}
interface ResolveFailure {
  ok: false;
  reason: string;
  confidence?: number;
  confidence_band?: ScoreBreakdown["band"];
  score_breakdown?: ScoreBreakdown;
}
export type ResolveResult = ResolveSuccess | ResolveFailure;

interface Candidate {
  url: string;
  source: string;
  title: string;
  pageText: string;
  provider: "firecrawl";
  query: string;
}

// Önceliklendirilmiş Türk OEM yedek parça siteleri.
// `site:` ile en üsttekiler önce denenir; başarılı eşleşmeler buradan optimize edilir.
const PRIORITY_DOMAINS = [
  "oemotoyedekparca.com",
  "otoparcaburada.com",
  "parcahane.com",
  "parcamarket.com",
  "yedekparcabudur.com",
  "yedekparcam.com",
  "otoparcam.com",
  "parcaburada.com",
  "ucuzyedekparcam.com",
  "otokocyedekparca.com",
];

function oemVariants(oem: string): string[] {
  const compact = normalizeOem(oem);
  const dashed = compact.replace(/([A-Z]+)(\d+)/, "$1-$2");
  return Array.from(new Set([oem.trim(), compact, dashed].filter(Boolean)));
}

function buildSearchQueries(oem: string, part?: PartContext | null): string[] {
  const brand = part?.brand?.trim() ?? "";
  const model = part?.model?.trim() ?? "";
  const title = part?.title?.trim() || part?.part_type?.trim() || "";
  const compact = normalizeOem(oem);
  const out: string[] = [];
  const push = (q: string) => {
    const s = q.replace(/\s+/g, " ").trim();
    if (s && !out.includes(s)) out.push(s);
  };

  // 1) Yüksek öncelik: site-targeted (geçmişte başarılı domain'ler önce)
  for (const d of PRIORITY_DOMAINS) push(`${compact} site:${d}`);

  // 2) OEM varyasyonları
  for (const v of oemVariants(oem)) push(v);

  // 3) OEM + Marka / Model / Ürün Adı kombinasyonları
  if (brand) push(`${compact} ${brand}`);
  if (model && model !== brand) push(`${compact} ${model}`);
  if (title) push(`${compact} ${title}`);
  if (brand && title) push(`${brand} ${compact} ${title}`);

  // 4) Genel anahtar kelimeler
  push(`${compact} OEM`);
  push(`${compact} yedek parça`);
  push(`${compact} oto yedek parça`);

  return out.slice(0, 24);
}

function logProvider(args: {
  provider: string;
  query: string;
  httpStatus?: number;
  resultsCount: number;
  durationMs: number;
  bodyPreview?: string;
  error?: string;
}) {
  console.log("[image-resolver-provider]", {
    provider: args.provider,
    query: args.query,
    httpStatus: args.httpStatus ?? null,
    resultsCount: args.resultsCount,
    durationMs: args.durationMs,
    error: args.error ?? null,
    bodyPreview: args.bodyPreview?.slice(0, 500),
  });
}

async function firecrawlOne(query: string, key: string, signal: AbortSignal): Promise<Candidate[]> {
  const t0 = Date.now();
  const out: Candidate[] = [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        limit: 6,
        scrapeOptions: { formats: ["html"], onlyMainContent: false },
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      logProvider({
        provider: "firecrawl",
        query,
        httpStatus: res.status,
        resultsCount: 0,
        durationMs: Date.now() - t0,
        bodyPreview: body,
      });
      return out;
    }
    const j = JSON.parse(body);
    const items: Array<{
      url?: string;
      title?: string;
      html?: string;
      metadata?: { ogImage?: string; sourceURL?: string };
    }> = j?.data?.web ?? j?.data ?? [];
    for (const r of items) {
      const src = r.url ?? r.metadata?.sourceURL ?? "";
      const html = r.html ?? "";
      const pageText = (r.title ?? "") + " " + html.replace(/<[^>]+>/g, " ").slice(0, 5000);
      if (r.metadata?.ogImage) {
        out.push({
          url: r.metadata.ogImage,
          source: src,
          title: r.title ?? "",
          pageText,
          provider: "firecrawl",
          query,
        });
      }
      const matches = extractAllImages(html, src);
      for (const m of matches.slice(0, 20)) {
        out.push({
          url: m,
          source: src,
          title: r.title ?? "",
          pageText,
          provider: "firecrawl",
          query,
        });
      }
    }
    logProvider({
      provider: "firecrawl",
      query,
      httpStatus: res.status,
      resultsCount: out.length,
      durationMs: Date.now() - t0,
      bodyPreview: body,
    });
  } catch (e) {
    logProvider({
      provider: "firecrawl",
      query,
      resultsCount: 0,
      durationMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return out;
}

async function searchCandidates(
  oem: string,
  signal: AbortSignal,
  part?: PartContext | null,
): Promise<Candidate[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  const queries = buildSearchQueries(oem, part);
  const out: Candidate[] = [];
  // Sırayla dene; yeterli aday biriktiğinde dur.
  for (const q of queries) {
    if (signal.aborted) break;
    const items = await firecrawlOne(q, key, signal);
    out.push(...items);
    if (out.length >= 16) break;
  }
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true))).slice(0, 24);
}

async function downloadImage(
  url: string,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const r = await fetch(url, {
      signal,
      redirect: "follow",
      headers: { "User-Agent": "TasitsanImageBot/1.0" },
    });
    if (!r.ok) return null;
    const cl = Number(r.headers.get("content-length") ?? 0);
    if (cl && cl > 4 * 1024 * 1024) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 1500 || buf.byteLength > 4 * 1024 * 1024) return null;
    return { bytes: buf, contentType: pickContentType(url, r.headers.get("content-type")) };
  } catch {
    return null;
  }
}

export async function resolveOemImage(
  oem: string,
  part?: PartContext | null,
): Promise<ResolveResult> {
  const normalized = normalizeOem(oem);
  if (!normalized) return { ok: false, reason: "empty oem" };

  // 1) Cache lookup
  const cacheKey = `oem:img:v2:${normalized}`;
  try {
    const { data: cached } = await supabaseAdmin.rpc("get_oem_research", { _key: cacheKey });
    if (cached && typeof cached === "object") {
      const c = cached as {
        storage_path?: string;
        public_url?: string;
        source?: string;
        source_url?: string | null;
        confidence?: number;
        confidence_band?: ScoreBreakdown["band"];
        score_breakdown?: ScoreBreakdown;
        failed?: boolean;
      };
      if (c.storage_path && c.public_url) {
        return {
          ok: true,
          storage_path: c.storage_path,
          public_url: c.public_url,
          source: c.source ?? "cache",
          source_url: c.source_url ?? null,
          confidence: c.confidence ?? 0,
          confidence_band: c.confidence_band ?? bandFor(c.confidence ?? 0),
          score_breakdown: c.score_breakdown ?? {
            oem: 0,
            brand: 0,
            title: 0,
            visual: 0,
            total: c.confidence ?? 0,
            band: bandFor(c.confidence ?? 0),
          },
        };
      }
      // Eski Firecrawl-only negatif cache artık güvenilir değil; Google/Bing fallback'leri denenebilsin.
    }
  } catch {
    /* ignore */
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const candidates = await searchCandidates(normalized, controller.signal, part);
    if (candidates.length === 0) {
      await writeNegativeCache(cacheKey, normalized);
      return { ok: false, reason: "no candidates" };
    }

    // Skor üret + sırala (yüksekten düşüğe)
    const scored = candidates.map((c) => {
      const hostBad = BAD.some((b) => c.url.toLowerCase().includes(b));
      const haystack = `${c.url} ${c.source} ${c.title} ${c.pageText}`;
      // İlk skor (byteLen bilinmiyor → tahmini 20k ver)
      const tentative = scoreCandidate({
        oemNormalized: normalized,
        haystack,
        byteLen: 20_000,
        hostBad,
        part,
      });
      // Katalog domain bonusu (+20)
      const bonus = catalogBonus(c.url, c.source);
      tentative.visual = Math.min(30, tentative.visual + bonus);
      tentative.total = tentative.oem + tentative.brand + tentative.title + tentative.visual;
      tentative.band = bandFor(tentative.total);
      return { cand: c, tentative };
    });
    scored.sort((a, b) => b.tentative.total - a.tentative.total);

    // OEM eşleşmesi olmayan adayları reddet (oem skoru 0)
    const viable = scored.filter((s) => s.tentative.oem >= 30);
    let bestRejected: ScoreBreakdown | null = scored[0]?.tentative ?? null;

    for (const item of viable) {
      if (controller.signal.aborted) break;
      const dl = await downloadImage(item.cand.url, controller.signal);
      if (!dl) continue;

      // Gerçek byteLen ile final skor
      const hostBad = BAD.some((b) => item.cand.url.toLowerCase().includes(b));
      const haystack = `${item.cand.url} ${item.cand.source} ${item.cand.title} ${item.cand.pageText}`;
      const score = scoreCandidate({
        oemNormalized: normalized,
        haystack,
        byteLen: dl.bytes.byteLength,
        hostBad,
        part,
      });
      // Katalog domain bonusu (+20) + byte boyutu bonusu (büyük görsele +5 ek)
      const bonus = catalogBonus(item.cand.url, item.cand.source);
      const sizeBonus = dl.bytes.byteLength >= 60_000 ? 5 : 0;
      score.visual = Math.min(30, score.visual + bonus + sizeBonus);
      score.total = score.oem + score.brand + score.title + score.visual;
      score.band = bandFor(score.total);

      // 70 altı → reddet (admin görmek istese de cache'lemiyoruz, denemeye devam et)
      if (score.total < MIN_CONFIDENCE_KEEP) {
        bestRejected = score.total > (bestRejected?.total ?? 0) ? score : bestRejected;
        continue;
      }

      // 70+ → yükle
      const ext = extToCt(dl.contentType);
      const storagePath = `oem/${normalized}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("part-images")
        .upload(storagePath, dl.bytes, { contentType: dl.contentType, upsert: true });
      if (upErr) {
        console.warn("[image-resolver] upload failed", upErr.message);
        continue;
      }
      const publicUrl = `/api/public/img/${storagePath}`;
      const payload = {
        storage_path: storagePath,
        public_url: publicUrl,
        source: item.cand.provider,
        source_url: item.cand.source ?? null,
        confidence: score.total,
        confidence_band: score.band,
        score_breakdown: score,
        cached_at: new Date().toISOString(),
      };
      try {
        await supabaseAdmin.rpc("save_oem_research", {
          _key: cacheKey,
          _query: normalized,
          _result: payload as never,
          _ttl_seconds: 60 * 60 * 24 * 90,
        });
      } catch {
        /* ignore */
      }
      return { ok: true, ...payload };
    }

    await writeNegativeCache(cacheKey, normalized);
    return {
      ok: false,
      reason: bestRejected
        ? `low confidence (${bestRejected.total}%): oem=${bestRejected.oem} brand=${bestRejected.brand} title=${bestRejected.title}`
        : "no candidate matched oem",
      confidence: bestRejected?.total,
      confidence_band: bestRejected?.band,
      score_breakdown: bestRejected ?? undefined,
    };
  } catch (e: unknown) {
    const reason = e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : "error";
    if (reason === "timeout") await writeNegativeCache(cacheKey, normalized);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

function safeHost(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "firecrawl";
  }
}

async function writeNegativeCache(key: string, normalized: string) {
  try {
    await supabaseAdmin.rpc("save_oem_research", {
      _key: key,
      _query: normalized,
      _result: { failed: true, cached_at: new Date().toISOString() } as never,
      _ttl_seconds: 60 * 60 * 24 * 7,
    });
  } catch {
    /* ignore */
  }
}
