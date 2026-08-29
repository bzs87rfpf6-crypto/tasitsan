import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Görsel bulucu: önceliklendirilmiş Firecrawl sorgu listesi + AI alaka skoru.
// İlk başarılı (>=3 aday) sorgu kümesi kullanılır; cache: oem_research_cache.

const inputSchema = z.object({
  oem: z.string().trim().max(60).optional().nullable(),
  title: z.string().trim().max(200).optional().nullable(),
  brand: z.string().trim().max(60).optional().nullable(),
  model: z.string().trim().max(60).optional().nullable(),
  force: z.boolean().optional(),
});

export interface OemImageResult {
  url: string;
  source_url: string;
  source_title: string;
  source_domain: string;
  relevance: number;
}

export interface OemVisualSearchResult {
  images: OemImageResult[];
  cached: boolean;
  cache_age_hours?: number;
  query: string;
  tried_queries: string[];
}

const IMG_RE = /https?:\/\/[^\s"'<>)]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>)]*)?/gi;
const BAD_HOSTS = [
  "gstatic.com",
  "googleusercontent.com/proxy",
  "doubleclick",
  "googlesyndication",
  "google.com/images/branding",
  "facebook.com/tr",
  "/pixel.",
];
const BAD_URL_HINTS = [
  "logo", "icon", "favicon", "sprite", "banner", "placeholder",
  "watermark", "no-image", "noimage", "default-", "/avatar", "/avatars/",
];
const TARGETED_DOMAINS = [
  "oemotoyedekparca.com",
  "otoparcaburada.com",
  "partsouq.com",
  "amayama.com",
  "7zap.com",
  "megazip.net",
];

function isBadUrl(u: string): boolean {
  const low = u.toLowerCase();
  if (BAD_HOSTS.some((b) => low.includes(b))) return true;
  if (BAD_URL_HINTS.some((h) => low.includes(h))) return true;
  return false;
}

function stripTr(s: string): string {
  return s
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ç/g, "c").replace(/Ç/g, "C");
}

function normalizeOemKey(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-./_]+/g, "");
}

