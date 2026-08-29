/**
 * Parça adı → OEM Kataloğu → OnlineParça sonucu.
 * OEM benzeri terimlerde çalışmaz (o akış useExternalOemPart ile zaten var).
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { catalogOemExternalSearch } from "@/lib/catalog-oem.functions";
import { isOemLikeTerm } from "@/lib/use-external-oem-part";
import { externalStockLabel } from "@/lib/external-stock-label";
import type { Part } from "@/components/PartCard";

export const CATALOG_PART_PREFIX = "cat:";

export function useCatalogOemParts(term: string, enabled: boolean): { parts: Part[]; loading: boolean } {
  const run = useServerFn(catalogOemExternalSearch);
  const q = (term ?? "").trim();
  const active = enabled && q.length >= 3 && !isOemLikeTerm(q);

  const query = useQuery({
    queryKey: ["parts-search", "catalog-oem", q.toLowerCase()],
    queryFn: () => run({ data: { query: q } }),
    staleTime: 5 * 60_000,
    retry: false,
    enabled: active,
  });

  const items = query.data?.items ?? [];

  const parts = useMemo<Part[]>(() => {
    const seen = new Set<string>();
    const out: Part[] = [];
    for (const it of items) {
      const r = it.result;
      const key = String(r.oem ?? it.oem).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `${CATALOG_PART_PREFIX}${key}`,
        title: r.title,
        brand: r.brand,
        model: null,
        year: null,
        price: r.price,
        city: null,
        photos: r.photo ? [r.photo] : null,
        condition: "new",
        part_type: "original",
        stock_quantity: r.stock_status === "IN_STOCK" ? (r.stock_quantity ?? 1) : null,
        stock_label: externalStockLabel(r.stock_status),
        oem_code: r.oem,
        is_sold: false,
        source_type: r.source_type,
        supplier_name: r.supplier_name,
      } as Part);
    }
    return out;
  }, [items]);

  return { parts, loading: active && query.isPending };
}
