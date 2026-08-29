/**
 * KALICI OEM ÖĞRENME (sunucu tarafı).
 *
 * AI/web araştırmasından gelen ve confidence >= 0.80 olan OEM'ler mevcut
 * `oem_reference` sözlüğüne kalıcı olarak yazılır. Şema DEĞİŞTİRİLMEZ:
 * yalnızca mevcut kolonlar kullanılır; last_seen / occurrence bilgisi
 * `notes` alanında JSON olarak taşınır.
 *
 * confidence < 0.80 olan adaylar sözlüğe ASLA yazılmaz (yalnızca
 * `oem_research_results` denetim tablosunda kalır).
 */
import { normalizeOem } from "@/lib/oem-normalize";
import { MIN_OEM_CONFIDENCE, type OemResearchItem } from "@/lib/oem-research.server";
import { categoryLabel, positionLabel, type PartQueryAnalysis } from "@/lib/part-query-analyzer";

export const LEARNED_SOURCE = "ai_research";

interface LearnMeta {
  source_url?: string;
  source_name?: string;
  last_seen?: string;
  occurrences?: number;
  /** true ise bu OEM manuel/otomatik reddedilmiştir; asla kullanılmaz veya yeniden öğrenilmez. */
  rejected?: boolean;
  rejected_reason?: string;
  evidence_type?: string;
  source_count?: number;
  verified_original_oe?: boolean;
}

function parseMeta(notes: string | null | undefined): LearnMeta {
  if (!notes) return {};
  try {
    const v = JSON.parse(notes) as unknown;
    return v && typeof v === "object" ? (v as LearnMeta) : {};
  } catch {
    return {};
  }
}

/** Reddedilmiş kayıt mı? (verified=false + notes.rejected veya source='rejected') */
function isRejected(row: { source?: unknown; notes?: unknown; verified?: unknown }): boolean {
  if (String(row.source ?? "") === "rejected") return true;
  return parseMeta(row.notes as string | null).rejected === true;
}


/** "ön fren balatası" gibi normalize parça adı — sözlük eşleşmesinin anahtarı. */
export function referencePartName(analysis: PartQueryAnalysis): string | null {
  const cat = categoryLabel(analysis.partCategory);
  if (!cat) return null;
  const pos = positionLabel(analysis.position);
  return (pos ? `${pos} ${cat}` : cat).trim();
}

/**
 * Sözlükten arama: mevcut `oem_reference` kayıtları.
 * Bulunursa AI araştırması yapılmaz.
 */
export async function lookupOemDictionary(analysis: PartQueryAnalysis): Promise<OemResearchItem[]> {
  const partName = referencePartName(analysis);
  if (!analysis.brand || !partName) return [];

  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const catFirst = (categoryLabel(analysis.partCategory) ?? "").split(" ")[0] ?? "";

  const { data, error } = await sb
    .from("oem_reference")
    .select("id, oem, oem_raw, brand, model, part_name, source, confidence, notes")
    .ilike("brand", `%${analysis.brand}%`)
    .ilike("part_name", `%${catFirst}%`)
    .eq("verified", true)
    .gte("confidence", MIN_OEM_CONFIDENCE)
    .order("confidence", { ascending: false })
    .limit(10);

  if (error || !data?.length) return [];

  const wantPos = positionLabel(analysis.position);
  const rows = data.filter((r) => {
    // Reddedilmiş OEM'ler ASLA dictionary sonucu olarak kullanılmaz.
    if (isRejected(r)) return false;
    if (!wantPos) return true;
    const pn = String(r.part_name ?? "").toLocaleLowerCase("tr");
    // Konum belirtildiyse ters konumlu kayıtları ele.
    const other = wantPos === "ön" ? "arka" : wantPos === "arka" ? "ön" : null;
    if (other && pn.includes(other) && !pn.includes(wantPos)) return false;
    return true;
  });


  const out: OemResearchItem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const code = String(r.oem_raw ?? r.oem ?? "").trim();
    const key = normalizeOem(code);
    if (!key || key.length < 5 || seen.has(key)) continue;
    seen.add(key);
    const meta = parseMeta(r.notes as string | null);
    out.push({
      oem: code,
      confidence: Number(r.confidence ?? 1) || 1,
      sourceName: meta.source_name ?? String(r.source ?? "Taşıtsan OEM sözlüğü"),
      sourceUrl: meta.source_url ?? "https://www.tasitsan.com.tr/",
    });
    if (out.length >= 5) break;
  }

  // Sözlükten geldiği için son görülme sayacını güncelle (best-effort).
  if (out.length) void touchSeen(rows.map((r) => ({ id: String(r.id), notes: r.notes as string | null })));
  return out;
}

