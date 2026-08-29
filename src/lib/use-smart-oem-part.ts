/**
 * Akıllı OEM fallback hook'u — yalnızca Taşıtsan'da sonuç yoksa çalışır.
 * Kaynak/tedarikçi bilgisi müşteriye gösterilmez.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { smartOemSearch } from "@/lib/smart-oem.functions";
import type { Part } from "@/components/PartCard";

export const SMART_PART_PREFIX = "smart:";

export function useSmartOemPart(term: string, enabled: boolean): { part: Part | null; loading: boolean } {
  const run = useServerFn(smartOemSearch);
  const q = (term ?? "").trim();
  const active = enabled && q.length >= 3;

  const query = useQuery({
    queryKey: ["parts-search", "smart-oem", q.toLowerCase()],
    queryFn: () => run({ data: { query: q } }),
    staleTime: 10 * 60_000,
    retry: false,
    enabled: active,
  });

  const res = query.data?.result ?? null;

  const part = useMemo<Part | null>(() => {
    if (!res) return null;
    return {
      id: `${SMART_PART_PREFIX}${res.oem.toUpperCase().replace(/[^A-Z0-9]/g, "")}`,
      title: res.title,
      brand: res.brand,
      model: null,
      year: null,
      price: res.price,
      city: null,
      photos: res.photo ? [res.photo] : null,
      condition: "new",
      part_type: "original",
      stock_quantity: res.stock_status === "IN_STOCK" ? (res.stock_quantity ?? 1) : null,
      stock_label: res.stock_status === "IN_STOCK" ? null : "Tedarik edilebilir",
      oem_code: res.oem,
      is_sold: false,
    } as Part;
  }, [res]);

  return { part, loading: active && query.isPending };
}
