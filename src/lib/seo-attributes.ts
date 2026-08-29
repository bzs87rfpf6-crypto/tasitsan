// Attribute normalizer for SEO enrichment.
// Turns raw `parts` row into a canonical, filterable attribute bag used by
// Product JSON-LD, internal linking, and scoring.

export interface RawPartRow {
  id: string;
  title: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  category?: string | null;
  oem_code?: string | null;
  oem_codes?: string[] | null;
  oem_families?: string[] | null;
  oem_family?: string | null;
  engine_code?: string | null;
  part_type?: string | null;
  vehicle_class?: string | null;
  city?: string | null;
  photos?: string[] | null;
  condition?: string | null;
}

export interface NormalizedAttributes {
  oem_primary: string | null;
  oem_all: string[];
  oem_families: string[];
  brand: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  engine: string | null;
  body_type: string | null;
  fuel: string | null;
  transmission: string | null;
  category: string | null;
  part_type: string | null;
  vehicle_class: string | null;
  city: string | null;
  condition: string | null;
}

const BODY_HINTS: Array<[RegExp, string]> = [
  [/sedan/i, "sedan"],
  [/hatchback|hb/i, "hatchback"],
  [/su[vw]|crossover/i, "suv"],
  [/pickup|kamyonet/i, "pickup"],
  [/kamyon|truck/i, "truck"],
  [/otob[uü]s|bus/i, "bus"],
  [/traktör|tractor/i, "tractor"],
  [/i[şs] makinesi|excavator|loader/i, "construction"],
];

const FUEL_HINTS: Array<[RegExp, string]> = [
  [/dizel|diesel|hdi|tdi|crdi|dci|jtd/i, "diesel"],
  [/benzin|petrol|tsi|fsi|tfsi/i, "petrol"],
  [/lpg/i, "lpg"],
  [/hibrit|hybrid/i, "hybrid"],
  [/elektrik|electric|ev/i, "electric"],
];

const TX_HINTS: Array<[RegExp, string]> = [
  [/otomatik|automatic|dsg|tiptronic|s-tronic/i, "automatic"],
  [/manuel|manual/i, "manual"],
  [/cvt/i, "cvt"],
];

function pickHint(hay: string, table: Array<[RegExp, string]>): string | null {
  for (const [re, val] of table) if (re.test(hay)) return val;
  return null;
}

const norm = (s: string | null | undefined): string | null => {
  if (!s) return null;
  const t = String(s).trim();
  return t.length === 0 ? null : t;
};

export function normalizeAttributes(p: RawPartRow): NormalizedAttributes {
  const oemAll = Array.from(
    new Set(
      [
        ...(p.oem_codes ?? []),
        p.oem_code ?? null,
      ]
        .filter(Boolean)
        .map((x) => String(x).toUpperCase().replace(/\s+/g, "")),
    ),
  );
  const families = Array.from(
    new Set(
      [...(p.oem_families ?? []), p.oem_family ?? null]
        .filter(Boolean)
        .map((x) => String(x).toUpperCase()),
    ),
  );
  const hay = [p.title, p.description, p.category, p.part_type, p.vehicle_class, p.engine_code]
    .filter(Boolean)
    .join(" ");
  return {
    oem_primary: oemAll[0] ?? null,
    oem_all: oemAll,
    oem_families: families,
    brand: norm(p.brand),
    make: norm(p.brand),
    model: norm(p.model),
    year: p.year ?? null,
    engine: norm(p.engine_code),
    body_type: pickHint(hay, BODY_HINTS),
    fuel: pickHint(hay, FUEL_HINTS),
    transmission: pickHint(hay, TX_HINTS),
    category: norm(p.category),
    part_type: norm(p.part_type),
    vehicle_class: norm(p.vehicle_class),
    city: norm(p.city),
    condition: norm(p.condition),
  };
}

/** Alt text builder for each product photo — index-aware for uniqueness. */
export function buildAltTexts(p: RawPartRow, attrs: NormalizedAttributes): string[] {
  const photos = (p.photos ?? []).filter((u) => typeof u === "string" && u.length > 0);
  if (photos.length === 0) return [];
  const base = [
    attrs.oem_primary,
    p.title,
    [attrs.brand, attrs.model, attrs.year].filter(Boolean).join(" "),
    attrs.condition === "new" ? "sıfır" : attrs.condition === "used" ? "ikinci el" : null,
  ]
    .filter(Boolean)
    .join(" — ");
  return photos.map((_, i) => (photos.length === 1 ? base : `${base} · Foto ${i + 1}`));
}
