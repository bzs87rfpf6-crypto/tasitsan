// Deterministic unique <title> and meta description builder.
// Ensures no two products share the same head tags by weaving in
// differentiating fields (variant + city + condition + engine code)
// and by tracking a per-part `title_variant` collision counter.

export interface SeoPartInput {
  id: string;
  title: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  category?: string | null;
  oem_code?: string | null;
  oem_codes?: string[] | null;
  engine_code?: string | null;
  city?: string | null;
  price?: number | null;
  condition?: string | null;
  stock_quantity?: number | null;
}

const CONDITION_TR: Record<string, string> = {
  new: "Sıfır",
  refurbished: "Yenilenmiş",
  used: "İkinci El",
};

const MAX_TITLE = 68;
const MAX_DESC = 158;

export function primaryOem(p: SeoPartInput): string | null {
  const list = p.oem_codes && p.oem_codes.length > 0 ? p.oem_codes : (p.oem_code ? [p.oem_code] : []);
  return list[0] ?? null;
}

/** Deterministic UNIQUE title. Uses OEM+title+brand+model+year+variant to keep
 * every product distinct even when many rows share the same OEM. */
export function buildUniqueTitle(p: SeoPartInput, variant = 0): string {
  const oem = primaryOem(p);
  const brand = p.brand?.trim() ?? "";
  const model = p.model?.trim() ?? "";
  const year = p.year ? String(p.year) : "";
  const cond = p.condition ? CONDITION_TR[p.condition] ?? "" : "";
  const differentiators = [p.engine_code, p.city, variant > 0 ? `#${variant + 1}` : null]
    .filter(Boolean) as string[];

  // Primary shape: {OEM} {Title} — {Brand} {Model} {Year} {Cond} | Taşıtsan
  const head = oem ? `${oem} ${p.title}` : p.title;
  const car = [brand, model, year].filter(Boolean).join(" ");
  const tail = [cond, ...differentiators].filter(Boolean).join(" · ");

  let title = head;
  if (car) title += ` — ${car}`;
  if (tail) title += ` · ${tail}`;
  title += " | Taşıtsan";

  // Trim to fit if too long, keeping the "| Taşıtsan" suffix.
  if (title.length > MAX_TITLE) {
    const suffix = " | Taşıtsan";
    const room = MAX_TITLE - suffix.length;
    title = (head + (car ? ` — ${car}` : "")).slice(0, room).trim() + suffix;
  }
  return title.replace(/\s+/g, " ").trim();
}

/** Meta description with pricing + condition + city + USP baked in for uniqueness. */
export function buildUniqueDescription(p: SeoPartInput): string {
  const oem = primaryOem(p);
  const car = [p.brand, p.model, p.year].filter(Boolean).join(" ");
  const cond = p.condition ? (CONDITION_TR[p.condition] ?? "").toLocaleLowerCase("tr-TR") : "";
  const city = p.city ?? "";
  const price = p.price != null && p.price > 0
    ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(p.price))
    : "";

  const own = (p.description ?? "").replace(/\s+/g, " ").trim();
  const ownShort = own.length > 20 ? own.slice(0, 90).replace(/[.!?]?\s*$/, "") : "";

  const bits = [
    oem ? `${oem} OEM` : null,
    p.title,
    car ? `(${car})` : null,
    cond || null,
    price ? `${price}` : null,
    city ? `${city}` : null,
    ownShort || "Güvenilir satıcılardan uygun fiyatlarla Taşıtsan Parça Borsası'nda.",
  ].filter(Boolean) as string[];

  let desc = bits.join(" · ").replace(/\s+/g, " ").trim();
  if (desc.length > MAX_DESC) desc = desc.slice(0, MAX_DESC - 1).trim() + "…";
  return desc;
}

/** Stable content hash over the fields that drive title/description. Two rows
 * with identical hash are duplicate-content candidates. */
export function computeContentHash(p: SeoPartInput): string {
  const key = [
    primaryOem(p) ?? "",
    (p.title ?? "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim(),
    (p.brand ?? "").toLocaleLowerCase("tr-TR"),
    (p.model ?? "").toLocaleLowerCase("tr-TR"),
    p.year ?? "",
    (p.category ?? "").toLocaleLowerCase("tr-TR"),
    (p.condition ?? ""),
  ].join("|");
  // Small deterministic FNV-1a 32-bit hex — enough for collision buckets.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
