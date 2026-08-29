// Faz 4/3 — Cross-Sell listesi (Bunları da alanlar…)
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { crossSellForPart, type CrossSellItem } from "@/lib/cross-sell.functions";
import { buildPartParam } from "@/lib/part-slug";
import { Sparkles, ShoppingCart } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

export function CrossSell({ partId, limit = 6 }: { partId: string; limit?: number }) {
  const run = useServerFn(crossSellForPart);
  const [items, setItems] = useState<CrossSellItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    run({ data: { part_id: partId, limit } })
      .then((r) => { if (!cancelled) setItems(r); })
      .catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true };
  }, [partId, limit, run]);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <ShoppingCart className="size-4 text-primary" />
        <h3 className="font-semibold text-base">Bunları da alanlar…</h3>
        <span className="text-xs text-muted-foreground">Aynı araç için sık aranan parçalar</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        {items.map((p) => (
          <Link
            key={p.id}
            to="/parts/$id"
            params={{ id: buildPartParam({ id: p.id, seo_slug: p.seo_slug, title: p.title, oem_code: p.oem_code, oem_codes: p.oem_codes }) }}
            onClick={() => trackEvent("cross_sell_click", { from_part: partId, to_part: p.id, reason: p.reason, score: p.score })}
            className="group flex flex-col rounded-xl border border-border hover:border-primary/50 bg-card overflow-hidden hover:shadow-md transition"
          >
            <div className="aspect-square bg-muted grid place-items-center overflow-hidden">
              {p.photos?.[0] ? (
                <img src={p.photos[0]} alt={p.title} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <Sparkles className="size-6 text-muted-foreground" />
              )}
            </div>
            <div className="p-2 min-w-0">
              <div className="text-xs font-medium line-clamp-2 leading-tight group-hover:text-primary">{p.title}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {[p.brand, p.model].filter(Boolean).join(" · ")}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-bold text-primary">
                  {p.price ? `${Number(p.price).toLocaleString("tr-TR")} ₺` : "Fiyat sor"}
                </span>
                <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary">{p.reason}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
