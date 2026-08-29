// Ana sayfa vitrini için "son gösterilen ürünler" hafızası.
// Amaç: aynı ziyaretçi kısa süre içinde tekrar girdiğinde farklı ürünler görsün.
const KEY = "ts:homeSeen";
const TTL_MS = 30 * 60 * 1000; // 30 dk sonra hafıza sıfırlanır
const MAX_IDS = 240; // RPC parametresini şişirmemek için üst sınır

type Store = { t: number; ids: string[] };

function read(): Store | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Store;
    if (!s || !Array.isArray(s.ids) || typeof s.t !== "number") return null;
    if (Date.now() - s.t > TTL_MS) return null;
    return s;
  } catch {
    return null;
  }
}

/** Son 30 dakikada bu tarayıcıda gösterilmiş ürün ID'leri. */
export function getSeenPartIds(): string[] {
  return read()?.ids ?? [];
}

/** Gösterilen ürünleri hafızaya ekler (en yeniler başta, üst sınırla kırpılır). */
export function rememberSeenPartIds(ids: string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  const prev = read()?.ids ?? [];
  const merged = Array.from(new Set([...ids, ...prev])).slice(0, MAX_IDS);
  try {
    localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), ids: merged } satisfies Store));
  } catch {
    /* kota dolabilir — yok say */
  }
}
