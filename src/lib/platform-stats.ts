// Merkezi istatistik servisi — ana sayfa, açılış ekranı ve yönetici paneli
// aynı `platform_stats()` RPC'sinden beslenir. Sunucu tarafında 60 sn cache var.
import { useEffect, useState } from "react";
import { homePublicRpc } from "@/lib/home-public-rpc";

export interface PlatformStats {
  active_parts: number;
  total_parts: number;
  brand_count: number;
  model_count: number;
  total_oem: number;
  total_sellers: number;
  total_members: number;
  verified_sellers: number;
  total_cities: number;
  today_new: number;
  last24h_new: number;
  week_count: number;
  last24h_views: number;
  completed_sales: number;
  open_part_requests: number;
  total_stock_value: number;
  computed_at?: string;
  cached?: boolean;
}


const REFRESH_MS = 60_000;

let cache: { data: PlatformStats; t: number } | null = null;
let inflight: Promise<PlatformStats | null> | null = null;
const listeners = new Set<(s: PlatformStats) => void>();

/** NULL / NaN / negatif değerleri 0'a indirger. */
const safe = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

function normalize(raw: Record<string, unknown> | null): PlatformStats {
  const r = raw ?? {};
  return {
    active_parts: safe(r.active_parts),
    total_parts: safe(r.total_parts),
    brand_count: safe(r.brand_count),
    model_count: safe(r.model_count),
    total_oem: safe(r.total_oem),
    total_sellers: safe(r.total_sellers),
    total_members: safe(r.total_members),
    verified_sellers: safe(r.verified_sellers),
    total_cities: safe(r.total_cities),
    today_new: safe(r.today_new),
    last24h_new: safe(r.last24h_new),

    week_count: safe(r.week_count),
    last24h_views: safe(r.last24h_views),
    completed_sales: safe(r.completed_sales),
    open_part_requests: safe(r.open_part_requests),
    total_stock_value: safe(r.total_stock_value),
    computed_at: typeof r.computed_at === "string" ? r.computed_at : undefined,
    cached: Boolean(r.cached),
  };
}

export async function fetchPlatformStats(force = false): Promise<PlatformStats | null> {
  if (!force && cache && Date.now() - cache.t < REFRESH_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await homePublicRpc<Record<string, unknown>>("platform_stats");
      if (!data) return cache?.data ?? null;
      const stats = normalize(data as Record<string, unknown>);
      cache = { data: stats, t: Date.now() };
      listeners.forEach((fn) => fn(stats));
      return stats;
    } catch {
      return cache?.data ?? null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Ortak istatistik hook'u: ilk açılışta yükler, 60 sn'de bir arka planda yeniler. */
export function usePlatformStats() {
  const [stats, setStats] = useState<PlatformStats | null>(cache?.data ?? null);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    const push = (s: PlatformStats) => { if (!cancelled) { setStats(s); setLoading(false); } };
    listeners.add(push);

    (async () => {
      const s = await fetchPlatformStats();
      if (!cancelled) { if (s) setStats(s); setLoading(false); }
    })();

    const iv = setInterval(() => { void fetchPlatformStats(true); }, REFRESH_MS);
    return () => { cancelled = true; listeners.delete(push); clearInterval(iv); };
  }, []);

  return { stats, loading };
}
