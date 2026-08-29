// OEM Knowledge Base servisi. `oem_reference` tablosu üzerinden cross-reference çözer.
// Faz 1: keyword tabanlı lookup. Faz 2: pgvector semantic search burada eklenecek.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface OemReferenceHit {
  oem: string;
  brand: string | null;
  model: string | null;
  part_name: string | null;
  alternative_oems: string[];
  cross_reference: string[];
  compatible_oems: string[];
  notes: string | null;
}

type Sb = SupabaseClient<Database>;

export async function lookupOemReferences(
  sb: Sb, oems: string[],
): Promise<{ hits: OemReferenceHit[]; similar_oems: string[] }> {
  if (oems.length === 0) return { hits: [], similar_oems: [] };
  const hits: OemReferenceHit[] = [];
  const similar = new Set<string>();
  for (const oem of oems.slice(0, 5)) {
    const { data, error } = await sb.rpc("lookup_oem_reference" as never, { _oem: oem, _limit: 10 } as never);
    if (error) { console.warn("[oem-kb] lookup failed", error.message); continue; }
    for (const r of (data ?? []) as Array<{
      oem: string; brand: string | null; model: string | null; part_name: string | null;
      alternative_oems: string[]; cross_reference: string[]; compatible_oems: string[]; notes: string | null;
    }>) {
      hits.push({
        oem: r.oem, brand: r.brand, model: r.model, part_name: r.part_name,
        alternative_oems: r.alternative_oems ?? [],
        cross_reference: r.cross_reference ?? [],
        compatible_oems: r.compatible_oems ?? [],
        notes: r.notes,
      });
      for (const x of [...(r.alternative_oems ?? []), ...(r.cross_reference ?? []), ...(r.compatible_oems ?? [])]) {
        const norm = x.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (norm && !oems.includes(norm)) similar.add(norm);
      }
    }
  }
  return { hits, similar_oems: Array.from(similar).slice(0, 20) };
}
