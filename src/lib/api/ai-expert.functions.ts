import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CATEGORIES = [
  "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
] as const;

const SYSTEM_PROMPT = `Sen otomotiv yedek parça uzmanısın. Kullanıcı doğal dilde araç ve parça tarifi yazar (ör. "2018 Toyota Corolla sağ ön far").
Görevin metinden marka, model, yıl ve parça adını çıkarmak, olası OEM kodlarını ve bu OEM'in bilinen eşdeğer (cross-reference) OEM kodlarını üretmektir.
- Türkçe yanıt ver.
- Marka/model/yıl/parça tespit edilemiyorsa boş bırak.
- OEM kodlarını BÜYÜK harf, boşluksuz yaz.
- Emin olmadığın OEM uydurma; sadece o üreticinin parça numarası formatına uygun gerçekçi adaylar üret.
- candidate_oems: o araç+parça için en olası 1-5 OEM. equivalent_oems: bu parçanın bilinen yan sanayi/eşdeğer cross-reference kodları (1-10).`;

export const interpretPartQuery = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      query: z.string().trim().min(3, "En az 3 karakter").max(300, "Çok uzun"),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI servisi yapılandırılmamış." };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: data.query },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_query",
                description: "Doğal dil parça aramasını yapılandırılmış bilgiye çevir.",
                parameters: {
                  type: "object",
                  properties: {
                    brand: { type: "string", description: "Araç markası (ör. Toyota). Yoksa boş string." },
                    model: { type: "string", description: "Araç modeli (ör. Corolla). Yoksa boş string." },
                    year: { type: "integer", description: "Model yılı. Bilinmiyorsa 0." },
                    part_name: { type: "string", description: "Parça adı (ör. 'sağ ön far'). Yoksa boş string." },
                    category: { type: "string", enum: [...CATEGORIES], description: "Parça kategorisi." },
                    confidence: { type: "integer", minimum: 0, maximum: 100 },
                    keywords: {
                      type: "array",
                      items: { type: "string" },
                      description: "Arama için 1-6 kısa anahtar kelime.",
                    },
                    candidate_oems: {
                      type: "array",
                      items: { type: "string" },
                      description: "Bu araç+parça için en olası OEM numaraları (BÜYÜK HARF, boşluksuz).",
                    },
                    equivalent_oems: {
                      type: "array",
                      items: { type: "string" },
                      description: "Eşdeğer / cross-reference OEM numaraları.",
                    },
                    notes: { type: "string", description: "Kısa açıklama (1 cümle)." },
                  },
                  required: [
                    "brand", "model", "year", "part_name", "category", "confidence",
                    "keywords", "candidate_oems", "equivalent_oems", "notes",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "report_query" } },
        }),
      });

      if (res.status === 429) return { ok: false as const, error: "Çok fazla istek. Lütfen biraz sonra tekrar deneyin." };
      if (res.status === 402) return { ok: false as const, error: "AI kredisi tükendi. Yöneticiye bildirin." };
      if (!res.ok) {
        const t = await res.text();
        console.error("AI expert error", res.status, t);
        return { ok: false as const, error: "Sorgu analiz edilemedi." };
      }

      const payload = await res.json();
      const argsStr = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!argsStr) return { ok: false as const, error: "Sonuç çözümlenemedi." };

      const parsed = JSON.parse(argsStr) as {
        brand: string; model: string; year: number; part_name: string;
        category: string; confidence: number; keywords: string[];
        candidate_oems: string[]; equivalent_oems: string[]; notes: string;
      };

      // normalize OEMs
      const norm = (s: string) => s.toUpperCase().replace(/\s+/g, "").trim();
      parsed.candidate_oems = Array.from(new Set((parsed.candidate_oems ?? []).map(norm).filter(Boolean)));
      parsed.equivalent_oems = Array.from(new Set((parsed.equivalent_oems ?? []).map(norm).filter(Boolean)));

      return { ok: true as const, result: parsed };
    } catch (e) {
      console.error("interpretPartQuery failed", e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Bilinmeyen hata" };
    }
  });
