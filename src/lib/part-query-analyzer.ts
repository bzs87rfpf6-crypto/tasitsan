/**
 * Doğal dil parça sorgusu analizörü (saf fonksiyon — client & server güvenli).
 *
 * "Chrey ön balata" →
 *  { brand: "Chery", model: null, partCategory: "brake_pad", position: "front",
 *    normalizedQuery: "chery on fren balatasi" }
 *
 * KURAL: Model uydurulmaz, OEM üretilmez. Sadece metinden çıkarım yapılır.
 */

export interface PartQueryAnalysis {
  originalQuery: string;
  normalizedQuery: string;
  brand: string | null;
  model: string | null;
  partCategory: string | null;
  position: string | null;
}

/** Fuzzy marka düzeltmesinde kullanılan marka listesi. */
export const KNOWN_BRANDS: string[] = [
  "Toyota", "Ford", "Renault", "Volkswagen", "Fiat", "Mercedes-Benz", "BMW", "Audi",
  "Peugeot", "Opel", "Hyundai", "Kia", "Honda", "Nissan", "Mazda", "Citroen", "Dacia",
  "Skoda", "Seat", "Chevrolet", "Mitsubishi", "Suzuki", "Isuzu", "Iveco", "MAN",
  "Scania", "DAF", "Volvo", "Porsche", "Jaguar", "Land Rover", "Mini", "Alfa Romeo",
  "Lancia", "Lexus", "Infiniti", "Subaru", "Jeep", "Chrysler", "Dodge", "Cadillac",
  "Tesla", "Smart", "SsangYong", "Daewoo", "Daihatsu", "Genesis", "Cupra", "BYD",
  "Chery", "Geely", "Great Wall", "Haval", "MG", "Tofaş",
];

const BRAND_ALIASES: Record<string, string> = {
  vw: "Volkswagen",
  mercedes: "Mercedes-Benz",
  mercedesbenz: "Mercedes-Benz",
  benz: "Mercedes-Benz",
  tofas: "Tofaş",
  cheri: "Chery",
  cherry: "Chery",
  landrover: "Land Rover",
  alfaromeo: "Alfa Romeo",
  greatwall: "Great Wall",
};

/** Türkçe karakterleri sadeleştirip küçük harfe indirger. */
export function foldTr(input: string): string {
  const map: Record<string, string> = {
    ı: "i", İ: "i", I: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g",
    ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c", â: "a", î: "i", û: "u",
  };
  return String(input ?? "")
    .replace(/[ıİIşŞğĞüÜöÖçÇâîû]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9\s.\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Damerau-Levenshtein (yer değiştirme = 1 maliyet) — "chrey" ↔ "chery" için gerekli. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i]![0] = i;
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
    }
  }
  return d[m]![n]!;
}

/** Parça kategorileri — kanonik anahtar + Türkçe etiket + eş anlamlılar. */
const CATEGORIES: Array<{ key: string; label: string; terms: string[] }> = [
  { key: "brake_pad", label: "fren balatasi", terms: ["balata", "fren balatasi", "balatasi", "brake pad", "disk balata"] },
  { key: "brake_disc", label: "fren diski", terms: ["fren diski", "disk", "diski", "brake disc", "ayna"] },
  { key: "brake_caliper", label: "fren kaliperi", terms: ["kaliper", "kaliperi", "caliper"] },
  {
    key: "brake_booster",
    label: "fren servosu",
    terms: [
      "westinghouse",
      "fren servosu",
      "servo fren",
      "fren servo",
      "fren yardimcisi",
      "fren yardimci",
      "brake booster",
      "booster",
    ],
  },
  { key: "brake_master", label: "fren ana merkezi", terms: ["fren ana merkezi", "ana merkez", "master silindir"] },
  { key: "shock_absorber", label: "amortisor", terms: ["amortisor", "amortisoru", "shock"] },
  { key: "ball_joint", label: "rotil", terms: ["rotil", "rotili", "dodik", "ball joint"] },
  { key: "tie_rod", label: "rot basi", terms: ["rot basi", "rot", "rotbasi", "tie rod"] },
  { key: "control_arm", label: "salincak", terms: ["salincak", "salincagi", "control arm"] },
  { key: "oil_filter", label: "yag filtresi", terms: ["yag filtresi", "yagfiltre", "oil filter"] },
  { key: "air_filter", label: "hava filtresi", terms: ["hava filtresi", "air filter"] },
  { key: "fuel_filter", label: "yakit filtresi", terms: ["yakit filtresi", "mazot filtresi", "fuel filter"] },
  { key: "cabin_filter", label: "polen filtresi", terms: ["polen filtresi", "kabin filtresi", "cabin filter"] },
  { key: "spark_plug", label: "buji", terms: ["buji", "bujisi", "spark plug"] },
  { key: "timing_belt", label: "triger kayisi", terms: ["triger", "triger kayisi", "eksantrik kayisi"] },
  { key: "water_pump", label: "devirdaim", terms: ["devirdaim", "su pompasi", "water pump"] },
  { key: "clutch", label: "debriyaj", terms: ["debriyaj", "baski balata", "clutch"] },
  { key: "headlight", label: "far", terms: ["far", "fari", "headlight"] },
  { key: "tail_light", label: "stop lambasi", terms: ["stop", "stop lambasi", "tail light"] },
  { key: "mirror", label: "ayna", terms: ["dikiz aynasi", "kapi aynasi", "mirror"] },
  { key: "bumper", label: "tampon", terms: ["tampon", "tamponu", "bumper"] },
  { key: "fender", label: "camurluk", terms: ["camurluk", "camurlugu", "fender"] },
  { key: "radiator", label: "radyator", terms: ["radyator", "radyatoru", "radiator"] },
  { key: "alternator", label: "alternator", terms: ["alternator", "sarj dinamosu"] },
  { key: "starter", label: "mars motoru", terms: ["mars motoru", "marj motoru", "starter"] },
  { key: "wheel_bearing", label: "teker rulmani", terms: ["rulman", "poyra", "wheel bearing"] },
  { key: "stabilizer_link", label: "viraj demiri rotu", terms: ["z rot", "viraj rotu", "stabilizator rotu"] },
];

