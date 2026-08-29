// Sıralı arama motoru (KURAL 2) — Faz 3: paralel katmanlar, grup etiketleri, davranış-tabanlı ranking.
// Sıra (mantıksal): parts (OEM) → oem_reference (KB) → vehicle compatibility → synonyms → fuzzy → semantic
// Katmanlar birbirinden bağımsız oldukları için PARALEL çağrılır. Skorlama sırayı korur.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalize, scorePart, buildTokenOrExpressions } from "@/lib/search";
import { lookupOemReferences, type OemReferenceHit } from "./oem-kb.server";
import { embedText } from "./embeddings.server";

export type ResultGroup = "exact_oem" | "oem_equivalent" | "compatible" | "semantic";

export interface RankedPart {
  id: string;
  seo_slug: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  oem_code: string | null;
  oem_codes: string[] | null;
  price: number | null;
  city: string | null;
  photos: string[] | null;
  condition: string | null;
  part_type: string | null;
  stock_quantity: number | null;
  seller_id: string | null;
  score: number;
  match_reasons: string[];
  group: ResultGroup;
}

export interface PipelineIntent {
  brand: string; model: string; category: string;
  part_name: string; candidate_oems: string[]; keywords: string[];
  position?: string; side?: string;
}

export interface PipelineResult {
  parts: RankedPart[];
  groups: Record<ResultGroup, RankedPart[]>;
  oem_references: OemReferenceHit[];
  similar_oems: string[];
  stage_reached: "oem_exact" | "oem_kb" | "vehicle" | "synonyms" | "fuzzy" | "semantic" | "none";
  stages_run: string[];
  duration_ms_by_stage: Record<string, number>;
}

interface SemanticHit extends RawPart { similarity: number }

const PART_COLS = "id, seo_slug, title, brand, model, year, category, oem_code, oem_codes, price, city, photos, condition, part_type, stock_quantity, seller_id";
type Sb = SupabaseClient<Database>;
type RawPart = Omit<RankedPart, "score" | "match_reasons" | "group">;

function normOem(s: string) { return s.toUpperCase().replace(/[^A-Z0-9]/g, ""); }

async function timed<T>(label: string, buckets: Record<string, number>, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try { return await fn(); } finally { buckets[label] = (buckets[label] ?? 0) + (Date.now() - t0); }
}

// ---------- Katman 1: parts tablosunda tam OEM ----------
async function stageOemExact(sb: Sb, oems: string[]): Promise<RawPart[]> {
  if (oems.length === 0) return [];
  const { data, error } = await sb
    .from("parts").select(PART_COLS)
    .eq("status", "approved").gt("stock_quantity", 0)
    .or(oems.flatMap((o) => [
      `oem_code.ilike.%${o}%`, `oem_codes.cs.{${o}}`, `oem_norm.cs.{${o}}`,
    ]).join(","))
    .limit(40);
  if (error) { console.warn("[pipeline] oem_exact", error.message); return []; }
  return (data ?? []) as RawPart[];
}

// ---------- Katman 3: vehicle compatibility ----------
async function stageVehicle(sb: Sb, brand: string, model: string, category: string): Promise<RawPart[]> {
  if (!brand && !model) return [];
  let q = sb.from("parts").select(PART_COLS).eq("status", "approved").gt("stock_quantity", 0);
  if (brand) q = q.ilike("brand", `%${brand}%`);
  if (model) q = q.ilike("model", `%${model}%`);
  if (category && category !== "Diğer") q = q.ilike("category", `%${category}%`);
  const { data, error } = await q.limit(30);
  if (error) { console.warn("[pipeline] vehicle", error.message); return []; }
  return (data ?? []) as RawPart[];
}

