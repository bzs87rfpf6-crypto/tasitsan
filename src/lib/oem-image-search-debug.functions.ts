import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin debug aracı: Tek bir sorguyu birden fazla görsel/web arama sağlayıcısına
 * gönderir ve her birinin ham yanıtını, HTTP durumunu, sonuç sayısını ve
 * varsa hata mesajını döndürür. Amaç: 0-sonuç probleminin sorguda mı, API
 * anahtarında mı, rate limit'te mi, yoksa provider yapılandırmasında mı
 * olduğunu net olarak ortaya koymak.
 */

const inputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  providers: z.array(z.enum(["firecrawl", "google_cse", "bing_image", "serpapi", "brave", "google_web", "bing_web"])).optional(),
});

export type ProviderId =
  | "firecrawl"
  | "google_cse"
  | "bing_image"
  | "serpapi"
  | "brave"
  | "google_web"
  | "bing_web";

export interface ProviderDebugResult {
  provider: ProviderId;
  providerLabel: string;
  configured: boolean;
  missingEnv?: string[];
  query: string;
  url?: string;
  httpStatus?: number;
  ok?: boolean;
  durationMs?: number;
  resultsCount: number;
  imageUrls: string[];
  error?: string;
  errorKind?: "auth" | "rate_limit" | "timeout" | "network" | "server" | "parse" | "not_configured" | "unknown";
  rawBodyPreview?: string;
}

const LABELS: Record<ProviderId, string> = {
  firecrawl: "Firecrawl Search",
  google_cse: "Google Custom Search (Images)",
  bing_image: "Bing Image Search",
  serpapi: "SerpAPI (Google Images)",
  brave: "Brave Image Search",
  google_web: "Google Custom Search (Web)",
  bing_web: "Bing Web Search",
};

const IMG_RE = /https?:\/\/[^\s"'<>)]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>)]*)?/gi;

function preview(s: string, n = 500): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function classifyStatus(status: number): ProviderDebugResult["errorKind"] | undefined {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (status >= 400) return "unknown";
  return undefined;
}

async function timedFetch(url: string, init: RequestInit, timeoutMs = 15000): Promise<{ res?: Response; body: string; durationMs: number; error?: { kind: ProviderDebugResult["errorKind"]; message: string } }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.text();
    return { res, body, durationMs: Date.now() - t0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const kind: ProviderDebugResult["errorKind"] = /abort|timeout/i.test(msg) ? "timeout" : "network";
    return { body: "", durationMs: Date.now() - t0, error: { kind, message: msg } };
  }
}

// ---------- Providers ----------

async function runFirecrawl(query: string): Promise<ProviderDebugResult> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    return {
      provider: "firecrawl", providerLabel: LABELS.firecrawl, configured: false,
      missingEnv: ["FIRECRAWL_API_KEY"], query, resultsCount: 0, imageUrls: [],
      error: "FIRECRAWL_API_KEY environment değişkeni tanımlı değil.", errorKind: "not_configured",
    };
  }
  const url = "https://api.firecrawl.dev/v2/search";
  const { res, body, durationMs, error } = await timedFetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 8, scrapeOptions: { formats: ["html", "links"], onlyMainContent: false } }),
  });
  if (error || !res) {
    return { provider: "firecrawl", providerLabel: LABELS.firecrawl, configured: true, query, url, durationMs, resultsCount: 0, imageUrls: [], error: error?.message ?? "Bilinmeyen ağ hatası", errorKind: error?.kind ?? "network" };
  }
  const imageUrls: string[] = [];
  let resultsCount = 0;
  try {
    const json = JSON.parse(body);
    const results: Array<{ url?: string; html?: string; metadata?: { ogImage?: string } }> = json?.data?.web ?? json?.data ?? [];
    resultsCount = results.length;
    for (const r of results) {
      if (r.metadata?.ogImage) imageUrls.push(r.metadata.ogImage);
      const m = (r.html ?? "").match(IMG_RE) ?? [];
      for (const u of m.slice(0, 5)) imageUrls.push(u);
    }
  } catch (e) {
    return { provider: "firecrawl", providerLabel: LABELS.firecrawl, configured: true, query, url, httpStatus: res.status, ok: res.ok, durationMs, resultsCount: 0, imageUrls: [], rawBodyPreview: preview(body), error: `JSON parse hatası: ${e instanceof Error ? e.message : String(e)}`, errorKind: "parse" };
  }
  return {
    provider: "firecrawl", providerLabel: LABELS.firecrawl, configured: true, query, url,
    httpStatus: res.status, ok: res.ok, durationMs, resultsCount,
    imageUrls: Array.from(new Set(imageUrls)).slice(0, 20),
    rawBodyPreview: preview(body),
    errorKind: res.ok ? undefined : classifyStatus(res.status),
    error: res.ok ? undefined : `HTTP ${res.status}`,
  };
}