async function touchSeen(rows: { id: string; notes: string | null }[]): Promise<void> {
  try {
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    for (const r of rows) {
      const meta = parseMeta(r.notes);
      await sb
        .from("oem_reference")
        .update({
          notes: JSON.stringify({ ...meta, last_seen: now, occurrences: (Number(meta.occurrences) || 0) + 1 }),
          updated_at: now,
        })
        .eq("id", r.id);
    }
  } catch (e) {
    console.warn("[oem-learning] touch", e);
  }
}

/**
 * Araştırma sonucunu kalıcı sözlüğe yazar (upsert).
 *
 * SIKI KURAL: yalnızca `verifiedOriginalOe === true` olan adaylar aktif sözlüğe
 * yazılır. confidence >= 0.80 TEK BAŞINA yeterli DEĞİLDİR. Doğrulanmamış adaylar
 * yalnızca `oem_research_results` denetim tablosunda kalır.
 * Daha önce reddedilmiş (rejected) OEM'ler asla yeniden öğrenilmez.
 */
export async function learnOems(analysis: PartQueryAnalysis, items: OemResearchItem[]): Promise<number> {
  const partName = referencePartName(analysis);
  const good = items.filter(
    (i) =>
      i.verifiedOriginalOe === true &&
      i.evidenceType === "ORIGINAL_OE" &&
      Number(i.confidence) >= MIN_OEM_CONFIDENCE &&
      normalizeOem(i.oem).length >= 5,
  );
  if (!good.length || !analysis.brand || !partName) {
    console.info(
      "[oem-learning]",
      JSON.stringify({ brand: analysis.brand, part: partName, learned: 0, skipped: items.length }),
    );
    return 0;
  }

  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  let written = 0;
  let rejectedSkips = 0;

  for (const it of good) {
    const oem = normalizeOem(it.oem);
    try {
      // Bu OEM daha önce herhangi bir kayıtta reddedildiyse öğrenme.
      const { data: rejectedRows } = await sb
        .from("oem_reference")
        .select("id, source, notes, verified")
        .eq("oem", oem)
        .limit(20);
      if ((rejectedRows ?? []).some((r) => isRejected(r))) {
        rejectedSkips += 1;
        continue;
      }

      let q = sb
        .from("oem_reference")
        .select("id, confidence, notes")
        .eq("oem", oem)
        .ilike("brand", analysis.brand)
        .ilike("part_name", partName)
        .limit(1);
      q = analysis.model ? q.ilike("model", analysis.model) : q.is("model", null);
      const { data: existing } = await q.maybeSingle();

      if (existing) {
        const meta = parseMeta(existing.notes as string | null);
        await sb
          .from("oem_reference")
          .update({
            oem_raw: it.oem.trim().toUpperCase(),
            confidence: Math.max(Number(existing.confidence ?? 0), Number(it.confidence)),
            source: LEARNED_SOURCE,
            verified: true,
            notes: JSON.stringify({
              source_name: it.sourceName,
              source_url: it.sourceUrl,
              evidence_type: it.evidenceType,
              source_count: it.sourceCount,
              verified_original_oe: true,
              first_seen: meta.last_seen ?? now,
              last_seen: now,
              occurrences: (Number(meta.occurrences) || 0) + 1,
            }),
            updated_at: now,
          })
          .eq("id", existing.id);
      } else {
        await sb.from("oem_reference").insert({
          oem,
          oem_raw: it.oem.trim().toUpperCase(),
          brand: analysis.brand,
          model: analysis.model,
          category: analysis.partCategory,
          part_name: partName,
          source: LEARNED_SOURCE,
          confidence: Number(it.confidence),
          verified: true,
          notes: JSON.stringify({
            source_name: it.sourceName,
            source_url: it.sourceUrl,
            evidence_type: it.evidenceType,
            source_count: it.sourceCount,
            verified_original_oe: true,
            first_seen: now,
            last_seen: now,
            occurrences: 1,
          }),
        });
      }
      written += 1;
    } catch (e) {
      console.warn("[oem-learning] upsert", e);
    }
  }

  if (rejectedSkips) console.info("[oem-learning]", JSON.stringify({ rejected_skipped: rejectedSkips }));


  console.info(
    "[oem-learning]",
    JSON.stringify({ brand: analysis.brand, part: partName, learned: written, skipped: items.length - good.length }),
  );
  return written;
}
