import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, Activity, Sparkles, AlertTriangle } from "lucide-react";
import { getPartEvaluation, type PartEvaluation } from "@/lib/stock-eval.functions";

function tl(n: number | null | undefined) {
  if (n == null) return "—";
  return `₺${Number(n).toLocaleString("tr-TR")}`;
}

export function StockInsightsCard({ partId }: { partId: string }) {
  const fetchEval = useServerFn(getPartEvaluation);
  const [data, setData] = useState<PartEvaluation | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEval({ data: { partId } })
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setErr(e?.message ?? "Hata"); });
    return () => { cancelled = true; };
  }, [partId, fetchEval]);

  if (err) return null;
  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
        Akıllı stok analizi yükleniyor...
      </div>
    );
  }
  if (data.error) return null;

  const score = data.demand_score;
  const scoreColor = score >= 70 ? "text-emerald-400" : score >= 40 ? "text-gold" : "text-muted-foreground";
  const scoreLabel = score >= 70 ? "Yüksek" : score >= 40 ? "Orta" : "Düşük";

  return (
    <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-card to-gold/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-gold" />
        <h3 className="text-xs uppercase tracking-wider text-gold font-semibold">Akıllı Stok Analizi</h3>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Arama" value={data.search_count} icon={<Activity className="size-3" />} />
        <Stat label="Talep" value={data.request_count} />
        <Stat label="Görüntülenme" value={data.view_count} />
      </div>

      <div className="rounded-lg bg-background/60 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Talep Skoru</span>
          <span className={`text-base font-bold ${scoreColor}`}>{score}/100 · {scoreLabel}</span>
        </div>
        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-gold to-emerald-400 transition-all"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-background/60 p-2.5">
          <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Piyasa Ortalaması</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{tl(data.market_avg)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {data.similar_count} benzer ilan · Medyan {tl(data.market_median)}
          </p>
        </div>
        <div className="rounded-lg bg-background/60 p-2.5">
          <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Önerilen Aralık</p>
          <p className="text-sm font-semibold text-gold mt-0.5">
            {data.recommended_low != null && data.recommended_high != null
              ? `${tl(data.recommended_low)} – ${tl(data.recommended_high)}`
              : "Yeterli veri yok"}
          </p>
          {data.market_min != null && data.market_max != null && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Min {tl(data.market_min)} · Max {tl(data.market_max)}
            </p>
          )}
        </div>
      </div>

      {data.is_stale && data.recommendation && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[11px] flex gap-2">
          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-destructive mb-0.5">
              {data.age_days} gündür satılmadı
            </p>
            <p className="leading-relaxed">{data.recommendation}</p>
          </div>
        </div>
      )}

      {!data.is_stale && data.recommended_high != null && data.price != null && data.price > data.recommended_high && (
        <div className="rounded-lg border border-gold/30 bg-gold/10 p-3 text-[11px] flex gap-2">
          <TrendingUp className="size-4 text-gold shrink-0 mt-0.5" />
          <span>Fiyatınız piyasanın üzerinde — önerilen aralığa indirmek görünürlüğü artırır.</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-background/60 p-2">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </div>
      <p className="text-base font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}
