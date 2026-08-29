/**
 * OEM Parça Kataloğu — parça adı normalizasyonu, token üretimi ve kolon otomatik eşleştirme.
 * Saf fonksiyonlar (client & server güvenli). DB tarafındaki public.catalog_normalize_name
 * ile aynı çıktıyı üretmek zorundadır.
 */

const TR_MAP: Record<string, string> = {
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
  ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u",
  Â: "a", Î: "i", Û: "u", â: "a", î: "i", û: "u",
};

/** "ÖN FREN DİSK BALATASI" → "on fren disk balatasi" */
export function normalizeCatalogName(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[ÇĞİIÖŞÜçğıiöşüÂÎÛâîû]/g, (c) => TR_MAP[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** OEM normalize — sadece arama/karşılaştırma için; gerçek OEM değeri korunur. */
export function normalizeCatalogOem(raw: string | null | undefined): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

/** Türkçe iyelik/çoğul eklerini basitçe kırpar: "balatasi" → "balata", "diskleri" → "disk". */
export function stemTr(word: string): string {
  let w = word;
  for (const suf of ["larindan", "lerinden", "larinin", "lerinin", "lari", "leri", "lar", "ler", "sinin", "nin", "nun", "si", "su", "si", "yi", "yu", "in", "un", "i", "u"]) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) {
      w = w.slice(0, w.length - suf.length);
      break;
    }
  }
  return w;
}

const STOPWORDS = new Set(["icin", "ile", "ve", "adet", "no", "oem", "parca", "parcasi", "orjinal", "orijinal"]);

/** Eş anlamlı genişletme — arama tokenlarına eklenir. */
const SYNONYMS: Record<string, string[]> = {
  balata: ["balata", "fren"],
  disk: ["disk"],
  amortisor: ["amortisor"],
  rotil: ["rotil"],
  filtre: ["filtre"],
  yag: ["yag"],
  far: ["far"],
  on: ["on"],
  arka: ["arka"],
  triger: ["triger", "eksantrik"],
  debriyaj: ["debriyaj", "baski"],
  devirdaim: ["devirdaim", "su", "pompa"],
};

/**
 * Arama ifadesini eşleştirme tokenlarına çevirir.
 * "hilux ön fren balatası" → ["hilux","on","fren","balata"]
 */
export function buildSearchTokens(query: string): string[] {
  const out = new Set<string>();
  for (const raw of normalizeCatalogName(query).split(" ")) {
    if (!raw || raw.length < 2 || STOPWORDS.has(raw)) continue;
    const stem = stemTr(raw);
    if (stem.length >= 2) out.add(stem);
    for (const syn of SYNONYMS[stem] ?? []) out.add(syn);
  }
  return Array.from(out);
}

/* ------------------------------------------------------------------ */
/* Excel/CSV kolon otomatik eşleştirme                                  */
/* ------------------------------------------------------------------ */

export type CatalogField =
  | "part_name"
  | "oem_no"
  | "brand"
  | "vehicle_model"
  | "vehicle_year"
  | "alternative_oems";

export const CATALOG_FIELD_LABEL: Record<CatalogField, string> = {
  part_name: "Parça Adı",
  oem_no: "OEM No",
  brand: "Marka",
  vehicle_model: "Araç / Model",
  vehicle_year: "Yıl",
  alternative_oems: "Alternatif OEM",
};

const FIELD_HINTS: Record<CatalogField, string[]> = {
  part_name: ["parca adi", "parcaadi", "urun adi", "urun", "parca", "malzeme adi", "aciklama", "part name", "product name", "description", "name", "title"],
  oem_no: ["oem no", "oem", "oem kodu", "oem numarasi", "orijinal no", "orjinal no", "parca no", "parca kodu", "kod", "part no", "part number", "reference", "ref"],
  brand: ["marka", "brand", "uretici", "make", "manufacturer"],
  vehicle_model: ["model", "arac", "arac model", "vehicle", "tip", "car"],
  vehicle_year: ["yil", "model yili", "year", "sene"],
  alternative_oems: ["alternatif oem", "alternatif", "muadil", "capraz", "cross", "alternative", "alt oem", "esdeger"],
};

/** Başlık satırından alan → kolon indeksi eşlemesi üretir. */
export function autoDetectColumns(headers: string[]): Partial<Record<CatalogField, number>> {
  const norm = headers.map((h) => normalizeCatalogName(h));
  const used = new Set<number>();
  const map: Partial<Record<CatalogField, number>> = {};

  const pick = (field: CatalogField, test: (h: string, hint: string) => boolean) => {
    if (map[field] !== undefined) return;
    for (const hint of FIELD_HINTS[field]) {
      for (let i = 0; i < norm.length; i++) {
        if (used.has(i)) continue;
        const h = norm[i] ?? "";
        if (!h) continue;
        if (test(h, hint)) {
          map[field] = i;
          used.add(i);
          return;
        }
      }
    }
  };

  const fields = Object.keys(FIELD_HINTS) as CatalogField[];
  // 1) tam eşleşme, 2) içerme
  for (const f of fields) pick(f, (h, hint) => h === hint);
  for (const f of fields) pick(f, (h, hint) => h.includes(hint));
  return map;
}

/** "1234, 5678; 9012" → ["1234","5678","9012"] */
export function splitAlternativeOems(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/[,;|/\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && s.length <= 60);
}
