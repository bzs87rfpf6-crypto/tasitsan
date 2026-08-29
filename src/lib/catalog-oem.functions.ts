/**
 * KATALOG → ONLINEPARÇA KÖPRÜSÜ
 *
 * Kullanıcı parça adı yazar ("corolla yağ filtresi"), sistem OEM Kataloğu'ndan
 * OEM numarasını bulur ve MEVCUT OnlineParça pipeline'ına gerçek bir OEM
 * araması olarak gönderir. Pipeline yeniden yazılmaz.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ExternalOemPublicResult } from "@/lib/external-oem.server";

export interface CatalogExternalItem {
  /** Katalogdan bulunan OEM (arama bu OEM ile yapıldı). */
  oem: string;
  /** Katalogdaki eşleşen parça adı. */
  catalog_part_name: string;
  result: ExternalOemPublicResult;
}

export interface CatalogExternalResponse {
  query: string;
  /** Katalogdan üretilen ve OnlineParça'da aratılan OEM'ler. */
  searched_oems: string[];
  items: CatalogExternalItem[];
  error: string | null;
}

const MAX_OEMS = 3;

export const catalogOemExternalSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ query: z.string().trim().min(3).max(200) }).parse(d))
  .handler(async ({ data }): Promise<CatalogExternalResponse> => {
    const empty: CatalogExternalResponse = { query: data.query, searched_oems: [], items: [], error: null };
    try {
      const { searchCatalogByNameServer } = await import("@/lib/catalog-search.server");
      const catalog = await searchCatalogByNameServer(data.query, 20, 0.2);
      if (catalog.oems.length === 0) return empty;

      const nameByOem = new Map<string, string>();
      for (const m of catalog.matches) {
        for (const code of [m.oem_no, ...(m.alternative_oems ?? [])]) {
          if (code && !nameByOem.has(code)) nameByOem.set(code, m.part_name);
        }
      }

      // Aynı OEM iki kez sorgulanmaz.
      const uniq: string[] = [];
      const seenOem = new Set<string>();
      for (const o of catalog.oems) {
        const k = o.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!k || seenOem.has(k)) continue;
        seenOem.add(k);
        uniq.push(o);
        if (uniq.length >= MAX_OEMS) break;
      }
      const oems = uniq;

      const { lookupExternalOemServer } = await import("@/lib/external-oem.server");
      const { cachedOemLookup } = await import("@/lib/oem-lookup-cache.server");

      // Bağımsız OEM sorguları paralel; sonuç sırası katalog önceliğini korur.
      const settled = await Promise.all(
        oems.map(async (oem) => {
          try {
            const { result } = await cachedOemLookup(oem, async () => {
              const r = await lookupExternalOemServer(oem, false);
              return { result: r.result, error: r.error };
            });
            return { oem, result };
          } catch (err) {
            console.warn("[catalog-oem] lookup failed", oem, err instanceof Error ? err.message : err);
            return { oem, result: null };
          }
        }),
      );

      const items: CatalogExternalItem[] = [];
      for (const { oem, result } of settled) {
        if (result) items.push({ oem, catalog_part_name: nameByOem.get(oem) ?? data.query, result });
      }

      console.info(
        "[catalog-oem]",
        JSON.stringify({ query: data.query, catalog_oems: oems, supplier_results: items.length }),
      );

      return { query: data.query, searched_oems: oems, items, error: null };
    } catch (err) {
      return { ...empty, error: err instanceof Error ? err.message : "Katalog araması başarısız" };
    }
  });
