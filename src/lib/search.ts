import { normalizeOem } from "@/lib/oem";

export interface PartSearchable {
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  oem_code?: string | null;
  oem_codes?: string[] | null;
  description?: string | null;
  engine_code?: string | null;
}

export interface SearchCriteria {
  q?: string;
  brand?: string;
  model?: string;
  oem?: string;
}

/** Türkçe karakterleri normalize eder; karşılaştırmalar büyük-küçük harf duyarsızdır. */
export function normalizeSearchText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/** 0–1 arası benzerlik skoru (1 = tam eşleşme / alt dizi). */
export function fuzzyScore(term: string, candidate: string): number {
  const t = normalizeSearchText(term);
  const c = normalizeSearchText(candidate);
  if (!t || !c) return 0;
  if (c.includes(t) || t.includes(c)) return 1;
  const dist = levenshtein(t, c);
  const maxLen = Math.max(t.length, c.length);
  return Math.max(0, 1 - dist / maxLen);
}

export const FUZZY_MATCH_THRESHOLD = 0.52;

export function hasTextSearchCriteria(criteria: SearchCriteria): boolean {
  return !!(
    criteria.q?.trim() ||
    criteria.brand?.trim() ||
    criteria.model?.trim() ||
    criteria.oem?.trim()
  );
}

export function scorePartMatch(part: PartSearchable, criteria: SearchCriteria): number {
  const scores: number[] = [];

  if (criteria.q?.trim()) {
    const fields = [
      part.title ?? "",
      part.brand ?? "",
      part.model ?? "",
      part.oem_code ?? "",
      part.engine_code ?? "",
      part.description ?? "",
      ...(part.oem_codes ?? []),
    ].filter((f) => f.trim().length > 0);

    const words = criteria.q.trim().split(/\s+/).filter((w) => w.length >= 2);
    for (const word of words.length ? words : [criteria.q.trim()]) {
      scores.push(Math.max(0, ...fields.map((f) => fuzzyScore(word, f))));
    }
  }

  if (criteria.brand?.trim()) {
    scores.push(fuzzyScore(criteria.brand, part.brand ?? ""));
  }
  if (criteria.model?.trim()) {
    scores.push(fuzzyScore(criteria.model, part.model ?? ""));
  }
  if (criteria.oem?.trim()) {
    const normalized = normalizeOem(criteria.oem);
    const oemFields = [part.oem_code, ...(part.oem_codes ?? [])].filter(Boolean) as string[];
    scores.push(Math.max(0, ...oemFields.map((f) => fuzzyScore(normalized, normalizeOem(f)))));
  }

  if (scores.length === 0) return 1;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

export function applyFuzzySearch<T extends PartSearchable>(
  parts: T[],
  criteria: SearchCriteria,
): T[] {
  if (!hasTextSearchCriteria(criteria)) return parts;

  return parts
    .map((part) => ({ part, score: scorePartMatch(part, criteria) }))
    .filter(({ score }) => score >= FUZZY_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map(({ part }) => part);
}

/** PostgREST ilike için güvenli kaçış. */
export function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}
