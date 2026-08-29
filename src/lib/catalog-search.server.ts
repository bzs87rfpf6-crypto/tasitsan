/**
 * OEM Kataloğu — parça adı ile arama (sunucu tarafı ortak servis).
 * Hem `catalogSearchByName` hem de katalog → OnlineParça köprüsü bunu kullanır.
 */
import { buildSearchTokens, normalizeCatalogOem } from "@/lib/catalog-match";
import type { CatalogRow, CatalogSearchResponse } from "@/lib/oem-catalog.functions";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    }),
  );
}

// Katalog sonucu deterministik → 30 dk süreç-içi önbellek + inflight birleştirme.
const CATALOG_TTL_MS = 30 * 60 * 1000;
const catalogCache = new Map<string, { value: CatalogSearchResponse; expires: number }>();
const catalogInflight = new Map<string, Promise<CatalogSearchResponse>>();

export async function searchCatalogByNameServer(
  query: string,
  limit = 30,
  minScore = 0.2,
): Promise<CatalogSearchResponse> {
  const key = `${limit}|${minScore}|${query.trim().toLowerCase().replace(/\s+/g, " ")}`;
  const hit = catalogCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const pending = catalogInflight.get(key);
  if (pending) return pending;

  const p = runCatalogSearch(query, limit, minScore)
    .then((value) => {
      if (catalogCache.size >= 300) {
        const first = catalogCache.keys().next().value;
        if (first) catalogCache.delete(first);
      }
      catalogCache.set(key, { value, expires: Date.now() + CATALOG_TTL_MS });
      return value;
    })
    .finally(() => catalogInflight.delete(key));
  catalogInflight.set(key, p);
  return p;
}

async function runCatalogSearch(
  query: string,
  limit: number,
  minScore: number,
): Promise<CatalogSearchResponse> {
  const db = await publicClient();
  const tokens = buildSearchTokens(query);
  const { data: rows, error } = await db.rpc("catalog_search" as never, {
    _q: query,
    _tokens: tokens,
    _limit: limit,
  } as never);
  if (error) throw new Error(error.message);

  const raw = ((rows ?? []) as unknown as CatalogRow[]).filter((r) => Number(r.score ?? 0) >= minScore);

  const { rerankCatalogMatches, CATALOG_PRIMARY_MIN } = await import("@/lib/catalog-rerank");
  const { primary, secondary } = rerankCatalogMatches(query, raw);

  const matches = primary.map((p) => ({ ...p.row, score: Number(p.finalScore.toFixed(2)) }));
  const weakMatches = secondary.map((p) => ({ ...p.row, score: Number(p.finalScore.toFixed(2)) }));

  // OEM zinciri YALNIZCA yüksek güvenli (terfi etmemiş, eşiği geçen) ana eşleşmelerden beslenir.
  const confident = primary.filter((p) => !p.promoted && p.finalScore >= CATALOG_PRIMARY_MIN);

  // Önce ana OEM'ler (kayıt sırası), sonra alternatifler — alternatifler ana OEM'leri kaydırmaz.
  const oems: string[] = [];
  const seen = new Set<string>();
  const push = (code: string | null | undefined) => {
    if (!code) return;
    const n = normalizeCatalogOem(code);
    if (n.length < 4 || seen.has(n)) return;
    seen.add(n);
    oems.push(code);
  };
  for (const p of confident) push(p.row.oem_no);
  for (const p of confident) for (const alt of (p.row.alternative_oems ?? []).slice(0, 3)) push(alt);

  return { query, matches, weakMatches, oems };
}
