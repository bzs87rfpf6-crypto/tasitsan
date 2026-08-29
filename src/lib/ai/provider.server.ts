// Provider-agnostic AI wrapper.
// Bugün Lovable AI Gateway (Gemini/OpenAI); yarın kendi modelimize geçişte
// SADECE bu dosya değişir — çağıran kod aynı kalır.
//
// Yeni provider eklemek için: createXxxProvider() implementasyonu + AI_PROVIDER env.

export interface AiToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiToolCallRequest {
  system: string;
  user: string;
  tool: AiToolSpec;
  model?: string;
  temperature?: number;
}

export interface AiToolCallResponse<T = unknown> {
  ok: boolean;
  args?: T;
  error?: string;
  raw_status?: number;
  model_used?: string;
  duration_ms?: number;
}

export interface AiProvider {
  name: string;
  defaultModel: string;
  toolCall<T = unknown>(req: AiToolCallRequest): Promise<AiToolCallResponse<T>>;
}

function createLovableGatewayProvider(): AiProvider {
  const defaultModel = "google/gemini-2.5-flash";
  return {
    name: "lovable-gateway",
    defaultModel,
    async toolCall<T>(req: AiToolCallRequest): Promise<AiToolCallResponse<T>> {
      const started = Date.now();
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) return { ok: false, error: "AI servisi yapılandırılmamış." };
      const model = req.model ?? defaultModel;
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
            tools: [{
              type: "function",
              function: {
                name: req.tool.name,
                description: req.tool.description,
                parameters: req.tool.parameters,
              },
            }],
            tool_choice: { type: "function", function: { name: req.tool.name } },
          }),
        });
        const duration_ms = Date.now() - started;
        if (res.status === 429) return { ok: false, error: "AI istek limiti aşıldı.", raw_status: 429, model_used: model, duration_ms };
        if (res.status === 402) return { ok: false, error: "AI kredisi tükendi.", raw_status: 402, model_used: model, duration_ms };
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error("[ai-provider] gateway error", res.status, t.slice(0, 400));
          return { ok: false, error: "AI servisine ulaşılamadı.", raw_status: res.status, model_used: model, duration_ms };
        }
        const json = await res.json();
        const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (!args) return { ok: false, error: "AI cevabı çözümlenemedi.", model_used: model, duration_ms };
        try {
          return { ok: true, args: JSON.parse(args) as T, model_used: model, duration_ms };
        } catch (e) {
          console.error("[ai-provider] parse error", e);
          return { ok: false, error: "AI cevabı JSON değil.", model_used: model, duration_ms };
        }
      } catch (e) {
        console.error("[ai-provider] network error", e);
        return { ok: false, error: e instanceof Error ? e.message : "Ağ hatası", model_used: model, duration_ms: Date.now() - started };
      }
    },
  };
}

let _provider: AiProvider | null = null;

/** Aktif AI provider'ı döndürür. AI_PROVIDER env ile ileride geçiş yapılabilir. */
export function getAiProvider(): AiProvider {
  if (_provider) return _provider;
  // const kind = process.env.AI_PROVIDER; // future: "openai" | "anthropic" | "local"
  _provider = createLovableGatewayProvider();
  return _provider;
}
