/**
 * "Bunu mu aradınız?" — yazım hatası toleranslı öneri skorlama katmanı.
 *
 * Mevcut arama motorunu (search_parts_family / OnlineParça / katalog) DEĞİŞTİRMEZ;
 * yalnızca sonuç bulunamadığında ya da sonuç zayıf olduğunda kullanıcıya
 * gösterilecek adayları normalize edip skorlar.
 */
import { foldTr } from "@/lib/search";

export type RawSuggestion = {
  kind: string; // "part" | "brand_model" | "oem" | ...
  label: string;
  hint?: string | null;
};

export type ScoredSuggestion = RawSuggestion & { score: number };

/** Türkçe karakter, büyük/küçük harf, noktalama ve boşluk normalizasyonu. */
export function normalizeText(raw: string): string {
  return foldTr(String(raw ?? "").toLocaleLowerCase("tr-TR"))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** OEM format farklılıklarını (-, /, ., boşluk, alt çizgi) temizler. */
export function normalizeOemCode(raw: string): string {
  return String(raw ?? "").toUpperCase().replace(/[\s\-./_]+/g, "");
}

export function isOemLike(raw: string): boolean {
  const c = normalizeOemCode(raw);
  if (c.length < 5 || c.length > 24) return false;
  if (!/^[A-Z0-9]+$/.test(c)) return false;
  return (c.match(/\d/g) ?? []).length >= 2;
}

/** Levenshtein mesafesi (küçük dizeler için yeterli). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

function tokenSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.startsWith(a) || a.startsWith(b)) {
    return 0.9 - Math.min(0.25, Math.abs(a.length - b.length) * 0.03);
  }
  const d = levenshtein(a, b);
  const max = Math.max(a.length, b.length);
  return Math.max(0, 1 - d / max);
}

/**
 * Sorgu ile aday arasında 0..1 benzerlik.
 * - Kelime sırası önemsiz (her sorgu token'ı en iyi aday token'ıyla eşlenir).
 * - OEM benzeri sorgularda format farkları normalize edilerek karşılaştırılır.
 */
export function similarity(query: string, candidate: string): number {
  const q = String(query ?? "").trim();
  const c = String(candidate ?? "").trim();
  if (!q || !c) return 0;

  if (isOemLike(q) || isOemLike(c)) {
    const qa = normalizeOemCode(q);
    const cb = normalizeOemCode(c);
    if (qa === cb) return 1;
    if (cb.includes(qa) || qa.includes(cb)) return 0.92;
    return tokenSimilarity(qa.toLowerCase(), cb.toLowerCase());
  }

  const qt = normalizeText(q).split(" ").filter(Boolean);
  const ct = normalizeText(c).split(" ").filter(Boolean);
  if (qt.length === 0 || ct.length === 0) return 0;

  let total = 0;
  for (const t of qt) {
    let best = 0;
    for (const u of ct) best = Math.max(best, tokenSimilarity(t, u));
    total += best;
  }
  const base = total / qt.length;
  // Aday çok daha uzunsa hafif ceza (alakasız uzun başlıklar öne çıkmasın).
  const lengthPenalty = ct.length > qt.length ? Math.min(0.12, (ct.length - qt.length) * 0.03) : 0;
  return Math.max(0, base - lengthPenalty);
}

export const MIN_SUGGEST_SCORE = 0.55;

/** Adayları skorlayıp güven eşiğinin üstünde kalan en iyi N öneriyi döner. */
export function rankSuggestions(
  query: string,
  candidates: RawSuggestion[] | null | undefined,
  limit = 5,
  minScore = MIN_SUGGEST_SCORE,
): ScoredSuggestion[] {
  const q = String(query ?? "").trim();
  if (!q) return [];
  const qn = normalizeText(q);
  const seen = new Set<string>();
  const out: ScoredSuggestion[] = [];
  for (const c of candidates ?? []) {
    const label = (c?.label ?? "").trim();
    if (!label) continue;
    const key = `${c.kind}:${normalizeText(label)}`;
    if (seen.has(key)) continue;
    const score = similarity(q, label);
    if (score < minScore) continue;
    if (normalizeText(label) === qn) continue; // sorgunun aynısını önerme
    seen.add(key);
    out.push({ ...c, label, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
