// Search helpers: Turkish character folding, typo fixes, synonym expansion.

const TR_FOLD: Record<string, string> = {
  ş: "s", Ş: "s", ç: "c", Ç: "c", ğ: "g", Ğ: "g",
  ı: "i", İ: "i", ö: "o", Ö: "o", ü: "u", Ü: "u",
  â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
};

export function foldTr(s: string): string {
  return s.replace(/[şŞçÇğĞıİöÖüÜâÂîÎûÛ]/g, (ch) => TR_FOLD[ch] ?? ch);
}

export function normalize(s: string): string {
  return foldTr((s ?? "").toLocaleLowerCase("tr-TR")).trim();
}

// Common typo fixes (yazım hataları). Key is lowercased+folded.
const TYPO_FIX: Record<string, string> = {
  reyl: "rail",
  hiluks: "hilux",
  toyata: "toyota",
  toyotta: "toyota",
  enjektor: "enjektör",
  sanzıman: "şanzıman",
  sanziman: "şanzıman",
  turboşarj: "turbo",
  camurluk: "çamurluk",
};

// Synonym groups — any token matching one expands to all.
// Include BOTH Turkish and ASCII-folded forms so DB ilike can match either way.
const SYN_GROUPS: string[][] = [
  ["common rail", "rail", "yakıt rampası", "yakit rampasi", "yakıt rayı"],
  ["far", "ön far", "on far", "farı"],
  ["stop", "stop lambası", "stop lambasi", "arka lamba", "arka stop"],
  ["turbo", "turboşarj", "turbosarj", "turbo şarj"],
  ["kaput", "motor kaputu"],
  ["enjektör", "enjektor", "injektor"],
  ["şanzıman", "sanziman", "sanzıman", "vites kutusu"],
  ["yağ", "yag", "motor yağı", "motor yagi"],
  ["çamurluk", "camurluk"],
  ["aks kafası", "aks kafasi", "dış aks kafası", "dis aks kafasi"],
  ["balata", "fren balatası", "fren balatasi"],
  ["amortisör", "amortisor", "süspansiyon", "suspansiyon"],
  ["debriyaj", "kavrama"],
  ["müşür", "musur", "müşürü", "musuru", "sensör", "sensor"],
  ["hilux", "hiluks"],
  ["toyota", "toyata", "toyotta"],
];

const SYN_INDEX = (() => {
  const m = new Map<string, Set<string>>();
  for (const g of SYN_GROUPS) {
    const set = new Set(g);
    for (const w of g) {
      const k = normalize(w);
      if (!m.has(k)) m.set(k, new Set());
      for (const v of set) m.get(k)!.add(v);
    }
  }
  return m;
})();

/** Expand a free-text query into a small list of search variants. */
export function expandQuery(raw: string, max = 14): string[] {
  const base = raw.trim();
  if (!base) return [];
  const out = new Set<string>();
  const norm = normalize(base);

  // typo fix on whole phrase
  const fixedPhrase = norm
    .split(/\s+/)
    .map((t) => TYPO_FIX[t] ?? t)
    .join(" ");

  out.add(base);
  out.add(norm);
  out.add(fixedPhrase);

  // synonyms on whole phrase
  const phraseSyns = SYN_INDEX.get(norm) ?? SYN_INDEX.get(fixedPhrase);
  if (phraseSyns) for (const s of phraseSyns) out.add(s);

  // token-level expansion
  for (const tok of fixedPhrase.split(/\s+/).filter(Boolean)) {
    out.add(tok);
    const syns = SYN_INDEX.get(tok);
    if (syns) for (const s of syns) out.add(s);
  }

  // sanitize for postgrest .or() — drop reserved chars
  const safe = Array.from(out)
    .map((v) => v.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim())
    .filter((v) => v.length >= 2);

  return Array.from(new Set(safe)).slice(0, max);
}

/** Build PostgREST .or() expression matching the variants across text columns. */
export function buildOrExpression(variants: string[], fields: string[]): string {
  const parts: string[] = [];
  for (const v of variants) {
    const esc = v.replace(/[%]/g, "");
    for (const f of fields) parts.push(`${f}.ilike.%${esc}%`);
  }
  return parts.join(",");
}

/**
 * Build one .or() expression per query token (AND-of-OR semantics):
 * every token must match in at least one of the given fields.
 * Each token is expanded with synonyms + typo fix.
 */
export function buildTokenOrExpressions(rawQuery: string, fields: string[]): string[] {
  const norm = normalize(rawQuery);
  if (!norm) return [];
  const tokens = norm
    .split(/\s+/)
    .map((t) => TYPO_FIX[t] ?? t)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];
  const exprs: string[] = [];
  for (const tok of tokens) {
    const variants = new Set<string>([tok]);
    const syns = SYN_INDEX.get(tok);
    if (syns) for (const s of syns) variants.add(s);
    const safe = Array.from(variants)
      .map((v) => v.replace(/[,()%]/g, " ").replace(/\s+/g, " ").trim())
      .filter((v) => v.length >= 2);
    if (safe.length === 0) continue;
    const parts: string[] = [];
    for (const v of safe) for (const f of fields) parts.push(`${f}.ilike.%${v}%`);
    exprs.push(parts.join(","));
  }
  return exprs;
}

/** Local match for client-side suggestions (accent + case insensitive). */
export function localMatch(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack || !needle) return false;
  return normalize(haystack).includes(normalize(needle));
}

/** Relevance score: how well a part matches a free-text query. Higher = more relevant. */
export function scorePart(
  part: { title?: string | null; brand?: string | null; model?: string | null; oem_code?: string | null },
  rawQuery: string,
): number {
  const q = normalize(rawQuery);
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;

  const title = normalize(part.title ?? "");
  const brand = normalize(part.brand ?? "");
  const model = normalize(part.model ?? "");
  const oem = normalize(part.oem_code ?? "");

  let score = 0;
  // Whole phrase exact substring in title = huge boost
  if (title.includes(q)) score += 200;
  if (oem && oem === q.toUpperCase().replace(/\s+/g, "")) score += 500;

  let titleHits = 0;
  for (const t of tokens) {
    if (title.includes(t)) { score += 30; titleHits += 1; }
    if (brand.includes(t)) score += 10;
    if (model.includes(t)) score += 10;
    if (oem.includes(t.toUpperCase())) score += 20;
  }
  // All tokens present in title = strong relevance signal
  if (titleHits === tokens.length) score += 100;
  return score;
}

