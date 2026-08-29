/**
 * AKILLI OEM ARAŞTIRMASI (sunucu tarafı).
 *
 * Amaç: OEM bilinmeden yapılan doğal dil aramalarında ("Chery ön balata"),
 * güvenilir kaynaklara dayalı OEM ADAYLARINI bulmak.
 *
 * KATI KURALLAR
 *  - OEM UYDURULMAZ. AI yalnızca kaynak (isim + URL) gösterebildiği adayları döndürebilir.
 *  - confidence < 0.80 olan adaylar elenir.
 *  - Sonuç kesin değilse boş dizi döner.
 *  - Mevcut OnlineParça pipeline'ı, cache'i ve parser'ı DEĞİŞTİRİLMEZ; bu servis
 *    yalnızca doğrulanmış OEM'i o pipeline'a teslim eder.
 */
import { normalizeOem } from "@/lib/oem-normalize";
import type { PartQueryAnalysis } from "@/lib/part-query-analyzer";
import { categoryLabel, positionLabel } from "@/lib/part-query-analyzer";

export interface OemResearchItem {
  oem: string;
  confidence: number;
  sourceName: string;
  sourceUrl: string;
  /** Kanıt türü: yalnızca "oe_original" aktif sözlüğe öğrenilebilir. */
  evidenceType?:
    | "ORIGINAL_OE"
    | "AFTERMARKET_PART_NUMBER"
    | "SELLER_SKU"
    | "STOCK_CODE"
    | "CROSS_REFERENCE"
    | "UNKNOWN";
  /** Kaynak güven puanı (0-100): resmi katalog > güvenilir katalog > satıcı. */
  sourceScore?: number;
  /** Kodu destekleyen bağımsız (farklı alan adı) kaynak sayısı. */
  sourceCount?: number;
  /** Orijinal OE numarası olarak doğrulandı mı? (sözlüğe yazma koşulu) */
  verifiedOriginalOe?: boolean;
}


export const MIN_OEM_CONFIDENCE = 0.8;
const CACHE_TTL_DAYS = 30;
/** Sonuçsuz araştırmalar kısa süre cache'lenir (kalıcı kilitlenmeyi önler). */
const EMPTY_CACHE_TTL_DAYS = 1;

/** Aynı normalize sorgu için eşzamanlı araştırma tekrarını engeller (request dedup). */
const inflight = new Map<string, Promise<OemResearchItem[]>>();

/** Kaynak URL'i gerçek bir web kaynağı mı? (uydurma/boş kaynaklar elenir) */
function isPlausibleSource(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (!u.hostname.includes(".")) return false;
    if (/example\.(com|org)$/i.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** OEM formatı: 5-20 karakter, en az 4 rakam, yalnızca harf/rakam/-/. */
function isPlausibleOem(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (c.length < 5 || c.length > 20) return false;
  if (!/^[A-Z0-9][A-Z0-9\-./ ]*$/.test(c)) return false;
  return (c.match(/\d/g) ?? []).length >= 4;
}

function dedupe(items: OemResearchItem[]): OemResearchItem[] {
  const seen = new Map<string, OemResearchItem>();
  for (const it of items) {
    const key = normalizeOem(it.oem);
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev || it.confidence > prev.confidence) seen.set(key, { ...it, oem: it.oem.trim().toUpperCase() });
  }
  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

const SYSTEM_PROMPT = `Sen otomotiv OEM parça numarası araştırmacısısın.
Görevin: verilen araç ve parça tanımı için GERÇEKTEN BİLİNEN OEM numaralarını listelemek.

MUTLAK KURALLAR:
- OEM numarası UYDURMA. Emin olmadığın hiçbir kodu yazma.
- Her OEM için gerçek, bilinen bir kaynak (katalog/üretici/yedek parça veritabanı) adı ve URL'i ver.
- Kaynağını gösteremediğin OEM'i listeleme.
- Kod formatı o üreticinin gerçek formatına uymalı.
- Hiç emin olamadığın durumda boş liste döndür. Boş liste yanlış cevaptan İYİDİR.
- confidence: 0-1 arası gerçekçi güven. Tahmin/analoji ile üretilen kodlara 0.5'in altında ver.`;

async function askAi(analysis: PartQueryAnalysis): Promise<OemResearchItem[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return [];

  const userMsg = [
    `Araç markası: ${analysis.brand ?? "bilinmiyor"}`,
    `Model: ${analysis.model ?? "bilinmiyor"}`,
    `Parça: ${categoryLabel(analysis.partCategory) ?? analysis.originalQuery}`,
    `Konum: ${positionLabel(analysis.position) ?? "belirtilmemiş"}`,
    `Kullanıcı sorgusu: ${analysis.originalQuery}`,
  ].join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_oems",
            description: "Kaynağı gösterilebilen OEM adaylarını döndür.",
            parameters: {
              type: "object",
              properties: {
                oems: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      oem: { type: "string" },
                      confidence: { type: "number" },
                      source_name: { type: "string" },
                      source_url: { type: "string" },
                    },
                    required: ["oem", "confidence", "source_name", "source_url"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["oems"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "report_oems" } },
    }),
  });

  if (!res.ok) {
    console.warn("[oem-research] gateway", res.status);
    return [];
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];

  try {
    const parsed = JSON.parse(args) as {
      oems?: Array<{ oem?: string; confidence?: number; source_name?: string; source_url?: string }>;
    };
    const items: OemResearchItem[] = [];
    for (const raw of parsed.oems ?? []) {
      const oem = String(raw.oem ?? "").trim().toUpperCase();
      const url = String(raw.source_url ?? "").trim();
      const conf = Number(raw.confidence);
      if (!isPlausibleOem(oem)) continue;
      if (!isPlausibleSource(url)) continue;
      if (!Number.isFinite(conf) || conf < MIN_OEM_CONFIDENCE) continue;
      items.push({
        oem,
        confidence: Math.min(1, conf),
        sourceName: String(raw.source_name ?? "").trim().slice(0, 120) || new URL(url).hostname,
        sourceUrl: url.slice(0, 500),
      });
    }
    return dedupe(items);
  } catch (e) {
    console.warn("[oem-research] parse", e);
    return [];
  }
}

