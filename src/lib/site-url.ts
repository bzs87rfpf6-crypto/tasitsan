// Tek merkezî URL/indeksleme politikası.
//
// Google Search Console'daki "Yönlendirmeli sayfa", "Kopya — Google farklı bir
// standart sayfa seçti" ve sitemap kaynaklı hataların kök nedeni, canonical +
// sitemap URL'lerinin www'suz host ile üretilmesiydi. Canlı sunucu
// https://www.tasitsan.com.tr/* adreslerini 302 ile https://www.tasitsan.com.tr/*
// adresine yönlendiriyor; yani her canonical ve her sitemap URL'si bir 3xx idi.
//
// Bundan sonra TÜM canonical, og:url, JSON-LD ve sitemap URL'leri buradan
// üretilir. Başka hiçbir dosyada host sabiti tanımlanmamalıdır.

export const SITE_ORIGIN = "https://www.tasitsan.com.tr";

/** Yalnızca host farkı olan eski/alternatif originler (301 hedefi kontrolü için). */
export const ALTERNATE_ORIGINS = [
  "https://www.tasitsan.com.tr",
  "http://tasitsan.com.tr",
  "http://www.tasitsan.com.tr",
];

/** `/parts/x` → `https://www.tasitsan.com.tr/parts/x` (her zaman mutlak, query'siz). */
export function absoluteUrl(path: string): string {
  if (!path) return SITE_ORIGIN;
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  // Query ve fragment kanonik URL'de asla yer almaz.
  const noQuery = clean.split("#")[0]!.split("?")[0]!;
  return `${SITE_ORIGIN}${noQuery === "/" ? "" : noQuery.replace(/\/+$/, "")}`;
}

/** Ürün kanonik yolu — sitemap ve canonical bu tek fonksiyondan üretilir. */
export function partPath(seoSlug: string): string {
  return `/parts/${seoSlug}`;
}

export function partUrl(seoSlug: string): string {
  return absoluteUrl(partPath(seoSlug));
}

export const ROBOTS_INDEX = "index,follow,max-image-preview:large,max-snippet:-1";
export const ROBOTS_NOINDEX = "noindex,follow";

/**
 * Merkezî ürün indeksleme politikası.
 * Kural: onaylı (approved) ve kanonik slug'ı olan her gerçek ürün dizine girer.
 * Stok 0, fotoğrafsız veya satılmış olması indekslemeyi ENGELLEMEZ.
 */
export function isPartIndexable(part: {
  status?: string | null;
  seo_slug?: string | null;
}): boolean {
  return part.status === "approved" && !!(part.seo_slug && part.seo_slug.trim());
}

export function partRobots(part: { status?: string | null; seo_slug?: string | null }): string {
  return isPartIndexable(part) ? ROBOTS_INDEX : ROBOTS_NOINDEX;
}