// ---------- Katman 4-5: TÜM tokenlar başlık/açıklama/marka/model içinde bulunmalı (AND-of-OR) ----------
async function stageKeywords(sb: Sb, rawQuery: string, partName: string): Promise<RawPart[]> {
  const q = (rawQuery ?? "").trim();
  if (!q) return [];
  const exprs = buildTokenOrExpressions(q, ["title", "description", "brand", "model", "category"]);
  if (exprs.length === 0) return [];
  let qb = sb.from("parts").select(PART_COLS).eq("status", "approved").gt("stock_quantity", 0);
  // Her token için ayrı .or() — birbirleriyle AND'lenir
  for (const e of exprs) qb = qb.or(e);
  // Parça adı belirtildiyse başlık/açıklamada zorunlu — alakasız (müşür/valf) elenir
  if (partName && partName.trim().length >= 2) {
    const nameExprs = buildTokenOrExpressions(partName, ["title", "description"]);
    for (const e of nameExprs) qb = qb.or(e);
  }
  const { data, error } = await qb.limit(40);
  if (error) { console.warn("[pipeline] keywords", error.message); return []; }
  return (data ?? []) as RawPart[];
}

// ---------- Katman 6: Semantic (pgvector) ----------
async function stageSemantic(sb: Sb, query: string): Promise<SemanticHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const emb = await embedText(q);
  if (!emb.ok || !emb.vector) {
    if (emb.error) console.warn("[pipeline] semantic embed", emb.error);
    return [];
  }
  const { data, error } = await sb.rpc("match_parts_semantic", {
    query_embedding: emb.vector as unknown as string,
    match_count: 20,
    min_similarity: 0.35,
  });
  if (error) { console.warn("[pipeline] semantic rpc", error.message); return []; }
  return ((data ?? []) as unknown as SemanticHit[]);
}

// ---------- Davranış tabanlı ranking sinyalleri ----------
async function fetchSellerScores(sb: Sb, sellerIds: string[]): Promise<Map<string, { score: number; response_hours: number | null }>> {
  const map = new Map<string, { score: number; response_hours: number | null }>();
  if (sellerIds.length === 0) return map;
  const { data, error } = await sb.from("seller_scores")
    .select("seller_id, trust_score, response_time_minutes")
    .in("seller_id", sellerIds);
  if (error) { console.warn("[pipeline] seller_scores", error.message); return map; }
  for (const r of (data ?? [])) {
    map.set(r.seller_id, {
      score: r.trust_score ?? 0,
      response_hours: r.response_time_minutes != null ? r.response_time_minutes / 60 : null,
    });
  }
  return map;
}

async function fetchViewCounts(sb: Sb, partIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (partIds.length === 0) return map;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb.from("part_views")
    .select("part_id")
    .in("part_id", partIds)
    .gte("viewed_at", since)
    .limit(5000);
  if (error) { console.warn("[pipeline] part_views", error.message); return map; }
  for (const r of (data ?? []) as Array<{ part_id: string }>) {
    map.set(r.part_id, (map.get(r.part_id) ?? 0) + 1);
  }
  return map;
}

// ---------- Grup atama ----------
function classify(reasons: string[]): ResultGroup {
  if (reasons.includes("OEM eşleşmesi")) return "exact_oem";
  if (reasons.includes("Benzer OEM") || reasons.includes("Kısmi OEM")) return "oem_equivalent";
  if (reasons.includes("Marka") || reasons.includes("Model") || reasons.includes("Kategori") || reasons.includes("Parça adı")) return "compatible";
  return "semantic";
}

