import { Package, Layers, CalendarClock, CalendarDays, Store, MapPin } from "lucide-react";

export interface HomeStats {
  total_parts: number;
  total_oem: number;
  today_count: number;
  week_count: number;
  total_sellers: number;
  total_cities: number;
}

const fmt = (n: number) => (n ?? 0).toLocaleString("tr-TR");

export function LiveStatsBar({ stats, loading }: { stats: HomeStats | null; loading?: boolean }) {
  const cards = [
    { icon: <Package className="size-3.5" />, label: "Toplam Ürün", value: stats?.total_parts },
    { icon: <Layers className="size-3.5" />, label: "Toplam OEM", value: stats?.total_oem },
    { icon: <CalendarClock className="size-3.5" />, label: "Bugün Eklenen", value: stats?.today_count, accent: "text-emerald-400" },
    { icon: <CalendarDays className="size-3.5" />, label: "Bu Hafta", value: stats?.week_count, accent: "text-gold" },
    { icon: <Store className="size-3.5" />, label: "Firma", value: stats?.total_sellers },
    { icon: <MapPin className="size-3.5" />, label: "Şehir", value: stats?.total_cities },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl bg-card border border-border/60 p-2.5 sm:p-3">
          <div className="flex items-center gap-1 text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">
            {c.icon}
            <span className="truncate">{c.label}</span>
          </div>
          <div className={`mt-1 font-display text-lg sm:text-2xl ${c.accent ?? "text-gold"}`}>
            {loading || c.value == null ? "…" : fmt(c.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
