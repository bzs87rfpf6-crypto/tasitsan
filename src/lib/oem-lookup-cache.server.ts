/**
 * Harici OEM sorguları için süreç-içi sonuç önbelleği + eş zamanlı istek birleştirme.
 *
 * Doğruluk mantığı DEĞİŞMEZ: yalnızca aynı OEM için tekrarlanan/eş zamanlı
 * OnlineParça isteklerini engeller ve 30 dk boyunca aynı sonucu döner.
 */
import type { ExternalOemPublicResult } from "@/lib/external-oem.server";

const TTL_MS = 30 * 60 * 1000;
/** Sonuçsuz/hatalı yanıtlar için kısa TTL — yavaş kaynakta hızlı yeniden deneme. */
const NEGATIVE_TTL_MS = 60 * 1000;
const MAX = 500;

type Value = { result: ExternalOemPublicResult | null; error: string | null };
interface Entry {
  value: Value;
  expires: number;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<Value>>();

function key(oem: string): string {
  return oem.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function peekOemLookup(oem: string): Value | null {
  const k = key(oem);
  const e = store.get(k);
  if (!e) return null;
  if (e.expires < Date.now()) {
    store.delete(k);
    return null;
  }
  return e.value;
}

/** Cache + inflight dedupe ile OEM sorgusu çalıştırır. */
export async function cachedOemLookup(oem: string, run: () => Promise<Value>): Promise<Value> {
  const k = key(oem);
  if (!k) return { result: null, error: null };
  const metrics = await import("@/lib/onlineparca-metrics.server");

  const cached = peekOemLookup(oem);
  if (cached) {
    metrics.recordCacheHit();
    return cached;
  }

  const pending = inflight.get(k);
  if (pending) {
    metrics.recordInflightJoin();
    return pending;
  }
  metrics.recordCacheMiss();

  const p = (async () => {
    const value = await run();
    if (store.size >= MAX) {
      const first = store.keys().next().value;
      if (first) store.delete(first);
    }
    // Sonuçsuz/hatalı yanıtlar kısa süre saklanır; başarılı sonuç tam TTL alır.
    const ttl = value.result ? TTL_MS : NEGATIVE_TTL_MS;
    store.set(k, { value, expires: Date.now() + ttl });
    return value;
  })().finally(() => inflight.delete(k));

  inflight.set(k, p);
  return p;
}
