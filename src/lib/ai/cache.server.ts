// Faz 4/8 — In-memory arama önbelleği (LRU, TTL). Süreç ömrü boyunca çalışır.
// Amaç: sık tekrarlanan sorgularda embed + DB atmadan sonuç dönmek.

const TTL_MS = 5 * 60 * 1000; // 5 dk
const MAX = 200;

interface Entry<T> { value: T; expires: number }
const store = new Map<string, Entry<unknown>>();

function normKey(query: string, vehicleId: string | null): string {
  return `${(vehicleId ?? "-")}::${query.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export function cacheGet<T>(query: string, vehicleId: string | null): T | null {
  const k = normKey(query, vehicleId);
  const e = store.get(k) as Entry<T> | undefined;
  if (!e) return null;
  if (e.expires < Date.now()) { store.delete(k); return null; }
  // LRU refresh
  store.delete(k); store.set(k, e);
  return e.value;
}

export function cacheSet<T>(query: string, vehicleId: string | null, value: T): void {
  const k = normKey(query, vehicleId);
  if (store.size >= MAX) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
  store.set(k, { value, expires: Date.now() + TTL_MS });
}

export function cacheStats() {
  return { size: store.size, max: MAX, ttl_ms: TTL_MS };
}
