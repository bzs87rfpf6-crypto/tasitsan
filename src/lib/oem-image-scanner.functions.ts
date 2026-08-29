import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// OEM Görsel Toplu Tarayıcı — admin paneli için.

// ====== STATS ======

export const getScannerStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("oem_scanner_stats");
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, number>;
  });

// ====== ENQUEUE ======

const enqueueSchema = z.object({
  scope: z.enum(["all", "no_images", "brand", "oem"]),
  brand: z.string().trim().max(80).optional(),
  oem: z.string().trim().max(60).optional(),
  limit: z.number().int().min(1).max(20000).optional(),
});

export const enqueueBulkScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => enqueueSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.scope === "brand" && !data.brand) throw new Error("Marka gerekli.");
    if (data.scope === "oem" && !data.oem) throw new Error("OEM gerekli.");
    const { data: inserted, error } = await supabase.rpc("enqueue_oem_scan", {
      _scope: data.scope,
      _brand: data.brand ?? undefined,
      _oem: data.oem ?? undefined,
      _limit: data.limit ?? 5000,
    });
    if (error) throw new Error(error.message);
    return { enqueued: (inserted as number) ?? 0 };
  });

// ====== CLEAR QUEUE ======

const clearSchema = z.object({
  status: z.enum(["pending", "error", "done", "all"]).default("pending"),
});

export const clearScanQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clearSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("oem_scan_queue").delete();
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { deleted: rows?.length ?? 0 };
  });

// ====== RECENT FAILED SEARCHES ======

export const recentFailedSearches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("oem_failed_searches")
      .select("id,oem,brand,title,reason,tried_queries,attempt_count,last_attempt_at")
      .order("last_attempt_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ====== RECENT SCAN JOBS (DEBUG) ======

export const recentScanJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("recent_oem_scan_jobs", { _limit: 25 });
    if (error) throw new Error(error.message);
    type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];
    return (data ?? []) as Array<{
      id: string;
      oem: string;
      brand: string | null;
      title: string | null;
      status: string;
      result_count: number | null;
      found_urls: number | null;
      last_error: string | null;
      debug_log: JsonValue;
      scheduled_at: string;
      completed_at: string | null;
    }>;
  });

// ====== HELPERS ======