async function runGoogleCse(query: string, searchType: "image" | "web"): Promise<ProviderDebugResult> {
  const provider: ProviderId = searchType === "image" ? "google_cse" : "google_web";
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  const missing: string[] = [];
  if (!key) missing.push("GOOGLE_CSE_API_KEY");
  if (!cx) missing.push("GOOGLE_CSE_CX");
  if (missing.length) {
    return { provider, providerLabel: LABELS[provider], configured: false, missingEnv: missing, query, resultsCount: 0, imageUrls: [], error: `Eksik env: ${missing.join(", ")}`, errorKind: "not_configured" };
  }
  const params = new URLSearchParams({ key: key!, cx: cx!, q: query, num: "10" });
  if (searchType === "image") params.set("searchType", "image");
  const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
  const { res, body, durationMs, error } = await timedFetch(url, { method: "GET" });
  if (error || !res) {
    return { provider, providerLabel: LABELS[provider], configured: true, query, url, durationMs, resultsCount: 0, imageUrls: [], error: error?.message ?? "Ağ hatası", errorKind: error?.kind ?? "network" };
  }
  let imageUrls: string[] = [];
  let resultsCount = 0;
  try {
    const json = JSON.parse(body);
    const items: Array<{ link?: string; image?: { thumbnailLink?: string }; pagemap?: { cse_image?: Array<{ src?: string }> } }> = json?.items ?? [];
    resultsCount = items.length;
    if (searchType === "image") {
      imageUrls = items.map((it) => it.link).filter((u): u is string => !!u);
    } else {
      for (const it of items) {
        const src = it.pagemap?.cse_image?.[0]?.src;
        if (src) imageUrls.push(src);
      }
    }
  } catch (e) {
    return { provider, providerLabel: LABELS[provider], configured: true, query, url, httpStatus: res.status, ok: res.ok, durationMs, resultsCount: 0, imageUrls: [], rawBodyPreview: preview(body), error: `JSON parse: ${e instanceof Error ? e.message : String(e)}`, errorKind: "parse" };
  }
  return {
    provider, providerLabel: LABELS[provider], configured: true, query, url,
    httpStatus: res.status, ok: res.ok, durationMs, resultsCount, imageUrls,
    rawBodyPreview: preview(body),
    errorKind: res.ok ? undefined : classifyStatus(res.status),
    error: res.ok ? undefined : `HTTP ${res.status}`,
  };
}

async function runBing(query: string, kind: "image" | "web"): Promise<ProviderDebugResult> {
  const provider: ProviderId = kind === "image" ? "bing_image" : "bing_web";
  const key = process.env.BING_SEARCH_API_KEY;
  if (!key) {
    return { provider, providerLabel: LABELS[provider], configured: false, missingEnv: ["BING_SEARCH_API_KEY"], query, resultsCount: 0, imageUrls: [], error: "BING_SEARCH_API_KEY tanımlı değil.", errorKind: "not_configured" };
  }
  const url = kind === "image"
    ? `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(query)}&count=20`
    : `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=20`;
  const { res, body, durationMs, error } = await timedFetch(url, { method: "GET", headers: { "Ocp-Apim-Subscription-Key": key } });
  if (error || !res) {
    return { provider, providerLabel: LABELS[provider], configured: true, query, url, durationMs, resultsCount: 0, imageUrls: [], error: error?.message ?? "Ağ hatası", errorKind: error?.kind ?? "network" };
  }
  let imageUrls: string[] = [];
  let resultsCount = 0;
  try {
    const json = JSON.parse(body);
    if (kind === "image") {
      const items: Array<{ contentUrl?: string; thumbnailUrl?: string }> = json?.value ?? [];
      resultsCount = items.length;
      imageUrls = items.map((it) => it.contentUrl ?? it.thumbnailUrl).filter((u): u is string => !!u);
    } else {
      const pages: Array<{ url?: string }> = json?.webPages?.value ?? [];
      resultsCount = pages.length;
      const txt = JSON.stringify(json);
      imageUrls = Array.from(new Set(txt.match(IMG_RE) ?? [])).slice(0, 20);
    }
  } catch (e) {
    return { provider, providerLabel: LABELS[provider], configured: true, query, url, httpStatus: res.status, ok: res.ok, durationMs, resultsCount: 0, imageUrls: [], rawBodyPreview: preview(body), error: `JSON parse: ${e instanceof Error ? e.message : String(e)}`, errorKind: "parse" };
  }
  return {
    provider, providerLabel: LABELS[provider], configured: true, query, url,
    httpStatus: res.status, ok: res.ok, durationMs, resultsCount, imageUrls,
    rawBodyPreview: preview(body),
    errorKind: res.ok ? undefined : classifyStatus(res.status),
    error: res.ok ? undefined : `HTTP ${res.status}`,
  };
}

