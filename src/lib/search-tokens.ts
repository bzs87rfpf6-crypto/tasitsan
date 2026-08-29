/**
 * Arama sorgusunu `search_parts_family` RPC'sinin beklediği token dizisine çevirir.
 *
 * - Türkçe karakterler sadeleştirilir (search_doc zaten sadeleştirilmiş saklanıyor).
 * - Eş anlamlılar `a|b|c` biçiminde TEK token içinde OR olarak gönderilir;
 *   böylece AND semantiği bozulmadan "kavrama" = "debriyaj" eşleşir.
 * - Yazım hatası toleransı sunucu tarafındadır (fuzzy katmanı).
 * - Marka/model/OEM ayrıştırması yapılmaz; hepsi search_doc içinde aranır.
 */
import { foldTr } from "@/lib/part-query-analyzer";

/** Anlam taşımayan, sonucu daraltıp boş liste üreten kelimeler. */
const STOPWORDS = new Set([
  "icin", "ile", "ve", "adet", "takim", "takimi", "parca", "parcasi",
  "arac", "araba", "oto", "otomobil", "yedek", "fiyat", "fiyati", "satilik",
  "orjinal", "orijinal", "sifir", "ikinci", "el", "de", "da", "bir",
]);

/** Eş anlamlı grupları — herhangi bir üye diğerlerine genişler. */
const SYNONYMS: string[][] = [
  ["balata", "balatasi"],
  ["debriyaj", "kavrama"],
  ["amortisor", "suspansiyon"],
  ["enjektor", "injektor"],
  ["sanziman", "vites"],
  ["far", "fari"],
  ["stop", "lamba"],
  ["turbo", "turbosarj"],
  ["camurluk", "camurlugu"],
  ["rotil", "dodik"],
  ["devirdaim", "pompasi"],
  ["musur", "sensor"],
  ["rail", "rampa", "rampasi"],
  ["kaput", "kaputu"],
  ["radyator", "radyatoru"],
  ["tampon", "tamponu"],
  ["buji", "bujisi"],
  ["kaliper", "kaliperi"],
  ["salincak", "salincagi"],
  ["marc", "mars"],
];

const SYN_INDEX = (() => {
  const m = new Map<string, string[]>();
  for (const group of SYNONYMS) {
    for (const w of group) m.set(w, group);
  }
  return m;
})();

/**
 * Serbest metni token dizisine dönüştürür.
 * Örn. "Chrey ön balata" → ["chrey", "on", "balata|balatasi"]
 */
export function buildSearchTokens(raw: string): string[] {
  const folded = foldTr(String(raw ?? ""));
  if (!folded) return [];

  const words = folded
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of words) {
    const group = SYN_INDEX.get(w);
    const token = group ? Array.from(new Set([w, ...group])).join("|") : w;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  // Aşırı uzun sorgularda AND semantiği sonucu sıfırlar → ilk 8 anlamlı kelime.
  return out.slice(0, 8);
}
