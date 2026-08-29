// AI intent extraction. Kullanıcı serbest metnini yapılandırılmış aramaya çevirir.
// AI başarısız olursa (402/429/500) HEURİSTİK fallback devreye girer — sistem hiç durmaz.
import { getAiProvider } from "./provider.server";
import { heuristicIntent } from "./intent-fallback";

const CATEGORIES = [
  "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
] as const;

const POSITIONS = ["on", "arka", "ust", "alt", ""] as const;
const SIDES = ["sag", "sol", ""] as const;

const SYSTEM = `Sen Taşıtsan'ın parça arama analizörüsün. Kullanıcının serbest metnini alıp yapılandırılmış aramaya çevirirsin.
KATI KURALLAR:
- Sadece kullanıcının yazdığından çıkarım yap.
- OEM UYDURMA. Sadece metinde geçen OEM'leri veya o araç+parça için o üreticinin format standardına uygun 1-3 aday üret. Emin değilsen boş bırak.
- Yazım hatalarını düzelt (hilux vs hiluks, toyata vs toyota, sanziman vs şanzıman).
- position: ön/arka/üst/alt bilgisi metinde geçmiyorsa boş bırak. side: sağ/sol bilgisi metinde geçmiyorsa boş bırak. Uydurma.
- Değerleri Türkçe aksansız yaz: "on","arka","ust","alt","sag","sol".
- Türkçe düşün. Emin olmadığın alanı boş bırak.`;

export interface Intent {
  brand: string;
  model: string;
  year: number;
  part_name: string;
  category: string;
  position: string;   // "on" | "arka" | "ust" | "alt" | ""
  side: string;       // "sag" | "sol" | ""
  candidate_oems: string[];
  keywords: string[];
  ai_notes: string;
  model_used?: string;
  duration_ms?: number;
  error?: string;
}

function normalizeOem(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normEnum<T extends readonly string[]>(v: string, allowed: T): string {
  const x = (v ?? "").toLowerCase().trim();
  return allowed.includes(x as T[number]) ? x : "";
}

export async function extractIntent(query: string): Promise<Intent> {
  const ai = getAiProvider();
  const res = await ai.toolCall<{
    brand: string; model: string; year: number; part_name: string;
    category: string; position: string; side: string;
    candidate_oems: string[]; keywords: string[]; ai_notes: string;
  }>({
    system: SYSTEM,
    user: query,
    tool: {
      name: "extract_intent",
      description: "Kullanıcı sorgusunu marka/model/yıl/parça/pozisyon/yön/OEM/anahtar kelime alanlarına ayır.",
      parameters: {
        type: "object",
        properties: {
          brand: { type: "string" },
          model: { type: "string" },
          year:  { type: "integer" },
          part_name: { type: "string" },
          category: { type: "string", enum: [...CATEGORIES] },
          position: { type: "string", enum: [...POSITIONS] },
          side:     { type: "string", enum: [...SIDES] },
          candidate_oems: { type: "array", items: { type: "string" } },
          keywords: { type: "array", items: { type: "string" } },
          ai_notes: { type: "string" },
        },
        required: ["brand","model","year","part_name","category","position","side","candidate_oems","keywords","ai_notes"],
        additionalProperties: false,
      },
    },
  });

  if (!res.ok || !res.args) {
    // AI down (402 kredi bitti / 429 rate limit / network) — heuristik intent kullan
    console.warn("[intent] AI failed, using heuristic fallback:", res.error);
    const h = heuristicIntent(query);
    return { ...h, model_used: res.model_used, duration_ms: res.duration_ms, error: res.error };
  }
  const a = res.args;
  return {
    brand: (a.brand ?? "").trim(),
    model: (a.model ?? "").trim(),
    year: Number.isFinite(a.year) ? a.year : 0,
    part_name: (a.part_name ?? "").trim(),
    category: a.category ?? "Diğer",
    position: normEnum(a.position ?? "", POSITIONS),
    side: normEnum(a.side ?? "", SIDES),
    candidate_oems: Array.from(new Set((a.candidate_oems ?? []).map(normalizeOem).filter((s) => s.length >= 3))),
    keywords: (a.keywords ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 6),
    ai_notes: a.ai_notes ?? "",
    model_used: res.model_used,
    duration_ms: res.duration_ms,
  };
}
