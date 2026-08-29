// OnlineParça (Yetkili Servis) marka istatistiği — gerçek katalog verisinden.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OnlineParcaBrand {
  brand: string;
  oem_count: number;
  part_type: "original";
}

export interface OnlineParcaBrandStats {
  brand_count: number;
  oem_count: number;
  brands: OnlineParcaBrand[];
}

const REFRESH_MS = 300_000;
let cache: { data: OnlineParcaBrandStats; t: number } | null = null;
let inflight: Promise<OnlineParcaBrandStats | null> | null = null;

export async function fetchOnlineParcaBrandStats(): Promise<OnlineParcaBrandStats | null> {
  if (cache && Date.now() - cache.t < REFRESH_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await (supabase as any).rpc("onlineparca_brand_stats");
      if (error || !data) return cache?.data ?? null;
      const raw = data as Record<string, unknown>;
      const brands = Array.isArray(raw.brands) ? (raw.brands as OnlineParcaBrand[]) : [];
      const stats: OnlineParcaBrandStats = {
        brand_count: Number(raw.brand_count) || brands.length,
        oem_count: Number(raw.oem_count) || 0,
        brands,
      };
      cache = { data: stats, t: Date.now() };
      return stats;
    } catch {
      return cache?.data ?? null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useOnlineParcaBrandStats() {
  const [stats, setStats] = useState<OnlineParcaBrandStats | null>(cache?.data ?? null);

  useEffect(() => {
    let cancelled = false;
    void fetchOnlineParcaBrandStats().then((s) => {
      if (!cancelled && s) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
