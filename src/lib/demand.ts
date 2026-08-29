// Fırsatlar / Talep İstihbaratı — istemci kayıt yardımcıları.
// Sonuç bulunamayan veya çok az sonuç dönen aramalar otomatik olarak
// demand_signals tablosuna işlenir. Bot / admin / geliştirme oturumları hariç tutulur.

import { supabase } from "@/integrations/supabase/client";
import { getFingerprint } from "./fingerprint";
import { getCachedGeo } from "./geolocation";
import { isInternalSession } from "./analytics";

const LOW_RESULT_THRESHOLD = 2;
const LOCAL_DEDUPE_MS = 30 * 60 * 1000;
const LOCAL_KEY = "ts_demand_seen_v1";

export type DemandTier = "critical" | "high" | "medium" | "low";

export const DEMAND_TIER_META: Record<DemandTier, { label: string; icon: string; className: string }> = {
  critical: { label: "Çok Yüksek Fırsat", icon: "🔥", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  high: { label: "Yüksek", icon: "🟠", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  medium: { label: "Orta", icon: "🟡", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  low: { label: "Düşük", icon: "⚪", className: "bg-muted text-muted-foreground border-border" },
};

export function tierOfScore(score: number): DemandTier {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function normalizeKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Trafik kaynağı: google / facebook / instagram / direct ... */
function trafficSource(): string {
  if (typeof document === "undefined") return "direct";
  try {
    const ref = document.referrer || "";
    if (!ref) return "direct";
    const host = new URL(ref).hostname.replace(/^www\./, "");
    if (host === window.location.hostname) return "internal";
    if (/google\./.test(host)) return "google";
    if (/bing\./.test(host)) return "bing";
    if (/yandex\./.test(host)) return "yandex";
    if (/facebook|fb\.com/.test(host)) return "facebook";
    if (/instagram/.test(host)) return "instagram";
    if (/t\.co|twitter|x\.com/.test(host)) return "twitter";
    if (/whatsapp/.test(host)) return "whatsapp";
    return host.slice(0, 40);
  } catch {
    return "direct";
  }
}

/** Aynı tarayıcıda 30 dk içinde aynı arama tekrar kaydedilmez (spam koruması). */
function seenRecently(key: string): boolean {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    for (const k of Object.keys(map)) if (now - map[k] > LOCAL_DEDUPE_MS) delete map[k];
    const hit = typeof map[key] === "number" && now - map[key] < LOCAL_DEDUPE_MS;
    map[key] = now;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
    return hit;
  } catch {
    return false;
  }
}

export interface DemandInput {
  oem?: string | null;
  query?: string | null;
  partName?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  vehicleClass?: string | null;
  category?: string | null;
  resultsCount: number;
}

/**
 * Sonuç bulunamayan / az sonuç dönen aramayı Fırsatlar veritabanına yazar.
 * Hiçbir hata kullanıcıya yansımaz (best-effort).
 */
export async function recordDemandSignal(input: DemandInput): Promise<void> {
  if (typeof window === "undefined") return;
  if (input.resultsCount > LOW_RESULT_THRESHOLD) return;

  const key = normalizeKey(String(input.oem || input.query || input.partName || ""));
  if (key.length < 3) return;

  if (isInternalSession()) return;
  if (/bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent || "")) return;
  if (seenRecently(key)) return;

  try {
    const geo = getCachedGeo();
    await supabase.rpc("record_demand_signal", {
      _oem: input.oem ?? undefined,
      _query: input.query ?? undefined,
      _part_name: input.partName ?? undefined,
      _brand: input.brand ?? undefined,
      _model: input.model ?? undefined,
      _year: input.year ?? undefined,
      _vehicle_class: input.vehicleClass ?? undefined,
      _category: input.category ?? undefined,
      _ip_hash: getFingerprint(),
      _source: trafficSource(),
      _city: geo?.city ?? undefined,
      _results_count: input.resultsCount,
      _is_internal: false,
    });
  } catch {
    /* sessizce yut */
  }
}
