/**
 * OEM Katalog sonuçlarının anlamsal yeniden sıralaması (saf fonksiyon — client & server güvenli).
 *
 * Amaç: "hilux ön fren balatası" aramasında "ÖN AMORTİSÖR" gibi farklı parça
 * kategorilerinin, "i30 westinghouse" aramasında ise Toyota gibi farklı
 * araçların OEM listesine sızmasını engellemek.
 *
 * Kural:
 *  - Parça kategorisi uyuşmuyorsa kayıt asla ANA sonuç olamaz (çoğu zaman elenir).
 *  - Sorguda araç/model geçiyorsa, araç uyuşmayan kayıt ANA sonuç olamaz.
 *  - Marka çakışması (Hyundai sorgusu ↔ Toyota kaydı) kaydı tamamen eler.
 *  - Konum (ön/arka), motor (dizel/benzin) ve yıl uyumu skoru güçlendirir.
 *  - OEM listesi yalnızca ANA eşleşmelerden üretilir.
 */
import { analyzePartQuery, foldTr, KNOWN_BRANDS, PART_TERM_WORDS } from "@/lib/part-query-analyzer";

export interface RerankInput {
  part_name: string;
  brand?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: string | null;
  score?: number | null;
}

export interface RerankScored<T> {
  row: T;
  finalScore: number;
  categoryMatch: boolean;
  positionMatch: boolean;
  vehicleMatch: boolean;
  /** true → ana sonuç eşiğini geçemediği halde "hiç sonuç yok" durumunda terfi etti. */
  promoted?: boolean;
}

/** Ana (yüksek güvenli) eşleşme eşiği — OEM zincirine yalnız bunu geçenler girer. */
export const CATALOG_PRIMARY_MIN = 0.45;

export interface RerankResult<T> {
  primary: RerankScored<T>[];
  secondary: RerankScored<T>[];
}

/** Aynı aileye ait, birbirine yakın sayılabilecek kategoriler. */
const RELATED: Record<string, string[]> = {
  brake_pad: ["brake_disc"],
  brake_disc: ["brake_pad"],
  tie_rod: ["ball_joint", "stabilizer_link"],
  ball_joint: ["tie_rod", "stabilizer_link"],
  stabilizer_link: ["tie_rod", "ball_joint"],
  brake_booster: ["brake_master"],
  brake_master: ["brake_booster"],
};

/** Aynı platformu paylaşan / birbirinin muadili model adları. */
const MODEL_ALIASES: string[][] = [
  ["i30", "ceed", "cee'd", "ceed"],
  ["elantra", "cerato", "forte"],
  ["ix35", "tucson", "sportage"],
  ["accent", "rio"],
];

const PRIMARY_MIN = CATALOG_PRIMARY_MIN;
const KEEP_MIN = 0.2;

const GENERIC = new Set([
  "on", "one", "onu", "arka", "arkasi", "sol", "solu", "sag", "sagi",
  "takim", "seti", "set", "adet", "icin", "arac", "oto", "parca", "parcasi",
  "orjinal", "orijinal", "muadil", "yan", "sanayi", "komple", "komplesi",
  "dizel", "benzinli", "benzin", "lpg", "hibrit", "otomatik", "manuel",
]);

const FUEL_TERMS: Record<string, string[]> = {
  diesel: ["dizel", "diesel", "crdi", "hdi", "tdi", "dci", "jtd", "d4d"],
  petrol: ["benzin", "benzinli", "petrol", "tsi", "vvt", "gdi"],
};