// ---------- Skorlama ----------
function scoreAll(
  parts: RawPart[],
  intent: PipelineIntent,
  similarOems: Set<string>,
  rawQuery: string,
  semanticSim: Map<string, number> = new Map(),
  sellerBoost: Map<string, { score: number; response_hours: number | null }> = new Map(),
  viewBoost: Map<string, number> = new Map(),
): RankedPart[] {
  const seen = new Map<string, RankedPart>();
  const brandN = normalize(intent.brand);
  const modelN = normalize(intent.model);
  const catN   = normalize(intent.category);
  const partN  = normalize(intent.part_name);
  const wantPos = (intent.position ?? "").trim();
  const wantSide = (intent.side ?? "").trim();

  for (const p of parts) {
    let score = 0;
    const reasons: string[] = [];
    const pOems = new Set<string>([
      ...(p.oem_code ? [normOem(p.oem_code)] : []),
      ...((p.oem_codes ?? []).map(normOem)),
    ]);

    if (intent.candidate_oems.some((o) => pOems.has(o))) {
      score += 100; reasons.push("OEM eşleşmesi");
    } else if (intent.candidate_oems.some((o) => [...pOems].some((x) => x.includes(o) || o.includes(x)))) {
      score += 60; reasons.push("Kısmi OEM");
    }
    const titleN = normalize(p.title);
    // HARD FILTRE: parça adı varsa başlıkta o adın en az bir tokenı olmalı (OEM tam eşleşme hariç)
    if (partN) {
      const partTokens = partN.split(/\s+/).filter((t) => t.length >= 2);
      const anyPartHit = partTokens.some((t) => titleN.includes(t));
      // OEM tam eşleşme veya benzer OEM varsa yine kabul (aksi hâlde ele)
      const oemHit = intent.candidate_oems.some((o) => pOems.has(o)) ||
                     [...pOems].some((x) => similarOems.has(x));
      if (!anyPartHit && !oemHit) continue;
      if (partTokens.every((t) => titleN.includes(t))) { score += 80; reasons.push("Parça adı"); }
      else if (anyPartHit) { score += 40; reasons.push("Parça adı (kısmi)"); }
    } else if (titleN.includes(normalize(rawQuery))) { score += 60; reasons.push("Metin eşleşmesi"); }
    if (brandN && normalize(p.brand ?? "").includes(brandN)) { score += 30; reasons.push("Marka"); }
    if (modelN && normalize(p.model ?? "").includes(modelN)) { score += 30; reasons.push("Model"); }
    if (catN && normalize(p.category ?? "").includes(catN)) { score += 20; reasons.push("Kategori"); }
    if ([...pOems].some((x) => similarOems.has(x))) { score += 40; reasons.push("Benzer OEM"); }
    const fuzzy = scorePart(p, rawQuery);
    if (fuzzy > 0) { score += Math.min(fuzzy, 40); if (fuzzy >= 30) reasons.push("Metin eşleşmesi"); }
    const sim = semanticSim.get(p.id);
    if (sim !== undefined) {
      const bonus = Math.round(Math.max(0, sim - 0.35) / 0.65 * 70);
      if (bonus > 0) { score += bonus; reasons.push("Semantik"); }
    }

    // Position / side alignment (yumuşak filtre)
    if (wantPos) {
      const hasWanted = titleN.includes(wantPos);
      const opp = wantPos === "on" ? "arka" : wantPos === "arka" ? "on" : wantPos === "ust" ? "alt" : wantPos === "alt" ? "ust" : "";
      if (hasWanted) score += 25;
      else if (opp && titleN.includes(opp)) score -= 35;
    }
    if (wantSide) {
      const hasWanted = titleN.includes(wantSide);
      const opp = wantSide === "sag" ? "sol" : "sag";
      if (hasWanted) score += 25;
      else if (titleN.includes(opp)) score -= 35;
    }

    // Davranış sinyalleri
    if ((p.stock_quantity ?? 0) > 1) score += Math.min(10, (p.stock_quantity ?? 0));
    const sellerInfo = p.seller_id ? sellerBoost.get(p.seller_id) : undefined;
    if (sellerInfo) {
      score += Math.min(15, Math.round((sellerInfo.score ?? 0) / 10));
      if (sellerInfo.response_hours !== null && sellerInfo.response_hours < 6) score += 8;
    }
    const views = viewBoost.get(p.id) ?? 0;
    if (views > 0) score += Math.min(12, Math.round(Math.log2(1 + views) * 3));

    if (score <= 0) continue;

    const prev = seen.get(p.id);
    if (prev && prev.score >= score) continue;
    seen.set(p.id, { ...p, score, match_reasons: Array.from(new Set(reasons)), group: classify(reasons) });
  }
  return Array.from(seen.values()).sort((a, b) => b.score - a.score).slice(0, 24);
}

