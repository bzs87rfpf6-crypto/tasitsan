/**
 * OEM Görsel Havuzu çözücü hook'u.
 *
 * Öncelik sırası ürün görseli için:
 *   1) parts.photos[0]
 *   2) OEM Havuzu — birebir (exact) eşleşme
 *   3) OEM Havuzu — normalize edilmiş eşleşme
 *   4) OEM Havuzu — aile eşleşmesi (revizyon harfleri kaldırılarak)
 *   5) OEM Havuzu — çapraz referans üzerinden eşdeğer OEM
 *   6) Marka logosu (SafePartImage fallback'i)
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeOem, normalizeOemList, normalizeOemFamily, normalizeOemFamilyList } from "@/lib/oem-normalize";

export type OemImageMatch = "exact" | "normalized" | "family" | "cross_reference";

export interface ResolvedOemImage {
  url: string;
  oem: string;
  oem_normalized: string | null;
  match: OemImageMatch;
  source_name: string | null;
  confidence: number | null;
  via_equivalent?: string | null;
}

interface UseOemLibraryImageArgs {
  oemCodes: ReadonlyArray<string | null | undefined>;
  enabled?: boolean;
}

async function lookupByNormalized(normList: string[]) {
  return supabase
    .from("oem_image_library")
    .select("image_url, oem, oem_normalized, is_primary, confidence, source_name, verified")
    .in("oem_normalized", normList)
    .eq("verified", true)
    .order("is_primary", { ascending: false })
    .order("confidence", { ascending: false })
    .limit(20);
}

async function lookupByFamily(familyList: string[]) {
  return supabase
    .from("oem_image_library")
    // oem_family is a generated stored column added via migration
    .select("image_url, oem, oem_normalized, is_primary, confidence, source_name, verified")
    .in("oem_family" as never, familyList as never)
    .eq("verified", true)
    .order("is_primary", { ascending: false })
    .order("confidence", { ascending: false })
    .limit(20);
}

export function useOemLibraryImage({
  oemCodes,
  enabled = true,
}: UseOemLibraryImageArgs) {
  const rawList = Array.from(
    new Set(
      (oemCodes ?? [])
        .map((v) => (v ?? "").trim())
        .filter((v) => v.length >= 4),
    ),
  );
  const normList = normalizeOemList(rawList);
  const famList = normalizeOemFamilyList(rawList);
  const queryEnabled = enabled && normList.length > 0;

  return useQuery({
    queryKey: ["oem-library-image", normList, famList],
    enabled: queryEnabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async (): Promise<ResolvedOemImage | null> => {
      // 1) Doğrudan OEM havuzunda ara (exact + normalized)
      const direct = await lookupByNormalized(normList);
      if (direct.error) {
        console.warn("[oem-library] lookup failed", direct.error.message);
      } else if (direct.data && direct.data.length > 0) {
        const rawSet = new Set(rawList.map((r) => r.toUpperCase()));
        let exact = direct.data.find((r) => r.oem && rawSet.has(String(r.oem).toUpperCase()));
        if (!exact) {
          const rawNormSet = new Set(rawList.map((r) => normalizeOem(r)));
          exact = direct.data.find(
            (r) => normalizeOem(r.oem) && rawNormSet.has(normalizeOem(r.oem)) &&
              String(r.oem).toUpperCase() === normalizeOem(r.oem),
          );
        }
        const picked = exact ?? direct.data[0];
        return {
          url: picked.image_url,
          oem: String(picked.oem ?? ""),
          oem_normalized: picked.oem_normalized ?? null,
          match: exact ? "exact" : "normalized",
          source_name: picked.source_name ?? null,
          confidence: picked.confidence ?? null,
        };
      }

      // 2) Aile eşleşmesi — revizyon harfleri kaldırılarak (1320A015-A → 1320A015)
      if (famList.length > 0) {
        const fam = await lookupByFamily(famList);
        if (!fam.error && fam.data && fam.data.length > 0) {
          const picked = fam.data[0];
          return {
            url: picked.image_url,
            oem: String(picked.oem ?? ""),
            oem_normalized: picked.oem_normalized ?? null,
            match: "family",
            source_name: picked.source_name ?? null,
            confidence: picked.confidence ?? null,
          };
        }
      }

      // 3) Çapraz referans üzerinden eşdeğer OEM'lere bak
      const equivSet = new Set<string>();
      for (const n of normList) {
        const { data: eqs } = await supabase.rpc(
          "find_oem_equivalents" as never,
          { _oem_normalized: n } as never,
        );
        for (const e of (eqs ?? []) as Array<{ equivalent_normalized?: string | null }>) {
          const en = e.equivalent_normalized;
          if (en && !normList.includes(en)) equivSet.add(en);
        }
      }
      if (equivSet.size === 0) return null;

      const viaList = Array.from(equivSet);
      const viaLookup = await lookupByNormalized(viaList);
      if (viaLookup.error || !viaLookup.data || viaLookup.data.length === 0) {
        // family fallback on equivalents
        const viaFam = Array.from(new Set(viaList.map((v) => normalizeOemFamily(v)).filter((v) => v.length >= 4)));
        if (viaFam.length === 0) return null;
        const famLookup = await lookupByFamily(viaFam);
        if (famLookup.error || !famLookup.data || famLookup.data.length === 0) return null;
        const picked = famLookup.data[0];
        return {
          url: picked.image_url,
          oem: String(picked.oem ?? ""),
          oem_normalized: picked.oem_normalized ?? null,
          match: "cross_reference",
          source_name: picked.source_name ?? null,
          confidence: picked.confidence ?? null,
          via_equivalent: picked.oem_normalized ?? null,
        };
      }
      const picked = viaLookup.data[0];
      return {
        url: picked.image_url,
        oem: String(picked.oem ?? ""),
        oem_normalized: picked.oem_normalized ?? null,
        match: "cross_reference",
        source_name: picked.source_name ?? null,
        confidence: picked.confidence ?? null,
        via_equivalent: picked.oem_normalized ?? null,
      };
    },
  });
}
