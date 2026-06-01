import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CATEGORIES = [
  "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
] as const;

const SYSTEM_PROMPT = `Sen otomotiv yedek parça uzmanısın. Kullanıcının yüklediği fotoğrafı incele ve parçanın ne olduğunu tahmin et.
- Sadece otomotiv yedek parça analizine odaklan.
- Türkçe yanıt ver.
- Eğer fotoğrafta bir araç parçası göremiyorsan veya emin değilsen confidence'i 30'un altında ver.
- Anahtar kelimeler arama için kullanılacak: kısa, tek kelime tercih et (örn: "far", "balata", "amortisör").
- OEM kodu görselde okunabiliyorsa birebir yaz; okunmuyorsa parça tipine göre en olası OEM/üretici kodu formatında bir tahmin ver veya boş bırak.
- Marka/model uyumluluğu: parçanın muhtemelen takıldığı üretici markaları (örn: "Ford", "Renault") ve model adlarını (örn: "Transit", "Megane") listele. Emin değilsen boş dizi döndür.`;

export const analyzePartImage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      imageDataUrl: z
        .string()
        .startsWith("data:image/", "Geçersiz görsel formatı")
        .max(8 * 1024 * 1024, "Görsel çok büyük (max 6MB)"),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI servisi yapılandırılmamış." };
    }

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
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Bu fotoğraftaki otomotiv yedek parçayı analiz et. Parça adını, kategorisini, güven oranını ve arama için anahtar kelimeleri döndür.",
                },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_part",
                description: "Tespit edilen parça hakkında yapılandırılmış bilgi döndür.",
                parameters: {
                  type: "object",
                  properties: {
                    part_name: {
                      type: "string",
                      description: "Parçanın tahmini Türkçe adı (örn: 'Ön sol far').",
                    },
                    category: {
                      type: "string",
                      enum: [...CATEGORIES],
                      description: "Parçanın ait olduğu kategori.",
                    },
                    confidence: {
                      type: "integer",
                      minimum: 0,
                      maximum: 100,
                      description: "Tahminin güven yüzdesi.",
                    },
                    keywords: {
                      type: "array",
                      items: { type: "string" },
                      description: "Arama için kullanılacak 1-5 kısa anahtar kelime.",
                    },
                    description: {
                      type: "string",
                      description: "Parça hakkında 1-2 cümlelik kısa açıklama.",
                    },
                    oem_code_guess: {
                      type: "string",
                      description: "Görselden okunan veya tahmin edilen OEM kodu. Bilinmiyorsa boş string.",
                    },
                    brand_compatibility: {
                      type: "array",
                      items: { type: "string" },
                      description: "Parçanın muhtemelen uyumlu olduğu araç markaları.",
                    },
                    model_compatibility: {
                      type: "array",
                      items: { type: "string" },
                      description: "Parçanın muhtemelen uyumlu olduğu araç modelleri.",
                    },
                  },
                  required: [
                    "part_name", "category", "confidence", "keywords", "description",
                    "oem_code_guess", "brand_compatibility", "model_compatibility",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "report_part" } },
        }),
      });

      if (res.status === 429) return { ok: false as const, error: "Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin." };
      if (res.status === 402) return { ok: false as const, error: "AI kredisi tükendi. Yöneticiye bildirin." };
      if (!res.ok) {
        const t = await res.text();
        console.error("AI vision error", res.status, t);
        return { ok: false as const, error: "Görsel analiz edilemedi." };
      }

      const payload = await res.json();
      const toolCall = payload?.choices?.[0]?.message?.tool_calls?.[0];
      const argsStr = toolCall?.function?.arguments;
      if (!argsStr) return { ok: false as const, error: "Sonuç çözümlenemedi." };

      const parsed = JSON.parse(argsStr) as {
        part_name: string;
        category: string;
        confidence: number;
        keywords: string[];
        description: string;
        oem_code_guess: string;
        brand_compatibility: string[];
        model_compatibility: string[];
      };

      return { ok: true as const, result: parsed };
    } catch (e) {
      console.error("analyzePartImage failed", e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Bilinmeyen hata" };
    }
  });