const EXT_IMG_RE = /https?:\/\/[^\s"'<>)]+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s"'<>)]*)?/gi;
const SRC_ATTR_RE = /<img[^>]+(?:data-src|data-original|src)\s*=\s*["']([^"']+)["']/gi;
const SRCSET_RE = /<img[^>]+srcset\s*=\s*["']([^"']+)["']/gi;
const BAD_HOSTS = ["gstatic.com", "googleusercontent.com/proxy", "doubleclick", "googlesyndication", "google.com/images/branding"];
const BAD_URL_HINTS = ["logo", "favicon", "sprite", "placeholder", "watermark", "no-image", "noimage", "/avatar"];
const TARGETED_DOMAINS = ["partsouq.com", "amayama.com", "7zap.com", "megazip.net", "oemotoyedekparca.com", "otoparcaburada.com", "parts.cat", "nissan-parts.com", "toyodiy.com"];

function isBadUrl(u: string): boolean {
  const low = u.toLowerCase();
  if (BAD_HOSTS.some((b) => low.includes(b))) return true;
  if (BAD_URL_HINTS.some((h) => low.includes(h))) return true;
  return false;
}
function absolutize(maybe: string, base: string): string {
  try {
    if (maybe.startsWith("//")) return "https:" + maybe;
    if (maybe.startsWith("http")) return maybe;
    if (!base) return maybe;
    return new URL(maybe, base).toString();
  } catch { return maybe; }
}
function extractDomain(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function extractImageUrls(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const m of html.match(EXT_IMG_RE) ?? []) out.add(m);
  let mm: RegExpExecArray | null;
  SRC_ATTR_RE.lastIndex = 0;
  while ((mm = SRC_ATTR_RE.exec(html))) out.add(absolutize(mm[1], baseUrl));
  SRCSET_RE.lastIndex = 0;
  while ((mm = SRCSET_RE.exec(html))) {
    for (const part of mm[1].split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url) out.add(absolutize(url, baseUrl));
    }
  }
  return Array.from(out).filter((u) => /^https?:\/\//i.test(u) && !isBadUrl(u));
}
function oemVariants(oem: string): string[] {
  const v = new Set<string>();
  const t = oem.trim(); if (!t) return [];
  v.add(t.toUpperCase());
  v.add(t.replace(/[\s\-./_]+/g, "").toUpperCase());
  return Array.from(v).filter(Boolean);
}
function buildQueries(oem: string, brand: string | null, title: string | null): string[] {
  const q: string[] = [];
  const push = (s: string) => { const t = s.replace(/\s+/g, " ").trim(); if (t && !q.includes(t)) q.push(t); };
  const oems = oemVariants(oem);
  const primary = oems[0] ?? "";
  if (brand && primary) {
    for (const o of oems.slice(0, 2)) push(`${brand} ${o}`);
    for (const o of oems.slice(0, 2)) push(`${o} ${brand}`);
  }
  if (primary) push(`OEM ${primary}`);
  for (const o of oems) push(o);
  if (primary) for (const d of TARGETED_DOMAINS) push(`${primary} site:${d}`);
  if (primary && title) push(`${primary} ${title}`);
  if (brand && primary) push(`${brand} ${primary} yedek parça`);
  if (brand && primary) push(`${brand} ${primary} image`);
  return q.slice(0, 14);
}

type SearchHit = { url: string; source_url: string; source_domain: string };

async function firecrawlSearch(query: string, apiKey: string): Promise<{ hits: SearchHit[]; pages: number; status: number; error?: string }> {
  const out: SearchHit[] = [];
  let pages = 0;
  let res: Response;
  try {
    res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 6, scrapeOptions: { formats: ["html", "links"], onlyMainContent: false } }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return { hits: out, pages, status: 0, error: e instanceof Error ? e.message : "network_error" };
  }
  if (!res.ok) {
    let bodyMsg = "";
    try { bodyMsg = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    return { hits: out, pages, status: res.status, error: `HTTP ${res.status} ${bodyMsg}` };
  }
  try {
    const json = await res.json() as {
      data?: { web?: unknown[] } | unknown[];
      web?: unknown[];
    };
    const dataObj = json?.data;
    const results = (
      (dataObj && typeof dataObj === "object" && !Array.isArray(dataObj) && Array.isArray((dataObj as { web?: unknown[] }).web)
        ? (dataObj as { web: unknown[] }).web
        : Array.isArray(dataObj) ? dataObj : json?.web ?? [])
    ) as Array<{ url?: string; html?: string; links?: string[]; metadata?: { ogImage?: string; sourceURL?: string } }>;
    pages = results.length;
    for (const r of results) {
      const sourceUrl = r.url ?? r.metadata?.sourceURL ?? "";
      const domain = extractDomain(sourceUrl);
      if (r.metadata?.ogImage && !isBadUrl(r.metadata.ogImage)) {
        out.push({ url: r.metadata.ogImage, source_url: sourceUrl, source_domain: domain });
      }
      const html = r.html ?? "";
      for (const u of extractImageUrls(html, sourceUrl).slice(0, 12)) {
        out.push({ url: u, source_url: sourceUrl, source_domain: domain });
      }
      for (const u of r.links ?? []) {
        if (/\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)/i.test(u) && !isBadUrl(u)) {
          out.push({ url: u, source_url: sourceUrl, source_domain: domain });
        }
      }
    }
  } catch { /* ignore */ }
  return { hits: out, pages, status: res.status };
}

// ====== PROVIDER STATUS ======

export const getProviderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const env = (k: string) => Boolean(process.env[k] && process.env[k]!.length > 0);
    const providers: Array<{ id: string; name: string; configured: boolean; status?: number; ok?: boolean; error?: string }> = [
      { id: "firecrawl", name: "Firecrawl Search", configured: env("FIRECRAWL_API_KEY") },
      { id: "google_images", name: "Google Images (CSE)", configured: env("GOOGLE_CSE_API_KEY") && env("GOOGLE_CSE_ID") },
      { id: "bing_images", name: "Bing Images", configured: env("BING_SEARCH_API_KEY") },
      { id: "serpapi", name: "SerpAPI", configured: env("SERPAPI_KEY") },
      { id: "brave", name: "Brave Search", configured: env("BRAVE_SEARCH_API_KEY") },
    ];

    const fcKey = process.env.FIRECRAWL_API_KEY;
    if (fcKey) {
      const fc = providers.find((p) => p.id === "firecrawl")!;
      try {
        const r = await fetch("https://api.firecrawl.dev/v2/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "ping", limit: 1 }),
          signal: AbortSignal.timeout(8000),
        });
        fc.status = r.status;
        fc.ok = r.ok;
        if (!r.ok) {
          let body = ""; try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
          fc.error = r.status === 402
            ? "Firecrawl hesabınızda kredi bitmiş (HTTP 402). Firecrawl panelinden kredi yükleyin."
            : `HTTP ${r.status} ${body}`;
        }
      } catch (e) {
        fc.ok = false;
        fc.error = e instanceof Error ? e.message : "network_error";
      }
    }

    const activeCount = providers.filter((p) => p.configured && p.ok !== false).length;
    return { providers, activeCount };
  });