// Analizördeki kategori/konum sözlüğü + burada tutulan ek varyantlar.
// Sözlük büyüdükçe otomatik güncel kalması için PART_TERM_WORDS ile birleştirilir.
const CATEGORY_WORDS = new Set<string>([
  ...PART_TERM_WORDS,
  "fren", "balata", "balatasi", "disk", "diski", "amortisor", "amortisoru",
  "kaliper", "kaliperi", "servo", "servosu", "yardimcisi", "yardimci",
  "westinghouse", "booster", "merkez", "merkezi", "silindir",
  "rotil", "rot", "basi", "salincak", "salincagi", "filtre", "filtresi",
  "yag", "hava", "yakit", "mazot", "polen", "kabin", "buji", "bujisi",
  "triger", "kayisi", "devirdaim", "pompasi", "debriyaj", "baski", "far",
  "fari", "stop", "lambasi", "ayna", "aynasi", "tampon", "tamponu",
  "camurluk", "camurlugu", "radyator", "radyatoru", "alternator", "mars",
  "motoru", "rulman", "poyra", "viraj", "rotu", "stabilizator", "dodik",
  "kaput", "kaputu", "kapi", "kapisi", "cam", "cami", "aks", "aksi", "sanziman",
  "enjektor", "turbo", "kasnak", "kasnagi", "conta", "contasi", "kollektor",
  "brake", "pad", "filter", "disc", "shock", "bumper", "arm", "joint", "rod",
]);

const BRAND_KEYS = KNOWN_BRANDS.map((b) => foldTr(b));

function isYearToken(t: string): boolean {
  return /^\d{2,4}(-\d{2,4})?$/.test(t) || /^\d{4}$/.test(t);
}

/** Sorgudaki araç/model adaylarını çıkarır (kategori/konum/motor/yıl kelimeleri hariç). */
function vehicleTokens(query: string): string[] {
  return foldTr(query)
    .split(/[\s/]+/)
    .filter(Boolean)
    .filter((t) => t.length >= 2)
    .filter((t) => !GENERIC.has(t))
    .filter((t) => !CATEGORY_WORDS.has(t))
    .filter((t) => !isYearToken(t))
    .filter((t) => !/^\d+$/.test(t));
}

function expandAliases(tokens: string[]): Set<string> {
  const out = new Set(tokens);
  for (const group of MODEL_ALIASES) {
    if (tokens.some((t) => group.includes(t))) group.forEach((g) => out.add(g));
  }
  return out;
}

function queryBrands(tokens: string[]): string[] {
  return tokens.filter((t) => BRAND_KEYS.includes(t));
}

function fuelOf(text: string): string | null {
  for (const [key, terms] of Object.entries(FUEL_TERMS)) {
    if (terms.some((t) => new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(text))) return key;
  }
  return null;
}

/** "12-18", "2012-2018" → [2012, 2018] */
function yearRange(text: string): [number, number] | null {
  const m = text.match(/(\d{2,4})\s*[-/]\s*(\d{2,4})/);
  if (!m) return null;
  const norm = (s: string) => (s.length <= 2 ? 2000 + Number(s) : Number(s));
  const a = norm(m[1]!);
  const b = norm(m[2]!);
  if (a < 1950 || b < 1950 || a > 2100 || b > 2100) return null;
  return a <= b ? [a, b] : [b, a];
}

function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

