import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Phase 2 — AI: suggest equivalent OEM numbers, compatible vehicles, and similar parts
// for a given OEM / part description. Uses Lovable AI Gateway (no key required client-side).

const inputSchema = z.object({
  oem: z.string().trim().min(2).max(60),
  brand: z.string().trim().max(60).optional().nullable(),
  model: z.string().trim().max(60).optional().nullable(),
  title: z.string().trim().max(200).optional().nullable(),
});

export interface OemAiSuggestion {
  equivalent_oems: string[];
  compatible_vehicles: string[];
  similar_parts: string[];
  notes: string | null;
}

export const suggestEquivalentOems = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<OemAiSuggestion> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("AI servisine erişim yapılandırılmamış.");
    }

    const sys =
      "Sen otomotiv yedek parça uzmanısın. Verilen OEM numarası için olası eşdeğer OEM numaralarını, uyumlu araçları ve benzer/alternatif parça isimlerini Türkçe olarak listele. Bilmiyorsan boş dizi döndür, asla uydurma yapma.";

    const userMsg =
      `OEM: ${data.oem}` +
      (data.brand ? `\nMarka: ${data.brand}` : "") +
      (data.model ? `\nModel: ${data.model}` : "") +
      (data.title ? `\nParça: ${data.title}` : "");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_suggestions",
              description: "OEM eşdeğer önerilerini döndür.",
              parameters: {
                type: "object",
                properties: {
                  equivalent_oems: { type: "array", items: { type: "string" } },
                  compatible_vehicles: { type: "array", items: { type: "string" } },
                  similar_parts: { type: "array", items: { type: "string" } },
                  notes: { type: "string" },
                },
                required: ["equivalent_oems", "compatible_vehicles", "similar_parts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_suggestions" } },
      }),
    });

    if (res.status === 429) throw new Error("AI istek limiti aşıldı, biraz sonra tekrar deneyin.");
    if (res.status === 402) throw new Error("AI kredisi tükendi, lütfen yöneticiyle iletişime geçin.");
    if (!res.ok) {
      const text = await res.text();
      console.error("[ai-oem] gateway error", res.status, text);
      throw new Error("AI servisine ulaşılamadı.");
    }

    const json = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments;
    if (!args) {
      return { equivalent_oems: [], compatible_vehicles: [], similar_parts: [], notes: null };
    }
    try {
      const parsed = JSON.parse(args);
      return {
        equivalent_oems: Array.isArray(parsed.equivalent_oems)
          ? parsed.equivalent_oems.map((s: unknown) => String(s).toUpperCase().trim()).filter(Boolean).slice(0, 12)
          : [],
        compatible_vehicles: Array.isArray(parsed.compatible_vehicles)
          ? parsed.compatible_vehicles.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 12)
          : [],
        similar_parts: Array.isArray(parsed.similar_parts)
          ? parsed.similar_parts.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 12)
          : [],
        notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 400) : null,
      };
    } catch (e) {
      console.error("[ai-oem] parse error", e);
      return { equivalent_oems: [], compatible_vehicles: [], similar_parts: [], notes: null };
    }
  });