function extractDomain(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function dedupe<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function oemVariants(oem: string): string[] {
  const v = new Set<string>();
  const trimmed = oem.trim();
  if (!trimmed) return [];
  v.add(trimmed);
  v.add(trimmed.toUpperCase());
  const compact = trimmed.replace(/[\s\-./_]+/g, "");
  v.add(compact);
  v.add(compact.toUpperCase());
  // hyphen variant: split letters from digits with dash
  const dashed = compact.replace(/([A-Za-z])(\d)/, "$1-$2");
  if (dashed !== compact) v.add(dashed.toUpperCase());
  return Array.from(v).filter(Boolean);
}

function buildQueries(d: { oem?: string | null; title?: string | null; brand?: string | null }): string[] {
  const oemRaw = d.oem?.trim() || "";
  const brand = d.brand?.trim() || "";
  const title = d.title?.trim() || "";
  const q: string[] = [];
  const push = (s: string) => { const t = s.replace(/\s+/g, " ").trim(); if (t && !q.includes(t)) q.push(t); };

  const oems = oemVariants(oemRaw);
  const primaryOem = oems[0] ?? "";

  // ÖNCELİK SIRASI:
  // 1) OEM + marka (yüksek alaka)
  if (primaryOem && brand) {
    for (const o of oems.slice(0, 2)) push(`${brand} ${o}`);
  }
  // 2) Sadece OEM
  for (const o of oems) push(o);
  // 3) Domain hedefli sorgular (site: operatörü) — sadece OEM ile
  if (primaryOem) {
    for (const d of TARGETED_DOMAINS) push(`${primaryOem} site:${d}`);
  }
  // 4) OEM + ürün adı
  if (primaryOem && title) {
    for (const o of oems.slice(0, 2)) push(`${o} ${title}`);
    if (brand) push(`${brand} ${primaryOem} ${title}`);
  }
  // 5) Sadece ürün adı (+marka)
  if (brand && title) push(`${brand} ${title} yedek parça`);
  if (title) push(`${title} yedek parça`);
  if (title) push(title);

  // Türkçe karakterleri kaldırılmış alternatifler
  const ascii: string[] = [];
  for (const s of q) {
    const a = stripTr(s);
    if (a !== s) ascii.push(a);
  }
  for (const a of ascii) push(a);

  return q.slice(0, 16);
}

class SearchError extends Error {
  kind: "rate_limit" | "auth" | "timeout" | "network" | "server";
  status?: number;
  constructor(kind: SearchError["kind"], message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

async function firecrawlSearch(query: string, apiKey: string): Promise<OemImageResult[]> {
  const out: OemImageResult[] = [];
  let res: Response;
  try {
    res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        limit: 8,
        scrapeOptions: { formats: ["html", "links"], onlyMainContent: false },
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort|timeout/i.test(msg)) throw new SearchError("timeout", `Görsel arama zaman aşımına uğradı (${query}).`);
    throw new SearchError("network", `Görsel arama servisine ulaşılamadı: ${msg}`);
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new SearchError("auth", "Görsel arama servisi yetkilendirme hatası (API anahtarını kontrol edin).", res.status);
    }
    if (res.status === 429) {
      throw new SearchError("rate_limit", "Görsel arama servisi limitine ulaşıldı, lütfen biraz sonra tekrar deneyin.", 429);
    }
    if (res.status >= 500) {
      throw new SearchError("server", `Görsel arama servisi geçici olarak hizmet veremiyor (HTTP ${res.status}).`, res.status);
    }
    console.warn("[img-search] firecrawl status", res.status, "for", query);
    return out;
  }
  try {
    const json = await res.json();
    const results: Array<{ url?: string; title?: string; html?: string; metadata?: { ogImage?: string; sourceURL?: string } }> =
      json?.data?.web ?? json?.data ?? [];
    for (const r of results) {
      const sourceUrl = r.url ?? r.metadata?.sourceURL ?? "";
      const sourceTitle = r.title ?? "";
      const domain = extractDomain(sourceUrl);
      if (r.metadata?.ogImage) {
        out.push({ url: r.metadata.ogImage, source_url: sourceUrl, source_title: sourceTitle, source_domain: domain, relevance: 0.5 });
      }
      const html = r.html ?? "";
      const matches = html.match(IMG_RE) ?? [];
      for (const m of matches.slice(0, 10)) {
        if (isBadUrl(m)) continue;
        out.push({ url: m, source_url: sourceUrl, source_title: sourceTitle, source_domain: domain, relevance: 0.5 });
      }
    }
  } catch (e) {
    console.warn("[img-search] parse error", query, e);
  }
  return out;
}


export const findOemImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OemVisualSearchResult> => {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!firecrawlKey) throw new Error("Görsel arama servisi yapılandırılmamış (FIRECRAWL_API_KEY eksik).");

    const queries = buildQueries({ oem: data.oem, title: data.title, brand: data.brand });
    if (queries.length === 0) {
      throw new Error("Arama için OEM kodu, marka veya ürün adı gereklidir.");
    }

    const primaryQuery = queries[0];
    const cacheKeyBase = data.oem ? `img:v2:${normalizeOemKey(data.oem)}` : `img:v2:t:${stripTr(primaryQuery).toLowerCase().replace(/\s+/g, "_").slice(0, 80)}`;
    const cacheKey = `oem:${cacheKeyBase}`;
    const { supabase, userId } = context;

    // 0) OEM Görsel Havuzu — internet aramasından önce kontrol et.
    //    Doğrulanmış havuz görseli varsa, Firecrawl çağrılmadan döndürülür.
    if (data.oem && !data.force) {
      const { data: libRows } = await supabase.rpc("lookup_oem_images", { _oem: data.oem, _limit: 10 });
      if (Array.isArray(libRows) && libRows.length > 0) {
        const libImages: OemImageResult[] = libRows.map((r: { image_url: string; brand: string | null; source_type: string; confidence: number }) => ({
          url: r.image_url,
          source_url: r.image_url,
          source_title: `OEM Havuzu (${r.source_type})`,
          source_domain: r.brand ?? "library",
          relevance: Math.max(0.8, (r.confidence ?? 90) / 100),
        }));
        return { images: libImages, cached: true, query: data.oem, tried_queries: ["library"] };
      }
    }


    // 1) Cache — pozitif sonuçlar 30 gün, boş sonuçlar 10 gün TTL.
    //    Boş cache de geri döner (TTL boyunca Firecrawl tekrar çağırılmaz);
    //    expires_at geçince get_oem_research NULL döner → otomatik yeniden dener.
    if (!data.force) {
      const { data: cached } = await supabase.rpc("get_oem_research", { _key: cacheKey });
      if (cached && typeof cached === "object") {
        const c = cached as { images?: OemImageResult[]; cached_at?: string; query?: string; tried_queries?: string[] };
        const ageHours = c.cached_at ? Math.max(0, (Date.now() - new Date(c.cached_at).getTime()) / 36e5) : undefined;
        const imgs = Array.isArray(c.images) ? c.images : [];
        return {
          images: imgs,
          cached: true,
          cache_age_hours: ageHours,
          query: c.query ?? primaryQuery,
          tried_queries: c.tried_queries ?? [primaryQuery],
        };
      }
    }

    // 2) Firecrawl — sırayla dene, ilk başarılı set'i al (min 4 sorgu)
    const MIN_QUERIES_BEFORE_GIVEUP = 4;
    const ENOUGH_RESULTS = 6;
    const tried: string[] = [];
    let successQuery = primaryQuery;
    let pool: OemImageResult[] = [];
    let apiError: SearchError | null = null;
    for (let idx = 0; idx < queries.length; idx++) {
      const q = queries[idx];
      tried.push(q);
      let res: OemImageResult[] = [];
      try {
        res = await firecrawlSearch(q, firecrawlKey);
      } catch (e) {
        if (e instanceof SearchError) {
          // auth/rate_limit -> hemen yüzeye çıkar
          if (e.kind === "auth" || e.kind === "rate_limit") {
            apiError = e;
            break;
          }
          // timeout/network/server -> diğer sorgulara devam et ama sakla
          apiError = e;
          console.warn("[img-search] api error, continuing", { query: q, kind: e.kind, status: e.status });
        } else {
          console.warn("[img-search] unexpected error", q, e);
        }
      }
      const filtered = dedupe(res, (c) => c.url);
      console.log("[img-search] query", {
        oem: data.oem ?? null,
        brand: data.brand ?? null,
        productName: data.title ?? null,
        searchQuery: q,
        resultsCount: filtered.length,
      });
      if (filtered.length > 0) {
        pool = dedupe([...pool, ...filtered], (c) => c.url);
        if (pool.length === filtered.length || successQuery === primaryQuery) {
          successQuery = q;
        }
      }
      // Yeterince sonuç ve minimum sorgu denendiyse dur
      if (pool.length >= ENOUGH_RESULTS && idx + 1 >= MIN_QUERIES_BEFORE_GIVEUP) break;
    }

    // Hiç sonuç yok ve API hatası varsa kullanıcıya gerçek hatayı göster
    if (pool.length === 0 && apiError) {
      throw apiError;
    }

    let images = pool.slice(0, 24);


    // 3) AI alaka skoru
    if (images.length > 0 && aiKey) {
      try {
        const list = images.map((im, i) => ({ i, domain: im.source_domain, title: im.source_title.slice(0, 120), url: im.url.slice(0, 200) }));
        const sys = "Sen otomotiv görsel arama denetçisisin. Stok/logo/ikon/banner görsellerine düşük (0-0.3), gerçek ürün fotoğrafına yüksek (0.7-1) skor ver.";
        const userMsg = `Sorgu: ${successQuery}\nOEM: ${data.oem ?? "-"}\nParça: ${data.title ?? "-"}\nMarka/Model: ${data.brand ?? "-"} ${data.model ?? ""}\nAdaylar (JSON):\n${JSON.stringify(list)}`;
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
            tools: [{
              type: "function",
              function: {
                name: "score_images",
                parameters: {
                  type: "object",
                  properties: { scores: { type: "array", items: { type: "object", properties: { i: { type: "number" }, relevance: { type: "number" } }, required: ["i", "relevance"] } } },
                  required: ["scores"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "score_images" } },
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (r.ok) {
          const j = await r.json();
          const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          if (args) {
            const parsed = JSON.parse(args);
            const map = new Map<number, number>();
            for (const s of parsed.scores ?? []) map.set(Number(s.i), Math.max(0, Math.min(1, Number(s.relevance) || 0)));
            images = images.map((im, i) => ({ ...im, relevance: map.get(i) ?? im.relevance }));
          }
        }
      } catch (e) {
        console.warn("[img-search] AI scoring failed", e);
      }
    }

    images.sort((a, b) => b.relevance - a.relevance);
    images = images.slice(0, 10);

    const result: OemVisualSearchResult = {
      images,
      cached: false,
      query: successQuery,
      tried_queries: tried,
    };

    // 4) Cache — boş sonuçlar 10 gün, dolu sonuçlar 30 gün TTL
    try {
      const ttlSeconds = images.length > 0 ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 10;
      await supabase.rpc("save_oem_research", {
        _key: cacheKey,
        _query: successQuery,
        _result: JSON.parse(JSON.stringify({ ...result, cached_at: new Date().toISOString() })),
        _ttl_seconds: ttlSeconds,
      });
    } catch (e) {
      console.warn("[img-search] cache write failed", e);
    }

    // 4b) Başarılı Firecrawl sonuçlarını OEM havuzuna aday olarak kaydet (admin onayı bekler).
    if (data.oem && images.length > 0) {
      try {
        const candidates = images.filter((im) => im.relevance >= 0.5).slice(0, 8).map((im) => ({
          oem: data.oem!,
          brand: data.brand ?? null,
          image_url: im.url,
          source_type: "firecrawl" as const,
          source_name: im.source_domain || null,
          source_query: successQuery,
          confidence: Math.round(im.relevance * 100),
          quality_score: Math.round(im.relevance * 100),
          verified: false,
          uploaded_by: userId,
        }));
        if (candidates.length > 0) {
          await supabase.from("oem_image_library").upsert(candidates, { onConflict: "oem_normalized,image_url", ignoreDuplicates: true });
        }
      } catch (e) {
        console.warn("[img-search] library write failed", e);
      }
    }

    // 4c) Başarısız aramaları kaydet (retry stratejisi için)
    if (data.oem && images.length === 0) {
      try {
        await supabase.from("oem_failed_searches").insert({
          oem: data.oem,
          brand: data.brand ?? null,
          title: data.title ?? null,
          reason: apiError?.kind ?? "no_results",
          tried_queries: tried,
        });
      } catch (e) {
        console.warn("[img-search] failed-search log failed", e);
      }
    }




    // 5) Audit
    try {
      await supabase.from("admin_audit_log").insert({
        actor_id: userId,
        action: "oem_image_search",
        metadata: { oem: data.oem ?? null, query: successQuery, tried: tried.length, image_count: images.length, top_relevance: images[0]?.relevance ?? null },
      });
    } catch { /* non-fatal */ }

    return result;
  });

// ----- Seçilen görseli ürünün ana resmi olarak kaydet -----

const setMainSchema = z.object({
  partId: z.string().uuid(),
  imageUrl: z.string().url().max(2000),
});

export const setPartMainPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setMainSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; url: string }> => {
    const { supabase, userId } = context;

    // Sahip doğrulaması (RLS bypass ile olası karışıklığı önlemek için açıkça)
    const { data: part, error: pErr } = await supabase
      .from("parts")
      .select("id, seller_id, photos")
      .eq("id", data.partId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!part) throw new Error("İlan bulunamadı.");
    if (part.seller_id !== userId) throw new Error("Bu ilana erişim izniniz yok.");

    // Görseli indir
    let buf: ArrayBuffer;
    let contentType = "image/jpeg";
    try {
      const r = await fetch(data.imageUrl, {
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": "Mozilla/5.0 TasitsanBot/1.0", Accept: "image/*" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get("content-type") ?? "";
      if (ct.startsWith("image/")) contentType = ct.split(";")[0].trim();
      buf = await r.arrayBuffer();
      if (buf.byteLength < 1024) throw new Error("Görsel çok küçük.");
      if (buf.byteLength > 8 * 1024 * 1024) throw new Error("Görsel çok büyük (max 8MB).");
    } catch (e) {
      throw new Error(`Görsel indirilemedi: ${e instanceof Error ? e.message : String(e)}`);
    }

    const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
    const ext = extMap[contentType] ?? "jpg";
    const path = `${userId}/${data.partId}/web-${Date.now()}.${ext}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from("part-photos").upload(path, new Uint8Array(buf), {
      contentType,
      upsert: false,
    });
    if (upErr) throw new Error(`Yükleme başarısız: ${upErr.message}`);

    const { data: pub } = supabaseAdmin.storage.from("part-photos").getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const existing = Array.isArray(part.photos) ? part.photos.filter((p): p is string => typeof p === "string") : [];
    const next = [publicUrl, ...existing.filter((p) => p !== publicUrl)].slice(0, 10);

    const { error: updErr } = await supabaseAdmin.from("parts").update({ photos: next }).eq("id", data.partId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, url: publicUrl };
  });