export function rerankCatalogMatches<T extends RerankInput>(query: string, rows: T[]): RerankResult<T> {
  const q = analyzePartQuery(query);
  const qTokensRaw = vehicleTokens(query);
  const qBrands = queryBrands(qTokensRaw);
  const vTokens = [...expandAliases(qTokensRaw)];
  const qFuel = fuelOf(foldTr(query));
  const qYears = yearRange(foldTr(query));

  const scored: RerankScored<T>[] = [];

  for (const row of rows) {
    const base = Math.max(0, Math.min(1, Number(row.score ?? 0)));
    const r = analyzePartQuery(row.part_name ?? "");

    const rowCat = r.partCategory;
    const qCat = q.partCategory;

    let categoryMatch = true;
    let catPenalty = 0;
    if (qCat) {
      if (rowCat === qCat) {
        catPenalty = -0.15; // bonus
      } else if (rowCat && (RELATED[qCat] ?? []).includes(rowCat)) {
        categoryMatch = false;
        catPenalty = 0.25;
      } else if (rowCat) {
        categoryMatch = false;
        catPenalty = 0.85; // farklı parça türü → pratikte elenir
      } else {
        categoryMatch = false;
        catPenalty = 0.3; // kategori çözümlenemedi
      }
    }

    let positionMatch = true;
    let posPenalty = 0;
    if (q.position && r.position) {
      if (q.position === r.position) posPenalty = -0.1;
      else {
        positionMatch = false;
        posPenalty = 0.3;
      }
    }

    const rowText = foldTr(`${row.brand ?? ""} ${row.vehicle_model ?? ""} ${row.part_name ?? ""}`);
    const rowTokens = rowText.split(/[\s/]+/).filter(Boolean);
    const rowBrandKey = foldTr(row.brand ?? "");

    // --- ARAÇ / MODEL DUYARLILIĞI -------------------------------------------
    const vehicleMatch =
      vTokens.length > 0 &&
      vTokens.some((t) => rowTokens.includes(t) || (t.length >= 4 && rowText.includes(t)));

    // Marka çakışması: sorguda marka var, kayıt farklı bir markaya ait → ele.
    const rowBrands = rowTokens.filter((t) => BRAND_KEYS.includes(t));
    if (rowBrandKey && BRAND_KEYS.includes(rowBrandKey)) rowBrands.push(rowBrandKey);
    const brandConflict =
      qBrands.length > 0 && rowBrands.length > 0 && !rowBrands.some((b) => qBrands.includes(b));

    let vehiclePenalty = 0;
    if (vTokens.length > 0) {
      if (vehicleMatch) vehiclePenalty = -0.2;
      else if (brandConflict) vehiclePenalty = 1; // kesin ele
      else if (row.vehicle_model || rowBrands.length > 0)
        vehiclePenalty = 1; // kaydın aracı belli ve uyuşmuyor → alakasız, hiç gösterme
      else vehiclePenalty = 0.45; // araç bilgisi yok → yalnızca düşük güvenli
    }

    // --- MOTOR / YIL ---------------------------------------------------------
    const rowFuel = fuelOf(rowText);
    let fuelPenalty = 0;
    if (qFuel && rowFuel) fuelPenalty = qFuel === rowFuel ? -0.08 : 0.2;

    const rowYears = yearRange(foldTr(`${row.vehicle_year ?? ""} ${row.part_name ?? ""}`));
    let yearPenalty = 0;
    if (qYears && rowYears) yearPenalty = rangesOverlap(qYears, rowYears) ? -0.08 : 0.2;

    const finalScore = Math.max(
      0,
      Math.min(1, base - catPenalty - posPenalty - vehiclePenalty - fuelPenalty - yearPenalty),
    );

    scored.push({ row, finalScore, categoryMatch, positionMatch, vehicleMatch });
  }

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const vehicleAware = vTokens.length > 0;

  const primary: RerankScored<T>[] = [];
  const secondary: RerankScored<T>[] = [];
  for (const s of scored) {
    if (s.finalScore < KEEP_MIN) continue;
    const ok =
      s.categoryMatch && s.positionMatch && s.finalScore >= PRIMARY_MIN && (!vehicleAware || s.vehicleMatch);
    if (ok) primary.push(s);
    else secondary.push(s);
  }

  // Hiç ana sonuç yoksa, kategori (ve varsa araç) uyumlu en iyi ikincil kayıt terfi eder.
  if (primary.length === 0) {
    const idx = secondary.findIndex(
      (s) => s.categoryMatch && s.finalScore >= KEEP_MIN && (!vehicleAware || s.vehicleMatch),
    );
    if (idx >= 0) {
      const [p] = secondary.splice(idx, 1);
      if (p) primary.push({ ...p, promoted: p.finalScore < PRIMARY_MIN });
    }
  }

  return { primary, secondary };
}
