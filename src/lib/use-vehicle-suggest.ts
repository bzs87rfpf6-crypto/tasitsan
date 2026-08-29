/**
 * Araç marka/model fuzzy önerisi — `public.vehicle_suggest` RPC'sini debounce ile çağırır.
 * OEM benzeri sorgularda hiç çalışmaz (OEM akışı korunur).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isOemLikeQuery,
  pickVehicleCorrection,
  type VehicleSuggestion,
} from "@/lib/vehicle-match";

export function useVehicleSuggest(term: string, enabled = true) {
  const [suggestions, setSuggestions] = useState<VehicleSuggestion[]>([]);

  useEffect(() => {
    const q = term.trim();
    if (!enabled || q.length < 3 || isOemLikeQuery(q)) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("vehicle_suggest" as never, { _q: q, _limit: 5 } as never);
      if (!alive) return;
      setSuggestions((data ?? []) as unknown as VehicleSuggestion[]);
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [term, enabled]);

  return { suggestions, correction: pickVehicleCorrection(term, suggestions) };
}
