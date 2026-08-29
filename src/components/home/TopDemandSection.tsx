import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEMAND_TIER_META, tierOfScore } from "@/lib/demand";

type Row = {
  oem_code: string | null;
  label: string | null;
  brand: string | null;
  category: string | null;
  search_count: number;
  score: number;
  tier: string;
};

/** Ana sayfa — "Bugün En Çok Aranan Ürünler" canlı talep vitrini. */
export function TopDemandSection() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    supabase.rpc("top_demand_today", { _limit: 10 }).then(({ data }) => {
      if (!alive) return;
      setRows(((data ?? []) as Row[]).filter((r) => (r.label ?? "").trim().length > 0));
    });
    return () => { alive = false; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base sm:text-lg flex items-center gap-2">
          <TrendingUp className="size-4 text-gold" />
          Bugün En Çok Aranan Ürünler
        </h2>
        <Link to="/firsatlar" className="text-[11px] font-semibold text-gold hover:underline">
          Talep Borsası →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {rows.map((r, i) => {
          const meta = DEMAND_TIER_META[tierOfScore(r.score)];
          const q = r.oem_code || r.label || "";
          return (
            <Link
              key={`${r.oem_code ?? r.label}-${i}`}
              to="/parts"
              search={{ q } as never}
              className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-3 py-2.5 hover:border-gold/40 transition-colors"
            >
              <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">{r.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {[r.brand, r.category].filter(Boolean).join(" · ") || (r.oem_code ?? "")}
                </p>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>
                {meta.icon} {r.search_count}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
