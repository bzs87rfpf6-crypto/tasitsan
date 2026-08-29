/**
 * Türkçe (ve karışık) sayı formatlarını güvenli şekilde parse eder.
 * "." binlik ayraç, "," ondalık ayraçtır.
 *   "4.396,85" -> 4396.85
 *   "146,35"   -> 146.35
 *   "1,073.21" -> 1073.21 (İngilizce format da desteklenir)
 *   "4396.85"  -> 4396.85
 * KDV / kâr / yuvarlama uygulanmaz.
 */
export function parseTrPrice(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let s = String(input).trim();
  if (!s) return null;

  // Para birimi, boşluk (NBSP dahil) ve diğer karakterleri at
  s = s.replace(/[\s\u00A0\u202F]/g, "").replace(/[^\d.,-]/g, "");
  if (!s) return null;

  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // Türkçe: 4.396,85
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // İngilizce: 1,073.21
      s = s.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const dec = s.length - lastComma - 1;
    // "1.234,5" gibi tek virgül -> ondalık; "1,234" (3 hane) binlik olabilir
    s = dec === 3 && s.indexOf(",") === lastComma && /^\d{1,3},\d{3}$/.test(s)
      ? s.replace(",", "")
      : s.replace(/,/g, ".");
  } else if (lastDot !== -1) {
    const parts = s.split(".");
    const isThousands = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
    // "4.396" veya "12.507.260" -> binlik ayraç
    if (isThousands) s = parts.join("");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Görüntüleme için TR para formatı. */
export function formatTrPrice(n: number): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