// ---------- Orkestra ----------
export async function runSearchPipeline(
  sb: Sb, intent: PipelineIntent, rawQuery: string,
): Promise<PipelineResult> {
  const stages_run: string[] = ["parts_oem", "oem_kb", "vehicle", "synonyms_fuzzy"];
  const duration_ms_by_stage: Record<string, number> = {};
  let stage_reached: PipelineResult["stage_reached"] = "none";

  // Paralel: OEM exact + KB + vehicle + keywords (AND-of-OR)
  const [oemExact, kb, vehicle, keywordHits] = await Promise.all([
    timed("parts_oem", duration_ms_by_stage, () => stageOemExact(sb, intent.candidate_oems)),
    timed("oem_kb", duration_ms_by_stage, () => lookupOemReferences(sb, intent.candidate_oems)),
    timed("vehicle", duration_ms_by_stage, () => stageVehicle(sb, intent.brand, intent.model, intent.category)),
    timed("synonyms_fuzzy", duration_ms_by_stage, () => stageKeywords(sb, rawQuery, intent.part_name)),
  ]);
  const { hits: oemHits, similar_oems } = kb;

  // KB'den gelen benzer OEM'lerle ikinci OEM taraması
  const oemFromKb = similar_oems.length > 0
    ? await timed("parts_oem_kb", duration_ms_by_stage, () => stageOemExact(sb, similar_oems))
    : [];

  const prelim = scoreAll([...oemExact, ...oemFromKb, ...vehicle, ...keywordHits], intent, new Set(similar_oems), rawQuery);

  // Semantic — güçlü sonuç yoksa devreye girer
  const strong = prelim.filter((r) => r.score >= 80).length;
  let semanticHits: SemanticHit[] = [];
  const semanticSim = new Map<string, number>();
  if (strong < 3 || prelim.length < 8) {
    stages_run.push("semantic");
    semanticHits = await timed("semantic", duration_ms_by_stage, () => stageSemantic(sb, rawQuery));
    for (const h of semanticHits) semanticSim.set(h.id, h.similarity);
  }

  const merged = [...oemExact, ...oemFromKb, ...vehicle, ...keywordHits, ...semanticHits];
  const uniqueIds = Array.from(new Set(merged.map((p) => p.id)));
  const uniqueSellerIds = Array.from(new Set(merged.map((p) => p.seller_id).filter((v): v is string => !!v)));

  // Davranış sinyallerini paralel çek
  const [sellerBoost, viewBoost] = await Promise.all([
    timed("seller_scores", duration_ms_by_stage, () => fetchSellerScores(sb, uniqueSellerIds)),
    timed("part_views", duration_ms_by_stage, () => fetchViewCounts(sb, uniqueIds)),
  ]);

  const scored = scoreAll(merged, intent, new Set(similar_oems), rawQuery, semanticSim, sellerBoost, viewBoost);

  // Gruplama
  const groups: Record<ResultGroup, RankedPart[]> = {
    exact_oem: [], oem_equivalent: [], compatible: [], semantic: [],
  };
  for (const p of scored) groups[p.group].push(p);

  if (scored.length > 0) {
    const top = scored[0];
    if (top.match_reasons.includes("OEM eşleşmesi")) stage_reached = "oem_exact";
    else if (top.match_reasons.includes("Benzer OEM")) stage_reached = "oem_kb";
    else if (top.match_reasons.includes("Marka") || top.match_reasons.includes("Model")) stage_reached = "vehicle";
    else if (top.match_reasons.includes("Parça adı")) stage_reached = "synonyms";
    else if (top.match_reasons.includes("Semantik")) stage_reached = "semantic";
    else stage_reached = "fuzzy";
  }

  return { parts: scored, groups, oem_references: oemHits, similar_oems, stage_reached, stages_run, duration_ms_by_stage };
}
