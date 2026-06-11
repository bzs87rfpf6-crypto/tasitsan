import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Flame, MapPin, Car, Hash } from "lucide-react";

type Range = "today" | "7d" | "30d" | "all";
const RANGE_LABEL: Record<Range, string> = { today: "Bugün", "7d": "7 gün", "30d": "30 gün", all: "Tümü" };

type QueryRow = { query: string; search_count: number; last_searched_at: string };
type OemRow = { oem: string; search_count: number; last_searched_at: string };
type BMRow = { brand: string; model: string; search_count: number; last_searched_at: string };
type CityRow = { city: string; search_count: number; last_searched_at: string };

export function SearchAnalyticsPanel() {
  const [range, setRange] = useState<Range>("30d");
  const [busy, setBusy] = useState(true);
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [oems, setOems] = useState<OemRow[]>([]);
  const [bms, setBms] = useState<BMRow[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);

  const load = useCallback(async (r: Range) => {
    setBusy(true);
    const [q, o, bm, c] = await Promise.all([
      supabase.rpc("top_search_queries", { _range: r, _limit: 50 }),
      supabase.rpc("top_oem_searches", { _range: r, _limit: 50 }),
      supabase.rpc("top_search_brand_model", { _range: r, _limit: 50 }),
      supabase.rpc("top_search_cities", { _range: r, _limit: 50 }),
    ]);
    setQueries((q.data ?? []) as QueryRow[]);
    setOems((o.data ?? []) as OemRow[]);
    setBms((bm.data ?? []) as BMRow[]);
    setCities((c.data ?? []) as CityRow[]);
    setBusy(false);
  }, []);

  useEffect(() => { load(range); }, [load, range]);

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              range === r ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
            }`}>
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {busy ? (
        <p className="text-sm text-muted-foreground text-center py-8">Yükleniyor…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatTable
            icon={<Flame className="size-4" />}
            title="En Çok Aranan Parçalar"
            empty="Bu dönemde arama yok."
            rows={queries.map((r) => ({ label: r.query, value: r.search_count }))}
          />
          <StatTable
            icon={<Hash className="size-4" />}
            title="En Çok Aranan OEM Kodları"
            empty="Bu dönemde OEM araması yok."
            rows={oems.map((r) => ({ label: r.oem, value: r.search_count, mono: true }))}
          />
          <StatTable
            icon={<Car className="size-4" />}
            title="En Çok Aranan Marka / Model"
            empty="Bu dönemde marka-model araması yok."
            rows={bms
              .map((r) => ({ label: [r.brand, r.model].filter(Boolean).join(" ") || "—", value: r.search_count }))
              .filter((r) => r.label !== "—")}
          />
          <StatTable
            icon={<MapPin className="size-4" />}
            title="Aramalar — Şehir Dağılımı"
            empty="Şehir bilgisi içeren arama yok."
            rows={cities.map((r) => ({ label: r.city, value: r.search_count }))}
          />
        </div>
      )}
    </div>
  );
}

function StatTable({ icon, title, rows, empty, }: {
  icon: React.ReactNode; title: string; rows: { label: string; value: number; mono?: boolean }[]; empty: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gold">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gold">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{empty}</p>
      ) : (
        <ul className="space-y-1 max-h-96 overflow-y-auto">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex items-center gap-2 text-sm py-1 border-b border-border/40 last:border-0">
              <span className="size-5 shrink-0 rounded-full bg-gold/10 text-gold text-[10px] font-bold grid place-items-center">{i + 1}</span>
              <span className={`flex-1 min-w-0 truncate ${r.mono ? "font-mono text-xs" : ""}`}>{r.label}</span>
              <span className="text-gold font-bold tabular-nums">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
