import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CATEGORIES = [
  "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
] as const;

const SYSTEM_PROMPT = `Sen kıdemli bir otomotiv yedek parça uzmanısın. Türkçe yanıt ver.
Kullanıcı sana bir OEM kodu, parça açıklaması veya parça görseli verecek. Görevin parçayı kapsamlı şekilde araştırıp tanımlamaktır.

Yapacakların:
1) Parça adını net olarak belirle (Türkçe).
2) Verilen veya görselden tahmin edilen OEM kodunu doğrula/yaz.
3) Bilinen muadil (eşdeğer, cross-reference) OEM kodlarını listele — yan sanayi (BOSCH, VALEO, MAHLE, FEBI, MEYLE, NGK, DELPHI, vs.) dahil.
4) Bu parçanın uyumlu olduğu araç marka ve modellerini, mümkünse yıl aralıklarıyla listele.
5) Parça kategorisini seç.
6) Parçanın işlevini, sık arızalarını ve teknik özelliklerini 2-4 cümlede açıkla.
7) Arama için 3-8 anahtar kelime üret.

Kurallar:
- OEM kodlarını BÜYÜK harfle, boşluksuz yaz.
- Emin olmadığın bilgileri uydurma; bilmiyorsan boş bırak.
- candidate_oems: doğrudan uyumlu orijinal OEM'ler (1-8).
- equivalent_oems: yan sanayi / eşdeğer OEM kodları (1-15).
- compatible_vehicles: "Marka Model (yıl aralığı)" formatında 1-15 satır.`;

const ResultSchema = {
  type: "object",
  properties: {
    part_name: { type: "string" },
    category: { type: "string", enum: [...CATEGORIES] },
    primary_oem: { type: "string" },
    candidate_oems: { type: "array", items: { type: "string" } },
    equivalent_oems: { type: "array", items: { type: "string" } },
    compatible_vehicles: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
  },
  required: [
    "part_name", "category", "primary_oem", "candidate_oems", "equivalent_oems",
    "compatible_vehicles", "keywords", "description", "confidence",
  ],
  additionalProperties: false,
} as const;

function cacheKeyFor(query: string): string {
  return query.trim().toUpperCase().replace(/\s+/g, " ").slice(0, 200);
}

export type ResearchResult = {
  part_name: string;
  category: string;
  primary_oem: string;
  candidate_oems: string[];
  equivalent_oems: string[];
  compatible_vehicles: string[];
  keywords: string[];
  description: string;
  confidence: number;
};


/**
 * Fast path: check the persistent research cache.
 * Returns null when no cached entry exists; AI is not invoked here.
 */
export const lookupCachedResearch = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string().trim().min(2).max(400) }))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const key = cacheKeyFor(data.query);
      const { data: row, error } = await supabaseAdmin.rpc("get_oem_research", { _key: key });
      if (error) {
        console.error("lookupCachedResearch rpc error", error);
        return { ok: true as const, hit: false as const };
      }
      if (!row) return { ok: true as const, hit: false as const };
      return { ok: true as const, hit: true as const, result: row as ResearchResult };
    } catch (e) {
      console.error("lookupCachedResearch failed", e);
      return { ok: true as const, hit: false as const };
    }
  });

/**
 * Slow path: ask the AI gateway, then persist the result to the cache for next time.
 * Image queries skip the cache (no stable key).
 */
export const researchPart = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      query: z.string().trim().max(400).optional(),
      imageDataUrl: z
        .string()
        .startsWith("data:image/")
        .max(8 * 1024 * 1024)
        .optional(),
    }).refine((d) => (d.query && d.query.length >= 2) || d.imageDataUrl, {
      message: "OEM/metin ya da görsel gerekli.",
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI servisi yapılandırılmamış." };

    const userParts: Array<Record<string, unknown>> = [];
    if (data.imageDataUrl) {
      userParts.push({
        type: "text",
        text: data.query
          ? `Bu görseldeki parçayı detaylıca araştır. Ek bilgi: "${data.query}"`
          : "Bu görseldeki otomotiv parçasını detaylıca araştır ve tanımla.",
      });
      userParts.push({ type: "image_url", image_url: { url: data.imageDataUrl } });
    } else {
      userParts.push({
        type: "text",
        text: `Şu sorguyu detaylıca araştır: "${data.query}". OEM kodu olabilir, parça adı olabilir veya araç+parça tarifi olabilir.`,
      });
    }

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userParts },
          ],
          tools: [{
            type: "function",
            function: { name: "report_research", description: "Parça araştırma sonucu.", parameters: ResultSchema },
          }],
          tool_choice: { type: "function", function: { name: "report_research" } },
        }),
      });

      if (res.status === 429) return { ok: false as const, error: "Çok fazla istek. Biraz sonra deneyin." };
      if (res.status === 402) return { ok: false as const, error: "AI kredisi tükendi." };
      if (!res.ok) {
        console.error("researchPart error", res.status, await res.text());
        return { ok: false as const, error: "Araştırma yapılamadı." };
      }

      const payload = await res.json();
      const argsStr = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!argsStr) return { ok: false as const, error: "Sonuç çözümlenemedi." };

      const parsed = JSON.parse(argsStr) as {
        part_name: string; category: string; primary_oem: string;
        candidate_oems: string[]; equivalent_oems: string[];
        compatible_vehicles: string[]; keywords: string[];
        description: string; confidence: number;
      };

      const norm = (s: string) => s.toUpperCase().replace(/\s+/g, "").trim();
      parsed.primary_oem = parsed.primary_oem ? norm(parsed.primary_oem) : "";
      parsed.candidate_oems = Array.from(new Set((parsed.candidate_oems ?? []).map(norm).filter(Boolean)));
      parsed.equivalent_oems = Array.from(new Set((parsed.equivalent_oems ?? []).map(norm).filter(Boolean)));

      // Persist to cache for next time (text queries only — images have no stable key).
      if (data.query && parsed.confidence >= 40) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const key = cacheKeyFor(data.query);
          await supabaseAdmin.rpc("save_oem_research", {
            _key: key,
            _query: data.query,
            _result: parsed,
          });
          // Also save under the primary OEM as a key so different phrasings hit the same cache.
          if (parsed.primary_oem && parsed.primary_oem !== key) {
            await supabaseAdmin.rpc("save_oem_research", {
              _key: parsed.primary_oem,
              _query: data.query,
              _result: parsed,
            });
          }
        } catch (e) {
          console.error("cache save failed", e);
        }
      }

      return { ok: true as const, result: parsed };
    } catch (e) {
      console.error("researchPart failed", e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Bilinmeyen hata" };
    }
  });