/**
 * Doğal dil analizinden doğrulanmış OEM adaylarını döndürür.
 * Sıra: cache → AI araştırması → cache yazımı + admin denetim kaydı.
 */
export async function researchOEMs(analysis: PartQueryAnalysis): Promise<OemResearchItem[]> {
  const key = analysis.normalizedQuery.trim().toLowerCase();
  if (!key) return [];

  const running = inflight.get(key);
  if (running) return running;

  const task = (async (): Promise<OemResearchItem[]> => {
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");

    // 1) Cache
    const { data: cached } = await sb
      .from("smart_oem_research_cache")
      .select("oem_results, expires_at")
      .eq("normalized_query", key)
      .maybeSingle();
    if (cached && new Date(cached.expires_at as string).getTime() > Date.now()) {
      const rows = (cached.oem_results ?? []) as unknown as OemResearchItem[];
      console.info("[oem-research]", JSON.stringify({ key, cache: "HIT", count: rows.length }));
      return Array.isArray(rows) ? rows : [];
    }

    // 2) Gerçek web araştırması (Firecrawl) → yoksa saf AI araştırması
    let items: OemResearchItem[] = [];
    try {
      const { researchOEMsFromWeb } = await import("@/lib/web-oem-research.server");
      items = await researchOEMsFromWeb(analysis);
    } catch (e) {
      console.warn("[oem-research] web failed", e);
    }
    if (!items.length) {
      try {
        items = await askAi(analysis);
      } catch (e) {
        console.warn("[oem-research] failed", e);
        items = [];
      }
    }
    items = dedupe(items);


    // 3) Cache yaz (boş sonuç kısa süreli cache'lenir → tekrar araştırma sınırlanır ama kilitlenmez)
    const ttlDays = items.length ? CACHE_TTL_DAYS : EMPTY_CACHE_TTL_DAYS;
    const expires = new Date(Date.now() + ttlDays * 864e5).toISOString();
    try {
      await sb.from("smart_oem_research_cache").upsert(
        {
          normalized_query: key,
          brand: analysis.brand,
          model: analysis.model,
          part_category: analysis.partCategory,
          position: analysis.position,
          oem_results: JSON.parse(JSON.stringify(items)),
          expires_at: expires,
        },
        { onConflict: "normalized_query" },
      );
    } catch (e) {
      console.warn("[oem-research] cache write", e);
    }

    // 4) Admin denetim kaydı (gerçek kaynak yalnızca burada saklanır)
    if (items.length) {
      try {
        await sb.from("oem_research_results").insert(
          items.map((i) => ({
            query: analysis.originalQuery.slice(0, 300),
            brand: analysis.brand,
            model: analysis.model,
            part_category: analysis.partCategory,
            position: analysis.position,
            oem_code: i.oem,
            normalized_oem: normalizeOem(i.oem),
            source_name: i.sourceName,
            source_url: i.sourceUrl,
            confidence: i.confidence,
            verification_status: i.verifiedOriginalOe ? "verified_original_oe" : "pending",
          })),
        );
      } catch (e) {
        console.warn("[oem-research] audit write", e);
      }
    }

    console.info("[oem-research]", JSON.stringify({ key, cache: "MISS", count: items.length }));
    return items;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
