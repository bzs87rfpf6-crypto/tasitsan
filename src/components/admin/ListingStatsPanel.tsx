import { useEffect, useState } from "react";
import { Eye, Heart, TrendingUp } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

interface RankedPart {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  count: number;
}

interface Totals {
  views7: number;
  views30: number;
  favs7: number;
  favs30: number;
  favsTotal: number;
  viewsTotal: number;
}

function daysAgoIso(d: number) {
  return new Date(Date.now() - d * 86400 * 1000).toISOString();
}

async function topPartsByCount(table: "part_views" | "favorites", days: number | null): Promise<RankedPart[]> {
  let q = supabase.from(table).select("part_id");
  if (days) q = q.gte("created_at", daysAgoIso(days));
  const { data, error } = await q.limit(20000);
  if (error || !data) return [];
  const tally = new Map<string, number>();
  for (const row of data as { part_id: string }[]) {
    tally.set(row.part_id, (tally.get(row.part_id) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length === 0) return [];
  const ids = top.map(([id]) => id);
  const { data: parts } = await supabase.from("parts").select("id,title,brand,model").in("id", ids);
  const map = new Map((parts ?? []).map((p: any) => [p.id, p]));
  return top
    .map(([id, count]) => {
      const p = map.get(id);
      if (!p) return null;
      return { id, title: p.title, brand: p.brand, model: p.model, count } as RankedPart;
    })
    .filter(Boolean) as RankedPart[];
}

async function countSince(table: "part_views" | "favorites", days: number | null): Promise<number> {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (days) q = q.gte("created_at", daysAgoIso(days));
  const { count } = await q;
  return count ?? 0;
}

export function ListingStatsPanel() {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30 | 0>(30);
  const [totals, setTotals] = useState<Totals>({
    views7: 0, views30: 0, favs7: 0, favs30: 0, favsTotal: 0, viewsTotal: 0,
  });
  const [topViews, setTopViews] = useState<RankedPart[]>([]);
  const [topFavs, setTopFavs] = useState<RankedPart[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const days = range === 0 ? null : range;
      const [v7, v30, f7, f30, vT, fT, tv, tf] = await Promise.all([
        countSince("part_views", 7),
        countSince("part_views", 30),
        countSince("favorites", 7),
        countSince("favorites", 30),
        countSince("part_views", null),
        countSince("favorites", null),
        topPartsByCount("part_views", days),
        topPartsByCount("favorites", days),
      ]);
      if (!active) return;
      setTotals({ views7: v7, views30: v30, favs7: f7, favs30: f30, viewsTotal: vT, favsTotal: fT });
      setTopViews(tv);
      setTopFavs(tf);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [range]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-1.5">
          <TrendingUp className="size-4" /> İlan İstatistikleri
        </h2>
        <div className="flex gap-1.5 text-[11px]">
          {([[7, "7 gün"], [30, "30 gün"], [0, "Tümü"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setRange(v as 7 | 30 | 0)}
              className={`px-2.5 py-1 rounded-full border ${range === v ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground hover:border-gold/60"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Metric icon={<Eye className="size-3.5" />} label="Görüntülenme (7g)" value={totals.views7} />
        <Metric icon={<Eye className="size-3.5" />} label="Görüntülenme (30g)" value={totals.views30} />
        <Metric icon={<Eye className="size-3.5" />} label="Toplam Görüntülenme" value={totals.viewsTotal} accent="text-gold" />
        <Metric icon={<Heart className="size-3.5" />} label="Favori (7g)" value={totals.favs7} />
        <Metric icon={<Heart className="size-3.5" />} label="Favori (30g)" value={totals.favs30} />
        <Metric icon={<Heart className="size-3.5" />} label="Toplam Favori" value={totals.favsTotal} accent="text-destructive" />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <RankList title="En Çok Görüntülenen" icon={<Eye className="size-3.5" />} items={topViews} loading={loading} />
        <RankList title="En Çok Favorilenen" icon={<Heart className="size-3.5" />} items={topFavs} loading={loading} />
      </div>
    </section>
  );
}

function Metric({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        <span className="text-gold">{icon}</span>{label}
      </div>
      <div className={`text-lg font-display tracking-wider ${accent ?? "text-foreground"}`}>
        {value.toLocaleString("tr-TR")}
      </div>
    </div>
  );
}

function RankList({ title, icon, items, loading }: { title: string; icon: React.ReactNode; items: RankedPart[]; loading: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gold font-semibold">
        {icon} {title}
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground py-3 text-center">Yükleniyor...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">Henüz veri yok.</p>
      ) : (
        <ol className="space-y-1.5">
          {items.map((p, i) => (
            <li key={p.id}>
              <Link to="/parts/$id" params={{ id: p.id }}
                className="flex items-center gap-2 text-xs hover:text-gold">
                <span className="size-5 shrink-0 rounded-full bg-secondary text-muted-foreground grid place-items-center text-[10px] font-bold">{i + 1}</span>
                <span className="flex-1 truncate">{p.title}</span>
                <span className="font-bold text-gold tabular-nums">{p.count.toLocaleString("tr-TR")}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
