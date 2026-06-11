import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, Flame, Snowflake, Car, Sparkles, AlertTriangle } from "lucide-react";
import { getStockDashboard, type StockDashboard } from "@/lib/stock-eval.functions";

function tl(n: number | null | undefined) {
  if (n == null) return "—";
  return `₺${Number(n).toLocaleString("tr-TR")}`;
}

export function StockEvaluationPanel() {
  const fetchDash = useServerFn(getStockDashboard);
  const [data, setData] = useState<StockDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDash()
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setErr(e?.message ?? "Hata"); });
    return () => { cancelled = true; };
  }, [fetchDash]);

  if (err) return <p className="text-sm text-destructive p-4">Yüklenemedi: {err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground p-4">Yükleniyor...</p>;

  return (
    <div className="space-y-4">
      <Section title="En Çok Aranan Parçalar" icon={<Sparkles className="size-4 text-gold" />}>
        {data.most_searched.length === 0 ? <Empty /> : (
          <div className="space-y-1.5">
            {data.most_searched.slice(0, 10).map((m) => (
              <div key={m.oem} className="flex items-center justify-between gap-2 text-xs bg-background/50 rounded-lg p-2.5">
                <div className="min-w-0">
                  <p className="font-mono font-semibold text-foreground truncate">{m.oem}</p>
                  {m.sample && (
                    <Link to="/parts/$id" params={{ id: m.sample.id }} className="text-[10px] text-muted-foreground hover:text-gold line-clamp-1">
                      {m.sample.title}
                    </Link>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-gold font-bold">{m.search_count} arama</p>
                  <p className="text-[10px] text-muted-foreground">{m.listing_count} ilan</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Hızlı Satan İlanlar (7 gün)" icon={<Flame className="size-4 text-orange-400" />}>
        {data.fastest_selling.length === 0 ? <Empty /> : (
          <div className="space-y-1.5">
            {data.fastest_selling.map((p) => (
              <Link key={p.id} to="/parts/$id" params={{ id: p.id }}
                className="flex items-center justify-between gap-2 text-xs bg-background/50 rounded-lg p-2.5 hover:bg-background/80 transition-colors">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{p.title}</p>
                  <p className="text-[10px] text-muted-foreground">{[p.brand, p.model].filter(Boolean).join(" • ")}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-orange-400 font-bold">{p.views_7d}👁</p>
                  <p className="text-[10px] text-gold">{tl(p.price)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Yavaş Hareket Eden (60+ gün)" icon={<Snowflake className="size-4 text-blue-400" />}>
        {data.slow_moving.length === 0 ? <Empty /> : (
          <div className="space-y-1.5">
            {data.slow_moving.map((p) => (
              <Link key={p.id} to="/parts/$id" params={{ id: p.id }}
                className="flex items-center justify-between gap-2 text-xs bg-background/50 rounded-lg p-2.5 hover:bg-background/80 transition-colors">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{p.title}</p>
                  <p className="text-[10px] text-muted-foreground">{[p.brand, p.model, p.city].filter(Boolean).join(" • ")}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-blue-400 font-bold">{p.age_days}g</p>
                  <p className="text-[10px] text-muted-foreground">{p.views_30d} görüntüleme</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="En Çok Talep Edilen Araçlar" icon={<Car className="size-4 text-emerald-400" />}>
        {data.top_vehicles.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-2 gap-1.5">
            {data.top_vehicles.map((v, i) => (
              <div key={i} className="bg-background/50 rounded-lg p-2.5 text-xs">
                <p className="font-semibold text-foreground truncate">{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</p>
                <p className="text-[10px] text-emerald-400">{v.demand_count} talep</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Otomatik Öneriler" icon={<AlertTriangle className="size-4 text-gold" />}>
        {data.stale_recs.length === 0 ? <Empty /> : (
          <div className="space-y-1.5">
            {data.stale_recs.map((r) => (
              <div key={r.id} className="bg-background/50 rounded-lg p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Link to="/parts/$id" params={{ id: r.id }} className="font-semibold text-foreground hover:text-gold truncate">
                    {r.title}
                  </Link>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{r.age_days} gün · {tl(r.price)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed flex gap-1.5">
                  <TrendingUp className="size-3 text-gold shrink-0 mt-0.5" />
                  {r.recommendation}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-xs uppercase tracking-wider text-gold font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="text-[11px] text-muted-foreground p-2">Veri yok.</p>;
}
