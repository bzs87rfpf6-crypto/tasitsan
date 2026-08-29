/**
 * Akıllı OEM fallback — sunucu tarafı çalışma mantığı.
 *
 * KRİTİK: Mevcut OnlineParça pipeline'ı (onlineparca-pipeline.server.ts),
 * parser'ı ve 30 dakikalık cache'i DEĞİŞTİRİLMEZ. Burada yalnızca doğrulanmış
 * bir OEM üretilip mevcut `lookupExternalOemServer` akışına teslim edilir.
 */
import { analyzePartQuery, categoryLabel, foldTr, positionLabel } from "@/lib/part-query-analyzer";
import { normalizeOem } from "@/lib/oem-normalize";
import { researchOEMs, type OemResearchItem } from "@/lib/oem-research.server";
import { learnOems, lookupOemDictionary } from "@/lib/oem-learning.server";
import type { SmartOemPublicResult, SmartOemResponse } from "@/lib/smart-oem.functions";

/** Özellik bayrağı — varsayılan KAPALI. Açmak için SMART_OEM_RESEARCH_ENABLED=true. */
export function smartOemEnabled(): boolean {
  return String(process.env["SMART_OEM_RESEARCH_ENABLED"] ?? "").toLowerCase() === "true";
}

const OPPOSITE: Record<string, string[]> = {
  front: ["arka", "rear"],
  rear: ["on ", " on", "front"],
  left: ["sag", "right"],
  right: ["sol", "left"],
};

/** Dönen ürün adı, kullanıcının aradığı parça/konumla uyuşuyor mu? */
export function verifyProductMatch(
  title: string,
  partCategory: string | null,
  position: string | null,
): boolean {
  const t = ` ${foldTr(title)} `;
  const cat = categoryLabel(partCategory);
  if (cat) {
    // En ayırt edici kelime (son kelime) kök haline getirilir: "balatasi" → "balata".
    const words = cat.split(" ");
    const stem = (words[words.length - 1] ?? cat).replace(/(si|i|u|su)$/u, "");
    if (stem.length >= 3 && !t.includes(stem)) return false;
  }
  if (position) {
    const pos = positionLabel(position);
    const hasPos = pos ? t.includes(` ${pos}`) : false;
    const hasOpposite = (OPPOSITE[position] ?? []).some((o) => t.includes(o.trim()));
    if (hasOpposite && !hasPos) return false;
  }
  return true;
}

export async function runSmartOemSearch(rawQuery: string): Promise<SmartOemResponse> {
  if (!smartOemEnabled()) return { enabled: false, result: null, message: null };

  const analysis = analyzePartQuery(rawQuery);

  const log = {
    raw_query: rawQuery,
    normalized_query: analysis.normalizedQuery,
    brand: analysis.brand,
    model: analysis.model,
    part_category: analysis.partCategory,
    position: analysis.position,
    oem_research_attempted: false,
    oem_found: null as string | null,
    oem_source: "none" as "none" | "dictionary" | "research",
    online_supplier_queried: false,
    result_count: 0,
  };

  // Marka veya kategori çıkarılamadıysa araştırma başlatma (uydurma riski).
  if (!analysis.brand || !analysis.partCategory) {
    console.info("[smart-oem]", JSON.stringify(log));
    return { enabled: true, result: null, message: null };
  }

  // 1) Kalıcı OEM sözlüğü (oem_reference) — bulunursa AI araştırması YAPILMAZ.
  let candidates = await lookupOemDictionary(analysis);
  const fromDictionary = candidates.length > 0;

  // 2) Sözlükte yoksa araştır. Yalnızca ORİJİNAL OE olarak doğrulanan adaylar kullanılır.
  if (!fromDictionary) {
    log.oem_research_attempted = true;
    const researched = await researchOEMs(analysis);
    const verified = researched.filter((c) => c.verifiedOriginalOe === true);
    if (verified.length) await learnOems(analysis, verified);
    candidates = verified;
  }


  if (candidates.length === 0) {
    console.info("[smart-oem]", JSON.stringify(log));
    return { enabled: true, result: null, message: null };
  }

  log.oem_source = fromDictionary ? "dictionary" : "research";

  const { lookupExternalOemServer } = await import("@/lib/external-oem.server");
  const tried = new Set<string>();

  for (const cand of candidates.slice(0, 3)) {
    const key = normalizeOem(cand.oem);
    if (!key || tried.has(key)) continue;
    tried.add(key);
    log.oem_found = cand.oem;
    log.online_supplier_queried = true;

    const { result } = await lookupExternalOemServer(cand.oem);
    if (!result) continue;

    // Ürün adı doğrulaması — yanlış konum/kategori sonucu gösterilmez.
    if (!verifyProductMatch(result.title, analysis.partCategory, analysis.position)) continue;

    log.result_count = 1;
    console.info("[smart-oem]", JSON.stringify(log));

    const publicResult: SmartOemPublicResult = {
      title: result.title,
      brand: result.brand,
      oem: result.oem,
      price: result.price,
      photo: result.photo,
      stock_status: result.stock_status,
      stock_quantity: result.stock_quantity,
      availability_label: result.stock_status === "IN_STOCK" ? "Uygun ürün bulundu" : "Tedarik edilebilir",
    };
    return { enabled: true, result: publicResult, message: "Uygun ürün bulundu" };
  }

  console.info("[smart-oem]", JSON.stringify(log));
  return { enabled: true, result: null, message: null };
}
