/**
 * Araç marka/model "yarım yazım" eşleştirme yardımcıları.
 *
 * Amaç: müşteri "NISSAN TERR", "TOYOTA HILU", "MITSUBISHI L20" gibi eksik ya da
 * hatalı yazdığında doğru araca ("Nissan Terrano", "Toyota Hilux", "Mitsubishi L200")
 * yönlendirmek. Sözlük veritabanından gelir (public.vehicle_suggest RPC) —
 * hiçbir marka/model burada hard-code edilmez.
 *
 * OEM akışına karışmaz: OEM benzeri sorgular bu katmanı hiç tetiklemez.
 */
import { foldTr } from "@/lib/search";

export type VehicleSuggestion = {
  brand: string;
  model: string;
  label: string;
  score: number;
  listings?: number;
};

/** Türkçe karakter + case normalizasyonu, noktalama sadeleştirmesi. */
export function normalizeVehicleText(raw: string): string {
  return foldTr(String(raw ?? "").toLocaleLowerCase("tr-TR"))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * OEM benzeri sorgu mu? (ör. "52119-0K982", "5193124050")
 * OEM aramaları araç fuzzy katmanına girmemeli.
 */
export function isOemLikeQuery(raw: string): boolean {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  const compact = s.toUpperCase().replace(/[\s\-./_]+/g, "");
  if (compact.length < 5 || compact.length > 24) return false;
  if (!/^[A-Z0-9]+$/.test(compact)) return false;
  // En az iki rakam içeren, boşluksuz kod dizileri OEM sayılır.
  const digits = (compact.match(/\d/g) ?? []).length;
  return digits >= 2 && /\d/.test(compact);
}

/** Sorgu zaten öneriyle aynı mı? (öneriyi göstermenin anlamı kalmaz) */
export function isSameAsQuery(query: string, label: string): boolean {
  return normalizeVehicleText(query) === normalizeVehicleText(label);
}

const MIN_SHOW_SCORE = 0.7;
const MIN_REWRITE_SCORE = 0.85;

/**
 * Kullanıcıya "Bunu mu arıyorsunuz?" olarak gösterilecek en iyi eşleşme.
 * Yeterince güvenli değilse null döner.
 */
export function pickVehicleCorrection(
  query: string,
  suggestions: VehicleSuggestion[] | null | undefined,
): VehicleSuggestion | null {
  const q = query.trim();
  if (!q || isOemLikeQuery(q)) return null;
  const list = (suggestions ?? []).filter((s) => s?.label);
  if (list.length === 0) return null;
  const best = list.reduce((a, b) => (b.score > a.score ? b : a));
  if (best.score < MIN_SHOW_SCORE) return null;
  if (isSameAsQuery(q, best.label)) return null;
  return best;
}

/**
 * Sonuç bulunamadığında aramanın otomatik olarak düzeltilmiş terimle
 * tekrarlanıp tekrarlanmayacağı (sıralamaya yardım eder).
 */
export function shouldRewriteQuery(
  query: string,
  suggestion: VehicleSuggestion | null,
): boolean {
  if (!suggestion) return false;
  if (isOemLikeQuery(query)) return false;
  return suggestion.score >= MIN_REWRITE_SCORE;
}
