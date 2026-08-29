// Gece çalışan AI talep analizi — puanları tazeler ve öneri üretir.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DemandAiInsights } from "./demand-ai.functions";

type SignalRow = {
  oem_code: string | null;
  part_name: string | null;
  keyword: string | null;
  brand: string | null;
  category: string | null;
  search_count: number;
  unique_users: number;
  count_7d: number;
  count_30d: number;
  in_stock_count: number;
  score: number;
};

function fallback(rows: SignalRow[]): DemandAiInsights {
  const label = (r: SignalRow) => r.part_name || r.keyword || r.oem_code || "—";
  const byRising = [...rows].sort((a, b) => b.count_7d - a.count_7d).slice(0, 8);
  const byMonth = [...rows].sort((a, b) => b.count_30d - a.count_30d).slice(0, 8);
  const missing = rows.filter((r) => r.in_stock_count === 0).sort((a, b) => b.score - a.score).slice(0, 8);
  const brands = new Map<string, number>();
  for (const r of rows) if (r.brand) brands.set(r.brand, (brands.get(r.brand) ?? 0) + r.search_count);
  return {
    generated_at: new Date().toISOString(),
    rising: byRising.map((r) => `${label(r)} (7 günde ${r.count_7d} arama)`),
    top_oems: byMonth.map((r) => `${r.oem_code ?? label(r)} — 30 günde ${r.count_30d} arama`),
    missing: missing.map((r) => `${label(r)} — puan ${r.score}, stok yok`),
    suggested: missing.slice(0, 6).map((r) => label(r)),
    trends: [...brands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([b, c]) => `${b} — ${c} arama`),
    summary: `${rows.length} aktif talep sinyali analiz edildi.`,
  };
}

export async function runDemandAnalysis(): Promise<DemandAiInsights> {
  await supabaseAdmin.rpc("refresh_demand_scores");

  const { data } = await supabaseAdmin
    .from("demand_signals")
    .select("oem_code, part_name, keyword, brand, category, search_count, unique_users, count_7d, count_30d, in_stock_count, score")
    .order("score", { ascending: false })
    .limit(120);

  const rows = (data ?? []) as SignalRow[];
  let result = fallback(rows);

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (apiKey && rows.length > 0) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Sen bir otomotiv yedek parça pazar analistisin. Sana gerçek talep verisi verilecek. SADECE verilen veriye dayanarak Türkçe kısa maddeler üret, asla uydurma.",
            },
            { role: "user", content: JSON.stringify(rows.slice(0, 80)) },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_insights",
                parameters: {
                  type: "object",
                  properties: {
                    rising: { type: "array", items: { type: "string" } },
                    top_oems: { type: "array", items: { type: "string" } },
                    missing: { type: "array", items: { type: "string" } },
                    suggested: { type: "array", items: { type: "string" } },
                    trends: { type: "array", items: { type: "string" } },
                    summary: { type: "string" },
                  },
                  required: ["rising", "top_oems", "missing", "suggested", "trends", "summary"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_insights" } },
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (args) {
          const p = JSON.parse(args) as Partial<DemandAiInsights>;
          result = {
            generated_at: new Date().toISOString(),
            rising: p.rising ?? result.rising,
            top_oems: p.top_oems ?? result.top_oems,
            missing: p.missing ?? result.missing,
            suggested: p.suggested ?? result.suggested,
            trends: p.trends ?? result.trends,
            summary: p.summary ?? result.summary,
          };
        }
      } else {
        console.error("[demand-ai] gateway", res.status, await res.text());
      }
    } catch (e) {
      console.error("[demand-ai] error", e);
    }
  }

  await supabaseAdmin.from("stats_cache").upsert({
    key: "demand_ai_daily",
    payload: result as never,
    computed_at: new Date().toISOString(),
  });

  return result;
}
