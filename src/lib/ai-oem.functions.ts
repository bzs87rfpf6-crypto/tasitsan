import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// OEM AI: normalize → cache lookup → AI suggestion → cache write + audit log.
// Returns equivalent OEMs with per-item confidence (0-1) and overall match score.

const inputSchema = z.object({
  oem: z.string().trim().min(2).max(60),
  brand: z.string().trim().max(60).optional().nullable(),
  model: z.string().trim().max(60).optional().nullable(),
  title: z.string().trim().max(200).optional().nullable(),
  force: z.boolean().optional(),
});

export interface OemEquivalent {
  code: string;
  brand?: string | null;
  confidence: number; // 0..1
}

export interface OemAiSuggestion {
  equivalent_oems: OemEquivalent[];
  compatible_vehicles: string[];
  similar_parts: string[];
  notes: string | null;
  cached: boolean;
  cache_age_hours?: number;
  normalized_oem: string;
}

function normalizeOemKey(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-./_]+/g, "");
}

function confidenceTier(c: number): "high" | "medium" | "low" {
  if (c >= 0.8) return "high";
  if (c >= 0.55) return "medium";
  return "low";
}
export { confidenceTier };

export const suggestEquivalentOems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OemAiSuggestion> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI servisine erişim yapılandırılmamış.");

    const normalized = normalizeOemKey(data.oem);
    const cacheKey = `oem:eq:v2:${normalized}`;
    const { supabase, userId } = context;

    // 1) Cache lookup
    if (!data.force) {
      const { data: cached } = await supabase.rpc("get_oem_research", { _key: cacheKey });
      if (cached && typeof cached === "object") {
        const c = cached as Partial<OemAiSuggestion> & { cached_at?: string };
        const ageHours = c.cached_at
          ? Math.max(0, (Date.now() - new Date(c.cached_at).getTime()) / 36e5)
          : undefined;
        return {
          equivalent_oems: c.equivalent_oems ?? [],
          compatible_vehicles: c.compatible_vehicles ?? [],
          similar_parts: c.similar_parts ?? [],
          notes: c.notes ?? null,
          cached: true,
          cache_age_hours: ageHours,
          normalized_oem: normalized,
        };
      }
    }

    // 2) AI call
    const sys =
      "Sen otomotiv yedek parça uzmanısın. Verilen OEM numarası için olası eşdeğer OEM numaralarını (her biri için 0-1 arası güven skoru), uyumlu araçları ve benzer/alternatif parça isimlerini Türkçe olarak listele. Her eşdeğer kod için marka (Bosch, Denso, Valeo, NGK, Mahle vb.) belirtmeye çalış. Bilmiyorsan boş dizi döndür, asla uydurma yapma. Güvenli emin değilsen confidence < 0.5 ver.";

    const userMsg =
      `OEM: ${data.oem} (normalize: ${normalized})` +
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
              description: "OEM eşdeğer önerilerini güven skoru ile döndür.",
              parameters: {
                type: "object",
                properties: {
                  equivalent_oems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        code: { type: "string" },
                        brand: { type: "string" },
                        confidence: { type: "number" },
                      },
                      required: ["code", "confidence"],
                    },
                  },
                  compatible_vehicles: { type: "array", items: { type: "string" } },
                  similar_parts: { type: "array", items: { type: "string" } },
                  notes: { type: "string" },
                },
                required: ["equivalent_oems", "compatible_vehicles", "similar_parts"],
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
      console.error("[ai-oem] gateway error", res.status, await res.text());
      throw new Error("AI servisine ulaşılamadı.");
    }

    const json = await res.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let result: OemAiSuggestion = {
      equivalent_oems: [],
      compatible_vehicles: [],
      similar_parts: [],
      notes: null,
      cached: false,
      normalized_oem: normalized,
    };

    if (args) {
      try {
        const parsed = JSON.parse(args);
        const eqs: OemEquivalent[] = Array.isArray(parsed.equivalent_oems)
          ? parsed.equivalent_oems
              .map((e: unknown) => {
                if (typeof e === "string") return { code: e.toUpperCase().trim(), confidence: 0.5 };
                const o = e as { code?: string; brand?: string; confidence?: number };
                if (!o?.code) return null;
                return {
                  code: String(o.code).toUpperCase().trim(),
                  brand: o.brand ? String(o.brand).trim() : null,
                  confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0.5)),
                };
              })
              .filter(Boolean)
              .slice(0, 15)
          : [];
        result = {
          equivalent_oems: eqs as OemEquivalent[],
          compatible_vehicles: Array.isArray(parsed.compatible_vehicles)
            ? parsed.compatible_vehicles.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 12)
            : [],
          similar_parts: Array.isArray(parsed.similar_parts)
            ? parsed.similar_parts.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 12)
            : [],
          notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 400) : null,
          cached: false,
          normalized_oem: normalized,
        };
      } catch (e) {
        console.error("[ai-oem] parse error", e);
      }
    }

    // 3) Cache write (best-effort). TTL: 30 days for AI equivalents.
    try {
      await supabase.rpc("save_oem_research", {
        _key: cacheKey,
        _query: normalized,
        _result: JSON.parse(JSON.stringify({ ...result, cached_at: new Date().toISOString() })),
        _ttl_seconds: 60 * 60 * 24 * 30,
      });
    } catch (e) {
      console.warn("[ai-oem] cache write failed", e);
    }

    // 4) Audit log (best-effort)
    try {
      await supabase.from("admin_audit_log").insert({
        actor_id: userId,
        action: "oem_ai_suggest",
        metadata: {
          oem: data.oem,
          normalized,
          equivalent_count: result.equivalent_oems.length,
          top_confidence: result.equivalent_oems[0]?.confidence ?? null,
        },
      });
    } catch {
      /* non-fatal */
    }

    return result;
  });
