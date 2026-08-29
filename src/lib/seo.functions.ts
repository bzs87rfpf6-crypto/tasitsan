import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// Public-read Data API client. Parts have anon SELECT policies, so we avoid
// supabaseAdmin here — Lovable Cloud can inject `sb_secret_*` keys that break
// PostgREST JWT parsing and cause getPartSeo to 500. When that happens the
// parts head() falls back to noindex,follow, which is exactly the bug that
// took 8k+ product pages out of Google's index.
let _pub: SupabaseClient | null = null;
function pubClient(): SupabaseClient {
  if (_pub) return _pub;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing");
  _pub = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _pub;
}

import { SITE_ORIGIN } from "@/lib/site-url";

// Tek kaynak: src/lib/site-url.ts
export const SITE_URL = SITE_ORIGIN;

export const getPublicSiteSeo = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("ga4_measurement_id,gsc_verification_code")
    .maybeSingle();
  return {
    ga4: (data?.ga4_measurement_id as string | null) ?? null,
    gsc: (data?.gsc_verification_code as string | null) ?? null,
  };
});

// Accepts either a UUID, the current `seo_slug`, or any historical
// slug recorded in `parts_slug_history`. Returns the part row plus its
// canonical `seo_slug`. The caller can compare params.id with this
// value to decide whether to issue a 301 to the canonical URL.
export const getPartSeo = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const raw = data.id.trim();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const TRAIL_UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
    const cols = "id,title,description,brand,model,year,category,oem_code,oem_codes,engine_code,city,price,photos,condition,status,is_sold,stock_quantity,created_at,updated_at,seo_slug";
    const db = pubClient();

    // 1) Direct UUID hit (modern detail loader still passes a UUID when known).
    let partId: string | null = null;
    if (UUID_RE.test(raw)) partId = raw.toLowerCase();
    else {
      const m = TRAIL_UUID.exec(raw);
      if (m) partId = m[1].toLowerCase();
    }
    if (partId) {
      const { data: row, error } = await db.from("parts").select(cols).eq("id", partId).maybeSingle();
      if (error) console.error("[getPartSeo] by id failed", error);
      if (row) return row as PartSeoRow;
    }

    // 2) Current SEO slug.
    {
      const { data: row, error } = await db.from("parts").select(cols).eq("seo_slug", raw).maybeSingle();
      if (error) console.error("[getPartSeo] by slug failed", error);
      if (row) return row as PartSeoRow;
    }

    // 3) Historical slug → part id (oldest 301 chain).
    const { data: hist, error: histErr } = await db
      .from("parts_slug_history")
      .select("part_id")
      .eq("slug", raw)
      .order("replaced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (histErr) console.error("[getPartSeo] history lookup failed", histErr);
    if (hist?.part_id) {
      const { data: row } = await db.from("parts").select(cols).eq("id", hist.part_id).maybeSingle();
      if (row) return row as PartSeoRow;
    }

    // 4) Fuzzy fallback: search cards may build the slug from oem+title when the
    // row's cached seo_slug is stale or missing. Extract the leading OEM-like
    // token(s) from the slug (contiguous digit-bearing dash tokens) and look
    // up an approved part by oem_code / oem_codes. The loader will 301 to the
    // canonical slug on the next hop, so users never see "İlan bulunamadı".
    const segs = raw.split("-").filter(Boolean);
    const oemTokens: string[] = [];
    for (const t of segs) {
      const hasDigit = /\d/.test(t);
      const hasLetter = /[a-z]/i.test(t);
      if (oemTokens.length === 0) {
        if (!hasDigit) break;              // OEM always contains a digit
        oemTokens.push(t);
        continue;
      }
      // Additional OEM chunks: pure-digit or letter+digit blocks (e.g. "yp691").
      if (hasDigit && (hasLetter || /^\d+$/.test(t))) oemTokens.push(t);
      else break;
    }
    if (oemTokens.length >= 1) {
      const rawFp = raw.replace(/-/g, "");
      const pickBest = (rows: PartSeoRow[]): PartSeoRow | null => {
        let best: PartSeoRow | null = null;
        let bestScore = -1;
        for (const h of rows) {
          const cand = (h.seo_slug ?? "").replace(/-/g, "");
          let score = 0;
          const min = Math.min(cand.length, rawFp.length);
          for (let i = 0; i < min; i++) { if (cand[i] === rawFp[i]) score++; else break; }
          if (score > bestScore) { bestScore = score; best = h; }
        }
        return best;
      };
      // Try progressively shorter guesses (longest OEM first).
      for (let n = oemTokens.length; n >= 1; n--) {
        const guess = oemTokens.slice(0, n).join("-");
        if (guess.length < 4) continue;
        const compact = guess.replace(/-/g, "");
        const collected: PartSeoRow[] = [];
        // Query oem_code with ilike variants (safe inside or=).
        const orExpr = `oem_code.ilike.${guess},oem_code.ilike.${compact}`;
        const { data: h1, error: e1 } = await db
          .from("parts").select(cols).eq("status", "approved").or(orExpr).limit(20);
        if (e1) console.error("[getPartSeo] fuzzy oem_code lookup failed", e1);
        if (h1) collected.push(...(h1 as PartSeoRow[]));
        // Separate calls for the oem_codes array — `.cs.{...}` cannot be nested
        // inside PostgREST or=() without breaking its comma splitter.
        for (const val of [guess.toUpperCase(), compact.toUpperCase()]) {
          const { data: h2, error: e2 } = await db
            .from("parts").select(cols).eq("status", "approved").contains("oem_codes", [val]).limit(20);
          if (e2) { console.error("[getPartSeo] fuzzy oem_codes lookup failed", e2); continue; }
          if (h2) collected.push(...(h2 as PartSeoRow[]));
        }
        if (collected.length === 0) continue;
        const seen = new Set<string>();
        const uniq: PartSeoRow[] = [];
        for (const r of collected) { if (!seen.has(r.id)) { seen.add(r.id); uniq.push(r); } }
        const best = pickBest(uniq);
        if (best) return best;
      }
    }
    return null;
  });