// ====== PROCESS QUEUE ======

const processSchema = z.object({
  batchSize: z.number().int().min(1).max(20).default(5),
});

export const processScanQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => processSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) throw new Error("Hiçbir arama sağlayıcısı yapılandırılmamış. En az Firecrawl gerekli.");

    const { data: jobs, error: claimErr } = await supabase.rpc("claim_oem_scan_jobs", { _limit: data.batchSize });
    if (claimErr) throw new Error(claimErr.message);
    const list = (jobs ?? []) as Array<{ id: string; oem: string; brand: string | null; title: string | null }>;

    let processed = 0;
    let found = 0;
    let failed = 0;
    let totalUrls = 0;
    let providerHardFail: string | null = null;

    for (const job of list) {
      const debug: {
        queries: Array<{ q: string; pages: number; hits: number; status: number; error?: string }>;
        candidates: number;
        saved: number;
        from_cache: boolean;
        provider_error?: string;
      } = { queries: [], candidates: 0, saved: 0, from_cache: false };

      try {
        const { data: lib } = await supabase.rpc("lookup_oem_images", { _oem: job.oem, _limit: 1 });
        if (Array.isArray(lib) && lib.length > 0) {
          debug.from_cache = true;
          await supabase.rpc("complete_oem_scan_job", {
            _id: job.id, _status: "skipped", _result_count: (lib as unknown[]).length,
            _error: undefined, _debug: debug as unknown as never, _found_urls: 0,
          });
          processed++;
          continue;
        }

        const queries = buildQueries(job.oem, job.brand, job.title);
        const pool = new Map<string, SearchHit>();
        let successQ = queries[0] ?? job.oem;
        let lastProviderError: string | undefined;

        for (let i = 0; i < queries.length; i++) {
          const q = queries[i];
          const { hits, pages, status, error } = await firecrawlSearch(q, firecrawlKey);
          debug.queries.push({ q, pages, hits: hits.length, status, error });
          if (error) lastProviderError = error;
          if (status === 401 || status === 402 || status === 403) {
            providerHardFail = error ?? `HTTP ${status}`;
            break;
          }
          if (hits.length > 0 && pool.size === 0) successQ = q;
          for (const c of hits) if (!pool.has(c.url)) pool.set(c.url, c);
          if (pool.size >= 8 && i >= 3) break;
          if (pool.size >= 16) break;
        }

        if (providerHardFail) {
          debug.provider_error = providerHardFail;
          await supabase.rpc("complete_oem_scan_job", {
            _id: job.id, _status: "error", _result_count: 0,
            _error: providerHardFail.slice(0, 500), _debug: debug as unknown as never, _found_urls: 0,
          });
          failed++;
          break;
        }

        const candidates = Array.from(pool.values()).slice(0, 12);
        debug.candidates = candidates.length;
        totalUrls += candidates.length;

        if (candidates.length > 0) {
          const rows = candidates.map((c) => ({
            oem: job.oem, brand: job.brand, image_url: c.url,
            source_type: "firecrawl" as const, source_name: c.source_domain || null,
            source_query: successQ, confidence: 60, quality_score: 60,
            verified: false, uploaded_by: userId,
          }));
          const { error: upErr, count } = await supabase
            .from("oem_image_library")
            .upsert(rows, { onConflict: "oem_normalized,image_url", ignoreDuplicates: true, count: "exact" });
          debug.saved = upErr ? 0 : (count ?? rows.length);
          found++;
          await supabase.rpc("complete_oem_scan_job", {
            _id: job.id, _status: "done", _result_count: candidates.length,
            _error: undefined, _debug: debug as unknown as never, _found_urls: candidates.length,
          });
          processed++;
        } else {
          // Sonuç bulunamadı → "done" değil "error" olarak işaretle.
          await supabase.from("oem_failed_searches").insert({
            oem: job.oem, brand: job.brand, title: job.title,
            reason: lastProviderError ? `no_results · ${lastProviderError.slice(0, 100)}` : "no_results",
            tried_queries: queries,
          });
          debug.provider_error = lastProviderError;
          await supabase.rpc("complete_oem_scan_job", {
            _id: job.id, _status: "error", _result_count: 0,
            _error: (lastProviderError ?? "no_results").slice(0, 500),
            _debug: debug as unknown as never, _found_urls: 0,
          });
          failed++;
          processed++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase.rpc("complete_oem_scan_job", {
          _id: job.id, _status: "error", _result_count: 0,
          _error: msg.slice(0, 500), _debug: debug as unknown as never, _found_urls: 0,
        });
        failed++;
      }
    }

    return { processed, found, failed, claimed: list.length, totalUrls, providerHardFail };
  });
