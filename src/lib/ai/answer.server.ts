// AI grounded answer generator.
// KURAL 1: AI SADECE DB'den gelen gerçek verileri yorumlar.
import { getAiProvider } from "./provider.server";

const SYSTEM = `Sen Taşıtsan Parça Asistanı'sın. Sana kullanıcının sorgusu ve VERİTABANINDAN ÇEKİLMİŞ gerçek bulgular verilir.
MUTLAK KURALLAR:
- SADECE verilen bulguları yorumla. Olmayan ürün, olmayan OEM, olmayan uyumluluk asla söyleme.
- Bulunan ilanları özetle: kaç adet, hangi marka/model, fiyat aralığı, öne çıkan OEM.
- OEM Referans Bankası'nda cross-ref varsa kısaca belirt.
- Bulgu yoksa "Şu anda tam eşleşme bulunamadı" de, kullanıcıya 1-2 netleştirici soru sun.
- Türkçe, kısa (max 120 kelime), maddeli, dostane.
- Güven: OEM tam eşleşme + ilan var = 95+; sadece marka/model = 70-85; hiçbir eşleşme = 20-40.`;

export interface AiAnswer {
  answer: string;
  confidence: number;
  follow_up: string;
  model_used?: string;
  duration_ms?: number;
  error?: string;
}

export async function generateAnswer(query: string, intent: unknown, dbResults: unknown): Promise<AiAnswer> {
  const ai = getAiProvider();
  const res = await ai.toolCall<{ answer: string; confidence: number; follow_up: string }>({
    system: SYSTEM,
    user: `KULLANICI SORGUSU:\n${query}\n\nAI NİYET:\n${JSON.stringify(intent)}\n\nVERİTABANI BULGULARI:\n${JSON.stringify(dbResults).slice(0, 6000)}`,
    tool: {
      name: "reply_to_user",
      description: "Kullanıcıya cevap, güven puanı ve gerekiyorsa takip sorusu.",
      parameters: {
        type: "object",
        properties: {
          answer: { type: "string" },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          follow_up: { type: "string" },
        },
        required: ["answer", "confidence", "follow_up"],
        additionalProperties: false,
      },
    },
  });
  if (!res.ok || !res.args) {
    return {
      answer: "Şu anda cevap oluşturulamadı, lütfen tekrar deneyin.",
      confidence: 0, follow_up: "",
      model_used: res.model_used, duration_ms: res.duration_ms, error: res.error,
    };
  }
  return {
    answer: res.args.answer,
    confidence: Math.max(0, Math.min(100, res.args.confidence | 0)),
    follow_up: (res.args.follow_up ?? "").trim(),
    model_used: res.model_used,
    duration_ms: res.duration_ms,
  };
}