type PartSeoRow = {
  id: string; title: string; description: string | null;
  brand: string | null; model: string | null; year: number | null; category: string | null;
  oem_code: string | null; oem_codes: string[] | null; engine_code: string | null;
  city: string | null; price: number | null;
  photos: string[] | null; condition: string; status: string;
  stock_quantity: number | null; created_at: string; updated_at: string;
  seo_slug: string | null;
};

// Page size for product sitemap chunking. Google allows up to 50k URLs per
// sitemap file; we use 5000 to keep each file small and quick to fetch.
export const PRODUCTS_SITEMAP_PAGE_SIZE = 5000;
// PostgREST caps per-request rows (default 1000) regardless of .limit(),
// so we paginate with .range() to fetch every approved product.
const DB_PAGE = 1000;

async function fetchAllParts() {
  const rows: { id: string; title: string; updated_at: string; oem_code: string | null; oem_codes: string[] | null; seo_slug: string | null }[] = [];
  for (let from = 0; ; from += DB_PAGE) {
    const { data, error } = await supabaseAdmin
      .from("parts")
      .select("id,title,updated_at,oem_code,oem_codes,seo_slug")
      .eq("status", "approved")
      // Stok 0 olsa bile approved + seo_slug varsa dizinlenebilir kalır.
      .not("seo_slug", "is", null)
      .order("updated_at", { ascending: false })
      .range(from, from + DB_PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < DB_PAGE) break;
  }
  return rows;
}


export const getSitemapPartsCount = createServerFn({ method: "GET" }).handler(async () => {
  const { count, error } = await supabaseAdmin
    .from("parts")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    // Stok 0 olsa bile approved + seo_slug varsa sayaç dahil.
    .not("seo_slug", "is", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
});

export const getSitemapPartsPage = createServerFn({ method: "GET" })
  .inputValidator((d: { page: number }) =>
    z.object({ page: z.number().int().min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const from = (data.page - 1) * PRODUCTS_SITEMAP_PAGE_SIZE;
    const target = from + PRODUCTS_SITEMAP_PAGE_SIZE;
    const rows: { id: string; title: string; updated_at: string; oem_code: string | null; oem_codes: string[] | null; seo_slug: string | null }[] = [];
    for (let cursor = from; cursor < target; cursor += DB_PAGE) {
      const end = Math.min(cursor + DB_PAGE, target) - 1;
      const { data: chunk, error } = await supabaseAdmin
        .from("parts")
        .select("id,title,updated_at,oem_code,oem_codes,seo_slug")
        .eq("status", "approved")
        // Stok 0 olsa bile approved + seo_slug varsa dahil et.
        .not("seo_slug", "is", null)
        .order("updated_at", { ascending: false })
        .range(cursor, end);
      if (error) throw new Error(error.message);
      if (!chunk || chunk.length === 0) break;
      rows.push(...(chunk as typeof rows));
      if (chunk.length < end - cursor + 1) break;
    }
    return rows;
  });

// Kept for backward compatibility — returns ALL approved parts via pagination.
export const getSitemapParts = createServerFn({ method: "GET" }).handler(async () => {
  return await fetchAllParts();
});

export const getSitemapRequests = createServerFn({ method: "GET" }).handler(async () => {
  const rows: { id: string; updated_at: string }[] = [];
  for (let from = 0; ; from += DB_PAGE) {
    const { data, error } = await supabaseAdmin
      .from("part_requests")
      .select("id,updated_at")
      .in("status", ["new", "in_progress"])
      .order("updated_at", { ascending: false })
      .range(from, from + DB_PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < DB_PAGE) break;
  }
  return rows;
});