async function runSerpApi(query: string): Promise<ProviderDebugResult> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    return { provider: "serpapi", providerLabel: LABELS.serpapi, configured: false, missingEnv: ["SERPAPI_API_KEY"], query, resultsCount: 0, imageUrls: [], error: "SERPAPI_API_KEY tanımlı değil.", errorKind: "not_configured" };
  }
  const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(key)}`;
  const safeUrl = url.replace(encodeURIComponent(key), "***");
  const { res, body, durationMs, error } = await timedFetch(url, { method: "GET" });
  if (error || !res) {
    return { provider: "serpapi", providerLabel: LABELS.serpapi, configured: true, query, url: safeUrl, durationMs, resultsCount: 0, imageUrls: [], error: error?.message ?? "Ağ hatası", errorKind: error?.kind ?? "network" };
  }
  let imageUrls: string[] = [];
  let resultsCount = 0;
  try {
    const json = JSON.parse(body);
    const items: Array<{ original?: string; thumbnail?: string }> = json?.images_results ?? [];
    resultsCount = items.length;
    imageUrls = items.map((it) => it.original ?? it.thumbnail).filter((u): u is string => !!u);
  } catch (e) {
    return { provider: "serpapi", providerLabel: LABELS.serpapi, configured: true, query, url: safeUrl, httpStatus: res.status, ok: res.ok, durationMs, resultsCount: 0, imageUrls: [], rawBodyPreview: preview(body), error: `JSON parse: ${e instanceof Error ? e.message : String(e)}`, errorKind: "parse" };
  }
  return {
    provider: "serpapi", providerLabel: LABELS.serpapi, configured: true, query, url: safeUrl,
    httpStatus: res.status, ok: res.ok, durationMs, resultsCount, imageUrls,
    rawBodyPreview: preview(body),
    errorKind: res.ok ? undefined : classifyStatus(res.status),
    error: res.ok ? undefined : `HTTP ${res.status}`,
  };
}

async function runBrave(query: string): Promise<ProviderDebugResult> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    return { provider: "brave", providerLabel: LABELS.brave, configured: false, missingEnv: ["BRAVE_SEARCH_API_KEY"], query, resultsCount: 0, imageUrls: [], error: "BRAVE_SEARCH_API_KEY tanımlı değil.", errorKind: "not_configured" };
  }
  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=20`;
  const { res, body, durationMs, error } = await timedFetch(url, { method: "GET", headers: { "X-Subscription-Token": key, Accept: "application/json" } });
  if (error || !res) {
    return { provider: "brave", providerLabel: LABELS.brave, configured: true, query, url, durationMs, resultsCount: 0, imageUrls: [], error: error?.message ?? "Ağ hatası", errorKind: error?.kind ?? "network" };
  }
  let imageUrls: string[] = [];
  let resultsCount = 0;
  try {
    const json = JSON.parse(body);
    const items: Array<{ properties?: { url?: string }; thumbnail?: { src?: string } }> = json?.results ?? [];
    resultsCount = items.length;
    imageUrls = items.map((it) => it.properties?.url ?? it.thumbnail?.src).filter((u): u is string => !!u);
  } catch (e) {
    return { provider: "brave", providerLabel: LABELS.brave, configured: true, query, url, httpStatus: res.status, ok: res.ok, durationMs, resultsCount: 0, imageUrls: [], rawBodyPreview: preview(body), error: `JSON parse: ${e instanceof Error ? e.message : String(e)}`, errorKind: "parse" };
  }
  return {
    provider: "brave", providerLabel: LABELS.brave, configured: true, query, url,
    httpStatus: res.status, ok: res.ok, durationMs, resultsCount, imageUrls,
    rawBodyPreview: preview(body),
    errorKind: res.ok ? undefined : classifyStatus(res.status),
    error: res.ok ? undefined : `HTTP ${res.status}`,
  };
}

export interface ImageSearchDebugResult {
  query: string;
  ranAt: string;
  results: ProviderDebugResult[];
}

export const debugOemImageSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }): Promise<ImageSearchDebugResult> => {
    // Admin yetkisi şart
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const requested = data.providers ?? ["firecrawl", "google_cse", "bing_image", "serpapi", "brave", "google_web", "bing_web"];
    const runners: Record<ProviderId, () => Promise<ProviderDebugResult>> = {
      firecrawl: () => runFirecrawl(data.query),
      google_cse: () => runGoogleCse(data.query, "image"),
      google_web: () => runGoogleCse(data.query, "web"),
      bing_image: () => runBing(data.query, "image"),
      bing_web: () => runBing(data.query, "web"),
      serpapi: () => runSerpApi(data.query),
      brave: () => runBrave(data.query),
    };

    const results = await Promise.all(requested.map((p) => runners[p]().catch((e): ProviderDebugResult => ({
      provider: p, providerLabel: LABELS[p], configured: true, query: data.query,
      resultsCount: 0, imageUrls: [],
      error: e instanceof Error ? e.message : String(e), errorKind: "unknown",
    }))));

    // Konsola özet logla
    for (const r of results) {
      console.log("[img-debug]", {
        provider: r.provider,
        query: r.query,
        httpStatus: r.httpStatus,
        configured: r.configured,
        resultsCount: r.resultsCount,
        error: r.error ?? null,
        bodyPreview: r.rawBodyPreview ? r.rawBodyPreview.slice(0, 200) : undefined,
      });
    }

    return { query: data.query, ranAt: new Date().toISOString(), results };
  });