const POSITIONS: Array<{ key: string; label: string; terms: string[] }> = [
  { key: "front", label: "on", terms: ["on", "one", "onu", "front"] },
  { key: "rear", label: "arka", terms: ["arka", "arkasi", "rear"] },
  { key: "left", label: "sol", terms: ["sol", "solu", "left"] },
  { key: "right", label: "sag", terms: ["sag", "sagi", "right"] },
];

/**
 * Kategori + konum sözlüklerindeki TÜM kelimeler (tekil, sadeleştirilmiş).
 * Araç/model adayı çıkarımında "parça kelimesi mi?" testi için kullanılır;
 * böylece kategori sözlüğü büyüdükçe rerank otomatik güncel kalır.
 */
export const PART_TERM_WORDS: string[] = Array.from(
  new Set(
    [...CATEGORIES.flatMap((c) => c.terms), ...POSITIONS.flatMap((p) => p.terms)]
      .flatMap((t) => foldTr(t).split(" "))
      .filter((w) => w.length >= 2),
  ),
);

export function categoryLabel(key: string | null): string | null {
  return CATEGORIES.find((c) => c.key === key)?.label ?? null;
}

export function positionLabel(key: string | null): string | null {
  return POSITIONS.find((p) => p.key === key)?.label ?? null;
}

function matchBrand(tokens: string[]): { brand: string | null; index: number; length: number } {
  const folded = KNOWN_BRANDS.map((b) => ({ brand: b, key: foldTr(b) }));

  // 1) İki kelimelik marka (Land Rover, Alfa Romeo, Great Wall)
  for (let i = 0; i < tokens.length - 1; i++) {
    const pair = `${tokens[i]} ${tokens[i + 1]}`;
    const hit = folded.find((f) => f.key === pair);
    if (hit) return { brand: hit.brand, index: i, length: 2 };
  }

  // 2) Tam eşleşme / alias
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? "";
    if (t.length < 2) continue;
    const alias = BRAND_ALIASES[t.replace(/[^a-z0-9]/g, "")];
    if (alias) return { brand: alias, index: i, length: 1 };
    const exact = folded.find((f) => f.key.replace(/[^a-z0-9]/g, "") === t.replace(/[^a-z0-9]/g, ""));
    if (exact) return { brand: exact.brand, index: i, length: 1 };
  }

  // 3) Fuzzy (yazım hatası) — "chrey" → "chery"
  for (let i = 0; i < tokens.length; i++) {
    const t = (tokens[i] ?? "").replace(/[^a-z0-9]/g, "");
    if (t.length < 4) continue;
    let best: { brand: string; d: number } | null = null;
    for (const f of folded) {
      const key = f.key.replace(/[^a-z0-9]/g, "");
      if (Math.abs(key.length - t.length) > 2) continue;
      const d = editDistance(t, key);
      if (d <= (t.length >= 7 ? 2 : 1) && (!best || d < best.d)) best = { brand: f.brand, d };
    }
    if (best) return { brand: best.brand, index: i, length: 1 };
  }

  return { brand: null, index: -1, length: 0 };
}

/** Doğal dil sorgusunu marka / model / kategori / konum olarak çözümler. */
export function analyzePartQuery(query: string): PartQueryAnalysis {
  const originalQuery = String(query ?? "").trim();
  const folded = foldTr(originalQuery);
  const tokens = folded.split(" ").filter(Boolean);

  const { brand, index: brandIdx, length: brandLen } = matchBrand(tokens);

  // Kategori: en uzun eş anlamlı ifade kazanır.
  let partCategory: string | null = null;
  let categoryTerm = "";
  for (const c of CATEGORIES) {
    for (const term of c.terms) {
      if (term.length <= categoryTerm.length) continue;
      const re = new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
      if (re.test(folded)) {
        partCategory = c.key;
        categoryTerm = term;
      }
    }
  }

  let position: string | null = null;
  for (const p of POSITIONS) {
    if (p.terms.some((t) => new RegExp(`(^|\\s)${t}(\\s|$)`).test(folded))) {
      position = p.key;
      break;
    }
  }

  // Model: markadan hemen sonraki, kategori/konum olmayan kelimeler (uydurma yok).
  let model: string | null = null;
  if (brand && brandIdx >= 0) {
    const stop = new Set<string>([
      ...POSITIONS.flatMap((p) => p.terms),
      ...CATEGORIES.flatMap((c) => c.terms.flatMap((t) => t.split(" "))),
    ]);
    const rest: string[] = [];
    for (let i = brandIdx + brandLen; i < tokens.length; i++) {
      const t = tokens[i] ?? "";
      if (stop.has(t)) break;
      rest.push(t);
      if (rest.length >= 2) break;
    }
    if (rest.length) model = rest.join(" ");
  }

  const normalizedQuery = [
    brand ? foldTr(brand) : null,
    model,
    positionLabel(position),
    categoryLabel(partCategory),
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || folded;

  return { originalQuery, normalizedQuery, brand, model, partCategory, position };
}
