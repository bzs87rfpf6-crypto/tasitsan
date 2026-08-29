/**
 * Sonuç bulunamadığında "Bunu mu aradınız?" önerileri.
 * Mevcut RPC'leri (search_suggest + vehicle_suggest) kullanır; yeni bir arama
 * motoru kurmaz, OnlineParça/katalog akışlarına dokunmaz.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { rankSuggestions, type RawSuggestion, type ScoredSuggestion } from "@/lib/fuzzy-suggest";

export function useDidYouMean(term: string, enabled: boolean, limit = 5) {
  const [items, setItems] = useState<ScoredSuggestion[]>([]);

  useEffect(() => {
    const q = term.trim();
    if (!enabled || q.length < 3) { setItems([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const [sug, veh] = await Promise.all([
          supabase.rpc("search_suggest", { _q: q, _limit: 12 }),
          supabase.rpc("vehicle_suggest" as never, { _q: q, _limit: 6 } as never),
        ]);
        if (!alive) return;
        const candidates: RawSuggestion[] = [
          ...(((sug.data ?? []) as Array<{ kind: string; label: string; hint?: string | null }>) || []).map((s) => ({
            kind: s.kind, label: s.label, hint: s.hint ?? null,
          })),
          ...(((veh.data ?? []) as unknown as Array<{ label: string }>) || []).map((v) => ({
            kind: "brand_model", label: v.label, hint: null,
          })),
        ];
        setItems(rankSuggestions(q, candidates, limit));
      } catch (e) {
        console.warn("[did-you-mean] failed", e);
        if (alive) setItems([]);
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [term, enabled, limit]);

  return items;
}
