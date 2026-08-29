/**
 * OnlineParça performans ölçümü (süreç-içi, hafif).
 *
 * Yalnızca zamanlama/sayaç tutar; OEM dışında hassas veri saklamaz.
 * Doğrulama veya arama mantığını ETKİLEMEZ.
 */

export interface OnlineParcaSample {
  oem: string;
  at: number;
  searchMs: number;
  parseMs: number;
  detailMs: number;
  totalMs: number;
  attempts: number;
  timeouts: number;
  found: boolean;
}

const MAX_SAMPLES = 200;
const samples: OnlineParcaSample[] = [];
let cacheHits = 0;
let cacheMisses = 0;
let inflightJoins = 0;

export function recordOnlineParcaSample(s: OnlineParcaSample): void {
  samples.push(s);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

export function recordCacheHit(): void {
  cacheHits += 1;
}
export function recordCacheMiss(): void {
  cacheMisses += 1;
}
export function recordInflightJoin(): void {
  inflightJoins += 1;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return Math.round(sorted[i] ?? 0);
}

export interface OnlineParcaMetrics {
  sampleCount: number;
  cacheHits: number;
  cacheMisses: number;
  inflightJoins: number;
  cacheHitRate: number;
  timeouts: number;
  foundRate: number;
  avgSearchMs: number;
  avgParseMs: number;
  avgDetailMs: number;
  avgTotalMs: number;
  p50TotalMs: number;
  p95TotalMs: number;
  recent: OnlineParcaSample[];
}

export function getOnlineParcaMetrics(): OnlineParcaMetrics {
  const n = samples.length;
  const avg = (pick: (s: OnlineParcaSample) => number) =>
    n === 0 ? 0 : Math.round(samples.reduce((acc, s) => acc + pick(s), 0) / n);
  const totals = samples.map((s) => s.totalMs).sort((a, b) => a - b);
  const lookups = cacheHits + cacheMisses;

  return {
    sampleCount: n,
    cacheHits,
    cacheMisses,
    inflightJoins,
    cacheHitRate: lookups === 0 ? 0 : Math.round((cacheHits / lookups) * 100),
    timeouts: samples.reduce((acc, s) => acc + s.timeouts, 0),
    foundRate: n === 0 ? 0 : Math.round((samples.filter((s) => s.found).length / n) * 100),
    avgSearchMs: avg((s) => s.searchMs),
    avgParseMs: avg((s) => s.parseMs),
    avgDetailMs: avg((s) => s.detailMs),
    avgTotalMs: avg((s) => s.totalMs),
    p50TotalMs: pct(totals, 50),
    p95TotalMs: pct(totals, 95),
    recent: samples.slice(-25).reverse(),
  };
}
