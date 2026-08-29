// SEO 3.1 — UUID kullanıcıya hiç görünmez. URL = /parts/{seo_slug}.
// seo_slug DB tarafında benzersiz üretilir; resolver eski URL'leri 301'le çevirir.

const UUID_FULL_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const TR_MAP: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g",
  ı: "i", I: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};

export function slugify(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(/[çÇğĞıIİöÖşŞüÜ]/g, (ch) => TR_MAP[ch] ?? ch);
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  if (s.length > 80) s = s.slice(0, 80).replace(/-+[^-]*$/, "");
  return s;
}

export function slugifyOem(oem: string | null | undefined): string {
  if (!oem) return "";
  let s = String(oem).toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  return s;
}

export function extractPartUuid(idParam: string | null | undefined): string | null {
  if (!idParam) return null;
  const m = UUID_RE.exec(idParam);
  return m ? m[1].toLowerCase() : null;
}

export function isBareUuid(idParam: string): boolean {
  return UUID_FULL_RE.test(idParam);
}

interface PartSlugInput {
  id: string;
  seo_slug?: string | null;
  title?: string | null;
  oem_code?: string | null;
  oem_codes?: string[] | null;
}

/**
 * Kanonik URL parametresi. SEO 3.1: tercih `seo_slug`, yoksa
 * (henüz backfill edilmemiş eski kayıtlar için) OEM+başlık+UUID fallback.
 */
/**
 * Canonical URL parameter. SEO 4.0: URL asla UUID içermez.
 * - Tercih: seo_slug (tüm approved kayıtlar için DB trigger tarafından üretilir).
 * - Fallback: OEM + başlık slug'ı (yalnızca seo_slug boşsa; UUID EKLENMEZ).
 *   Resolver (getPartSeo) bu URL'yi seo_slug veya parts_slug_history üzerinden
 *   çözer; çözülmezse 404 verir — hiçbir koşulda UUID yayınlanmaz.
 */
export function buildPartParam(part: PartSlugInput): string {
  if (part.seo_slug && part.seo_slug.trim()) return part.seo_slug;
  const primaryOem =
    (Array.isArray(part.oem_codes) && part.oem_codes.find((c) => c && c.trim())) ||
    part.oem_code ||
    null;
  const oemSlug = slugifyOem(primaryOem);
  const titleSlug = slugify(part.title ?? "");
  const fallback = [oemSlug, titleSlug].filter(Boolean).join("-");
  // Son çare: kısa hash — yine UUID değil. Pratikte tetiklenmez (approved kayıtların hepsinde seo_slug var).
  return fallback || `ilan-${part.id.slice(0, 8)}`;
}
