/**
 * OEM normalize — tek bir kaynak.
 * Örn:
 *   "49110-VK513"  → "49110VK513"
 *   "49110 VK513"  → "49110VK513"
 *   "49110/vk513"  → "49110VK513"
 */
export function normalizeOem(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).toUpperCase().replace(/[\s\-./_]+/g, "");
}

export function normalizeOemList(values: ReadonlyArray<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const n = normalizeOem(v);
    if (n.length >= 4) out.add(n);
  }
  return Array.from(out);
}

/**
 * OEM "aile" normalize — revizyon harflerini ve REV1/V2 son eklerini de kaldırır.
 *
 *   "1320A015"     → "1320A015"
 *   "1320A015-A"   → "1320A015"
 *   "1320A015B"    → "1320A015"
 *   "735430904-a"  → "735430904"
 *   "8973886682REV2" → "8973886682"
 *
 * DB tarafındaki public.normalize_oem_family ile aynı çıktıyı vermek zorundadır.
 */
export function normalizeOemFamily(raw: string | null | undefined): string {
  let s = normalizeOem(raw);
  s = s.replace(/(REV|V)\d+$/u, "");
  s = s.replace(/(\d)[A-Z]$/u, "$1");
  return s;
}

export function normalizeOemFamilyList(values: ReadonlyArray<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const n = normalizeOemFamily(v);
    if (n.length >= 4) out.add(n);
  }
  return Array.from(out);
}

/**
 * Dosya adından OEM çıkar:
 *   "735430904-a.jpg"        → "735430904"
 *   "73430-76811-P4Z-a.jpg"  → "73430-76811-P4Z"
 *   "1320A015-B.png"         → "1320A015"
 * Tireler korunur (görsel görünümlü OEM'ler için); yalnızca SON tek-harfli revizyon
 * eki kaldırılır.
 */
export function extractOemFromFilename(filename: string): string {
  const base = filename.replace(/\.[^./]+$/u, "").trim();
  // strip trailing -A / _A / .A / space+A (single revision letter)
  let cleaned = base.replace(/[-_. ][A-Za-z]$/u, "");
  // trailing REV1 / V2 with separator
  cleaned = cleaned.replace(/[-_. ]?(REV|V)\d+$/iu, "");
  return cleaned.trim();
}

/**
 * Storage path sanitize — Supabase Storage geçersiz key hatasından kurtarır.
 * - NFD ile Türkçe aksanları çıkarır
 * - Küçük harfe çevirir
 * - Boşlukları "_" yapar
 * - Sadece [a-z0-9_\-./] bırakır
 */
export function sanitizeStoragePath(filePath: string): string {
  let s = String(filePath ?? "");
  // Replace Turkish-specific chars that NFD does not split.
  const map: Record<string, string> = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };
  s = s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => map[c] ?? c);
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.toLowerCase().replace(/\s+/g, "_");
  s = s.replace(/[^a-z0-9_\-./]/g, "");
  s = s.replace(/\/+/g, "/").replace(/^\/+/, "");
  return s || "_";
}
