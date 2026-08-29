// Admin → AI Analytics.
// KURAL 10: Arama başarısı, başarısızlık ve dönüşüm oranları görünür olsun.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Activity, Loader2, RefreshCw, TrendingUp, MousePointerClick, AlertTriangle, CheckCircle2 } from "lucide-react";

type Stats = {
  total_searches: number;
  successful: number;
  no_results: number;
  avg_confidence: number;
  click_through: number;
  requests_created: number;
  purchases: number;
  success_rate: number;
  ctr: number;
  conversion_rate: number;
  avg_response_ms?: number;
  cache_hit_rate?: number;
  semantic_match_rate?: number;
  clarification_rate?: number;
  sales_from_ai?: number;
};

type RecentRow = {
  id: string;
  created_at: string;
  query: string;
  parts_found: number;
  confidence: number;
  confidence_tier: string;
  stage_reached: string | null;
  ai_model: string | null;
  duration_ms: number | null;
  clicked_part_id: string | null;
  request_created: boolean;
};

const RANGES = [
  { label: "24 saat", days: 1 },
  { label: "7 gün", days: 7 },
  { label: "30 gün", days: 30 },
];

export function AiAnalyticsPanel() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s, error: se }, { data: r, error: re }] = await Promise.all([
      supabase.rpc("ai_search_stats" as never, { _days: days } as never),
      supabase.from("ai_search_logs")
        .select("id, created_at, query, parts_found, confidence, confidence_tier, stage_reached, ai_model, duration_ms, clicked_part_id, request_created")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setLoading(false);
    if (se) toast.error("İstatistikler alınamadı: " + se.message);
    else if (Array.isArray(s) && (s as unknown[]).length > 0) setStats((s as Stats[])[0]);
    if (re) toast.error("Kayıtlar alınamadı: " + re.message);
    else setRecent((r ?? []) as RecentRow[]);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Activity className="size-5 text-primary" />
        <h3 className="font-semibold text-lg">AI Arama Analitiği</h3>
        <div className="ml-auto flex items-center gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.days} size="sm"
              variant={days === r.days ? "default" : "ghost"}
              onClick={() => setDays(r.days)}
            >{r.label}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <StatBox label="Toplam Arama" value={stats.total_searches.toLocaleString("tr-TR")} icon={<Activity className="size-4" />} />
          <StatBox label="Başarı Oranı" value={`%${stats.success_rate}`} tone="ok" icon={<CheckCircle2 className="size-4" />} sub={`${stats.successful}/${stats.total_searches}`} />
          <StatBox label="Sonuçsuz" value={stats.no_results.toLocaleString("tr-TR")} tone={stats.no_results > 0 ? "warn" : "muted"} icon={<AlertTriangle className="size-4" />} />
          <StatBox label="Ort. Güven" value={`%${stats.avg_confidence}`} icon={<TrendingUp className="size-4" />} />
          <StatBox label="Tıklama (CTR)" value={`%${stats.ctr}`} icon={<MousePointerClick className="size-4" />} sub={`${stats.click_through} tıklama`} />
          <StatBox label="Parça Talebi" value={stats.requests_created.toLocaleString("tr-TR")} />
          <StatBox label="Satış" value={stats.purchases.toLocaleString("tr-TR")} tone="ok" />
          <StatBox label="Dönüşüm" value={`%${stats.conversion_rate}`} tone="ok" />
          {stats.avg_response_ms != null && <StatBox label="Ort. Yanıt" value={`${(stats.avg_response_ms/1000).toFixed(1)}s`} tone={stats.avg_response_ms < 2000 ? "ok" : "warn"} />}
          {stats.cache_hit_rate != null && <StatBox label="Cache Hit" value={`%${stats.cache_hit_rate}`} tone="ok" />}
          {stats.semantic_match_rate != null && <StatBox label="Semantik" value={`%${stats.semantic_match_rate}`} />}
          {stats.clarification_rate != null && <StatBox label="Netleştirme" value={`%${stats.clarification_rate}`} />}
          {stats.sales_from_ai != null && <StatBox label="AI'dan Satış" value={String(stats.sales_from_ai)} tone="ok" />}
        </div>
      )}

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Son 50 Arama</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left border-b border-border">
                <th className="py-2 pr-2">Zaman</th>
                <th className="py-2 pr-2">Sorgu</th>
                <th className="py-2 pr-2 text-right">Sonuç</th>
                <th className="py-2 pr-2 text-right">Güven</th>
                <th className="py-2 pr-2">Kademe</th>
                <th className="py-2 pr-2">Katman</th>
                <th className="py-2 pr-2">Model</th>
                <th className="py-2 pr-2 text-right">Süre</th>
                <th className="py-2 pr-2">Dönüşüm</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-1.5 pr-2 max-w-[220px] truncate" title={r.query}>{r.query}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{r.parts_found}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">%{r.confidence}</td>
                  <td className="py-1.5 pr-2"><TierBadge tier={r.confidence_tier} /></td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{r.stage_reached ?? "-"}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground truncate max-w-[120px]" title={r.ai_model ?? ""}>{r.ai_model ?? "-"}</td>
                  <td className="py-1.5 pr-2 text-right text-muted-foreground">{r.duration_ms ? `${r.duration_ms}ms` : "-"}</td>
                  <td className="py-1.5 pr-2">
                    {r.clicked_part_id && <span className="text-emerald-600">✓ tık</span>}
                    {r.request_created && <span className="text-sky-600 ml-1">✓ talep</span>}
                    {!r.clicked_part_id && !r.request_created && <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && !loading && (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Henüz kayıt yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" | "muted"; icon?: React.ReactNode }) {
  const toneClass = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded-lg border border-border p-2.5 bg-background">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </div>
      <div className={`text-xl font-bold mt-0.5 ${toneClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const meta: Record<string, { label: string; cls: string }> = {
    certain: { label: "Kesin", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
    high:    { label: "Yüksek", cls: "bg-sky-500/15 text-sky-700 border-sky-500/30" },
    review:  { label: "Kontrol", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    ask:     { label: "Soru", cls: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
  };
  const m = meta[tier] ?? { label: tier, cls: "bg-muted text-muted-foreground border-border" };
  return <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${m.cls}`}>{m.label}</span>;
}
