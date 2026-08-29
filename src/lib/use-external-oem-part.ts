/**
 * Harici tedarikçi (OnlineParça) sonucunu normal bir Taşıtsan ürün kartı verisine
 * dönüştürür ve OEM doğrulaması geçen sonucu ana ürün listesine eklenmek üzere döner.
 *
 * Müşteri arayüzünde kaynak bilgisi GÖSTERİLMEZ; kaynak alanları (source_type,
 * supplier_name) yalnızca backend/admin tarafında kullanılır.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo } from "react";
import { lookupExternalOem } from "@/lib/external-oem.functions";
import { externalStockLabel } from "@/lib/external-stock-label";
import type { Part } from "@/components/PartCard";

export const EXTERNAL_PART_PREFIX = "ext:";

export function isExternalPart(part: { id: string }): boolean {
  return part.id.startsWith(EXTERNAL_PART_PREFIX);
}

function norm(s: string | null | undefined): string {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Marka/tedarikçi prefix-suffix harflerini atarak OEM çekirdeğini bulur. */
function core(s: string | null | undefined): string {
  return norm(s).replace(/^[A-Z]+/, "").replace(/[A-Z]+$/, "");
}

/** Aranan OEM ile dönen OEM aynı parçaya mı ait? Sadece format farkları kabul edilir. */
export function oemMatches(searched: string, candidate: string | null | undefined): boolean {
  const a = norm(searched);
  const b = norm(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = core(searched);
  const cb = core(candidate);
  if (ca.length < 5 || cb.length < 5) return false;
  if (ca === cb) return true;
  // "TY8531502540" ↔ "8531502540" gibi prefix/suffix farkları
  return b.endsWith(ca) || a.endsWith(cb) || b.startsWith(ca) || a.startsWith(cb);
}

/** OEM benzeri terim: en az 5 rakam içeren 5-40 karakterlik kod. */
export function isOemLikeTerm(term: string): boolean {
  const t = term.trim();
  if (t.length < 5 || t.length > 40) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9 .\-/]*$/.test(t)) return false;
  return (t.match(/\d/g) ?? []).length >= 5;
}

export function useExternalOemPart(term: string): {
  part: Part | null;
  loading: boolean;
  enabled: boolean;
  normalizedOem: string;
} {
  const lookup = useServerFn(lookupExternalOem);
  const searchTerm = (term ?? "").trim();
  const enabled = isOemLikeTerm(searchTerm);
  const normalizedOem = norm(searchTerm);

  const q = useQuery({
    queryKey: ["parts-search", "external", normalizedOem],
    queryFn: () => lookup({ data: { oem: searchTerm } }),
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  });

  const res = q.data?.result ?? null;

  const part = useMemo<Part | null>(() => {
    if (!res) return null;
    // OEM DOĞRULAMASI — eşleşmeyen sonuç listeye ASLA eklenmez.
    const matched = oemMatches(searchTerm, res.oem) || oemMatches(searchTerm, res.matched_oem ?? "");
    if (!matched) return null;
    return {
      id: `${EXTERNAL_PART_PREFIX}${normalizedOem}`,
      title: res.title,
      brand: res.brand,
      model: null,
      year: null,
      price: res.price,
      city: null,
      photos: res.photo ? [res.photo] : null,
      // OnlineParça kaynaklı ürünler daima "Sıfır · Orijinal Parça" olarak gösterilir.
      condition: "new",
      part_type: "original",
      // Stok yalnızca gerçekten doğrulandığında "var" sayılır; belirsizse etiket yazılmaz.
      stock_quantity: res.stock_status === "IN_STOCK" ? (res.stock_quantity ?? 1) : null,
      stock_label: externalStockLabel(res.stock_status),
      // Yalnızca gerçek üretici OEM'i; tedarikçi stok kodu asla gösterilmez.
      oem_code: res.oem,
      is_sold: false,
      // Backend/admin kaynak bilgisi (frontend'de gösterilmez).
      source_type: res.source_type,
      supplier_name: res.supplier_name,
    };
  }, [normalizedOem, res, searchTerm]);

  useEffect(() => {
    if (!enabled || q.isPending) return;
    console.info(
      "[oem-merge]",
      JSON.stringify({
        searched_oem: searchTerm,
        normalized_oem: normalizedOem,
        supplier_result_count: res ? 1 : 0,
        oem_matched_count: part ? 1 : 0,
        merged_into_results: part ? 1 : 0,
        error: q.data?.error ?? null,
      }),
    );
  }, [enabled, normalizedOem, part, q.data?.error, q.isPending, res, searchTerm]);

  return { part, loading: enabled && q.isPending, enabled, normalizedOem };
}
